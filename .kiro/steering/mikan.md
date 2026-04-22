# MIKAN Restaurant Punch Clock — Project Steering

## What This Is
Employee time clock for MIKAN restaurant in Barcelona. 10 employees. PIN-based login (no Google account). Frontend on GitHub Pages, backend on Supabase PostgreSQL. Legally compliant with Spanish time-tracking law (Real Decreto-ley 8/2019 + 2026 updates).

## URLs
- **Live app:** https://danielbaudy-oss.github.io/MIKAN/
- **GitHub repo:** https://github.com/danielbaudy-oss/MIKAN
- **Supabase project (MIKAN):** https://kxbmlsbxnzvgzucxleoy.supabase.co
- **Supabase project (WorldClass school — DO NOT TOUCH):** https://ruytavhodexoxkejrgyb.supabase.co

## CRITICAL: Two Supabase Projects
User has TWO Supabase projects on free tier:
1. **MIKAN** (`kxbmlsbxnzvgzucxleoy`) — this app
2. **WorldClass school app** (`ruytavhodexoxkejrgyb`) — separate app, don't touch

**The Supabase MCP is connected to MIKAN** (`kxbmlsbxnzvgzucxleoy`). Always verify with `mcp_supabase_get_project_url` before any write operation, and double-check table names match MIKAN's schema (`employees`, `punches`, `holidays`, `closures`, etc.) — if you see `profiles`, `time_punches`, `school_holidays`, you're on the wrong project and should stop.

## File Structure
```
index.html        — PIN login (4-digit numpad)
employee.html     — Employee clock in/out + time off requests
admin.html        — Admin panel (hours, time off, closures)
supabase-api.js   — Shared API layer (all tables/queries)
logo.png          — MIKAN cat-drinking-wine logo
manifest.json     — PWA manifest
MIKAN_Compliance_Summary.html — Legal compliance doc (printable)
supabase/         — SQL schema files (reference only)
.kiro/steering/   — This file
```

## Deploy Workflow
- **ALL changes are frontend** — no backend code anymore, Supabase generates the API
- `git add <files> ; git commit -m "msg" ; git push origin main` — GitHub Pages auto-deploys
- Database changes: run SQL in MIKAN Supabase dashboard SQL editor

## Auth
- **Google OAuth via Supabase** (provider enabled in Supabase dashboard)
- Employees sign in at index.html with their Google account
- Admin pre-creates the employee row in the admin panel with a Gmail address
- On first successful Google sign-in, `link_employee_by_email` RPC ties the `auth.users.id` to `employees.auth_user_id`
- Session lives in Supabase's own localStorage (managed by the JS SDK); a lightweight mirror is kept in `sessionStorage.mikan_user` so the other pages can read name/role without a round-trip
- `requireAuth()` / `getCurrentEmployee()` helpers in `supabase-api.js` guard admin.html and employee.html
- Role `admin` → can pick admin or employee panel from index.html; role `employee` → routed straight to employee.html
- Admin role accounts landing on employee.html see a floating "→ Admin" switcher button

## Google Cloud / Supabase setup
- OAuth client in Google Cloud Console (independent project, not shared with WorldClass)
- Authorized JS origins: `https://danielbaudy-oss.github.io`, `https://kxbmlsbxnzvgzucxleoy.supabase.co`
- Authorized redirect URI: `https://kxbmlsbxnzvgzucxleoy.supabase.co/auth/v1/callback`
- Supabase → Auth → Providers → Google → enabled with client ID + secret
- Supabase → Auth → URL Configuration → Site URL: `https://danielbaudy-oss.github.io/MIKAN/`
- OAuth consent screen in Testing mode; test users list holds every employee's Gmail

