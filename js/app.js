import { forecast, makeCalendar, fetchWeather, fetchWeatherHistory, parsePOS, parseDaily, dailyTotals, backtestDaily, line, dayparts, dayTotals, kitchenLoad, backtest, hourLabel, hourRange, shortHour, chicagoNow, addDays, TZ, WDL, UPLIFT_NAMES, UPLIFT_MIN_DAYS } from "./engine.js";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const n0 = v => Math.round(v).toLocaleString("en-US");
const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;
const POS_KEY = "bo-watch-pos-csv", DAILY_KEY = "bo-watch-daily-csv", WX_KEY = "bo-watch-weather", WXH_KEY = "bo-watch-wxhist", ROLE_KEY = "bo-watch-role", THEME_KEY = "bo-watch-theme";
const icon = (id, cls = "") => `<svg class="ic ${cls}" aria-hidden="true" focusable="false"><use href="#i-${id}"/></svg>`;
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } }, del: k => { try { localStorage.removeItem(k); } catch {} } };

const MIX = [{ part:"Breakfast", share:30, window:"Open–10:30 AM", c:"var(--moderate)" }, { part:"Lunch", share:27, window:"10:30 AM–2 PM", c:"var(--busy)" }, { part:"Afternoon", share:17, window:"2–5 PM", c:"var(--slow)" }, { part:"Dinner", share:18, window:"5–8 PM", c:"var(--packed)" }, { part:"Late night", share:8, window:"8 PM–close", c:"var(--dead)" }];
const FRONTAGE = [
  ["Walmart Supercenter #4330","16077 Hwy 280 · 6 AM–11 PM · ~0.6 mi east. Weekend grocery peaks spill onto 280."],
  ["Murphy USA at Walmart","Fuel opens 4:30 AM weekdays — early biscuit traffic from the same lot pattern."],
  ["Publix Chelsea 280","501 Chelsea Crossroads · 7 AM–9 PM. Neighborhood center across from Walmart."],
  ["Pizza Hut","Chelsea Crossroads · 11 AM–11 PM · 0.1 mi. Dinner chicken/pizza split on the same frontage."],
  ["Burger King","15622 Hwy 280 · 0.2 mi — overlapping breakfast and lunch drive-thru demand."],
  ["KFC","16383 Hwy 280 — dinner chicken substitute; Bojangles still wins breakfast."],
  ["Sonic Drive-In","64 Chelsea Pointe Drive · 0.7 mi. Another 280 turning movement."],
  ["Taco Bell","16634 Hwy 280 · ~0.8 mi east · late drive-thru. Dinner and late-night overlap."],
  ["Cat-n-Bird Winery","11661 Old Hwy 280 · public Saturdays with food trucks and live music."],
  ["Chelsea High School","10510 County Rd 11 · first bell 7:35 AM, dismissal 3:00 PM. Home games at the stadium."]];
const CHANNELS = [
  ["Drive-thru + carry-out","79% of sales (chain FDD mix)","Open–close (lobby ~9 PM)","What you see in the lane. This highway store likely skews even more drive-thru."],
  ["DoorDash · store 662443","4.5 · 1,000+ ratings","Listed 4:00 AM–9:30 PM","Dasher lunch 10:30–1:30, dinner 4:30–9. A guest reported a 57-minute wait on family meals 5–7 PM."],
  ["Uber Eats","4.6 · 150+ ratings","Sun 6–8:30 PM · Mon–Sat 4 AM–8:30 PM","Platform copy: most popular in the evening. Top tickets are combos and family meals."],
  ["Grubhub / Seamless","3.3 · 6 ratings","Pickup 4 AM–9 PM · delivery 6 AM–9 PM","Smaller volume than DoorDash, still a ticket on the board."],
  ["Bojangles app · curbside · Google Ordering","Official channels","Store hours","Order-ahead and curbside skip the speaker but not the fryer."],
  ["ezCater catering","4.8 · $50 minimum","Mon–Sat 5 AM–9 PM · Sun 6:30 AM–9 PM","Office breakfast trays and group lunches, 18-hour change window."]];

const state = { now: new Date(), sel: null, selHour: null, role: ls.get(ROLE_KEY) || "cook", calJson: null, menu: null, cal: null,
  pos: null, posSource: null, posError: null, daily: null, dailySource: null, dailyError: null, wxHist: null, wxHistNote: null,
  weather: null, fc: null, fcKey: "", bt: null, btDaily: null, anim: true, chartW: 680 };

function compute() {
  const c = chicagoNow(state.now), key = [c.dateKey, c.hour, state.pos?.last, state.pos?.rows.length, state.daily?.last, state.daily?.rows.length, state.wxHist?.fetchedAt, state.weather?.fetchedAt, state.calJson?.updated].join("|");
  if (key !== state.fcKey) { state.fc = forecast({ now: state.now, cal: state.cal, pos: state.pos, daily: state.daily, wxHist: state.wxHist, weather: state.weather }); state.fcKey = key; }
  return state.fc;
}
const sp = () => state.fc?.spread ?? 0.25;
const L_ = x => line(x, state.fc.ratios, sp());
const MODE_TXT = { estimate: "Estimates", daily: "Daily sales", pos: "Hourly POS" };
function bandChip(x) { return `<span class="chip bg-${x.key} k-${x.key}">${esc(x.label)}</span>`; }

