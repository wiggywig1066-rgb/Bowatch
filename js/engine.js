// Bo Watch forecast engine. Plain ES module, no dependencies. Runs in the browser and in Node 18+.
//
// Two modes:
//   "estimate"  No POS history loaded. Uses the original app's hand-drawn weekday curves plus the
//               same additive rules (280 rush, church, apps, payday). Numbers are estimates.
//   "pos"       A POS CSV is loaded. Baseline = median tickets for the same weekday + hour over the
//               last 8 weeks. Item ratios and app share are learned from the same file. Only things a
//               weekday median cannot know (events, weather, no-school days, holidays, 1st of month)
//               are layered on top as multipliers.

export const TZ = "America/Chicago";
export const STORE = {
  name: "Bojangles", nickname: "Chelsea 280", address: "15392 US-280", city: "Chelsea", state: "AL", zip: "35043",
  phone: "(205) 678-0449", lat: 33.3401, lng: -86.6303,
};
// Sun..Sat. Drive-thru close; lobby ~9 PM.
export const HOURS = [{ open: 6, close: 22 }, { open: 5, close: 22 }, { open: 5, close: 22 }, { open: 5, close: 22 }, { open: 5, close: 22 }, { open: 5, close: 22 }, { open: 5, close: 22 }];
export const DAYS_AHEAD = 14;

// Original app's popularity curves (0-100 index), Sun..Sat x 24 hours.
const CURVES = [
  [0,0,0,0,0,0,10,18,28,42,58,64,58,36,22,18,22,34,40,28,16,10,0,0],
  [0,0,0,0,0,12,26,48,44,30,28,46,64,50,22,16,26,44,50,34,20,12,0,0],
  [0,0,0,0,0,10,22,42,38,26,24,40,58,46,20,14,22,38,44,30,18,10,0,0],
  [0,0,0,0,0,11,24,46,42,28,26,44,62,48,22,16,24,42,48,34,20,12,0,0],
  [0,0,0,0,0,12,26,46,42,30,28,44,62,50,24,18,26,44,50,36,22,13,0,0],
  [0,0,0,0,0,14,28,50,46,32,30,50,68,54,26,20,32,52,58,42,26,16,0,0],
  [0,0,0,0,0,16,32,48,58,62,54,60,68,52,34,28,32,42,48,34,22,14,0,0]];
const TICKETS_PER_POINT = 0.92; // original: tickets = popularity * 0.92

export const DAY_NOTES = [
  "Sunday stays modest until church lets out — then biscuits and family meals spike.",
  "Monday follows the work week: breakfast out, afternoon lull, dinner return.",
  "Tuesday is the deadest weekday — best bet for a short drive-thru.",
  "Wednesday tracks a normal weekday, with midweek church adding an evening lift.",
  "Thursday builds toward Friday. Evening is the second-busiest weeknight.",
  "Friday lunch and dinner run hotter — payday plus weekend family meals.",
  "Saturday morning biscuits stay busy through 11 AM; lunch is the weekly peak hour."];

