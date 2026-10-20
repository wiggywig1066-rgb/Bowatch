import { forecast, makeCalendar, fetchWeather, parsePOS, line, dayparts, dayTotals, kitchenLoad, backtest, hourLabel, hourRange, shortHour, chicagoNow, TZ } from "./engine.js";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const n0 = v => Math.round(v).toLocaleString("en-US");
const POS_KEY = "bo-watch-pos-csv", WX_KEY = "bo-watch-weather", ROLE_KEY = "bo-watch-role";

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

const state = { now: new Date(), sel: null, selHour: null, role: localStorage.getItem(ROLE_KEY) || "cook", calJson: null, menu: null, cal: null, pos: null, posSource: null, posError: null, weather: null, fc: null, fcKey: "", bt: null };

function compute() {
  const c = chicagoNow(state.now), key = `${c.dateKey}|${c.hour}|${state.pos?.last}|${state.weather?.fetchedAt}|${state.calJson?.updated}`;
  if (key !== state.fcKey) { state.fc = forecast({ now: state.now, cal: state.cal, pos: state.pos, weather: state.weather }); state.fcKey = key; }
  return state.fc;
}
const wide = () => state.fc?.mode !== "pos";

function bandChip(x) { return `<span class="chip bg-${x.key}">${esc(x.label)}</span>`; }

function hero(fc) {
  const today = fc.days[0], cur = fc.current, R = fc.ratios;
  const focus = cur.open ? cur : today.hours.find(x => x.open && x.hour > fc.hour) || fc.days[1].hours.find(x => x.open);
  const L = line(focus, R, wide()), nextX = (focus.dateKey === today.dateKey ? today : fc.days[1]).hours[focus.hour + 1], N = nextX ? line(nextX, R, wide()) : null;
  const title = cur.open ? `Drop this hour · ${hourRange(cur.hour)}` : `Closed now · next open ${focus.weekdayShort} ${hourLabel(focus.hour)}`;
  return `<section style="margin-top:0" class="grid hero">
    <div class="card dark"><p class="label">${esc(title)}</p><div class="big" style="margin-top:8px">${L.biscuits}</div><p style="margin:4px 0 0">biscuits</p>
      <p class="small" style="margin:8px 0 0;opacity:.8">${L.pansPerDrop === 0 ? "Hold the board" : `${L.pansPerDrop} pan${L.pansPerDrop === 1 ? "" : "s"} / 20 min`} · ${esc(focus.label)}</p>
      <p class="small" style="margin:6px 0 0;opacity:.7">${esc(L.dropNote)}</p></div>
    <div class="card"><p class="label">Chicken</p><div class="mid" style="margin-top:8px">${L.chicken} pcs</div><p class="small muted">${L.eightPiece} eight-piece · ${L.tenders} Bo’s Tenders</p></div>
    <div class="card"><p class="label">Next hour</p><div class="mid" style="margin-top:8px">${N && N.open ? `${N.biscuits}` : "—"}</div><p class="small muted">${N && N.open ? `biscuits · ${N.crew} crew` : "Clock out the line"}</p></div>
    <div class="card"><p class="label">On the floor</p><div class="mid" style="margin-top:8px">${L.crew}</div><p class="small muted">${esc(L.roles.join(", "))}</p></div>
  </section>`;
}

function itemsGrid(L) {
  const it = [["Bone-in", `${L.chicken} pcs`], ["Bo’s Tenders", L.tenders], ["Filet / sausage / ham / steak", L.breakfastProteins], ["Bo Fries", L.fries], ["Fixins", L.sides], ["Gravy", L.gravy], ["Bo-Tato Rounds", L.boRounds], ["Legendary tea", `${L.teaGallons} gal`]];
  return `<div class="items">${it.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join("")}</div>`;
}