function wxIcon(w) {
  if (!w) return null; const s = String(w.summary || "").toLowerCase();
  if (/thunder|storm|hail/.test(s)) return "storm"; if (/snow/.test(s)) return "snow";
  if (/rain|shower|drizzle/.test(s) || w.rain >= 60) return "rain"; if (/fog/.test(s)) return "fog";
  if (/partly|mostly clear/.test(s)) return "partly"; if (/cloud/.test(s)) return "cloud"; return "sun";
}
const KIND_ICON = { sports:"ball", college:"ball", holiday:"flag", local:"star", school:"school", retail:"star" };
function eventBadges(d, max = 2) {
  const evs = d.events.filter(e => e.lift !== 1 || e.closed), out = evs.slice(0, max).map(e => `<span class="badge" title="${esc(e.label)}">${icon(KIND_ICON[e.kind] || "star")}<span class="bt">${esc(shortEvent(e.label))}</span></span>`);
  if (evs.length > max) out.push(`<span class="badge soft">+${evs.length - max}</span>`);
  if (!d.schoolDay && d.weekday % 6 !== 0) out.push(`<span class="badge soft">${icon("school")}No school</span>`);
  return out.join("");
}
const shortEvent = l => l.split(/[,(:]/)[0].replace(/^CHS football/, "CHS").replace(/ \+ .*/, "").trim().slice(0, 22);

// ---------- right now ----------
function hero(fc) {
  const today = fc.days[0], cur = fc.current;
  const focus = cur.open ? cur : today.hours.find(x => x.open && x.hour > fc.hour) || fc.days[1].hours.find(x => x.open);
  const fDay = focus.dateKey === today.dateKey ? today : fc.days[1];
  const L = L_(focus), nextX = fDay.hours[focus.hour + 1], N = nextX?.open ? L_(nextX) : null;
  // Next biscuit drop: drops run on :00, :20, :40.
  let dropTime, dropL = L;
  if (cur.open) { const m = Math.ceil((fc.minute + 1) / 20) * 20; if (m >= 60) { dropTime = `${hourLabel((fc.hour + 1) % 24).replace(" ", ":00 ")}`; dropL = N || L; } else dropTime = `${hourLabel(fc.hour).replace(" ", `:${String(m).padStart(2, "0")} `)}`; }
  else dropTime = `${focus.weekdayShort === today.weekdayShort ? "" : focus.weekdayShort + " "}${hourLabel(focus.hour).replace(" ", ":00 ")}`;
  const perDrop = dropL.pansPerDrop * 16;
  const title = cur.open ? `${hourRange(cur.hour)}` : `Closed · opens ${focus.dateKey === today.dateKey ? "" : focus.weekdayShort + " "}${hourLabel(focus.hour)}`;
  const crewDelta = N ? N.crew - L.crew : 0;
  return `<section style="margin-top:0" class="hero fade" aria-labelledby="now-h">
    <div class="hero-top"><div><p class="label">${cur.open ? "Right now" : "Next shift"} · ${esc(fDay.isToday ? "Today" : fDay.weekdayLong)}</p><h2 class="hero-title" id="now-h">${esc(title)}</h2></div>
      <div>${bandChip(focus)} <span class="xs" style="color:var(--hero-muted)">${focus.wait === "No wait" ? "no wait" : `wait ${esc(focus.wait)}`}</span></div></div>
    <div class="hero-stats">
      <div class="stat primary"><div class="k">${icon("biscuit")} Next biscuit drop</div><div class="v">${perDrop || "Hold"}${perDrop ? "<small>biscuits</small>" : ""}</div><div class="s">${perDrop ? `${dropL.pansPerDrop} pan${dropL.pansPerDrop > 1 ? "s" : ""} at ${esc(dropTime)}` : `Sell the board · next check ${esc(dropTime)}`} · ${dropL.biscuits}/hr</div></div>
      <div class="stat"><div class="k">${icon("ticket")} Tickets this hour</div><div class="v">${L.tickets}</div><div class="s">likely ${L.ticketLow}–${L.ticketHigh} · lane + apps</div></div>
      <div class="stat"><div class="k">${icon("drum")} Chicken</div><div class="v">${L.chicken}<small>pcs</small></div><div class="s">≈ ${L.eightPiece} eight-piece · ${L.tenders} Bo’s Tenders</div></div>
      <div class="stat"><div class="k">${icon("crew")} Crew needed</div><div class="v">${L.crew}</div><div class="roles">${L.roles.map(r => `<span>${esc(r)}</span>`).join("")}</div></div>
    </div>
    <div class="hero-next">${N ? `<span>Next hour ${hourLabel(nextX.hour)}: <b>${N.tickets}</b> tickets · <b>${N.biscuits}</b> biscuits · <b>${N.chicken}</b> pcs</span>
      ${crewDelta > 0 ? `<span class="trend">${icon("up")} Add ${crewDelta} by ${hourLabel(nextX.hour)}</span>` : crewDelta < 0 ? `<span class="trend">${icon("down")} Can cut to ${N.crew} at ${hourLabel(nextX.hour)}</span>` : `<span class="trend">Same crew next hour</span>`}` : `<span>Last hour of the day — clock out the line after close.</span>`}
      <span class="xs" style="color:var(--hero-muted);flex-basis:100%">${esc(L.dropNote)}</span></div>
  </section>`;
}

function statusStrip(fc) {
  if (fc.mode === "pos") return `<div class="status ok">${icon("chart")}<div><b>Calibrated from your hourly POS</b> (${state.pos.first} → ${state.pos.last}). Ranges ±15%. Events and weather layer on top. <a href="#data">Details</a></div></div>`;
  if (fc.mode === "daily") return `<div class="status ok">${icon("chart")}<div><b>Calibrated from your daily sales</b> (${state.daily.first} → ${state.daily.last}). Day totals come from your numbers; the hourly split is still the default curve. Ranges ±18%. <a href="#data">Details</a></div></div>`;
  return `<div class="status">${icon("chart")}<div><b>Estimates until sales data is loaded.</b> Ranges ±25%.${fc.posInsufficient ? " The hourly file has too few recent rows." : ""}${fc.dailyInsufficient ? " The daily file needs 3+ weeks of recent days." : ""} <a href="#data">Load daily or hourly sales</a></div></div>`;
}

// ---------- 7-day outlook + week 2 ----------
function outlook(fc) {
  const maxT = Math.max(...fc.days.map(d => dayTotals(d, fc.ratios, sp()).tickets), 1);
  const card = d => { const t = dayTotals(d, fc.ratios, sp()), w = d.weather, wi = wxIcon(w), pk = d.peak;
    return `<button class="dcard" data-day="${d.dateKey}" aria-pressed="${state.sel === d.dateKey}" aria-label="${esc(`${d.isToday ? "Today" : d.weekdayLong} ${d.monthDay}: about ${n0(t.tickets)} tickets, peak ${pk ? hourLabel(pk.hour) + " " + pk.label : "closed"}${w ? `, ${w.high} degrees, ${w.rain}% rain` : ""}`)}">
      <div><span class="dname">${d.isToday ? "Today" : d.weekdayShort}</span><span class="ddate">${d.monthDay}</span></div>
      <div class="wx">${wi ? `${icon(wi)}<span><span class="hi">${w.high}°</span> <span class="muted">${w.low}°</span><br><span class="xs">${w.rain}% rain</span></span>` : `<span class="xs faint">Weather not out yet</span>`}</div>
      <div class="meter" aria-hidden="true"><i class="bg-${pk ? pk.key : "closed"}" style="width:${Math.max(8, t.tickets / maxT * 100)}%"></i></div>
      <div class="dsum"><b class="tnum" style="color:var(--ink)">${n0(t.tickets)}</b> tickets · peak ${pk ? shortHour(pk.hour) : "—"}${t.callIn ? ` · <b style="color:var(--accent)">call in</b>` : ""}</div>
      <div class="badges">${eventBadges(d)}</div></button>`; };
  const wk2 = fc.days.slice(7).map(d => { const t = dayTotals(d, fc.ratios, sp());
    return `<button data-day="${d.dateKey}" aria-pressed="${state.sel === d.dateKey}"><span class="dot bg-${d.peak ? d.peak.key : "closed"}" aria-hidden="true"></span><span><b>${d.weekdayShort} ${d.monthDay}</b><br><span class="xs muted">${n0(t.tickets)} tix${d.events.some(e => e.lift !== 1) ? " · event" : ""}</span></span></button>`; }).join("");
  return `<section aria-labelledby="ol-h"><div class="sec-head"><div><p class="label">7-day outlook</p><h2 id="ol-h">The week ahead</h2></div><p class="xs muted">Tap a day to load its shift. Bar = expected tickets, color = peak hour.<br>${wxLine()}</p></div>
    <div class="outlook" id="outlook" role="group" aria-label="Pick a day">${fc.days.slice(0, 7).map(card).join("")}</div>
    <div class="wk2" id="wk2" role="group" aria-label="Week two"><span class="xs muted" style="align-self:center;flex:none">Week 2</span>${wk2}</div></section>`;
}

function wxLine() { const wx = state.weather; return wx ? (wx.ok ? `Live weather · ${esc(wx.sources.filter(s => !/failed/.test(s)).join(" + "))}` : "Weather unavailable — forecast runs without it") : "Loading weather…"; }

// ---------- hourly chart ----------
function niceMax(v) { const p = 10 ** Math.floor(Math.log10(v || 1)), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }
function chart(fc, day, hourX) {
  const open = day.hours.filter(x => x.open); if (!open.length) return `<p class="muted">Closed all day.</p>`;
  const lines = open.map(x => [x, L_(x)]);
  const W = state.chartW, small = W < 520, H = small ? 230 : 270, pl = 34, pr = 6, pt = 30, pb = 26;
  const maxY = niceMax(Math.max(...lines.map(([, l]) => l.ticketHigh)) * 1.05), n = open.length, bw = (W - pl - pr) / n;
  const y = v => pt + (H - pt - pb) * (1 - v / maxY), cx = i => pl + bw * (i + 0.5);
  const ticks = [0, maxY / 2, maxY];
  const peaks = [...lines].sort((a, b) => b[1].tickets - a[1].tickets).filter((p, i, arr) => i === 0 || Math.abs(p[0].hour - arr[0][0].hour) > 2).slice(0, 2).map(p => p[0].hour);
  const nowH = day.isToday && fc.current.open ? fc.hour : null;
  const up = lines.map(([, l], i) => `${cx(i).toFixed(1)},${y(l.ticketHigh).toFixed(1)}`), dn = lines.map(([, l], i) => `${cx(i).toFixed(1)},${y(l.ticketLow).toFixed(1)}`).reverse();
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="group" aria-label="Hourly tickets for ${esc(day.weekdayLong)} with likely range. Use arrow keys to move between hours.">`;
  for (const t of ticks) s += `<line class="gl" x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${pl - 6}" y="${y(t) + 4}" text-anchor="end">${Math.round(t)}</text>`;
  lines.forEach(([x], i) => { if (x.hour === nowH) s += `<rect class="nowcol" x="${pl + bw * i}" y="${pt - 18}" width="${bw}" height="${H - pt - pb + 18}" rx="6"/><text class="nowtx" x="${cx(i)}" y="${pt - 6}" text-anchor="middle">NOW</text>`; });
  s += `<polygon class="bandp" points="${[...up, ...dn].join(" ")}"/><polyline class="bandl" points="${up.join(" ")}"/><polyline class="bandl" points="${dn.reverse().join(" ")}"/>`;
  const anim = state.anim ? "grow" : "";
  lines.forEach(([x, l], i) => { const bx = pl + bw * i + bw * 0.16, w = bw * 0.68, top = y(l.tickets), h = Math.max(2, y(0) - top);
    s += `<rect class="bar ${anim}" style="animation-delay:${i * 12}ms" x="${bx.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(5, w / 3)}" fill="var(--${x.key})"/>`;
    if (x.hour === hourX.hour) s += `<rect class="sel" x="${(bx - 2).toFixed(1)}" y="${(top - 2).toFixed(1)}" width="${(w + 4).toFixed(1)}" height="${(h + 4).toFixed(1)}" rx="6"/>`;
    if (peaks.includes(x.hour)) s += `<text class="pk" x="${cx(i)}" y="${Math.min(y(l.ticketHigh), top) - 14}" text-anchor="middle">${l.tickets}</text><text class="pkl" x="${cx(i)}" y="${Math.min(y(l.ticketHigh), top) - 3}" text-anchor="middle">PEAK</text>`;
    if (!small || i % 2 === 0 || x.hour === hourX.hour) s += `<text class="ax" x="${cx(i)}" y="${H - 8}" text-anchor="middle" ${x.hour === hourX.hour ? 'style="fill:var(--ink);font-weight:800"' : ""}>${shortHour(x.hour)}</text>`;
  });
  lines.forEach(([x, l], i) => { s += `<rect class="hit" data-hour="${x.hour}" tabindex="${x.hour === hourX.hour ? 0 : -1}" role="button" aria-pressed="${x.hour === hourX.hour}" aria-label="${esc(`${hourRange(x.hour)}: ${l.tickets} tickets, likely ${l.ticketLow} to ${l.ticketHigh}, ${x.label}, ${l.biscuits} biscuits, ${l.crew} crew`)}" x="${pl + bw * i}" y="${pt - 18}" width="${bw}" height="${H - pt + 18}"/>`; });
  return s + `</svg>`;
}

function chartCard(fc, day, hourX) {
  const L = L_(hourX);
  return `<div class="card chart-card" style="margin-top:12px">
    <div class="chart-read" aria-live="polite"><span class="label" style="flex-basis:100%">Selected hour</span><b>${hourRange(hourX.hour)}</b> ${bandChip(hourX)}
      <span><b class="tnum">${L.tickets}</b> tickets <span class="muted xs">(${L.ticketLow}–${L.ticketHigh})</span></span><span><b class="tnum">${L.biscuits}</b> biscuits</span><span><b class="tnum">${L.chicken}</b> pcs</span><span><b class="tnum">${L.crew}</b> crew</span></div>
    ${chart(fc, day, hourX)}
    <div class="legend">${["dead","slow","moderate","busy","packed"].map(k => `<span><i class="bg-${k}"></i>${k[0].toUpperCase() + k.slice(1)}</span>`).join("")}<span><i class="band"></i>Likely range ±${Math.round(sp() * 100)}%</span></div></div>`;
}

// ---------- role views ----------
function itemsGrid(L) {
  const it = [["Bone-in", `${L.chicken} pcs`], ["Bo’s Tenders", L.tenders], ["Filet / sausage / ham / steak", L.breakfastProteins], ["Bo Fries", L.fries], ["Fixins", L.sides], ["Gravy", L.gravy], ["Bo-Tato Rounds", L.boRounds], ["Legendary tea", `${L.teaGallons} gal`]];
  return `<div class="items">${it.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join("")}</div>`;
}
const ROLES = [["cook","Cook"],["manager","Manager"],["scheduler","Scheduler"]];
function roleView(fc, day, hourX) {
  const R = fc.ratios, T = dayTotals(day, R, sp());
  const tabs = `<div class="tabs" role="tablist" aria-label="View for">${ROLES.map(([id, l]) => `<button role="tab" id="tab-${id}" aria-controls="rolepanel" data-role="${id}" aria-selected="${state.role === id}" tabindex="${state.role === id ? 0 : -1}">${l}</button>`).join("")}</div>`;
  const heads = { cook: ["Biscuit station", "What to drop"], manager: ["Floor", "Who’s on, and what runs out"], scheduler: ["Schedule", "Who to put on the clock"] }[state.role];
  let body = "";
  if (state.role === "cook") {
    const hrs = day.hours.filter(x => x.open && x.hour >= hourX.hour).slice(0, 3);
    body = `<div class="grid g3">${hrs.map((x, i) => { const L = L_(x); return `<article class="card"><p class="label">${i === 0 ? "This hour" : "Coming up"} · ${hourRange(x.hour)}</p>
      <div class="mid" style="margin-top:6px">${L.biscuits} <span class="small muted">biscuits</span></div><p class="small muted" style="margin:2px 0 0">Stage ${L.biscuitLow}, ready for ${L.biscuitHigh}</p>
      <p class="small">${esc(L.dropNote)}</p>${itemsGrid(L)}</article>`; }).join("") || `<p class="muted">Closed for the rest of the day.</p>`}</div>
      <p class="xs faint" style="margin-top:12px">16 biscuits to a pan, about 48 to a batch, oven every 20 minutes. A forecast so the line isn’t surprised — not a live POS count.</p>`;
  } else if (state.role === "manager") {
    const L = L_(hourX), nx = day.hours[hourX.hour + 1], N = nx?.open ? L_(nx) : null;
    body = `<div class="grid g2"><div class="card dark"><p class="label">On the floor · ${hourRange(hourX.hour)}</p><div class="big" style="margin-top:8px">${L.crew}</div>
      <p class="small muted">${esc(hourX.label)} · wait ${esc(hourX.wait)}. ${L.tickets} tickets through the kitchen, lane plus apps.</p>
      <p>${L.roles.map(r => `<span class="pill">${esc(r)}</span>`).join(" ")}</p>
      ${N && N.crew < L.crew ? `<p class="small">You can drop to ${N.crew} at ${hourLabel(nx.hour)}.</p>` : ""}${N && N.crew > L.crew ? `<p class="small"><b>Add ${N.crew - L.crew} before ${hourLabel(nx.hour)}.</b></p>` : ""}</div>
      <div class="card"><p class="label">Don’t 86</p><h3>Hold this through ${hourLabel((hourX.hour + 1) % 24)}</h3><div style="margin-top:10px">
      ${[["Biscuits", `${L.biscuitLow}–${L.biscuitHigh}`], ["Bone-in chicken", `${L.chicken} pcs · about ${L.eightPiece} eight-piece`], ["Bo’s Chicken Tenders", L.tenders], ...(L.breakfastProteins > 0 ? [["Cajun filet, sausage, country ham, steak", L.breakfastProteins]] : []), ["Mac, dirty rice, mashed & other fixins", `${L.sides} sides`], ["Bo Fries", L.fries], ["Gravy", L.gravy], ["Bo-Tato Rounds", L.boRounds], ["Legendary Iced Tea", `${L.teaGallons} gal`]].map(([a, b]) => `<div class="row"><span>${a}</span><b>${b}</b></div>`).join("")}</div>
      ${L.appLoad >= 4 ? `<p class="small" style="color:var(--accent);font-weight:600">Apps are on this fryer. Bag the 8- and 12-piece before you work the lane.</p>` : ""}
      <p class="xs faint">A normal dinner is already a full floor. Call-in days are the ones that jump past that — game nights, church let-out, a packed Saturday.</p></div></div>`;
  } else {
    const parts = dayparts(day, R, sp());
    body = `<div class="grid g3">${parts.map(p => `<article class="card"><p class="label">${esc(p.name)} · ${esc(p.window)}</p><div class="mid" style="margin-top:6px">${p.peakCrew} <span class="small muted">peak on the floor${p.callIn ? " · <b style='color:var(--accent)'>call in</b>" : ""}</span></div>
      <p class="small muted">${p.biscuits} biscuits · ${p.chicken} pcs · peak ${hourLabel(p.peakHour)}</p><p class="small">${esc(p.note)}</p></article>`).join("")}</div>
      <div class="card scroll" style="margin-top:16px"><h3>Two-week call sheet</h3><table><thead><tr><th>Day</th><th class="n">Tickets</th><th class="n">Biscuits</th><th class="n">Chicken</th><th class="n">Peak crew</th><th></th></tr></thead><tbody>
      ${fc.days.map(d => { const t = dayTotals(d, R, sp()); return `<tr data-day="${d.dateKey}" class="${d.dateKey === state.sel ? "sel" : ""}" tabindex="0"><td>${d.isToday ? "Today" : d.weekdayShort} ${d.monthDay}</td><td class="n">${n0(t.tickets)}</td><td class="n">${n0(t.biscuits)}</td><td class="n">${n0(t.chicken)}</td><td class="n">${t.peakCrew}${t.peakHour != null ? ` at ${shortHour(t.peakHour)}` : ""}</td><td>${t.callIn ? "<b style='color:var(--accent)'>Call in</b>" : ""}</td></tr>`; }).join("")}</tbody></table></div>`;
  }
  return `<section aria-labelledby="role-h"><div class="sec-head"><div><p class="label">${heads[0]}</p><h2 id="role-h">${heads[1]}</h2><p class="small muted">${day.isToday ? "Today" : day.weekdayLong}, ${day.monthDay}. <b>${n0(T.biscuits)}</b> biscuits · <b>${n0(T.chicken)}</b> chicken pieces${T.callIn ? " · call someone in" : ""}.</p></div>${tabs}</div><div id="rolepanel" role="tabpanel" aria-labelledby="tab-${state.role}">${body}</div></section>`;
}

// ---------- selected day ----------
function dayDetail(fc, day, hourX) {
  const open = day.hours.filter(x => x.open), lsx = open.map(x => [x, L_(x)]);
  const sortedLow = [...lsx].sort((a, b) => a[0].score - b[0].score || a[0].hour - b[0].hour).slice(0, 3), sortedHigh = [...lsx].sort((a, b) => b[0].score - a[0].score || a[0].hour - b[0].hour).slice(0, 3);
  const kl = kitchenLoad(hourX), nowH = day.isToday ? fc.hour : null;
  return `<section aria-labelledby="hr-h"><div class="sec-head"><div><p class="label">Hour by hour</p><h2 id="hr-h">Every hour, ${esc(day.isToday ? "today" : day.weekdayShort + " " + day.monthDay)}</h2></div><p class="xs muted">Tap a row or a bar to see what’s driving it.</p></div>
    <div class="grid g2">
      <div class="card scroll" style="padding-left:8px;padding-right:8px"><table><thead><tr><th>Hour</th><th>Board</th><th class="n">Tix</th><th class="n">Bisc</th><th class="n">Chk</th><th class="n">Crew</th></tr></thead><tbody>
      ${lsx.map(([x, L]) => `<tr data-hour="${x.hour}" tabindex="0" class="${x.hour === hourX.hour ? "sel" : ""} ${x.hour === nowH ? "now" : ""}" ${x.hour === hourX.hour ? 'aria-current="true"' : ""}><td><b>${shortHour(x.hour)}</b>${x.hour === nowH ? ' <span class="xs" style="color:var(--accent);font-weight:800">NOW</span>' : ""}</td><td>${bandChip(x)}</td><td class="n">${L.tickets}</td><td class="n">${L.biscuits}</td><td class="n">${L.chicken}</td><td class="n">${L.crew}</td></tr>`).join("")}</tbody></table></div>
      <div class="grid" style="align-content:start">
        <div class="card"><p class="label">What’s pushing the needle · ${hourRange(hourX.hour)}</p>
          <ul class="drivers">${hourX.drivers.map(d => `<li>${d.pct ? `<span class="pct">${d.pct > 0 ? "+" : ""}${d.pct}%</span>` : d.delta ? `<span class="pct">+${d.delta} pts</span>` : ""}<b style="font-weight:700">${esc(d.label)}</b><div class="small muted">${esc(d.detail)}${d.source ? ` <a href="${esc(d.source)}" target="_blank" rel="noopener">source</a>` : ""}</div></li>`).join("") || "<li class='muted'>Closed.</li>"}</ul></div>
        <div class="card"><p class="label">Kitchen load</p><h3>${esc(kl.label)}</h3><p class="small muted" style="margin:4px 0">${hourRange(hourX.hour)} · wait ${esc(hourX.wait)}</p><p class="small" style="margin:0">${esc(kl.detail)}</p></div>
        <div class="grid g2" style="gap:12px">
          <div class="card"><p class="label">Cut labor here</p>${sortedLow.map(([x, L]) => `<div class="row"><span>${shortHour(x.hour)}</span><b>${L.crew} crew</b></div>`).join("")}</div>
          <div class="card"><p class="label">Don’t fall behind</p>${sortedHigh.map(([x, L]) => `<div class="row"><span>${shortHour(x.hour)}</span><b>${L.biscuits} bisc · ${L.crew} crew</b></div>`).join("")}</div>
        </div>
      </div></div></section>`;
}

function events(fc) {
  const start = fc.dateKey, evs = state.cal.events.filter(e => !e.history && e.date >= start).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.start - b.start);
  const up = fc.uplift?.factors || {};
  return `<section aria-labelledby="ev-h"><div class="sec-head"><div><p class="label">Calendar</p><h2 id="ev-h">Dated events on file</h2></div><p class="xs muted">From data/events.json (updated ${esc(state.calJson?.updated || "?")}). Every entry links its source.</p></div>
    <div class="card">${evs.map((e, i) => (i === 6 ? `<details class="more"><summary>Show ${evs.length - 6} more events</summary>` : "") + (() => { const f = up[e.kind]; return `<div class="evrow"><span class="when tnum">${icon(KIND_ICON[e.kind] || "star")} ${e.date.slice(5).replace("-", "/")} · ${shortHour(e.start)}–${shortHour(e.end)}</span><span>${esc(e.label)}${e.confidence ? ` <b style="color:var(--accent)">(${esc(e.confidence)})</b>` : ""}<br><span class="xs muted">${esc(e.detail || "")}</span></span><span class="small"><b class="tnum">${e.closed ? "closed" : `${e.lift >= 1 ? "+" : ""}${Math.round((e.lift - 1) * 100)}%`}</b>${f?.learned ? ` <span class="tag on" title="Learned from your sales">×${f.factor.toFixed(2)} day</span>` : ""} · <a href="${esc(e.source)}" target="_blank" rel="noopener">source</a></span></div>`; })()).join("") + (evs.length > 6 ? "</details>" : "") || "<p class='muted'>No dated events ahead. Add some to data/events.json.</p>"}</div></section>`;
}