// Weekly rules. delta = popularity points (estimate mode only, same values as the original app).
// app = kitchen-load points from delivery apps. school:true rules only fire on school days.
const WEEKLY = [
  { days:[1,2,3,4,5], s:6, e:9, delta:16, kind:"commute", label:"US-280 westbound rush", detail:"Morning inbound to Birmingham / over-the-mountain. Chelsea is the outer biscuit stop." },
  { days:[1,2,3,4,5], s:16, e:19, delta:22, kind:"commute", label:"US-280 eastbound rush", detail:"Evening outbound 4:00–6:30 PM is the worst 280 window." },
  { days:[1,2,3,4,5], s:7, e:8, delta:3, kind:"school", school:true, label:"CHS drop-off", detail:"First bell 7:35 AM. Parents who skip cafeteria breakfast hit 280 on the way." },
  { days:[1,2,3,4,5], s:15, e:16, delta:4, kind:"school", school:true, label:"CHS dismissal", detail:"3:00 PM bell. After-school snack / practice pickup on the 280 strip." },
  { days:[0], s:9, e:13, delta:8, kind:"church", label:"Sunday church corridor", detail:"Stacked services 9:00–10:45 AM on Chelsea Rd, Hwy 11, and the CMS/CHS campuses." },
  { days:[0], s:9, e:13, delta:18, kind:"church", label:"Sunday church let-out", detail:"Liberty Baptist 9:15 & 10:45, Chelsea Community 9:00 & 10:30, Generation Church 10:30 at CHS, Word of Life 10:00, Chelsea Pres 10:30 at CMS, St. Catherine’s 10:00. Same lift the original board used." },
  { days:[3], s:17, e:19, delta:3, kind:"church", label:"Wednesday night church", detail:"Midweek services 6:00–6:30 PM. Family meals 5–7 PM." },
  { days:[6], s:10, e:16, delta:3, kind:"retail", label:"Weekend Walmart spillover", detail:"Supercenter 0.6 mi east. Saturday grocery is the weekly retail peak." },
  { days:[5], s:11, e:20, delta:6, kind:"payday", label:"Friday payday", detail:"Weekly/biweekly payroll lifts lunch and dinner checks." },
  { days:[1,2,3,4,5], s:11, e:14, delta:4, app:4, kind:"delivery", label:"DoorDash / Uber Eats lunch tickets", detail:"Same fryer as the drive-thru. Dasher lunch 10:30 AM–1:30 PM." },
  { days:[1,2,3,4], s:17, e:20, delta:6, app:6, kind:"delivery", label:"Evening delivery peak", detail:"Uber Eats lists this store as most popular in the evening." },
  { days:[5,6], s:17, e:21, delta:9, app:9, kind:"delivery", label:"Fri–Sat delivery crush", detail:"Kitchen is bagging for drivers and working the 280 lane at once." },
  { days:[0], s:17, e:20, delta:5, app:5, kind:"delivery", label:"Sunday dinner delivery", detail:"Sunday 5–8:30 PM is a strong delivery block." },
  { days:[0,6], s:10, e:13, delta:3, app:3, kind:"delivery", label:"Weekend brunch app tickets", detail:"App, DoorDash, and Google Ordering stack biscuit combos on the morning line." },
  { days:[6], s:6, e:9, delta:4, kind:"local", label:"4x4 morning staging", detail:"A regular 4x4 group stages in this lot before weekend rides; trailers park and walk in." },
  { days:[1,2,3,4,5], s:8, e:10, delta:2, app:2, kind:"delivery", label:"ezCater / office breakfast trays", detail:"Weekday office trays hit the biscuit line, not the 280 lane." },
];

// Per-ticket item ratios by daypart (original app). Biscuits, chicken and tenders are replaced by
// POS-learned ratios when a POS file with those columns is loaded.
// Menu check 2026-10-20 (data/menu.json): the Chelsea store does not sell Chicken Supremes. Its boneless
// line is Bo's Chicken Tenders (plus Bo Bites). The old "supremes" per-ticket share is carried over
// unchanged as "tenders" -- an ESTIMATE, not measured at this store. A POS "tenders" column replaces it.
// boRounds = Bo-Tato Rounds, fries = Bo Fries, teaOz = Legendary Iced Tea, sides = the other fixins.
const DEFAULT_RATIOS = {
  breakfast:{biscuits:1.35,chicken:0.3,tenders:0.1,breakfastProteins:0.55,fries:0.18,boRounds:0.04,sides:0.12,gravy:0.28,teaOz:6},
  lunch:{biscuits:0.95,chicken:2,tenders:0.5,breakfastProteins:0.06,fries:0.7,boRounds:0.12,sides:0.32,gravy:0.05,teaOz:12},
  afternoon:{biscuits:0.8,chicken:1.4,tenders:0.35,breakfastProteins:0.04,fries:0.5,boRounds:0.08,sides:0.22,gravy:0.04,teaOz:8},
  dinner:{biscuits:1.1,chicken:2.6,tenders:0.55,breakfastProteins:0.02,fries:0.8,boRounds:0.16,sides:0.65,gravy:0.06,teaOz:12},
  late:{biscuits:0.7,chicken:1.6,tenders:0.4,breakfastProteins:0,fries:0.55,boRounds:0.1,sides:0.28,gravy:0.03,teaOz:8}};
export const partOf = h => h < 11 ? "breakfast" : h < 14 ? "lunch" : h < 17 ? "afternoon" : h < 20 ? "dinner" : "late";

export const DAYPARTS = [
  { id:"open", name:"Open", start:5, end:11, note:"Biscuit maker at the door. Cajun filets and gravy before the 7:35 bell." },
  { id:"lunch", name:"Lunch", start:11, end:14, note:"Bone-in and Bo's Tenders. Dashers are in the lot 11–2." },
  { id:"afternoon", name:"Afternoon", start:14, end:17, note:"Cut a person. Do not fry the dinner drop at 2." },
  { id:"dinner", name:"Dinner", start:17, end:20, note:"Family meals and app bags. Mac and dirty rice before 5, not at 5." },
  { id:"close", name:"Close", start:20, end:22, note:"Last biscuit drop around 9. Lobby is already dark." }];