function roleView(fc, day, hourX) {
  const R = fc.ratios, T = dayTotals(day, R, wide());
  const tabs = `<div class="tabs" role="tablist">${[["cook","Cook"],["manager","Manager"],["scheduler","Scheduler"]].map(([id, l]) => `<button data-role="${id}" class="${state.role === id ? "on" : ""}">${l}</button>`).join("")}</div>`;
  const heads = { cook: ["Biscuit station", "What to drop"], manager: ["Floor", "Who’s on, and what runs out"], scheduler: ["Schedule", "Who to put on the clock"] }[state.role];
  let body = "";
  if (state.role === "cook") {
    const hrs = day.hours.filter(x => x.open && x.hour >= hourX.hour).slice(0, 3);
    body = `<div class="grid g3">${hrs.map((x, i) => { const L = line(x, R, wide()); return `<article class="card"><p class="label">${i === 0 ? "This hour" : "Coming up"} · ${hourRange(x.hour)}</p>
      <div class="mid" style="margin-top:6px">${L.biscuits} <span class="small muted">biscuits · ${L.biscuitLow}–${L.biscuitHigh} if the lane runs light or heavy</span></div>
      <p class="small">${esc(L.dropNote)}</p>${itemsGrid(L)}</article>`; }).join("") || `<p class="muted">Closed for the rest of the day.</p>`}</div>
      <p class="xs faint" style="margin-top:12px">Stage the low end, be ready for the high. 16 biscuits to a pan, about 48 to a batch, oven every 20 minutes. A forecast so the line isn’t surprised — not a live POS count.</p>`;
  } else if (state.role === "manager") {
    const L = line(hourX, R, wide()), nx = day.hours[hourX.hour + 1], N = nx?.open ? line(nx, R, wide()) : null;
    body = `<div class="grid g2"><div class="card dark"><p class="label">On the floor · ${hourRange(hourX.hour)}</p><div class="big" style="margin-top:8px">${L.crew}</div>
      <p class="small" style="opacity:.75">${esc(hourX.label)} · wait ${esc(hourX.wait)}. ${L.tickets} tickets through the kitchen, lane plus apps.</p>
      <p>${L.roles.map(r => `<span class="pill">${esc(r)}</span>`).join(" ")}</p>
      ${N && N.crew < L.crew ? `<p class="small" style="opacity:.8">You can drop to ${N.crew} at ${hourLabel(nx.hour)}.</p>` : ""}${N && N.crew > L.crew ? `<p class="small">Add ${N.crew - L.crew} before ${hourLabel(nx.hour)}.</p>` : ""}</div>
      <div class="card"><p class="label">Don’t 86</p><h3>Hold this through ${hourLabel((hourX.hour + 1) % 24)}</h3><div style="margin-top:10px">
      ${[["Biscuits", `${L.biscuitLow}–${L.biscuitHigh}`], ["Bone-in chicken", `${L.chicken} pcs · about ${L.eightPiece} eight-piece`], ["Bo’s Chicken Tenders", L.tenders], ...(L.breakfastProteins > 0 ? [["Cajun filet, sausage, country ham, steak", L.breakfastProteins]] : []), ["Mac, dirty rice, mashed & other fixins", `${L.sides} sides`], ["Bo Fries", L.fries], ["Gravy", L.gravy], ["Bo-Tato Rounds", L.boRounds], ["Legendary Iced Tea", `${L.teaGallons} gal`]].map(([a, b]) => `<div class="row"><span>${a}</span><b>${b}</b></div>`).join("")}</div>
      ${L.appLoad >= 4 ? `<p class="small" style="color:var(--cayenne)">Apps are on this fryer. Bag the 8- and 12-piece before you work the lane.</p>` : ""}
      <p class="xs faint">A normal dinner is already a full floor. Call-in days are the ones that jump past that — game nights, church let-out, a packed Saturday.</p></div></div>`;
  } else {
    const parts = dayparts(day, R, wide());
    body = `<div class="grid g3">${parts.map(p => `<article class="card"><p class="label">${esc(p.name)} · ${esc(p.window)}</p><div class="mid" style="margin-top:6px">${p.peakCrew} <span class="small muted">peak on the floor${p.callIn ? " · <b style='color:var(--cayenne)'>call in</b>" : ""}</span></div>
      <p class="small muted">${p.biscuits} biscuits · ${p.chicken} pcs · peak ${hourLabel(p.peakHour)}</p><p class="small">${esc(p.note)}</p></article>`).join("")}</div>
      <h3 style="margin-top:20px">Two-week call sheet</h3><div class="scroll"><table><thead><tr><th>Day</th><th>Biscuits</th><th>Chicken</th><th>Peak crew</th><th></th></tr></thead><tbody>
      ${fc.days.map(d => { const t = dayTotals(d, R, wide()); return `<tr data-day="${d.dateKey}"><td>${d.isToday ? "Today" : d.weekdayShort} ${d.monthDay}</td><td>${n0(t.biscuits)}</td><td>${n0(t.chicken)}</td><td>${t.peakCrew}${t.peakHour != null ? ` at ${shortHour(t.peakHour)}` : ""}</td><td>${t.callIn ? "<b style='color:var(--cayenne)'>Call in</b>" : ""}</td></tr>`; }).join("")}</tbody></table></div>`;
  }
  return `<section><div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:flex-end;margin-bottom:16px">
    <div><p class="label">${heads[0]}</p><h2>${heads[1]}</h2><p class="small muted" style="margin:4px 0 0">${day.isToday ? "Today" : day.weekdayLong}, ${day.monthDay}. <b>${n0(T.biscuits)}</b> biscuits · <b>${n0(T.chicken)}</b> chicken pieces${T.callIn ? " · call someone in" : ""}.</p></div>${tabs}</div>${body}</section>`;
}