## Supabase Tables (MIKAN project)
- `employees` — id, name, email (unique), auth_user_id (FK auth.users), role, status, annual_days (30), personal_days (2), expected_hours (1791), medical_hours (20)
- `punches` — id, employee_id, employee_name, punch_date, punch_time, punch_type (IN/OUT), latitude, longitude, is_deleted, deleted_at, deleted_reason, edited_at, edit_reason, original_time
- `holidays` — id, employee_id, employee_name, type (Annual/Personal/Medical/MedAppt), start_date, end_date, days, reason, status (Pending/Approved/Rejected)
- `closures` — id, name, start_date, end_date
- `paid_hours` — id, employee_id, employee_name, hours, date, notes, created_by
- `app_config` — key/value (RestaurantName, FreezeDate, AllowPastPunches, MaxPastDays, DuplicateWindowMinutes)
- `audit_log` — id, table_name, record_id, action (INSERT/UPDATE/DELETE), old_data (jsonb), new_data (jsonb), changed_by, changed_at

RLS is **disabled** on all tables (PIN auth at app level, no public exposure).
Audit triggers auto-log all writes to every table.

## Convenio Colectivo — Cataluña Hostelería y Turismo 2022–2024
Numbers below come from the interprovincial collective agreement for the hospitality sector in Catalonia. These are the defaults the app uses; individual employees can override.

- **Annual hours (Art. 28):** 1,791h (≈40h/week annualized) → `expected_hours` default
- **Vacation (Art. 30):** 30 natural days, preferably Apr 1–Oct 31 → `annual_days` default
- **Personal days (Art. 33):** 2 days/year "asuntos propios", 90-day seniority required → `personal_days` default
- **Weekly rest (Art. 29):** minimum 2 consecutive days off
- **Overtime (Art. 34):** max **80h/year** per worker (app shows overtime column with warn at 60h, danger at 80h+)
- **Split shift (Art. 28.B.b):** max 5h / min 3h per turn, minimum 1.5h between turns
- **Single shift (Art. 28.B.a):** 20-min paid break when shift >5h
- **Rest between shifts:** default 12h (ET art. 34.3); 10h allowed only in specific tourist zones
- **Paid leave (Art. 33):** marriage 15d, bereavement/serious illness 3d (5d if travel), child/family wedding 1–3d, moving 2d (once per 12m), breastfeeding accumulated 19 consecutive days
- **End-of-contract indemnification (Art. 27):** 12 days of salary per year worked (non-indefinite)

The convenio text lives at `convenio-hosteleria-interprovincial-2022-2024-castellano.pdf` in the repo root (local reference only; not deployed).

## Branding / Aesthetics
**The vibe:** warm, minimal, restaurant-y. No emojis in headers/buttons (they got systematically removed). Clean typography, generous whitespace.

**Color palette (stick to this):**
- `--bg: #f1dfd3` — main background (warm beige)
- `--accent: #e9b595` — light brown accent
- `--accent-dark: #d4956e` — dark brown (primary actions on Clock side)
- `--olive: #81916e` — olive green (used for Time Off side, success, Clock IN button)
- `--cream: #f3f3ee` — cream (contrast backgrounds, cream-colored cards)
- `--border: #e0d0c4`
- `--text: #1a1a1a` — black text
- `--text-dim: #6b5c52`

**Tab distinction:**
- Clock tab active → brown (`--accent-dark`)
- Time Off tab active → olive (`--olive`)
- Apply `.olive` class on Time Off when active

**Holiday type colors (with matching darker borders):**
- Annual (Vacation): `#dbeafe` bg, `#3b82f6` border, `#1e40af` text
- Personal: `#ede9fe` bg, `#8b5cf6` border, `#5b21b6` text
- Medical (Sick): `#fee2e2` bg, `#ef4444` border, `#991b1b` text
- MedAppt (Med. Visit): `#fef3c7` bg, `#f59e0b` border, `#92400e` text
- Closures: `#fef3c7` bg, `#f59e0b` border (same as Med. Visit)
- Pending: 55% opacity overlay

Logo: transparent PNG, the cat drinking wine.

## Date/Timezone Handling — CRITICAL
Supabase `date` columns return clean `yyyy-MM-dd` strings. **Never use `new Date('yyyy-MM-dd')` on frontend** — it parses as UTC midnight and shifts the day.

Use this helper instead:
```js
function parseDateLocal(ds){const[y,m,d]=ds.split('-').map(Number);return new Date(y,m-1,d);}
```