// ---------------- date helpers (keys are Chicago-local YYYY-MM-DD) ----------------
const pad = n => String(n).padStart(2, "0");
export const addDays = (k, n) => { const [y,m,d] = k.split("-").map(Number); const t = new Date(Date.UTC(y, m-1, d+n)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth()+1)}-${pad(t.getUTCDate())}`; };
export const dow = k => { const [y,m,d] = k.split("-").map(Number); return new Date(Date.UTC(y, m-1, d)).getUTCDay(); };
const FMT = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23" });
export function chicagoNow(date = new Date()) {
  const p = {}; for (const x of FMT.formatToParts(date)) if (x.type !== "literal") p[x.type] = x.value;
  return { dateKey: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute) };
}
export const WD = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
export const WDL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
export const hourLabel = h => h === 0 || h === 24 ? "12 AM" : h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h-12} PM`;
export const hourRange = h => `${hourLabel(h)}–${hourLabel((h+1) % 24)}`;
export const shortHour = h => h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h-12}p`;
export const monthDay = k => { const [y,m,d] = k.split("-").map(Number); return new Date(Date.UTC(y,m-1,d)).toLocaleDateString("en-US", { month:"short", day:"numeric", timeZone:"UTC" }); };

// ---------------- bands (same cut-offs as the original) ----------------
export function band(score) {
  return score <= 0 ? { key:"closed", label:"Closed", wait:"—" }
    : score <= 2 ? { key:"dead", label:"Dead", wait:"No wait" }
    : score <= 4 ? { key:"slow", label:"Slow", wait:"2–5 min" }
    : score <= 6 ? { key:"moderate", label:"Moderate", wait:"5–10 min" }
    : score <= 8 ? { key:"busy", label:"Busy", wait:"10–18 min" }
    : { key:"packed", label:"Packed", wait:"18–35 min" };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round5 = v => v <= 0 ? 0 : Math.max(5, Math.round(v / 5) * 5);

// ---------------- POS ----------------
function splitCSVLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i+1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur); return out.map(s => s.trim());
}
const NUM_COLS = ["tickets","net_sales","biscuits","chicken_pieces","tenders","channel_drive_thru","channel_lobby","channel_doordash","channel_ubereats","channel_grubhub","channel_app","labor_hours"];
export function parsePOS(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error("CSV has no data rows.");
  const cols = splitCSVLine(lines[0]).map(c => c.toLowerCase());
  for (const need of ["date","hour","tickets"]) if (!cols.includes(need)) throw new Error(`Missing column "${need}". Use the pos_template.csv header.`);
  const rows = [], bad = [];
  lines.slice(1).forEach((l, i) => {
    const v = splitCSVLine(l), o = {};
    cols.forEach((c, j) => { o[c] = v[j] ?? ""; });
    let date = o.date;
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date); if (us) date = `${us[3]}-${pad(us[1])}-${pad(us[2])}`;
    const hour = Number(String(o.hour).split(":")[0]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(hour >= 0 && hour <= 23)) { bad.push(i + 2); return; }
    if (/^EXAMPLE/i.test(o.notes || "")) return;
    const r = { date, hour, notes: o.notes || "" };
    // Older exports used a "supremes" column; read it as tenders (the store's boneless line) when no tenders column is present.
    if (o.tenders == null && o.supremes != null) o.tenders = o.supremes;
    for (const c of NUM_COLS) r[c] = o[c] === "" || o[c] == null ? null : Number(o[c]);
    if (r.tickets == null || Number.isNaN(r.tickets)) { bad.push(i + 2); return; }
    rows.push(r);
  });
  if (!rows.length) throw new Error("No usable rows (need date as YYYY-MM-DD, hour 0–23, tickets).");
  rows.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.hour - b.hour);
  return { rows, badLines: bad, first: rows[0].date, last: rows[rows.length - 1].date, days: new Set(rows.map(r => r.date)).size };
}
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2; };

export function learnFromPOS(pos, { asOf, weeks = 8, excludeDates = new Set() }) {
  const cutoff = addDays(asOf, -7 * weeks);
  const cells = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => []));
  const app = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ t: 0, a: 0, n: 0 })));
  for (const r of pos.rows) {
    if (r.date < cutoff || r.date >= asOf || excludeDates.has(r.date)) continue;
    const d = dow(r.date); cells[d][r.hour].push(r.tickets);
    const a = (r.channel_doordash ?? 0) + (r.channel_ubereats ?? 0) + (r.channel_grubhub ?? 0) + (r.channel_app ?? 0);
    if (r.channel_doordash != null || r.channel_ubereats != null) { app[d][r.hour].t += r.tickets; app[d][r.hour].a += a; app[d][r.hour].n++; }
  }
  const base = cells.map(day => day.map(v => v.length >= 2 ? median(v) : null));
  const samples = cells.map(day => day.map(v => v.length));
  const appShare = app.map(day => day.map(c => c.n && c.t ? c.a / c.t : null));
  // Ratios per daypart (all history, not just the window, so thin columns still learn).
  const acc = {};
  for (const r of pos.rows) { const p = partOf(r.hour); acc[p] ??= { t:0, b:0, c:0, s:0, bn:0, cn:0, sn:0 };
    if (!r.tickets) continue; const a = acc[p];
    if (r.biscuits != null) { a.b += r.biscuits; a.bn += r.tickets; }
    if (r.chicken_pieces != null) { a.c += r.chicken_pieces; a.cn += r.tickets; }
    if (r.tenders != null) { a.s += r.tenders; a.sn += r.tickets; } }
  const ratios = structuredClone(DEFAULT_RATIOS), learned = [];
  for (const [p, a] of Object.entries(acc)) {
    if (a.bn >= 200) { ratios[p].biscuits = a.b / a.bn; learned.push(`${p} biscuits`); }
    if (a.cn >= 200) { ratios[p].chicken = a.c / a.cn; learned.push(`${p} chicken`); }
    if (a.sn >= 200) { ratios[p].tenders = a.s / a.sn; learned.push(`${p} tenders`); }
  }
  // Scale factor so cells with too few samples fall back to the curve shape at this store's volume.
  let num = 0, den = 0;
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) if (base[d][h] != null && CURVES[d][h]) { num += base[d][h]; den += CURVES[d][h]; }
  const curveScale = den ? num / den : TICKETS_PER_POINT;
  const filled = base.flat().filter(v => v != null).length;
  return { base, samples, appShare, ratios, learnedRatios: learned, curveScale, filledCells: filled, weeks };
}

// ---------------- calendar ----------------
export function makeCalendar(json) {
  const cal = json || {};
  const sc = cal.schoolCalendar || {};
  const closed = new Set(sc.closed || []), early = new Set(sc.earlyDismissal || []);
  const isSchoolDay = k => { const d = dow(k); if (d === 0 || d === 6) return false; if (sc.firstDay && k < sc.firstDay) return false; if (sc.lastDay && k > sc.lastDay) return false; return !closed.has(k); };
  const events = (cal.events || []).filter(e => e && e.date && e.lift != null);
  return { isSchoolDay, isEarly: k => early.has(k), events, eventsOn: k => events.filter(e => e.date === k), hasSchoolData: !!sc.firstDay, raw: cal };
}

// ---------------- weather ----------------
// byHour["YYYY-MM-DD|H"] = { tempF, pop, code, short, src }; byDay[key] = { high, low, rain, summary }
export function weatherFactor(w, day, h) {
  if (!w) return null;
  let f = 1, app = 0; const why = [];
  const pop = w.pop ?? 0, severe = (w.code >= 95) || (w.short && /thunder|severe/i.test(w.short) && pop >= 70);
  if (severe) { f *= 0.9; why.push("severe storms keep families home"); }
  else if (pop >= 60 && h >= 11 && h <= 19) { f *= 1.05; app += 2; why.push("steady rain favors the lane and stacks app tickets on the same fryer"); }
  else if (pop >= 35 && h >= 16 && h <= 19) { f *= 1.03; app += 1; why.push("storm chance after work — more cars stay in the lane"); }
  else if (pop >= 35 && h >= 11 && h <= 13) { f *= 1.02; app += 2; why.push("wet lunch hour lifts DoorDash / Uber / Grubhub"); }
  if (w.tempF != null && w.tempF <= 32 && h <= 9) { f *= 0.92; why.push("freezing morning"); }
  if (day?.high >= 90 && h >= 11 && h <= 18) { f *= 1.03; why.push("heat favors the drive-thru"); }
  if (!why.length) return null;
  return { factor: f, app, label: `${Math.round(w.tempF)}° · ${pop}% rain${w.short ? ` · ${w.short}` : ""}`, detail: `${why.join("; ")} (${w.src})` };
}
const WMO = { 0:"Clear", 1:"Mostly clear", 2:"Partly cloudy", 3:"Cloudy", 45:"Fog", 48:"Fog", 51:"Drizzle", 53:"Drizzle", 55:"Drizzle", 56:"Freezing drizzle", 57:"Freezing drizzle", 61:"Light rain", 63:"Rain", 65:"Heavy rain", 66:"Freezing rain", 67:"Freezing rain", 71:"Light snow", 73:"Snow", 75:"Heavy snow", 77:"Snow", 80:"Showers", 81:"Showers", 82:"Heavy showers", 85:"Snow showers", 86:"Snow showers", 95:"Thunderstorms", 96:"Storms, hail", 99:"Storms, hail" };
export async function fetchWeather(fetchFn = fetch) {
  const byHour = {}, byDay = {}, sources = [];
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${STORE.lat}&longitude=${STORE.lng}&hourly=temperature_2m,precipitation_probability,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&temperature_unit=fahrenheit&timezone=${encodeURIComponent(TZ)}&forecast_days=16`;
    const r = await fetchFn(u); if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
    const j = await r.json();
    j.hourly.time.forEach((t, i) => { byHour[`${t.slice(0,10)}|${Number(t.slice(11,13))}`] = { tempF: j.hourly.temperature_2m[i], pop: j.hourly.precipitation_probability[i] ?? 0, code: j.hourly.weather_code[i], src: "Open-Meteo" }; });
    j.daily.time.forEach((t, i) => { byDay[t] = { high: Math.round(j.daily.temperature_2m_max[i]), low: Math.round(j.daily.temperature_2m_min[i]), rain: j.daily.precipitation_probability_max[i] ?? 0, summary: WMO[j.daily.weather_code[i]] ?? "", src: "Open-Meteo" }; });
    sources.push("Open-Meteo");
  } catch (e) { sources.push(`Open-Meteo failed: ${e.message}`); }
  try { // NWS hourly overrides the first ~7 days (official forecast for this grid point)
    const pts = await (await fetchFn(`https://api.weather.gov/points/${STORE.lat},${STORE.lng}`, { headers: { Accept: "application/geo+json" } })).json();
    const hr = await fetchFn(pts.properties.forecastHourly, { headers: { Accept: "application/geo+json" } }); if (!hr.ok) throw new Error(`NWS ${hr.status}`);
    const hourly = await hr.json(); let n = 0;
    for (const p of hourly.properties.periods) {
      const { dateKey, hour } = chicagoNow(new Date(p.startTime)), k = `${dateKey}|${hour}`, prev = byHour[k];
      byHour[k] = { tempF: p.temperature, pop: p.probabilityOfPrecipitation?.value ?? prev?.pop ?? 0, code: prev?.code, short: p.shortForecast, src: "NWS" }; n++;
    }
    if (n) sources.push("NWS hourly");
  } catch (e) { sources.push(`NWS failed: ${e.message}`); }
  return { byHour, byDay, sources, fetchedAt: new Date().toISOString(), ok: Object.keys(byHour).length > 0 };
}