function guide(fc) {
  return `<section><p class="label">14-day guide</p><h2>When the line gets hit</h2>
    <p class="small muted">Tap a day to load that shift. Color is the 280 rush, church, sports, apps, school calendar and live weather — the reason the drop changes.</p>
    <div class="legend" style="margin:8px 0 12px">${["dead","slow","moderate","busy","packed"].map(k => `<span><i class="bg-${k}"></i>${k[0].toUpperCase() + k.slice(1)}</span>`).join("")}</div>
    <div class="days">${fc.days.map(d => { const pk = d.peak; const w = d.weather; const evs = d.events.filter(e => e.lift !== 1);
      return `<button class="day k-${pk ? pk.key : "closed"} ${state.sel === d.dateKey ? "sel" : ""}" data-day="${d.dateKey}">
      <div class="d">${d.isToday ? "Today" : d.weekdayShort} <span class="muted" style="font-weight:400">${d.monthDay}</span></div>
      <div class="p">${pk ? `Peak ${shortHour(pk.hour)} ${pk.label} · Dead ${shortHour(d.deadest.hour)}` : "Closed"}</div>
      ${w ? `<div class="w tnum">${w.high}°/${w.low}° · ${w.rain}% · ${esc(w.summary)}</div>` : `<div class="w faint">Weather past forecast range</div>`}
      ${evs.length ? `<div class="ev">${esc(evs[0].label.split(",")[0])}${evs.length > 1 ? ` +${evs.length - 1}` : ""}</div>` : d.schoolDay || d.weekday % 6 === 0 ? "" : `<div class="ev">No school</div>`}
      </button>`; }).join("")}</div></section>`;
}

function dayDetail(fc, day, hourX) {
  const R = fc.ratios, open = day.hours.filter(x => x.open), max = Math.max(...open.map(x => x.popularity), 1);
  const ls = open.map(x => [x, line(x, R, wide())]);
  const sortedLow = [...ls].sort((a, b) => a[0].score - b[0].score || a[0].hour - b[0].hour).slice(0, 3), sortedHigh = [...ls].sort((a, b) => b[0].score - a[0].score || a[0].hour - b[0].hour).slice(0, 3);
  const kl = kitchenLoad(hourX);
  return `<section><p class="label">${day.isToday ? "Today" : day.weekdayShort}</p><h2>${day.weekdayLong}, ${day.monthDay}</h2><p class="muted small">${esc(day.headline)}${day.weather ? ` · ${day.weather.high}°/${day.weather.low}°, ${day.weather.rain}% rain` : ""}${day.schoolDay ? "" : day.weekday % 6 ? " · No school" : ""}</p>
    <div class="card" style="margin-top:12px"><p class="label">Hourly drop · ${hourLabel(day.openHour)}–${hourLabel(day.closeHour)}</p>
      <div class="bars">${open.map(x => `<button data-hour="${x.hour}" class="${x.hour === hourX.hour ? "sel" : ""}" title="${hourRange(x.hour)} · ${esc(x.label)}"><div class="bar bg-${x.key}" style="height:${Math.max(4, x.popularity / max * 140)}px"></div><span class="hl">${x.hour > 12 ? x.hour - 12 : x.hour}</span></button>`).join("")}</div></div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card scroll"><table><thead><tr><th>Hour</th><th>Board</th><th>Biscuits</th><th>Chicken</th><th>Crew</th></tr></thead><tbody>
      ${ls.map(([x, L]) => `<tr data-hour="${x.hour}" class="${x.hour === hourX.hour ? "sel" : ""}"><td>${hourRange(x.hour)}</td><td>${bandChip(x)} <span class="faint xs">${x.score}/10</span></td><td>${L.biscuits}</td><td>${L.chicken}</td><td>${L.crew}</td></tr>`).join("")}</tbody></table></div>
      <div class="grid">
        <div class="card"><p class="label">Cut labor here</p>${sortedLow.map(([x, L]) => `<div class="row"><span>${hourRange(x.hour)}</span><b>${L.biscuits} biscuits · ${L.crew} crew</b></div>`).join("")}</div>
        <div class="card"><p class="label">Do not fall behind</p>${sortedHigh.map(([x, L]) => `<div class="row"><span>${hourRange(x.hour)}</span><b>${L.biscuits} biscuits · ${L.crew} crew</b></div>`).join("")}</div>
        <div class="card"><p class="label">What’s pushing the needle · ${hourRange(hourX.hour)}</p>
          <p class="xs faint" style="margin:4px 0 0">Tap any hour above. Commute, church, apps, sports, school and weather are what moved the number.</p>
          <ul class="drivers">${hourX.drivers.map(d => `<li>${d.pct ? `<span class="pct">${d.pct > 0 ? "+" : ""}${d.pct}%</span>` : d.delta ? `<span class="pct">+${d.delta} pts</span>` : ""}<b style="font-weight:500">${esc(d.label)}</b><div class="small muted">${esc(d.detail)}${d.source ? ` <a href="${esc(d.source)}" target="_blank" rel="noopener">source</a>` : ""}</div></li>`).join("") || "<li class='muted'>Closed.</li>"}</ul></div>
        <div class="card"><p class="label">Kitchen load</p><h3>${esc(kl.label)}</h3><p class="small muted">${hourRange(hourX.hour)} · wait ${esc(hourX.wait)}</p><p class="small">${esc(kl.detail)}</p></div>
      </div></div></section>`;
}