## Compliance Features (for Spanish labour law 2026)
- **Audit trail** via PostgreSQL triggers on all tables (tamper-proof)
- **GPS capture** on every punch (lat/lng stored, graceful fallback if denied)
- **Mandatory reason** for punch edits and deletions (both employee and admin)
- **Soft delete** on punches (`is_deleted` flag, original never removed)
- **Admin-only edits after 12h** — employees can edit/delete their own punches within 12h, after that only admin
- **Freeze date system** — admin can freeze all punches up to a date
- **Duplicate prevention** — punches within 2 minutes of each other blocked
- **4-year retention** — no automatic deletion
- **No biometrics** — Google OAuth only (no shared credentials)
- **Inspector view** — `inspector_report` SQL view + Audit Report Excel export (2 sheets: Punches + Audit Trail)

## Employee View Features (employee.html)
**Clock tab:**
- Date navigation (prev/next), calendar picker with cached months (no reload flash)
- Native time picker (clock icon hidden, whole field clickable on desktop)
- CLOCK IN (olive) / CLOCK OUT (amber) button — no emojis
- Punch list with edit/delete — only shown for punches <12h old
- Edit/delete use custom modals (NOT `prompt()`) with mandatory reason field
- Delete button goes straight to the reason modal (no inline confirm)
- Total hours card

**Time Off tab (olive theme when active):**
- Balance summary card (olive gradient): Vacation, Personal, Sick Days, Med. Visit hours
- Request form with 4 types: Annual, Personal, Medical, MedAppt (hour-based time range)
- Date inputs allow past dates (for retroactive requests)
- My Requests list shows Pending + Approved + Rejected
- Each request has an ✕ dismiss button (stored in localStorage per user — DB record stays)
- Submit updates in-place (no full tab rebuild)

**Calendar overlay:**
- Shows punched days, approved holidays (color-coded by type), closures
- Navigate up to 12 months future, unlimited past
- Click month label to jump back to today (shows "↺ Today" hint)
- Month cache — no reload flash when navigating
- Legend at bottom showing all types with darker borders

## Admin View Features (admin.html)
**Sidebar:** Employee Hours | Time Off | Annual Archive

**Employee Hours:**
- Tabs: Employees | Paid Hours (full CRUD) | Freeze (freeze through date, unfreeze)
- Monthly/Weekly view toggle with period selector in tab bar
- Search filter, click row → edit employee modal, 📅 button → calendar modal
- Calendar modal: click day → day detail with punches, admin can add/edit/delete (with reason)
- Stats grid (5 cards): employees count, period hours (month/week), year hours, on-track ratio (employees ≥95% of prorated 1,791h), pending requests
- CSV Export + Audit Report Excel Export (compliance)

**Time Off:**
- Sub-tabs: Requests (Pending/Approved) | Overview | Calendar | Closures
- Requests tab badge only shows when count > 0
- Cancel approved requests requires reason
- Calendar view: tall cells with employee name badges, colored by type with darker borders
- Navigate past/future freely with ↺ Today button
- Legend at bottom

## State / Caching Pattern
- Admin: `loadAll()` does one `adminInit` batch call, caches in `S` state, renders instantly on section/tab switches. Only month change refetches.
- Employee: `S.dayCache` for punch day data, `S.monthCache` for calendar, holiday data pre-loaded on init.
- Invalidation happens on write operations.

## UX Patterns (don't break these)
- **Button loading states** — disable + show `⏳` on action, restore text on error
- **In-place updates** — never blank the whole page for refreshes; update table rows / stat cards in place
- **Custom modals** — always use the app's modal system, never browser `alert()` / `confirm()` / `prompt()`
- **Row click = primary action** (edit), icon buttons = secondary (calendar view, delete)
- **Double-tap zoom disabled** via `touch-action: manipulation` on `*`

## Legacy / Historical
- App started on Google Apps Script + Google Sheets (like the WorldClass school app)
- Migrated to Supabase for speed (50ms vs 3-8s cold starts) and legal compliance
- The WorldClass school app is the "big brother" — features often get built there first and ported over