// ---------------- forecast ----------------
function hourModel(dateKey, h, ctx) {
  const d = dow(dateKey), hrs = HOURS[d], wd = WD[d];
  if (h < hrs.open || h >= hrs.close || ctx.closedDates.has(dateKey)) return { hour:h, dateKey, weekdayShort:wd, open:false, score:0, popularity:0, tickets:0, appLoad:0, drivers:[], ...band(0) };
  const { cal, learned, weather } = ctx, drivers = [];
  const school = cal.isSchoolDay(dateKey), weekday = d >= 1 && d <= 5;
  let tickets, appLoad = 0, mult = 1;
  if (!learned) {
    let pop = CURVES[d][h] || 20;
    drivers.push({ kind:"baseline", label:"Typical Bojangles rhythm (estimated curve)", detail: DAY_NOTES[d], pct:0 });
    for (const r of WEEKLY) {
      if (!r.days.includes(d) || h < r.s || h >= r.e) continue;
      if (r.school && !school) continue;
      pop += r.delta; appLoad += r.app || 0;
      drivers.push({ kind:r.kind, label:r.label, detail:r.detail, delta:r.delta });
    }
    tickets = pop * TICKETS_PER_POINT;
  } else {
    const b = learned.base[d][h];
    tickets = b != null ? b : (CURVES[d][h] || 20) * learned.curveScale;
    drivers.push({ kind:"baseline", label: b != null ? `POS median, last ${learned.weeks} weeks (${learned.samples[d][h]} ${wd}s)` : "Too few POS rows for this hour — curve scaled to your volume", detail: DAY_NOTES[d], pct:0 });
    const share = learned.appShare[d][h];
    if (share != null) { appLoad = share >= 0.18 ? 9 : share >= 0.1 ? 5 : share > 0.03 ? 2 : 0; if (appLoad) drivers.push({ kind:"delivery", label:`Apps ≈ ${Math.round(share*100)}% of tickets this hour (POS)`, detail:"DoorDash, Uber Eats, Grubhub and the app on the same fryer.", pct:0 }); }
    else for (const r of WEEKLY) if (r.app && r.days.includes(d) && h >= r.s && h < r.e) appLoad += r.app;
  }
  // Things a weekday median can't know: applied as multipliers in both modes.
  const mults = [];
  if (weekday && !school && cal.hasSchoolData) {
    if (h >= 9 && h < 15) mults.push([1.10, "school", "No school today", "Kids and parents out midday (Shelby County Schools calendar)."]);
    if (h >= 6 && h < 8) mults.push([0.95, "school", "No school today", "Lighter drop-off rush."]);
  }
  if (school && cal.isEarly(dateKey) && h >= 12 && h < 14) mults.push([1.08, "school", "Early dismissal 1 PM", "Shelby County Schools early release."]);
  if (Number(dateKey.slice(8)) === 1 && h >= 11 && h < 20) mults.push([1.04, "payday", "First of the month", "Benefit and monthly-bill payday."]);
  for (const e of cal.eventsOn(dateKey)) if (h >= e.start && h < e.end) mults.push([e.lift, e.kind || "local", e.label, e.detail || "", e.source]);
  const w = weatherFactor(weather?.byHour?.[`${dateKey}|${h}`], weather?.byDay?.[dateKey], h);
  if (w) { mults.push([w.factor, "weather", w.label, w.detail]); appLoad += w.app; }
  for (const [f, kind, label, detail, source] of mults) { mult *= f; drivers.push({ kind, label, detail, pct: Math.round((f - 1) * 100), source }); }
  tickets *= mult;
  // Score: estimate mode keeps the original 0-100 index; POS mode maps this store's 95th-pct hour to ~85.
  const popularity = clamp(learned ? tickets / ctx.posRef * 85 : tickets / TICKETS_PER_POINT, 4, 100);
  const score = clamp(Math.round(popularity / 10), 1, 10);
  return { hour:h, dateKey, weekdayShort:wd, open:true, popularity, score, tickets, appLoad, school, drivers: drivers.filter(x => x.kind !== "baseline" || drivers.length === 1 || learned), ...band(score) };
}