function eventsSection(fc) {
  const start = fc.dateKey, evs = state.cal.events.filter(e => e.date >= start).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.start - b.start);
  return `<section><p class="label">Calendar</p><h2>Dated events on file</h2>
    <p class="small muted">From <code>data/events.json</code> (updated ${esc(state.calJson?.updated || "?")}). Lifts are starting guesses until POS history shows the real effect. Every entry links its source.</p>
    <div class="card">${evs.map(e => `<div class="evrow"><span class="tnum">${e.date.slice(5).replace("-", "/")} · ${shortHour(e.start)}–${shortHour(e.end)}</span><span>${esc(e.label)}${e.confidence ? ` <b style="color:var(--cayenne)">(${esc(e.confidence)})</b>` : ""}<br><span class="xs muted">${esc(e.detail || "")}</span></span><span class="small"><span class="tnum">${e.closed ? "closed" : `${e.lift >= 1 ? "+" : ""}${Math.round((e.lift - 1) * 100)}%`}</span> · <a href="${esc(e.source)}" target="_blank" rel="noopener">source</a></span></div>`).join("") || "<p class='muted'>No dated events ahead. Add some to data/events.json.</p>"}</div></section>`;
}

function posSection(fc) {
  const p = state.pos, L = fc.learned, bt = state.bt;
  const fmt = o => Object.entries(o).map(([k, v]) => `${k} ${(v.mape * 100).toFixed(0)}% (${v.n} h)`).join(" · ") || "—";
  return `<section id="pos"><p class="label">Calibrate</p><h2>Load real POS history</h2>
    <div class="card"><p class="small">Export hourly sales from the POS as a CSV with the template header (one row per date + hour). The board then uses the median of the last 8 same-weekdays for each hour, learns biscuits / chicken / tenders per ticket by daypart (an older <code>supremes</code> column is read as tenders), and reads the app share from the channel columns.</p>
    <p class="small muted">The file stays in this browser (saved in local storage on this device). It is not uploaded anywhere.</p>
    <p><input type="file" id="posfile" accept=".csv,text/csv"> <a class="btn ghost" href="data/pos_template.csv" download>Download template</a> ${p ? `<button class="btn ghost" id="posclear">Remove POS data</button>` : ""}</p>
    ${state.posError ? `<p class="small" style="color:var(--cayenne)">Couldn’t read that file: ${esc(state.posError)}</p>` : ""}
    ${p ? `<div class="row"><span>Loaded (${esc(state.posSource)})</span><b>${n0(p.rows.length)} hourly rows · ${p.days} days · ${p.first} → ${p.last}${p.badLines.length ? ` · ${p.badLines.length} skipped lines` : ""}</b></div>
      <div class="row"><span>Baseline</span><b>${L ? `${L.filledCells} of 118 open weekday-hours from POS` : "Not enough recent rows yet (need ~3 days within the last 8 weeks)"}</b></div>
      <div class="row"><span>Learned ratios</span><b>${L?.learnedRatios.length ? esc(L.learnedRatios.join(", ")) : "none yet (need 200+ tickets per daypart with item columns)"}</b></div>
      ${bt ? `<div class="row"><span>Backtest, last ${bt.dates} days (MAPE, lower is better)</span><b class="small">POS model: ${fmt(bt.pos)}<br>Estimated curves: ${fmt(bt.estimate)}</b></div>` : ""}` : ""}
    </div></section>`;
}