// ---------- data: daily + hourly uploads and what was learned ----------
function dataSection(fc) {
  const p = state.pos, d = state.daily, L = fc.learned, bt = state.bt, bd = state.btDaily;
  const fmt = o => Object.entries(o || {}).map(([k, v]) => `${k} ${pct(v.mape)} (${v.n} h)`).join(" · ") || "—";
  const active = { estimate: "None — estimated curves", daily: "Daily sales (day totals) + default hourly curve", pos: "Hourly POS (hourly shape and totals)" }[fc.mode];
  const dl = fc.dailyLearned, up = fc.uplift, wx = fc.wxLearn, dr = fc.dailyRatios;
  const upRows = up ? Object.values(up.factors).sort((a, b) => b.n - a.n) : [];
  return `<section id="data" aria-labelledby="data-h"><div class="sec-head"><div><p class="label">Calibrate</p><h2 id="data-h">Your sales data</h2></div><p class="xs muted">Files stay in this browser (local storage on this device). Nothing is uploaded.</p></div>
    <div class="grid g2">
      <div class="card"><p class="label">Daily sales · easiest to start</p><h3>One row per day</h3>
        <p class="small muted">Columns <code>date,tickets,net_sales,notes</code>. Optional: <code>biscuits, chicken_pieces, tenders, labor_hours</code>. 8+ weeks is ideal.</p>
        <div class="btns"><label class="btn accent file">${icon("upload")} Load daily CSV<input type="file" id="dailyfile" accept=".csv,text/csv" aria-label="Load daily sales CSV"></label><a class="btn ghost" href="data/daily_template.csv" download>Template</a>${d ? `<button class="btn ghost" id="dailyclear" type="button">Remove</button>` : ""}</div>
        ${state.dailyError ? `<p class="small err" role="alert">Couldn’t read that file: ${esc(state.dailyError)}</p>` : ""}
        ${d ? `<div class="row"><span>Loaded <span class="xs muted">(${esc(state.dailySource)})</span></span><b>${d.days} days · ${d.first} → ${d.last}${d.badLines.length ? ` · ${d.badLines.length} skipped` : ""}</b></div>
          <div class="row"><span>Extra columns</span><b>${d.columns.length ? esc(d.columns.join(", ")) : "none"}</b></div>` : `<p class="xs faint">Not loaded.</p>`}</div>
      <div class="card"><p class="label">Hourly POS · most accurate</p><h3>One row per date + hour</h3>
        <p class="small muted">Template header (date, hour, tickets + optional items and channels). Takes priority for the hourly shape; learns app share by hour.</p>
        <div class="btns"><label class="btn file">${icon("upload")} Load hourly CSV<input type="file" id="posfile" accept=".csv,text/csv" aria-label="Load hourly POS CSV"></label><a class="btn ghost" href="data/pos_template.csv" download>Template</a>${p ? `<button class="btn ghost" id="posclear" type="button">Remove</button>` : ""}</div>
        ${state.posError ? `<p class="small err" role="alert">Couldn’t read that file: ${esc(state.posError)}</p>` : ""}
        ${p ? `<div class="row"><span>Loaded <span class="xs muted">(${esc(state.posSource)})</span></span><b>${n0(p.rows.length)} rows · ${p.days} days · ${p.first} → ${p.last}${p.badLines.length ? ` · ${p.badLines.length} skipped` : ""}</b></div>
          <div class="row"><span>Baseline</span><b>${L ? `${L.filledCells} of 118 weekday-hours` : "too few recent rows (need ~3 days in 8 weeks)"}</b></div>` : `<p class="xs faint">Not loaded.</p>`}</div>
    </div>
    <div class="card learn" style="margin-top:12px"><p class="label">What the board learned</p><h3>Active data: ${esc(active)}</h3><p class="small muted" style="margin:4px 0 8px">Likely range ±${Math.round(fc.spread * 100)}% (±25% no data · ±18% daily · ±15% hourly).</p>
      ${dl ? `<div class="scroll"><table><thead><tr><th>Day total baseline</th>${WDL.map(w => `<th class="n">${w.slice(0, 3)}</th>`).join("")}</tr></thead><tbody><tr><td>Median tickets</td>${dl.base.map(v => `<td class="n">${n0(v)}</td>`).join("")}</tr><tr><td class="xs muted">Same-weekday days used</td>${dl.samples.map(v => `<td class="n xs ${v < 3 ? "muted" : ""}">${v}${v < 3 ? "*" : ""}</td>`).join("")}</tr></tbody></table></div><p class="xs faint">Median of the last ${dl.weeks} same weekdays, event and no-school days left out. * fewer than 3: scaled from your other days.</p>` : ""}
      ${L ? `<div class="row"><span>Hourly item ratios</span><b>${L.learnedRatios.length ? esc(L.learnedRatios.join(", ")) : "none yet (need 200+ tickets per daypart with item columns)"}</b></div>` : ""}
      ${!L && dr ? `<div class="row"><span>Item ratios from daily columns</span><b>${dr.learned.length ? esc(dr.learned.join(", ")) : "none (need 7+ days with biscuits / chicken_pieces / tenders)"}</b></div>` : ""}
      ${dr?.ticketsPerLaborHour ? `<div class="row"><span>Tickets per labor hour (median, ${dr.laborDays} days)</span><b>${dr.ticketsPerLaborHour.toFixed(1)}</b></div>` : ""}
      ${up ? `<div class="row"><span>Special-day uplift <span class="xs muted">(need ${UPLIFT_MIN_DAYS}+ comparable days; vs same-weekday median)</span></span><b>${upRows.length ? "" : "no event or holiday days in your data yet"}</b></div>
        ${upRows.map(f => `<div class="row"><span>${esc(UPLIFT_NAMES[f.kind] || f.kind)} <span class="xs muted">${f.n} day${f.n === 1 ? "" : "s"}, actual ${pct(f.observed - 1)} vs normal</span></span><b>${f.learned ? `<span class="tag on">learned</span> ×${f.factor.toFixed(2)} on top of default lifts` : `<span class="tag off">default</span> need ${UPLIFT_MIN_DAYS - f.n} more`}</b></div>`).join("")}` : ""}
      ${wx ? `<div class="row"><span>Weather (rain) sensitivity</span><b>${wx.learned ? `<span class="tag on">learned</span> ×${wx.effect.toFixed(2)} on rainy days` : `<span class="tag off">skipped</span>`}</b></div><p class="xs muted" style="margin:0 0 6px">${esc(wx.reason)}${state.wxHistNote ? ` ${esc(state.wxHistNote)}` : ""}</p>` : ""}
      ${bd ? `<div class="row"><span>Daily backtest, last ${bd.dates} days <span class="xs muted">(MAPE on day totals, lower is better)</span></span><b>${bd.daily ? `Your data: ${pct(bd.daily.mape, 1)}` : "Your data: n/a"} · Estimate: ${pct(bd.estimate.mape, 1)}</b></div>` : ""}
      ${bt ? `<div class="row"><span>Hourly backtest, last ${bt.dates} days <span class="xs muted">(MAPE by daypart)</span></span><b class="small">POS: ${fmt(bt.pos)}<br>Estimate: ${fmt(bt.estimate)}</b></div>` : ""}
      ${fc.mode === "estimate" && !d && !p ? `<p class="small muted">Nothing learned yet. Load a daily file to calibrate day totals, holidays, events and (if the data supports it) rain.</p>` : ""}
    </div></section>`;
}