export function headline(day) {
  const open = day.hours.filter(x => x.open), packed = open.filter(x => x.key === "packed"), busy = open.filter(x => x.key === "busy" || x.key === "packed"), quiet = open.filter(x => x.key === "dead" || x.key === "slow");
  if (!open.length) return "Closed";
  if (packed.length) return `Packed ${packed.length === 1 ? shortHour(packed[0].hour) : `${shortHour(packed[0].hour)}–${shortHour(packed[packed.length-1].hour + 1)}`}`;
  if (busy.length >= 4) return `A heavy day — ${busy.length} busy hours`;
  if (day.peak && day.deadest) return `Peak ${shortHour(day.peak.hour)}, quietest ${shortHour(day.deadest.hour)}`;
  if (quiet.length >= 6) return "Mostly quiet — good day to go whenever";
  return "Typical Chelsea 280 rhythm";
}

export function forecast({ now = new Date(), cal, pos = null, weather = null, days = DAYS_AHEAD, weeks = 8 } = {}) {
  cal = cal || makeCalendar({});
  const c = chicagoNow(now);
  const exclude = new Set(cal.events.map(e => e.date));
  const learned = pos ? learnFromPOS(pos, { asOf: c.dateKey, weeks, excludeDates: exclude }) : null;
  const useLearned = learned && learned.filledCells >= 40 ? learned : null; // need ~3+ days of hours
  const baseVals = useLearned ? useLearned.base.flat().filter(v => v != null).sort((a, b) => a - b) : [];
  const posRef = baseVals.length ? Math.max(1, baseVals[Math.floor(0.95 * (baseVals.length - 1))]) : 1;
  const closedDates = new Set(cal.events.filter(e => e.closed).map(e => e.date));
  const ctx = { cal, learned: useLearned, weather, posRef, closedDates };
  const out = [];
  for (let i = 0; i < days; i++) {
    const key = addDays(c.dateKey, i), d = dow(key), hours = [];
    for (let h = 0; h < 24; h++) hours.push(hourModel(key, h, ctx));
    const open = hours.filter(x => x.open);
    const peak = open.length ? open.reduce((a, b) => b.score > a.score ? b : a) : null;
    const deadest = open.length ? open.reduce((a, b) => b.score < a.score ? b : a) : null;
    const day = { dateKey:key, weekday:d, weekdayLong:WDL[d], weekdayShort:WD[d], monthDay:monthDay(key), isToday:i === 0, openHour:HOURS[d].open, closeHour:HOURS[d].close,
      hours, peak, deadest, dayScore: open.length ? Math.round(open.reduce((s, x) => s + x.score, 0) / open.length) : 0,
      weather: weather?.byDay?.[key] ?? null, events: cal.eventsOn(key), schoolDay: cal.isSchoolDay(key) };
    day.headline = headline(day);
    out.push(day);
  }
  const today = out[0], cur = today.hours[c.hour];
  const later = [...today.hours.filter(x => x.hour > c.hour && x.open), ...out.slice(1).flatMap(d => d.hours.filter(x => x.open))];
  return { generatedAt: now.toISOString(), dateKey: c.dateKey, hour: c.hour, minute: c.minute, current: cur, days: out,
    nextDead: later.find(x => x.key === "dead" || x.key === "slow") ?? null, nextBusy: later.find(x => x.key === "busy" || x.key === "packed") ?? null,
    mode: useLearned ? "pos" : "estimate", learned: useLearned, posInsufficient: !!(learned && !useLearned), ratios: useLearned ? useLearned.ratios : DEFAULT_RATIOS };
}