function infoSections() {
  return `<section class="grid g2"><div class="card"><p class="label">Usual day parts</p><h3>Where the money moves</h3><p class="small muted">Chain-wide FDD mix. This store is ~79% drive-thru and carry-out.</p>
    <div class="mix">${MIX.map(m => `<div style="width:${m.share}%;background:${m.c}"></div>`).join("")}</div>
    ${MIX.map(m => `<div class="row"><span>${m.part} <span class="xs faint">${m.window}</span></span><b>${m.share}%</b></div>`).join("")}</div>
    <div class="card"><p class="label">On this frontage</p><h3>What else pulls cars</h3><ul class="list">${FRONTAGE.map(([a, b]) => `<li><b style="font-weight:500">${a}</b><div class="small muted">${b}</div></li>`).join("")}</ul></div></section>
    <section><p class="label">Shared kitchen</p><h2>Every app prints here</h2><p class="small muted">DoorDash, Uber Eats, Grubhub, the Bojangles app, and curbside all hit the same fryer as the 280 lane.</p>
    <div class="grid g3">${CHANNELS.map(([a, b, c, d]) => `<div class="card"><b style="font-weight:500">${a}</b><div class="small" style="color:var(--cayenne)">${b}</div><div class="xs faint">${c}</div><p class="small muted">${d}</p></div>`).join("")}</div></section>`;
}