function menuCard() {
  const m = state.menu; if (!m) return "";
  return `<section aria-labelledby="menu-h"><div class="sec-head"><div><p class="label">Menu tracked</p><h2 id="menu-h">What the board counts</h2></div><p class="xs muted">Checked ${esc(m.checkedAt)} · weekly check for changes</p></div>
    <div class="card"><div class="items" style="margin-top:0">${(m.tracked || []).map(t => `<div><span>${esc(t.key)}</span><b style="font-size:15px">${esc(t.board)}</b></div>`).join("")}</div>
    ${m.notSold?.length ? `<p class="small" style="margin-bottom:0"><b>Not sold at this store:</b> ${esc(m.notSold.join(", "))}. Boneless chicken is Bo’s Chicken Tenders and Bo Bites.</p>` : ""}
    <p class="xs muted" style="margin-bottom:0">${(m.sources || []).map((s, i) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`).join(" · ")}</p></div></section>`;
}

function infoSections() {
  return `<section class="grid g2"><div class="card"><p class="label">Usual day parts</p><h3>Where the money moves</h3><p class="small muted">Chain-wide FDD mix. This store is ~79% drive-thru and carry-out.</p>
    <div class="mix">${MIX.map(m => `<div style="width:${m.share}%;background:${m.c}"></div>`).join("")}</div>
    ${MIX.map(m => `<div class="row"><span>${m.part} <span class="xs faint">${m.window}</span></span><b>${m.share}%</b></div>`).join("")}</div>
    <div class="card"><p class="label">On this frontage</p><h3>What else pulls cars</h3><ul class="list">${FRONTAGE.map(([a, b]) => `<li><b>${a}</b><div class="small muted">${b}</div></li>`).join("")}</ul></div></section>
    <section><div class="sec-head"><div><p class="label">Shared kitchen</p><h2>Every app prints here</h2></div><p class="xs muted">DoorDash, Uber Eats, Grubhub, the app and curbside hit the same fryer as the 280 lane.</p></div>
    <div class="grid g3">${CHANNELS.map(([a, b, c, d]) => `<div class="card"><b>${a}</b><div class="small" style="color:var(--accent);font-weight:600">${b}</div><div class="xs faint">${c}</div><p class="small muted" style="margin-bottom:0">${d}</p></div>`).join("")}</div></section>`;
}

function sources() {
  const wx = state.weather;
  return `<section aria-labelledby="src-h"><div class="sec-head"><div><p class="label">Sources</p><h2 id="src-h">Everything that feeds this board</h2></div></div><div class="grid g2">
    ${[["Live weather", `Fetched in your browser for 33.34°N, 86.63°W: NWS hourly (api.weather.gov) for ~7 days, Open-Meteo for the rest of the 14-day window. ${wx ? `Last fetch ${new Date(wx.fetchedAt).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" })} CT: ${esc(wx.sources.join("; "))}.` : "Not loaded."}`],
      ["Past weather (only with sales data)", "Open-Meteo archive daily rain for your sales dates, used only to test whether rain moves your day totals."],
      ["Shelby County Schools 2026–27 calendar", `School days, breaks and early dismissals. <a href="${esc(state.calJson?.schoolCalendar?._source || "#")}" target="_blank" rel="noopener">PDF</a>`],
      ["Dated events", "Chelsea Hornets football (MaxPreps), Auburn and Alabama 2026 schedules, City of Chelsea calendar, US public holidays (past ones are kept to learn holiday uplift). See the Calendar section for links."],
      ["Weekly rhythm", "US-280 commute windows, Sunday church let-out, Wednesday church, Friday payday, Walmart Saturday, app delivery windows — carried over from the original board. Shapes the hours until hourly POS replaces it."],
      ["Line production model", "16 biscuits to a pan, ~48 to a batch, oven every 20 minutes. Item counts scale from tickets by daypart; crew roles follow the original board's thresholds."],
      ["Menu tracked", `${state.menu ? `Menu checked ${esc(state.menu.checkedAt)} against ${esc(state.menu.scope || "the Chelsea store menu")}. This store sells no Chicken Supremes; its boneless chicken is Bo’s Chicken Tenders and Bo Bites.` : "data/menu.json not loaded."}`],
      ["Bojangles location page & franchise FDD", "Hours (Mon–Sat 5 AM–10 PM, Sun 6 AM–10 PM), 79% drive-thru/carry-out, day-part sales mix."]]
      .map(([a, b]) => `<div class="card"><b>${a}</b><p class="small muted" style="margin-bottom:0">${b}</p></div>`).join("")}</div></section>`;
}

// ---------- render ----------
const THEMES = { auto: ["auto", "Auto"], light: ["sun", "Light"], dark: ["moon", "Dark"] };
function paintChrome(fc) {
  $("#clock").textContent = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(state.now) + " CT";
  const mp = $("#modepill"); mp.className = `mode-pill ${fc.mode}`; mp.textContent = MODE_TXT[fc.mode]; mp.title = `Active data: ${MODE_TXT[fc.mode]}`;
  const t = document.documentElement.dataset.theme || "auto", [ic, lbl] = THEMES[t] || THEMES.auto;
  const tb = $("#themebtn"); tb.innerHTML = `${icon(ic)}<span class="lbl">${lbl}</span>`; tb.setAttribute("aria-label", `Theme: ${lbl}. Switch theme`);
}
function measure() {
  const vw = Math.min(document.documentElement.clientWidth || 390, 1180), pad = vw >= 760 ? 48 : 28, card = vw >= 760 ? 42 : 26;
  let w = vw - pad - card; if (vw >= 760) { /* chart sits full-width */ } state.chartW = Math.max(280, Math.round(w));
}
function render() {
  const fc = compute(); measure();
  if (!state.sel || !fc.days.some(d => d.dateKey === state.sel)) state.sel = fc.dateKey;
  const day = fc.days.find(d => d.dateKey === state.sel) || fc.days[0];
  const defHour = day.isToday ? (fc.current.open ? fc.hour : (day.hours.find(x => x.open && x.hour > fc.hour)?.hour ?? day.openHour)) : (day.peak?.hour ?? day.openHour);
  if (state.selHour == null || !day.hours[state.selHour]?.open) state.selHour = defHour;
  const hourX = day.hours[state.selHour];
  // keep focus + horizontal scroll across re-renders
  const ae = document.activeElement; let fsel = null;
  if (ae && ae !== document.body) for (const a of ["data-day", "data-hour", "data-role", "id"]) { const v = ae.getAttribute?.(a); if (v != null) { fsel = `${ae.tagName.toLowerCase()}[${a}="${v}"]`; break; } }
  const scrolls = { outlook: $("#outlook")?.scrollLeft, wk2: $("#wk2")?.scrollLeft };
  const dayHead = `<section aria-labelledby="day-h"><div class="sec-head"><div><p class="label">${day.isToday ? "Today" : "Selected day"}</p><h2 id="day-h">${esc(day.weekdayLong)}, ${esc(day.monthDay)}</h2><p class="small muted">${esc(day.headline)}${day.weather ? ` · ${day.weather.high}°/${day.weather.low}°, ${day.weather.rain}% rain` : ""}${day.schoolDay ? "" : day.weekday % 6 ? " · No school" : ""}</p></div><div class="badges">${eventBadges(day, 4)}</div></div>${chartCard(fc, day, hourX)}</section>`;
  $("#app").innerHTML = statusStrip(fc) + hero(fc) + outlook(fc) + dayHead + roleView(fc, day, hourX) + dayDetail(fc, day, hourX) + events(fc) + dataSection(fc) + menuCard() + infoSections() + sources();
  $("#foot").innerHTML = `Intensity is a forecast, not a live camera. A wreck on 280, a closed lobby, or a sell-out can beat the model. Apps add wait you can’t see from the street. Hours: Mon–Sat 5 AM–10 PM, Sunday 6 AM–10 PM; lobby winds down at 9. All times Central. Not affiliated with or endorsed by Bojangles.`;
  paintChrome(fc);
  if (scrolls.outlook != null && $("#outlook")) $("#outlook").scrollLeft = scrolls.outlook; if (scrolls.wk2 != null && $("#wk2")) $("#wk2").scrollLeft = scrolls.wk2;
  if (fsel) document.querySelector(fsel)?.focus({ preventScroll: true });
  state.anim = false;
}
const announce = t => { const a = $("#announce"); if (a) a.textContent = t; };

// ---------- interaction ----------
document.addEventListener("click", e => {
  if (e.target.closest("#themebtn")) { const order = ["auto", "light", "dark"], cur = document.documentElement.dataset.theme || "auto", nx = order[(order.indexOf(cur) + 1) % 3];
    document.documentElement.dataset.theme = nx; ls.set(THEME_KEY, nx); paintChrome(state.fc); announce(`Theme ${nx}`); return; }
  const r = e.target.closest("[data-role]"); if (r) { state.role = r.dataset.role; ls.set(ROLE_KEY, state.role); render(); return; }
  const d = e.target.closest("[data-day]"); if (d) { state.sel = d.dataset.day; state.selHour = null; state.anim = true; render(); announce(`Showing ${state.sel}`); return; }
  const h = e.target.closest("[data-hour]"); if (h) { state.selHour = Number(h.dataset.hour); render(); return; }
  if (e.target.id === "posclear") { ls.del(POS_KEY); state.pos = null; state.bt = null; state.posSource = null; afterData(); }
  if (e.target.id === "dailyclear") { ls.del(DAILY_KEY); state.daily = null; state.dailySource = null; afterData(); }
});
document.addEventListener("keydown", e => {
  const t = e.target;
  if (t.matches?.("rect.hit, tr[data-hour], tr[data-day]") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); t.dispatchEvent(new MouseEvent("click", { bubbles: true })); return; }
  if (t.matches?.("rect.hit") && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { e.preventDefault();
    const day = state.fc.days.find(d => d.dateKey === state.sel), open = day.hours.filter(x => x.open).map(x => x.hour), i = open.indexOf(state.selHour);
    const nx = open[Math.max(0, Math.min(open.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)))]; state.selHour = nx; render(); document.querySelector(`rect.hit[data-hour="${nx}"]`)?.focus({ preventScroll: true }); return; }
  if (t.matches?.('[role="tab"]') && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { e.preventDefault();
    const ids = ROLES.map(r => r[0]), i = ids.indexOf(state.role), nx = ids[(i + (e.key === "ArrowRight" ? 1 : 2)) % 3]; state.role = nx; ls.set(ROLE_KEY, nx); render(); document.querySelector(`#tab-${nx}`)?.focus(); }
});
document.addEventListener("change", async e => {
  const f = e.target.files?.[0]; if (!f) return;
  const text = await f.text();
  if (e.target.id === "posfile") { try { loadPOS(text, f.name); if (!ls.set(POS_KEY, text)) state.posError = "Loaded, but too big to save in this browser — reload will drop it."; else state.posError = null; } catch (err) { state.posError = err.message; } }
  else if (e.target.id === "dailyfile") { try { loadDaily(text, f.name); state.dailyError = ls.set(DAILY_KEY, text) ? null : "Loaded, but too big to save in this browser."; } catch (err) { state.dailyError = err.message; } }
  else return;
  afterData(); announce("Sales data loaded");
});
function loadPOS(text, source) { state.pos = parsePOS(text); state.posSource = source; }
function loadDaily(text, source) { state.daily = parseDaily(text); state.dailySource = source; }
function afterData() {
  try { state.bt = state.pos ? backtest(state.pos, state.cal) : null; } catch (e) { state.bt = null; console.warn("backtest failed", e); }
  const totals = state.daily || state.pos ? dailyTotals(state.daily, state.pos) : null;
  try { state.btDaily = totals && totals.size >= 21 ? backtestDaily(totals, state.cal) : null; } catch (e) { state.btDaily = null; console.warn("daily backtest failed", e); }
  state.fcKey = ""; render();
  if (totals && totals.size >= 20) loadWxHist(totals);
}
async function loadWxHist(totals) {
  const keys = [...totals.keys()].sort(), today = chicagoNow(state.now).dateKey, start = keys[0], end = keys[keys.length - 1] < addDays(today, -3) ? keys[keys.length - 1] : addDays(today, -3);
  if (start > end) return;
  try { const c = JSON.parse(ls.get(WXH_KEY) || "null"); if (c && c.start <= start && c.end >= end) { state.wxHist = c; state.wxHistNote = null; state.fcKey = ""; render(); return; } } catch {}
  try { const h = await fetchWeatherHistory(start, end); state.wxHist = h; state.wxHistNote = null; ls.set(WXH_KEY, JSON.stringify(h)); }
  catch (e) { state.wxHistNote = `(Past weather couldn’t be fetched: ${e.message}.)`; console.warn("weather history failed", e); }
  state.fcKey = ""; render();
}
async function loadWeather() {
  try { const c = JSON.parse(ls.get(WX_KEY) || "null"); if (c && Date.now() - Date.parse(c.fetchedAt) < 30 * 60e3 && c.ok) { state.weather = c; render(); return; } } catch {}
  const wx = await fetchWeather();
  state.weather = wx; if (wx.ok) ls.set(WX_KEY, JSON.stringify(wx));
  render();
}