// ---------------- line production (same rules as the original board) ----------------
function pans(biscuits, isOpeningHour, isPeak) {
  if (isOpeningHour) return { pansPerDrop:1, dropNote:"Open the oven. One pan now. A second pan only if that one sells through." };
  if (biscuits < 20) return { pansPerDrop:0, dropNote:"Don’t start a fresh batch. Sell what’s already on the board." };
  const p = Math.min(3, Math.max(1, Math.round(biscuits / 3 / 16)));
  if (p === 1 && biscuits < 55) return { pansPerDrop:1, dropNote:"One pan every 20 minutes. Skip :40 if a full pan is still up." };
  if (p === 1) return { pansPerDrop:1, dropNote:"One pan (16) every 20 minutes, on the clock." };
  if (p === 2 && (biscuits >= 140 || (isPeak && biscuits >= 100))) return { pansPerDrop:2, dropNote:"Two pans every 20 minutes. Second biscuit maker — the fryer will pull the first one off the bench." };
  if (p === 2) return { pansPerDrop:2, dropNote:"Two pans every 20 minutes. One biscuit maker can hold this." };
  return { pansPerDrop:3, dropNote:"Three pans every 20 minutes. Two biscuit makers this hour." };
}
function crewFor(x) {
  const r = ["Lead", "Biscuit", "Fryer", "DT"];
  if (x.biscuits >= 140 || (x.score >= 9 && x.biscuits >= 100)) r.push("Biscuit 2");
  if (x.biscuits >= 220) r.push("Biscuit 3");
  if (x.chicken >= 110) r.push("Fryer 2");
  if (x.chicken >= 240) r.push("Fryer 3");
  if (x.tickets >= 45) r.push("Board");
  if (x.tickets >= 75 || x.score >= 9) r.push("DT 2");
  if (x.appLoad >= 4) r.push("Dasher");
  if (x.appLoad >= 8) r.push("Expo");
  if (x.hour >= 11 && x.hour < 21 && x.score >= 7) r.push("Lobby");
  return r;
}
export function line(x, ratios = DEFAULT_RATIOS, wide = false) {
  const part = partOf(x.hour);
  if (!x.open) return { hour:x.hour, open:false, tickets:0, biscuits:0, biscuitLow:0, biscuitHigh:0, pansPerDrop:0, dropNote:"Kitchen is dark.", chicken:0, tenders:0, breakfastProteins:0, fries:0, boRounds:0, sides:0, gravy:0, teaGallons:0, eightPiece:0, crew:0, roles:[], appLoad:0, part };
  const n = ratios[part], t = x.tickets;
  let bm = 1, cm = 1, sm = 1;
  if (x.appLoad >= 8) { bm = 1.08; cm = 1.18; sm = 1.2; } else if (x.appLoad >= 4) { bm = 1.05; cm = 1.1; sm = 1.1; }
  const b = t * n.biscuits * bm, biscuits = round5(b), chicken = round5(t * n.chicken * cm);
  const isOpening = x.weekdayShort === "Sun" ? x.hour === 6 : x.hour === 5;
  const p = pans(biscuits, isOpening, x.score >= 9);
  const roles = crewFor({ biscuits, chicken, tickets: Math.round(t), score: x.score, hour: x.hour, appLoad: x.appLoad });
  const tea = Math.round(t * n.teaOz / 128 * 2) / 2, spread = wide ? 0.25 : 0.15;
  return { hour:x.hour, open:true, part, tickets: round5(t), biscuits, biscuitLow: round5(b * (1 - spread)), biscuitHigh: round5(b * (1 + spread)), ...p,
    chicken, tenders: round5(t * (n.tenders ?? 0)), breakfastProteins: round5(t * n.breakfastProteins), fries: round5(t * n.fries), boRounds: round5(t * n.boRounds),
    sides: round5(t * n.sides * sm), gravy: round5(t * n.gravy), teaGallons: tea > 0 ? Math.max(0.5, tea) : 0, eightPiece: Math.max(1, Math.round(chicken / 8)),
    crew: roles.length, roles, appLoad: x.appLoad };
}
export function dayparts(day, ratios, wide) {
  return DAYPARTS.map(p => {
    const hrs = day.hours.filter(x => x.open && x.hour >= p.start && x.hour < p.end), ls = hrs.map(x => line(x, ratios, wide));
    const top = ls.reduce((a, b) => !a || b.crew > a.crew ? b : a, null), packed = hrs.filter(x => x.key === "packed").length, crew = top?.crew ?? 0;
    return { ...p, window: hrs.length ? `${hourLabel(hrs[0].hour)}–${hourLabel(hrs[hrs.length-1].hour + 1)}` : "Closed", biscuits: ls.reduce((s, x) => s + x.biscuits, 0), chicken: ls.reduce((s, x) => s + x.chicken, 0), peakCrew: crew, peakHour: top?.hour ?? null, packedHours: packed, callIn: crew >= 10 || packed >= 2 };
  }).filter(p => p.peakHour !== null);
}
export function dayTotals(day, ratios, wide) {
  const ls = day.hours.filter(x => x.open).map(x => line(x, ratios, wide)), top = ls.reduce((a, b) => !a || b.crew > a.crew ? b : a, null);
  return { biscuits: ls.reduce((s, x) => s + x.biscuits, 0), chicken: ls.reduce((s, x) => s + x.chicken, 0), tickets: ls.reduce((s, x) => s + x.tickets, 0), peakCrew: top?.crew ?? 0, peakHour: top?.hour ?? null, callIn: dayparts(day, ratios, wide).some(p => p.callIn) };
}
export function kitchenLoad(x) {
  if (!x.open) return { label:"Closed", detail:"Kitchen is dark." };
  if (x.appLoad >= 8) return { label:"Apps stacked", detail:"DoorDash, Uber Eats, and Grubhub are printing on this fryer while 280 is also in the lane. Wait is longer than the cars you can see." };
  if (x.appLoad >= 4) return { label:"Dashers in the lot", detail:"Lunch or evening tickets on the board. Same kitchen as the drive-thru — add a few minutes even if the lane looks short." };
  if (x.appLoad > 0) return { label:"Light app tickets", detail:"A few app orders on the fryer." };
  return { label:"Mostly the lane", detail:"Apps are quiet this hour. What you see in the drive-thru is most of the work." };
}

