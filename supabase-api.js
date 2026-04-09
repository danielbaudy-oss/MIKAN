// ============================================
// MIKAN — Supabase API Layer (using official JS client)
// ============================================

// Load Supabase client from CDN (added in HTML via script tag)
// const supabase is initialized after the CDN script loads

const SUPABASE_URL = 'https://kxbmlsbxnzvgzucxleoy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4Ym1sc2J4bnp2Z3p1Y3hsZW95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NzE3ODgsImV4cCI6MjA5MTI0Nzc4OH0.OrKHnYy0vElWI9bQ-xYlE2RXy1TU2FknBPafp--3jMY';

let _sb = null;
async function getSB() {
  if (!_sb) _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return _sb;
}

// ============================================
// API FUNCTIONS
// ============================================
const API = {
  // AUTH
  async login(pin) {
    const { data, error } = await (await getSB()).from('employees').select('id,name,role,pin').eq('pin', pin).eq('status', 'Active');
    if (error) throw error;
    if (!data.length) return { success: false, message: 'Invalid PIN or inactive account' };
    return { success: true, employee: data[0] };
  },

  // PUNCHES
  async getDayData(employeeId, date) {
    const { data: punches, error } = await (await getSB()).from('punches')
      .select('id,punch_time,punch_type')
      .eq('employee_id', employeeId).eq('punch_date', date).eq('is_deleted', false)
      .order('punch_time');
    if (error) throw error;
    const { data: closures } = await (await getSB()).from('closures')
      .select('name').lte('start_date', date).gte('end_date', date);
    return {
      success: true,
      punches: (punches||[]).map(p => ({ punchId: p.id, time: p.punch_time.substring(0, 5), punchType: p.punch_type })),
      closure: closures?.length ? closures[0].name : null
    };
  },

  async addPunch(employeeId, name, date, time, lat, lng) {
    const { data: existing } = await (await getSB()).from('punches')
      .select('id').eq('employee_id', employeeId).eq('punch_date', date).eq('is_deleted', false);
    const punchType = (existing||[]).length % 2 === 0 ? 'IN' : 'OUT';
    const row = {
      employee_id: employeeId, employee_name: name,
      punch_date: date, punch_time: time, punch_type: punchType
    };
    if (lat && lng) { row.latitude = lat; row.longitude = lng; }
    const { data, error } = await (await getSB()).from('punches').insert(row).select();
    if (error) throw error;
    return {
      success: true,
      punch: { punchId: data[0].id, time, punchType },
      message: punchType === 'IN' ? 'Clocked in at ' + time : 'Clocked out at ' + time
    };
  },

  async editPunch(punchId, newTime, reason) {
    const { error } = await (await getSB()).from('punches').update({
      punch_time: newTime, edited_at: new Date().toISOString(),
      edit_reason: reason || 'Corrected by admin'
    }).eq('id', punchId);
    if (error) throw error;
    return { success: true, message: 'Punch updated' };
  },

  async deletePunch(punchId, reason) {
    const { error } = await (await getSB()).from('punches').update({
      is_deleted: true, deleted_at: new Date().toISOString(),
      deleted_reason: reason || 'Deleted by user'
    }).eq('id', punchId);
    if (error) throw error;
    return { success: true, message: 'Punch deleted' };
  },

  async getPunchedDays(employeeId, year, month) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    const { data, error } = await (await getSB()).from('punches')
      .select('punch_date').eq('employee_id', employeeId)
      .gte('punch_date', startDate).lte('punch_date', endDate).eq('is_deleted', false);
    if (error) throw error;
    const days = {};
    (data||[]).forEach(r => { const d=r.punch_date; if(!days[d])days[d]={count:0}; days[d].count++; });
    return { success: true, days };
  },

  // HOLIDAYS
  async getHolidaySummary(employeeId) {
    const { data: empArr } = await (await getSB()).from('employees').select('*').eq('id', employeeId);
    const emp = empArr?.[0];
    if (!emp) return { success: false, message: 'Employee not found' };
    const { data: requests } = await (await getSB()).from('holidays').select('*').eq('employee_id', employeeId).order('created_at', { ascending: false });
    const rr = requests || [];
    const count = (type, status) => rr.filter(r => r.type === type && r.status === status).reduce((s, r) => s + r.days, 0);
    return {
      success: true,
      annualTotal: emp.annual_days, annualUsed: count('Annual','Approved'), annualPending: count('Annual','Pending'),
      annualRemaining: emp.annual_days - count('Annual','Approved') - count('Annual','Pending'),
      personalTotal: emp.personal_days, personalUsed: count('Personal','Approved'), personalPending: count('Personal','Pending'),
      personalRemaining: emp.personal_days - count('Personal','Approved') - count('Personal','Pending'),
      medicalUsed: count('Medical','Approved'), medicalPending: count('Medical','Pending'),
      medicalHoursTotal: emp.medical_hours,
      medApptUsed: count('MedAppt','Approved'), medApptPending: count('MedAppt','Pending'),
      requests: rr.map(r => ({
        requestId: r.id, type: r.type, startDate: r.start_date, endDate: r.end_date,
        days: r.days, reason: r.reason||'', status: r.status, requestDate: r.created_at
      }))
    };
  },

  async submitHoliday(employeeId, name, type, startDate, endDate, reason) {
    const s = new Date(startDate), e = new Date(endDate);
    const totalDays = Math.floor((e - s) / 86400000) + 1;
    const { data, error } = await (await getSB()).from('holidays').insert({
      employee_id: employeeId, employee_name: name, type,
      start_date: startDate, end_date: endDate, days: totalDays, reason: reason || null
    }).select();
    if (error) throw error;
    return { success: true, requestId: data[0].id, totalDays, message: 'Request submitted' };
  },

  // CLOSURES
  async getClosures() {
    const { data, error } = await (await getSB()).from('closures').select('*').order('start_date');
    if (error) throw error;
    return { success: true, closures: (data||[]).map(c => ({ closureId: c.id, name: c.name, startDate: c.start_date, endDate: c.end_date })) };
  },
  async addClosure(name, startDate, endDate) {
    const { data, error } = await (await getSB()).from('closures').insert({ name, start_date: startDate, end_date: endDate }).select();
    if (error) throw error;
    return { success: true, closureId: data[0].id, message: 'Closure added' };
  },
  async deleteClosure(id) {
    const { error } = await (await getSB()).from('closures').delete().eq('id', id);
    if (error) throw error;
    return { success: true, message: 'Closure deleted' };
  },

  // EMPLOYEES
  async getEmployees() {
    const { data, error } = await (await getSB()).from('employees').select('*').order('name');
    if (error) throw error;
    return { success: true, employees: (data||[]).map(e => ({
      id: e.id, name: e.name, pin: e.pin, role: e.role, status: e.status,
      annualDays: e.annual_days, personalDays: e.personal_days,
      expectedHours: e.expected_hours, medicalHours: e.medical_hours
    })) };
  },
  async addEmployee(params) {
    const name = (params.name||'').toUpperCase().trim();
    if (!name) return { success: false, message: 'Name is required' };
    const pin = params.pin || String(Math.floor(1000 + Math.random() * 9000));
    const { data: existing } = await (await getSB()).from('employees').select('id').eq('pin', pin);
    if (existing?.length) return { success: false, message: 'PIN already in use' };
    const { data, error } = await (await getSB()).from('employees').insert({
      name, pin, role: params.role||'employee',
      annual_days: params.annualDays||30, personal_days: params.personalDays||2,
      expected_hours: params.expectedHours||1776, medical_hours: params.medicalHours||20
    }).select();
    if (error) throw error;
    return { success: true, id: data[0].id, pin, message: `Employee ${name} added with PIN: ${pin}` };
  },
  async editEmployee(params) {
    const data = {};
    if (params.name) data.name = params.name.toUpperCase();
    if (params.pin) {
      const { data: existing } = await (await getSB()).from('employees').select('id').eq('pin', params.pin).neq('id', params.id);
      if (existing?.length) return { success: false, message: 'PIN already in use' };
      data.pin = params.pin;
    }
    if (params.role) data.role = params.role;
    if (params.status) data.status = params.status;
    if (params.annualDays !== undefined) data.annual_days = Number(params.annualDays);
    if (params.personalDays !== undefined) data.personal_days = Number(params.personalDays);
    if (params.expectedHours !== undefined) data.expected_hours = Number(params.expectedHours);
    if (params.medicalHours !== undefined) data.medical_hours = Number(params.medicalHours);
    const { error } = await (await getSB()).from('employees').update(data).eq('id', params.id);
    if (error) throw error;
    return { success: true, message: 'Employee updated' };
  },
  async deleteEmployee(id) {
    const { error } = await (await getSB()).from('employees').delete().eq('id', id);
    if (error) throw error;
    return { success: true, message: 'Employee deleted' };
  },

  // ADMIN
  async approveHoliday(id) {
    const { error } = await (await getSB()).from('holidays').update({ status: 'Approved', updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    return { success: true, message: 'Request approved' };
  },
  async rejectHoliday(id) {
    const { error } = await (await getSB()).from('holidays').update({ status: 'Rejected', updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    return { success: true, message: 'Request rejected' };
  },

  // ADMIN INIT (batch load)
  async adminInit(year, month) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    const sb = await getSB();
    const [empRes, punchRes, pendRes, appRes, cloRes] = await Promise.all([
      sb.from('employees').select('*').order('name'),
      sb.from('punches').select('employee_id,punch_date,punch_time,punch_type').gte('punch_date', startDate).lte('punch_date', endDate).eq('is_deleted', false).order('punch_time'),
      sb.from('holidays').select('*').eq('status', 'Pending').order('created_at', { ascending: false }),
      sb.from('holidays').select('*').eq('status', 'Approved').order('created_at', { ascending: false }),
      sb.from('closures').select('*').order('start_date')
    ]);

    const employees = empRes.data || [];
    const allPunches = punchRes.data || [];
    const activeEmps = employees.filter(e => e.status === 'Active');

    const dashboard = activeEmps.map(emp => {
      const empPunches = allPunches.filter(p => p.employee_id === emp.id);
      const dayMap = {};
      empPunches.forEach(p => { if (!dayMap[p.punch_date]) dayMap[p.punch_date] = []; dayMap[p.punch_date].push(p); });
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
        id: emp.id, name: emp.name, role: emp.role, pin: emp.pin, status: emp.status,
        annualDays: emp.annual_days, personalDays: emp.personal_days,
        expectedHours: emp.expected_hours, medicalHours: emp.medical_hours,
        monthHours: Math.round((totalMins/60)*100)/100,
        daysWorked: Object.keys(dayMap).length, dailyHours
      };
    });

    const mapHol = r => ({
      requestId: r.id, employeeId: r.employee_id, employeeName: r.employee_name,
      type: r.type, startDate: r.start_date, endDate: r.end_date,
      days: r.days, reason: r.reason||'', status: r.status, requestDate: r.created_at
    });

    return {
      success: true, dashboard,
      employees: employees.map(e => ({
        id: e.id, name: e.name, pin: e.pin, role: e.role, status: e.status,
        annualDays: e.annual_days, personalDays: e.personal_days,
        expectedHours: e.expected_hours, medicalHours: e.medical_hours
      })),
      pendingRequests: (pendRes.data||[]).map(mapHol),
      approvedHolidays: (appRes.data||[]).map(mapHol),
      closures: (cloRes.data||[]).map(c => ({ closureId: c.id, name: c.name, startDate: c.start_date, endDate: c.end_date })),
      month, year
    };
  }
};