async function boot() {
  try { const r = await fetch("data/menu.json", { cache: "no-cache" }); state.menu = await r.json(); } catch (e) { console.warn("menu.json failed to load", e); state.menu = null; }
  try { const r = await fetch("data/events.json", { cache: "no-cache" }); state.calJson = await r.json(); }
  catch (e) { console.warn("events.json failed to load", e); state.calJson = {}; }
  state.cal = makeCalendar(state.calJson);
  const saved = ls.get(POS_KEY), savedD = ls.get(DAILY_KEY);
  if (saved) { try { loadPOS(saved, "saved in this browser"); } catch (e) { state.posError = e.message; } }
  else if (state.calJson.posFile) { // optional shared POS file, set "posFile": "data/pos.csv" in events.json
    try { const r = await fetch(state.calJson.posFile, { cache: "no-cache" }); if (r.ok) loadPOS(await r.text(), state.calJson.posFile); } catch (e) { state.posError = e.message; } }
  if (savedD) { try { loadDaily(savedD, "saved in this browser"); } catch (e) { state.dailyError = e.message; } }
  afterData();
  loadWeather();
  setInterval(() => { state.now = new Date(); render(); }, 30e3);
  setInterval(() => { ls.del(WX_KEY); loadWeather(); }, 30 * 60e3);
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { const w = state.chartW; measure(); if (Math.abs(w - state.chartW) > 8) render(); }, 150); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => paintChrome(state.fc));
}
boot();