function sources() {
  const wx = state.weather;
  return `<section><p class="label">Sources</p><h2>Everything that feeds this board</h2><div class="grid g2">
    ${[["Live weather", `Fetched in your browser for 33.34°N, 86.63°W: NWS hourly (api.weather.gov) for ~7 days, Open-Meteo for the rest of the 14-day window. ${wx ? `Last fetch ${new Date(wx.fetchedAt).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" })} CT: ${esc(wx.sources.join("; "))}.` : "Not loaded."}`],
      ["Shelby County Schools 2026–27 calendar", `School days, breaks and early dismissals. <a href="${esc(state.calJson?.schoolCalendar?._source || "#")}" target="_blank" rel="noopener">PDF</a>`],
      ["Dated events", "Chelsea Hornets football (MaxPreps), Auburn and Alabama 2026 schedules, City of Chelsea calendar, US public holidays. See the Calendar section for each link."],
      ["Weekly rhythm", "US-280 commute windows, Sunday church let-out, Wednesday church, Friday payday, Walmart Saturday, app delivery windows — carried over from the original board. Used only until POS data replaces them."],
      ["Line production model", "16 biscuits to a pan, ~48 to a batch, oven every 20 minutes. Item counts scale from tickets by daypart; crew roles follow the original board's thresholds."],
      ["Menu tracked", `${state.menu ? `Menu checked ${esc(state.menu.checkedAt)} against ${esc(state.menu.scope || "the Chelsea store menu")}. Board items: ${esc((state.menu.tracked || []).map(t => t.board).join(", "))}. This store sells no Chicken Supremes; its boneless chicken is Bo’s Chicken Tenders and Bo Bites. ${(state.menu.sources || []).map((s, i) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">source ${i + 1}</a>`).join(" · ")}` : "data/menu.json not loaded."}`],
      ["Bojangles location page & franchise FDD", "Hours (Mon–Sat 5 AM–10 PM, Sun 6 AM–10 PM), 79% drive-thru/carry-out, day-part sales mix."]]
      .map(([a, b]) => `<div class="card"><b style="font-weight:500">${a}</b><p class="small muted" style="margin-bottom:0">${b}</p></div>`).join("")}</div></section>`;
}

function render() {
  const fc = compute();
  if (!state.sel || !fc.days.some(d => d.dateKey === state.sel)) state.sel = fc.dateKey;
  const day = fc.days.find(d => d.dateKey === state.sel) || fc.days[0];
  const defHour = day.isToday ? (fc.current.open ? fc.hour : (day.hours.find(x => x.open && x.hour > fc.hour)?.hour ?? day.openHour)) : (day.peak?.hour ?? day.openHour);
  if (state.selHour == null || !day.hours[state.selHour]?.open) state.selHour = defHour;
  const hourX = day.hours[state.selHour];
  const banner = fc.mode === "pos"
    ? `<div class="banner ok"><b>Calibrated from your POS history</b> (${state.pos.first} → ${state.pos.last}). Events and weather still layer on top.</div>`
    : `<div class="banner"><b>Baselines are estimates until real POS data is loaded.</b> Hourly counts come from the original hand-drawn curves${fc.posInsufficient ? " — the POS file loaded but has too few recent rows" : ""}. <a href="#pos">Load a POS export</a> to calibrate.</div>`;
  $("#app").innerHTML = banner + hero(fc) + roleView(fc, day, hourX) + guide(fc) + dayDetail(fc, day, hourX) + eventsSection(fc) + posSection(fc) + infoSections() + sources();
  $("#foot").innerHTML = `Intensity is a forecast, not a live camera. A wreck on 280, a closed lobby, or a sell-out can beat the model. Apps add wait you can’t see from the street. Hours: Mon–Sat 5 AM–10 PM, Sunday 6 AM–10 PM; lobby winds down at 9. All times Central.`;
  $("#clock").textContent = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(state.now) + " CT";
  const wx = state.weather; $("#wxstatus").textContent = wx ? (wx.ok ? `Live weather · ${wx.sources.filter(s => !/failed/.test(s)).join(" + ")}` : "Weather unavailable — forecast runs without it") : "Loading weather…";
}

// ---------- events ----------
document.addEventListener("click", e => {
  const r = e.target.closest("[data-role]"); if (r) { state.role = r.dataset.role; localStorage.setItem(ROLE_KEY, state.role); render(); return; }
  const d = e.target.closest("[data-day]"); if (d) { state.sel = d.dataset.day; state.selHour = null; render(); return; }
  const h = e.target.closest("[data-hour]"); if (h) { state.selHour = Number(h.dataset.hour); render(); return; }
  if (e.target.id === "posclear") { localStorage.removeItem(POS_KEY); state.pos = null; state.bt = null; state.posSource = null; render(); }
});
document.addEventListener("change", async e => {
  if (e.target.id !== "posfile" || !e.target.files[0]) return;
  const text = await e.target.files[0].text();
  try { loadPOS(text, e.target.files[0].name); localStorage.setItem(POS_KEY, text); state.posError = null; }
  catch (err) { state.posError = err.message; }
  render();
});
function loadPOS(text, source) {
  state.pos = parsePOS(text); state.posSource = source;
  try { state.bt = backtest(state.pos, state.cal); } catch (e) { state.bt = null; console.warn("backtest failed", e); }
}

async function loadWeather() {
  try { const c = JSON.parse(localStorage.getItem(WX_KEY) || "null"); if (c && Date.now() - Date.parse(c.fetchedAt) < 30 * 60e3 && c.ok) { state.weather = c; render(); return; } } catch {}
  const wx = await fetchWeather();
  state.weather = wx; if (wx.ok) localStorage.setItem(WX_KEY, JSON.stringify(wx));
  render();
}

async function boot() {
  try { const r = await fetch("data/menu.json", { cache: "no-cache" }); state.menu = await r.json(); } catch (e) { console.warn("menu.json failed to load", e); state.menu = null; }
  try { const r = await fetch("data/events.json", { cache: "no-cache" }); state.calJson = await r.json(); }
  catch (e) { console.warn("events.json failed to load", e); state.calJson = {}; }
  state.cal = makeCalendar(state.calJson);
  const saved = localStorage.getItem(POS_KEY);
  if (saved) { try { loadPOS(saved, "saved in this browser"); } catch (e) { state.posError = e.message; } }
  else if (state.calJson.posFile) { // optional shared POS file, set "posFile": "data/pos.csv" in events.json
    try { const r = await fetch(state.calJson.posFile, { cache: "no-cache" }); if (r.ok) loadPOS(await r.text(), state.calJson.posFile); } catch (e) { state.posError = e.message; } }
  render();
  loadWeather();
  setInterval(() => { state.now = new Date(); render(); }, 30e3);
  setInterval(() => { localStorage.removeItem(WX_KEY); loadWeather(); }, 30 * 60e3);
}
boot();
