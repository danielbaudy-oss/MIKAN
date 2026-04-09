// ============================================
// MIKAN — Supabase API Layer
// Include this in all HTML files to replace Apps Script calls
// ============================================

const SUPABASE_URL = 'https://kxbmlsbxnzvgzucxleoy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_qLmpXx5qeCO0cIdNqDMzeQ_HnLH4VS_';

const SB = {
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },

  async query(table, params = '') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers: SB.headers });
    if (!res.ok) throw new Error(`Query failed: ${res.statusText}`);
    return res.json();
  },

  async insert(table, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST', headers: SB.headers, body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Insert failed: ${res.statusText}`);
    return res.json();
  },

  async update(table, id, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'PATCH', headers: SB.headers, body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Update failed: ${res.statusText}`);
    return res.json();
  },

  async remove(table, id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'DELETE', headers: SB.headers
    });
    if (!res.ok) throw new Error(`Delete failed: ${res.statusText}`);
    return true;
  }
};

// ============================================
// API FUNCTIONS (same interface as Apps Script)
// ============================================

const API = {
  // AUTH
  async login(pin) {
    const rows = await SB.query('employees', `pin=eq.${pin}&status=eq.Active&select=id,name,role,pin`);
    if (!rows.length) return { success: false, message: 'Invalid PIN or inactive account' };
    return { success: true, employee: rows[0] };
  },

  // PUNCHES
  async getDayData(employeeId, date) {
    const punches = await SB.query('punches',
      `employee_id=eq.${employeeId}&punch_date=eq.${date}&is_deleted=eq.false&select=id,punch_time,punch_type&order=punch_time`
    );
    const closures = await SB.query('closures', `start_date=lte.${date}&end_date=gte.${date}&select=name`);
    return {
      success: true,
      punches: punches.map(p => ({ punchId: p.id, time: p.punch_time.substring(0, 5), punchType: p.punch_type })),
      closure: closures.length ? closures[0].name : null
    };
  },

  async addPunch(employeeId, name, date, time) {
    const existing = await SB.query('punches',
      `employee_id=eq.${employeeId}&punch_date=eq.${date}&is_deleted=eq.false&select=id`
    );
    const punchType = existing.length % 2 === 0 ? 'IN' : 'OUT';
    const rows = await SB.insert('punches', {
      employee_id: employeeId, employee_name: name,
      punch_date: date, punch_time: time, punch_type: punchType
    });
    const p = rows[0];
    return {
      success: true,
      punch: { punchId: p.id, time, punchType },
      message: punchType === 'IN' ? 'Clocked in at ' + time : 'Clocked out at ' + time
    };
  },

  async editPunch(punchId, newTime) {
    await SB.update('punches', punchId, { punch_time: newTime });
    return { success: true, message: 'Punch updated' };
  },

  async deletePunch(punchId) {
    // Soft delete for audit trail
    await SB.update('punches', punchId, { is_deleted: true, deleted_at: new Date().toISOString(), deleted_reason: 'Deleted by user' });
    return { success: true, message: 'Punch deleted' };
  },

  async getPunchedDays(employeeId, year, month) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
    const rows = await SB.query('punches',
      `employee_id=eq.${employeeId}&punch_date=gte.${startDate}&punch_date=lte.${endDate}&is_deleted=eq.false&select=punch_date`
    );
    const days = {};
    rows.forEach(r => {
      const d = r.punch_date;
      if (!days[d]) days[d] = { count: 0 };
      days[d].count++;
    });
    return { success: true, days };
  },

  // HOLIDAYS
  async getHolidaySummary(employeeId) {
    const emp = (await SB.query('employees', `id=eq.${employeeId}`))[0];
    if (!emp) return { success: false, message: 'Employee not found' };
    const requests = await SB.query('holidays', `employee_id=eq.${employeeId}&select=*&order=created_at.desc`);

    const count = (type, status) => requests.filter(r => r.type === type && r.status === status).reduce((s, r) => s + r.days, 0);

    return {
      success: true,
      annualTotal: emp.annual_days, annualUsed: count('Annual', 'Approved'), annualPending: count('Annual', 'Pending'),
      annualRemaining: emp.annual_days - count('Annual', 'Approved') - count('Annual', 'Pending'),
      personalTotal: emp.personal_days, personalUsed: count('Personal', 'Approved'), personalPending: count('Personal', 'Pending'),
      personalRemaining: emp.personal_days - count('Personal', 'Approved') - count('Personal', 'Pending'),
      medicalUsed: count('Medical', 'Approved'), medicalPending: count('Medical', 'Pending'),
      medicalHoursTotal: emp.medical_hours,
      medApptUsed: count('MedAppt', 'Approved'), medApptPending: count('MedAppt', 'Pending'),
      requests: requests.map(r => ({
        requestId: r.id, type: r.type, startDate: r.start_date, endDate: r.end_date,
        days: r.days, reason: r.reason || '', status: r.status, requestDate: r.created_at
      }))
    };
  },

  async submitHoliday(employeeId, name, type, startDate, endDate, reason) {
    const totalDays = Math.floor((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
    const rows = await SB.insert('holidays', {
      employee_id: employeeId, employee_name: name, type,
      start_date: startDate, end_date: endDate, days: totalDays, reason: reason || null
    });
    return { success: true, requestId: rows[0].id, totalDays, message: 'Request submitted' };
  },

  // CLOSURES
  async getClosures() {
    const rows = await SB.query('closures', 'select=id,name,start_date,end_date&order=start_date');
    return {
      success: true,
      closures: rows.map(c => ({ closureId: c.id, name: c.name, startDate: c.start_date, endDate: c.end_date }))
    };
  },

  async addClosure(name, startDate, endDate) {
    const rows = await SB.insert('closures', { name, start_date: startDate, end_date: endDate });
    return { success: true, closureId: rows[0].id, message: 'Closure added' };
  },

  async deleteClosure(id) {
    await SB.remove('closures', id);
    return { success: true, message: 'Closure deleted' };
  },

  // EMPLOYEES
  async getEmployees() {
    const rows = await SB.query('employees', 'select=*&order=name');
    return {
      success: true,
      employees: rows.map(e => ({
        id: e.id, name: e.name, pin: e.pin, role: e.role, status: e.status,
        annualDays: e.annual_days, personalDays: e.personal_days,
        expectedHours: e.expected_hours, medicalHours: e.medical_hours
      }))
    };
  },

  async addEmployee(params) {
    const name = (params.name || '').toUpperCase().trim();
    if (!name) return { success: false, message: 'Name is required' };
    const pin = params.pin || String(Math.floor(1000 + Math.random() * 9000));
    // Check PIN uniqueness
    const existing = await SB.query('employees', `pin=eq.${pin}&select=id`);
    if (existing.length) return { success: false, message: 'PIN already in use' };
    const rows = await SB.insert('employees', {
      name, pin, role: params.role || 'employee',
      annual_days: params.annualDays || 30, personal_days: params.personalDays || 2,
      expected_hours: params.expectedHours || 1776, medical_hours: params.medicalHours || 20
    });
    return { success: true, id: rows[0].id, pin, message: `Employee ${name} added with PIN: ${pin}` };
  },

  async editEmployee(params) {
    const data = {};
    if (params.name) data.name = params.name.toUpperCase();
    if (params.pin) {
      const existing = await SB.query('employees', `pin=eq.${params.pin}&id=neq.${params.id}&select=id`);
      if (existing.length) return { success: false, message: 'PIN already in use' };
      data.pin = params.pin;
    }
    if (params.role) data.role = params.role;
    if (params.status) data.status = params.status;
    if (params.annualDays !== undefined) data.annual_days = params.annualDays;
    if (params.personalDays !== undefined) data.personal_days = params.personalDays;
    if (params.expectedHours !== undefined) data.expected_hours = params.expectedHours;
    if (params.medicalHours !== undefined) data.medical_hours = params.medicalHours;
    await SB.update('employees', params.id, data);
    return { success: true, message: 'Employee updated' };
  },

  async deleteEmployee(id) {
    await SB.remove('employees', id);
    return { success: true, message: 'Employee deleted' };
  },

  // ADMIN
  async approveHoliday(id) {
    await SB.update('holidays', id, { status: 'Approved', updated_at: new Date().toISOString() });
    return { success: true, message: 'Request approved' };
  },

  async rejectHoliday(id) {
    await SB.update('holidays', id, { status: 'Rejected', updated_at: new Date().toISOString() });
    return { success: true, message: 'Request rejected' };
  },

  async adminInit(year, month) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

    const [employees, allPunches, pendingHols, approvedHols, closures] = await Promise.all([
      SB.query('employees', 'select=*&order=name'),
      SB.query('punches', `punch_date=gte.${startDate}&punch_date=lte.${endDate}&is_deleted=eq.false&select=employee_id,punch_date,punch_time,punch_type&order=punch_time`),
      SB.query('holidays', 'status=eq.Pending&select=*&order=created_at.desc'),
      SB.query('holidays', 'status=eq.Approved&select=*&order=created_at.desc'),
      SB.query('closures', 'select=*&order=start_date')
    ]);

    const activeEmps = employees.filter(e => e.status === 'Active');
    const dashboard = activeEmps.map(emp => {
      const empPunches = allPunches.filter(p => p.employee_id === emp.id);
      const dayMap = {};
      empPunches.forEach(p => {
        if (!dayMap[p.punch_date]) dayMap[p.punch_date] = [];
        dayMap[p.punch_date].push(p);
      });
      const dailyHours = {};
      let totalMins = 0;
      Object.entries(dayMap).forEach(([date, dps]) => {
        const sorted = dps.sort((a, b) => a.punch_time.localeCompare(b.punch_time));
        let dayMins = 0;
        for (let i = 0; i < sorted.length - 1; i += 2) {
          if (sorted[i].punch_type === 'IN' && sorted[i+1]?.punch_type === 'OUT') {
            const [ih, im] = sorted[i].punch_time.split(':').map(Number);
            const [oh, om] = sorted[i+1].punch_time.split(':').map(Number);
            const diff = (oh*60+om) - (ih*60+im);
            if (diff > 0) dayMins += diff;
          }
        }
        dailyHours[date] = Math.round((dayMins/60)*100)/100;
        totalMins += dayMins;
      });
      return {
        id: emp.id, name: emp.name, role: emp.role,
        pin: emp.pin, status: emp.status,
        annualDays: emp.annual_days, personalDays: emp.personal_days,
        expectedHours: emp.expected_hours, medicalHours: emp.medical_hours,
        monthHours: Math.round((totalMins/60)*100)/100,
        daysWorked: Object.keys(dayMap).length,
        dailyHours
      };
    });

    const mapHol = r => ({
      requestId: r.id, employeeId: r.employee_id, employeeName: r.employee_name,
      type: r.type, startDate: r.start_date, endDate: r.end_date,
      days: r.days, reason: r.reason || '', status: r.status, requestDate: r.created_at
    });

    return {
      success: true,
      dashboard,
      employees: employees.map(e => ({
        id: e.id, name: e.name, pin: e.pin, role: e.role, status: e.status,
        annualDays: e.annual_days, personalDays: e.personal_days,
        expectedHours: e.expected_hours, medicalHours: e.medical_hours
      })),
      pendingRequests: pendingHols.map(mapHol),
      approvedHolidays: approvedHols.map(mapHol),
      closures: closures.map(c => ({ closureId: c.id, name: c.name, startDate: c.start_date, endDate: c.end_date })),
      month, year
    };
  }
};