// ---------------- accuracy check ----------------
// Backtest: for each of the last `days` dates in the POS file, forecast it from the 8 weeks before
// (no weather — history isn't fetched), compare to actual tickets, report MAPE by daypart.
export function backtest(pos, cal, { days = 28, weeks = 8 } = {}) {
  const dates = [...new Set(pos.rows.map(r => r.date))].sort().slice(-days);
  const act = new Map(pos.rows.map(r => [`${r.date}|${r.hour}`, r.tickets]));
  const err = { pos: {}, estimate: {} };
  const exclude = new Set(cal.events.map(e => e.date));
  for (const k of dates) {
    const learned = learnFromPOS(pos, { asOf: k, weeks, excludeDates: exclude });
    const vals = learned.base.flat().filter(v => v != null).sort((a, b) => a - b);
    const modes = { estimate: null }; if (learned.filledCells >= 40) modes.pos = learned;
    for (const [m, L] of Object.entries(modes)) {
      const ctx = { cal, learned: L, weather: null, posRef: vals.length ? vals[Math.floor(0.95 * (vals.length - 1))] : 1, closedDates: new Set() };
      for (let h = 0; h < 24; h++) { const a = act.get(`${k}|${h}`); if (!a) continue; const x = hourModel(k, h, ctx); if (!x.open) continue;
        const p = partOf(h); (err[m][p] ??= []).push(Math.abs(x.tickets - a) / a); }
    }
  }
  const sum = o => Object.fromEntries(Object.entries(o).map(([p, e]) => [p, { mape: e.reduce((s, v) => s + v, 0) / e.length, n: e.length }]));
  return { dates: dates.length, pos: sum(err.pos), estimate: sum(err.estimate) };
}
