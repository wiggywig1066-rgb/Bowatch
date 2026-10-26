import { forecast, makeCalendar, fetchWeather, fetchWeatherHistory, parsePOS, parseDaily, dailyTotals, backtestDaily, line, dayparts, dayTotals, kitchenLoad, backtest, hourLabel, hourRange, shortHour, chicagoNow, addDays, hourBand, TZ, WDL, UPLIFT_NAMES, UPLIFT_MIN_DAYS } from "./engine.js";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const n0 = v => Math.round(v).toLocaleString("en-US");
const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;
const POS_KEY = "bo-watch-pos-csv", DAILY_KEY = "bo-watch-daily-csv", WX_KEY = "bo-watch-weather", WXH_KEY = "bo-watch-wxhist", THEME_KEY = "bo-watch-theme", VIEW_KEY = "bo-watch-view";
const VIEWS = ["now", "week", "cook", "crew", "data"];
const icon = (id) => `<svg class="ic" aria-hidden="true" focusable="false"><use href="#i-${id}"/></svg>`;
const ls = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del: k => { try { localStorage.removeItem(k); } catch {} },
};

const state = {
  now: new Date(), view: "now", sel: null, selHour: null,
  calJson: null, menu: null, promos: null, traffic: null, holidays: null, cal: null,
  pos: null, posText: null, posSource: null, posError: null, posWhere: null,
  daily: null, dailyText: null, dailySource: null, dailyError: null, dailyWhere: null,
  synthetic: false, wxHist: null, wxHistNote: null, weather: null, fc: null, fcKey: "", bt: null, btDaily: null, chartW: 680,
};

function compute() {
  const c = chicagoNow(state.now);
  const key = [c.dateKey, c.hour, state.pos?.last, state.pos?.rows.length, state.daily?.last, state.daily?.rows.length, state.wxHist?.fetchedAt, state.weather?.fetchedAt, state.calJson?.updated, state.synthetic].join("|");
  if (key !== state.fcKey) {
    state.fc = forecast({
      now: state.now, cal: state.cal, weather: state.weather,
      pos: state.synthetic ? null : state.pos,
      daily: state.daily,
      wxHist: state.synthetic ? null : state.wxHist,
    });
    state.fcKey = key;
  }
  return state.fc;
}
const spreadOf = x => hourBand(state.fc.uncertainty.spread, x.sampleN || 0, state.fc.uncertainty.basis);
const L_ = x => line(x, state.fc.ratios, spreadOf(x));
const MODE_TXT = { estimate: "Assumptions", daily: "Daily sales", pos: "Hourly sales" };
function bandChip(x) { return `<span class="chip bg-${x.key} k-${x.key}">${esc(x.label)}</span>`; }
function signPct(p) { const n = Math.round(p || 0); return `${n < 0 ? "−" : "+"}${Math.abs(n)}%`; }

function wxIcon(w) {
  if (!w) return null;
  const s = `${w.summary || ""} ${w.short || ""}`.toLowerCase();
  if (/thunder|storm|hail/.test(s)) return "storm";
  if (/snow/.test(s)) return "snow";
  if (/rain|shower|drizzle/.test(s) || w.rain >= 60) return "rain";
  if (/fog/.test(s)) return "fog";
  if (/partly|mostly clear/.test(s)) return "partly";
  if (/cloud/.test(s)) return "cloud";
  return "sun";
}
const KIND_ICON = { sports: "ball", college: "ball", holiday: "flag", local: "star", school: "school", retail: "star" };
const shortEvent = l => String(l || "").split(/[,(:]/)[0].replace(/^CHS football/, "CHS").replace(/ \+ .*/, "").trim().slice(0, 28);

function eventBadges(d, max = 2) {
  const evs = (d.events || []).filter(e => e.lift !== 1 || e.closed || e.confidence);
  const out = evs.slice(0, max).map(e => `<span class="badge" title="${esc(e.label)}">${icon(KIND_ICON[e.kind] || "star")}<span>${esc(shortEvent(e.label))}${e.confidence ? " · unconfirmed" : ""}</span></span>`);
  if (evs.length > max) out.push(`<span class="badge soft">+${evs.length - max}</span>`);
  if (!d.schoolDay && d.weekday % 6 !== 0) out.push(`<span class="badge soft">${icon("school")}No school</span>`);
  for (const n of d.context || []) if (n.pct === 0) out.push(`<span class="badge soft" title="${esc(n.detail)}">${esc(n.label)}</span>`);
  return out.join("");
}

function rangeNote(x, L) {
  const u = state.fc.uncertainty;
  const basis = u.basis === "backtest" ? "from your backtest" : "assumption";
  const n = x.sampleN >= 1 ? ` · ${x.sampleN} ${x.weekdayShort}${x.sampleN === 1 ? "" : "s"} in the baseline` : "";
  return `likely ${L.ticketLow}–${L.ticketHigh} · ${basis}${n}`;
}
function vsLine(x) {
  const p = Math.round((x.vsNormal - 1) * 100);
  if (!p) return `In line with a usual ${x.weekdayShort} ${hourLabel(x.hour)}.`;
  return `${Math.abs(p)}% ${p > 0 ? "above" : "below"} a usual ${x.weekdayShort} ${hourLabel(x.hour)}.`;
}
function whyBlock(x) {
  if (!x?.open) return `<p class="muted">Closed.</p>`;
  const chips = (x.adjustments || []).map(a => {
    const cls = a.pct > 0 ? "up" : a.pct < 0 ? "down" : "";
    const tag = a.assumption === false ? `<span class="tag">your sales</span>` : "";
    return `<span class="ychip ${cls}" title="${esc(a.detail || "")}">${esc(a.label)} ${signPct(a.pct)}${tag}</span>`;
  }).join("");
  const assumed = (x.adjustments || []).some(a => a.assumption !== false);
  return `<div class="whybar"><p class="label">Why this hour</p><p>${esc(x.why)}</p><p class="small muted" style="margin:6px 0 0">${esc(vsLine(x))}${assumed ? " Percents without a “your sales” tag are assumptions, not this store’s history." : ""}</p>${chips ? `<div class="chips">${chips}</div>` : ""}</div>`;
}
function wxLine() {
  const wx = state.weather;
  if (!wx) return "Loading weather…";
  if (!wx.ok) return "Weather unavailable — the board is running without it.";
  return `Live weather · ${wx.sources.filter(s => !/failed/.test(s)).join(" + ")}`;
}
function activePromos(dateKey) {
  return (state.promos?.items || []).filter(p => p.start && (!p.end || dateKey <= p.end) && dateKey >= p.start);
}

function hourCard(x, { now = false, kicker, fc }) {
  const L = L_(x);
  const drop = nextDropText(fc, x, L, now);
  return `<article class="hcard${now ? " is-now" : ""}">
    <div class="kicker"><p class="label">${esc(kicker)}</p>${bandChip(x)}</div>
    <p class="range">${esc(hourRange(x.hour))}${x.wait && x.wait !== "—" ? ` · ${esc(x.wait)}` : ""}</p>
    <div class="big tnum">${L.tickets}<small>tickets</small></div>
    <p class="range">${esc(rangeNote(x, L))}</p>
    <ul class="prep">
      <li><span>${icon("biscuit")} Biscuits</span><b class="tnum">${L.biscuits}</b></li>
      <li><span>${icon("drum")} Bone-in</span><b class="tnum">${L.chicken} pcs</b></li>
      <li><span>Bo’s Tenders</span><b class="tnum">${L.tenders}</b></li>
      <li><span>Next drop</span><b>${esc(drop)}</b></li>
    </ul>
    <div class="roles">${L.roles.map(r => `<span>${esc(r)}</span>`).join("")}<span class="pill">${L.crew} crew</span></div>
  </article>`;
}
function nextDropText(fc, x, L, isCurrent) {
  if (!L.pansPerDrop) return "Hold the board";
  if (isCurrent && x.hour === fc.hour && x.dateKey === fc.dateKey) {
    const m = Math.ceil((fc.minute + 1) / 20) * 20;
    if (m >= 60) return `${L.pansPerDrop * 16} at ${hourLabel(x.hour + 1).replace(" ", ":00 ")}`;
    return `${L.pansPerDrop * 16} at ${hourLabel(x.hour).replace(" ", `:${String(m).padStart(2, "0")} `)}`;
  }
  return `${L.pansPerDrop * 16} at ${hourLabel(x.hour).replace(" ", ":00 ")}`;
}

function alerts(fc) {
  const list = state.weather?.alerts || [];
  if (!list.length) return "";
  return list.map(a => `<div class="banner alert" role="status"><b>${icon("alert")} ${esc(a.event)}</b><div class="small">${esc(a.headline || "")}${a.instruction ? ` ${esc(a.instruction)}` : ""}</div></div>`).join("");
}
function promoBanner(dateKey) {
  const items = activePromos(dateKey);
  if (!items.length) return "";
  const names = items.map(p => `${p.name}${p.end ? ` through ${p.end.slice(5)}` : " (no end posted)"}`).join("; ");
  return `<div class="banner"><b>National promo · not in this count.</b> ${esc(names)}. Not confirmed at this Chelsea store.</div>`;
}
function statusStrip(fc) {
  const u = fc.uncertainty;
  if (state.synthetic) return `<div class="banner fake" role="status">FAKE EXAMPLE. These tickets are round placeholders so you can see a calibrated layout. They are not Chelsea sales and they are not saved on this phone.</div>`;
  if (fc.mode === "pos") return `<div class="status ok">${icon("chart")}<div><b>Using your hourly sales</b> (${esc(state.pos.first)} → ${esc(state.pos.last)}), kept on this phone. Likely range about ±${Math.round(u.spread * 100)}%.</div></div>`;
  if (fc.mode === "daily") return `<div class="status ok">${icon("chart")}<div><b>Using your daily sales</b> (${esc(state.daily.first)} → ${esc(state.daily.last)}). Day totals are yours; hours still follow the usual curve. Likely range about ±${Math.round(u.spread * 100)}%.</div></div>`;
  return `<div class="status">${icon("chart")}<div><b>Assumptions.</b> No store sales are loaded, so every count is a prior. Likely range about ±${Math.round(u.spread * 100)}% until a backtest on your file replaces it.${fc.posInsufficient ? " The hourly file has too few recent rows." : ""}${fc.dailyInsufficient ? " The daily file needs 3 or more recent weeks." : ""}</div></div>`;
}

function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v || 1)), m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}
function chart(fc, day, hourX) {
  const open = day.hours.filter(x => x.open);
  if (!open.length) return `<p class="muted">Closed all day.</p>`;
  const lines = open.map(x => [x, L_(x)]);
  const W = state.chartW, small = W < 520, H = small ? 220 : 260, pl = 36, pr = 8, pt = 28, pb = 26;
  const maxY = niceMax(Math.max(...lines.map(([, l]) => l.ticketHigh)) * 1.08);
  const n = open.length, bw = (W - pl - pr) / n;
  const y = v => pt + (H - pt - pb) * (1 - v / maxY);
  const cx = i => pl + bw * (i + 0.5);
  const ticks = [0, maxY / 2, maxY];
  const up = lines.map(([, l], i) => `${cx(i).toFixed(1)},${y(l.ticketHigh).toFixed(1)}`);
  const dn = lines.map(([, l], i) => `${cx(i).toFixed(1)},${y(l.ticketLow).toFixed(1)}`).reverse();
  const nowH = day.isToday && fc.current.open ? fc.hour : null;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="Hourly tickets for ${esc(day.weekdayLong)} with a likely range. Arrow keys move between hours.">`;
  for (const t of ticks) s += `<line class="gl" x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${pl - 6}" y="${y(t) + 4}" text-anchor="end">${Math.round(t)}</text>`;
  lines.forEach(([x], i) => { if (x.hour === nowH) s += `<rect class="nowcol" x="${(pl + bw * i).toFixed(1)}" y="${pt - 16}" width="${bw.toFixed(1)}" height="${H - pt - pb + 16}" rx="6"/><text class="nowtx" x="${cx(i)}" y="${pt - 4}" text-anchor="middle">NOW</text>`; });
  s += `<polygon class="bandp" points="${[...up, ...dn].join(" ")}"/>`;
  lines.forEach(([x, l], i) => {
    const bx = pl + bw * i + bw * 0.18, w = bw * 0.64, top = y(l.tickets), h = Math.max(2, y(0) - top);
    s += `<rect x="${bx.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(5, w / 3)}" fill="var(--${x.key})"/>`;
    if (x.hour === hourX.hour) s += `<rect class="sel" x="${(bx - 2).toFixed(1)}" y="${(top - 2).toFixed(1)}" width="${(w + 4).toFixed(1)}" height="${(h + 4).toFixed(1)}" rx="6"/>`;
    if (!small || i % 2 === 0 || x.hour === hourX.hour) s += `<text class="ax" x="${cx(i)}" y="${H - 8}" text-anchor="middle">${shortHour(x.hour)}</text>`;
  });
  lines.forEach(([x, l], i) => {
    s += `<rect class="hit" data-hour="${x.hour}" tabindex="${x.hour === hourX.hour ? 0 : -1}" role="button" aria-pressed="${x.hour === hourX.hour}" aria-label="${esc(`${hourRange(x.hour)}: ${l.tickets} tickets, likely ${l.ticketLow} to ${l.ticketHigh}. ${x.why}`)}" x="${pl + bw * i}" y="${pt - 16}" width="${bw}" height="${H - pt + 16}"/>`;
  });
  return s + `</svg>`;
}
function chartCard(fc, day, hourX, { why = true } = {}) {
  const L = L_(hourX);
  const u = fc.uncertainty;
  return `<div class="card chart-card">
    <div class="chart-read" aria-live="polite"><span class="label" style="flex-basis:100%">Selected hour</span><b>${esc(hourRange(hourX.hour))}</b> ${bandChip(hourX)}
      <span><b class="tnum">${L.tickets}</b> tickets <span class="muted xs">(${L.ticketLow}–${L.ticketHigh})</span></span>
      <span><b class="tnum">${L.biscuits}</b> biscuits</span><span><b class="tnum">${L.chicken}</b> pcs</span><span><b class="tnum">${L.crew}</b> crew</span></div>
    ${chart(fc, day, hourX)}
    <div class="legend"><span><i class="band"></i>Likely range ±${Math.round(spreadOf(hourX) * 100)}%${u.assumption ? " · assumption" : " · your backtest"}</span>
      ${["dead", "slow", "moderate", "busy", "packed"].map(k => `<span><i class="bg-${k}"></i>${k[0].toUpperCase() + k.slice(1)}</span>`).join("")}</div>
    ${why ? whyBlock(hourX) : ""}
  </div>`;
}

function dayButton(d, fc) {
  const t = dayTotals(d, fc.ratios, fc.uncertainty.spread);
  const w = d.weather, wi = wxIcon(w), pk = d.peak;
  const maxT = Math.max(...fc.days.map(x => dayTotals(x, fc.ratios, fc.uncertainty.spread).tickets), 1);
  const wx = w ? `${icon(wi || "sun")}<span><span class="hi">${w.high}°</span> <span class="muted">${w.low}°</span><br><span class="xs">${w.rain}% rain${w.precipIn >= 0.01 ? ` · ${Number(w.precipIn).toFixed(2)} in` : ""}</span></span>` : `<span class="xs faint">Weather not out yet</span>`;
  return `<button class="dcard" type="button" data-day="${d.dateKey}" aria-pressed="${state.sel === d.dateKey}">
    <div><span class="dname">${d.isToday ? "Today" : esc(d.weekdayShort)}</span> <span class="ddate">${esc(d.monthDay)}</span></div>
    <div class="wx">${wx}</div>
    <div class="meter" aria-hidden="true"><i class="bg-${pk ? pk.key : "closed"}" style="width:${Math.max(8, t.tickets / maxT * 100)}%"></i></div>
    <div class="small"><b class="tnum">${n0(t.tickets)}</b> tickets · peak ${pk ? shortHour(pk.hour) : "—"}${t.callIn ? " · call in" : ""}</div>
    <div class="chips">${eventBadges(d)}</div>
  </button>`;
}
function daySelect(fc, id = "daypick") {
  return `<label class="small" for="${id}">Day <select id="${id}">${fc.days.map(d => `<option value="${d.dateKey}" ${d.dateKey === state.sel ? "selected" : ""}>${d.isToday ? "Today" : d.weekdayLong} ${d.monthDay}</option>`).join("")}</select></label>`;
}

function focusHours(fc) {
  const today = fc.days[0];
  const cur = fc.current.open ? fc.current : today.hours.find(x => x.open && x.hour > fc.hour) || fc.days[1]?.hours.find(x => x.open);
  if (!cur) return [];
  const day = fc.days.find(d => d.dateKey === cur.dateKey) || today;
  const list = [{ x: cur, kicker: cur === fc.current && cur.open ? "Right now" : "Next open hour", now: true }];
  for (let step = 1; step <= 2; step++) {
    let h = cur.hour + step, key = cur.dateKey, guard = 0;
    while (guard++ < 30) {
      const d = fc.days.find(dd => dd.dateKey === key);
      if (d?.hours[h]?.open) {
      const soon = d.dateKey === cur.dateKey && h === cur.hour + step;
      list.push({ x: d.hours[h], kicker: soon ? (step === 1 ? "Next hour" : "Hour after") : `${d.weekdayShort} ${hourLabel(h)}`, now: false });
      break;
    }
      h += 1;
      if (h > 23) { h = 0; key = addDays(key, 1); }
    }
  }
  list._day = day;
  return list;
}

function viewNow(fc) {
  const today = fc.days[0];
  const cards = focusHours(fc);
  const hourX = today.hours.find(x => x.open && x.hour === (state.selHour ?? fc.hour)) || cards[0]?.x || today.hours.find(x => x.open);
  const w = today.weather;
  return `${statusStrip(fc)}${alerts(fc)}${promoBanner(today.dateKey)}
    <section class="fade" aria-labelledby="now-h">
      <p class="label">${esc(today.weekdayLong)} · ${esc(today.monthDay)}</p>
      <h1 id="now-h">What to cook right now</h1>
      <p class="muted">${esc(today.headline)}${w ? ` · ${w.high}° / ${w.low}°, ${w.rain}% rain${w.precipIn >= 0.01 ? `, ${Number(w.precipIn).toFixed(2)} in` : ""}` : ""}. ${esc(wxLine())}</p>
    </section>
    <div class="hours3" style="margin-top:12px">${cards.map(c => hourCard(c.x, { now: c.now, kicker: c.kicker, fc })).join("")}</div>
    ${whyBlock(cards[0]?.x)}
    ${hourX ? chartCard(fc, today, hourX, { why: false }) : ""}
    ${contextList(today)}`;
}

function viewWeek(fc) {
    const day = selectedDay(fc);
    const hourX = pickedHour(fc, day);
    if (!hourX) return `${statusStrip(fc)}<p class="muted">That day is closed.</p>`;
    return `${statusStrip(fc)}
    <section class="fade" aria-labelledby="wk-h">
      <div class="sec-head"><div><p class="label">Outlook</p><h1 id="wk-h">Next 14 days</h1><p class="muted">Tap a day. The bar is expected tickets. Color is the peak hour. ${esc(wxLine())}</p></div></div>
      <h2 class="wkhead">This week</h2>
      <div class="days">${fc.days.slice(0, 7).map(d => dayButton(d, fc)).join("")}</div>
      <h2 class="wkhead">Days 8–14</h2>
      <div class="days">${fc.days.slice(7, 14).map(d => dayButton(d, fc)).join("")}</div>
    </section>
    <section style="margin-top:16px" aria-labelledby="sel-h">
      <div class="sec-head"><div><p class="label">${day.isToday ? "Today" : "Selected day"}</p><h2 id="sel-h">${esc(day.weekdayLong)}, ${esc(day.monthDay)}</h2>
        <p class="muted">${esc(day.headline)}${day.weather ? ` · ${day.weather.summary || ""} ${day.weather.high}°/${day.weather.low}°` : ""}</p></div>
        <div>${eventBadges(day, 4)}</div></div>
      ${chartCard(fc, day, hourX)}
      ${contextList(day)}
      ${hourTable(fc, day, hourX)}
    </section>`;
}

function viewCook(fc) {
  const day = selectedDay(fc);
  const start = day.isToday ? fc.hour : day.openHour;
  const hours = day.hours.filter(x => x.open && x.hour >= start);
  const show = hours.length ? hours : day.hours.filter(x => x.open);
  const T = dayTotals(day, fc.ratios, fc.uncertainty.spread);
  const cards = show.map(x => {
    const L = L_(x);
    const soon = day.isToday && (x.hour === fc.hour || x.hour === fc.hour + 1);
    const times = L.pansPerDrop
      ? [0, 20, 40].map(m => `<li><span>${hourLabel(x.hour).replace(" ", `:${String(m).padStart(2, "0")} `)}</span><b>${L.pansPerDrop} pan${L.pansPerDrop > 1 ? "s" : ""} · ${L.pansPerDrop * 16} biscuits</b></li>`).join("")
      : `<li><span>This hour</span><b>No fresh pan</b></li>`;
    return `<article class="drop-card${soon ? " soon" : ""}">
      <div class="kicker"><p class="label">${soon ? "Coming up · " : ""}${esc(hourRange(x.hour))}</p>${bandChip(x)}</div>
      <p style="margin:8px 0 0"><b class="tnum">${L.biscuits}</b> biscuits · <b class="tnum">${L.chicken}</b> bone-in · <b class="tnum">${L.tenders}</b> Bo’s Tenders · <b>${L.crew}</b> crew</p>
      <p class="small">${esc(L.dropNote)}</p>
      <ul class="drops">${times}</ul>
      <div class="items"><div><span>Stage</span><b>${L.biscuitLow}–${L.biscuitHigh} biscuits</b></div><div><span>Eight-piece</span><b>about ${L.eightPiece}</b></div><div><span>Bo Fries</span><b>${L.fries}</b></div><div><span>Fixins</span><b>${L.sides}</b></div><div><span>Tea</span><b>${L.teaGallons} gal</b></div><div><span>Gravy</span><b>${L.gravy}</b></div></div>
    </article>`;
  }).join("");
  return `<section class="fade" aria-labelledby="cook-h">
    <div class="sec-head"><div><p class="label">Production</p><h1 id="cook-h">Drop and cook</h1>
      <p class="muted">${esc(day.isToday ? "Today" : day.weekdayLong)}, ${esc(day.monthDay)}. About <b>${n0(T.biscuits)}</b> biscuits and <b>${n0(T.chicken)}</b> bone-in pieces for the day. 16 biscuits to a pan, drops at :00, :20, and :40.</p></div>${daySelect(fc)}</div>
    <div class="drop-list">${cards || `<p class="muted">Closed.</p>`}</div>
    <p class="xs faint">A forecast so the line is not surprised. Not a live count from the register.</p>
  </section>`;
}

function viewCrew(fc) {
  const day = selectedDay(fc);
  const parts = dayparts(day, fc.ratios, fc.uncertainty.spread);
  const T = dayTotals(day, fc.ratios, fc.uncertainty.spread);
  return `<section class="fade" aria-labelledby="crew-h">
    <div class="sec-head"><div><p class="label">Schedule</p><h1 id="crew-h">Crew by shift</h1>
      <p class="muted">${esc(day.weekdayLong)}, ${esc(day.monthDay)}. Peak <b>${T.peakCrew}</b> on the floor${T.peakHour != null ? ` around ${hourLabel(T.peakHour)}` : ""}.${T.callIn ? " Call someone in." : ""} Roles follow the board’s thresholds. They are ${fc.mode === "estimate" ? "assumptions until sales are loaded." : "scaled to your sales."}</p></div>${daySelect(fc, "daypick2")}</div>
    <div class="grid g3">${parts.map(p => `<article class="card shift"><p class="label">${esc(p.name)} · ${esc(p.window)}</p><div class="mid tnum">${p.peakCrew}</div><p class="small muted">peak on the floor${p.callIn ? " · call in" : ""} · peak ${hourLabel(p.peakHour)}</p><p class="small" style="margin:0">${esc(p.note)} ${n0(p.biscuits)} biscuits · ${n0(p.chicken)} bone-in.</p></article>`).join("")}</div>
    <div class="card scroll" style="margin-top:12px"><h2>14-day call sheet</h2>
      <table><thead><tr><th>Day</th><th class="n">Tickets</th><th class="n">Biscuits</th><th class="n">Bone-in</th><th class="n">Peak crew</th><th></th></tr></thead><tbody>
      ${fc.days.map(d => { const t = dayTotals(d, fc.ratios, fc.uncertainty.spread); return `<tr data-day="${d.dateKey}" class="${d.dateKey === state.sel ? "sel" : ""}" tabindex="0"><td>${d.isToday ? "Today" : esc(d.weekdayShort)} ${esc(d.monthDay)}</td><td class="n tnum">${n0(t.tickets)}</td><td class="n tnum">${n0(t.biscuits)}</td><td class="n tnum">${n0(t.chicken)}</td><td class="n">${t.peakCrew}${t.peakHour != null ? ` at ${shortHour(t.peakHour)}` : ""}</td><td>${t.callIn ? "<b>Call in</b>" : ""}</td></tr>`; }).join("")}
      </tbody></table></div>
  </section>`;
}

function hourTable(fc, day, hourX) {
  const rows = day.hours.filter(x => x.open).map(x => {
    const L = L_(x);
    return `<tr data-hour="${x.hour}" tabindex="0" class="${x.hour === hourX.hour ? "sel" : ""} ${day.isToday && x.hour === fc.hour ? "now" : ""}"><td><b>${shortHour(x.hour)}</b></td><td>${bandChip(x)}</td><td class="n tnum">${L.tickets}</td><td class="n tnum">${L.biscuits}</td><td class="n tnum">${L.chicken}</td><td class="n">${L.crew}</td></tr>`;
  }).join("");
  const kl = kitchenLoad(hourX);
  return `<div class="grid g2" style="margin-top:12px">
    <div class="card scroll"><table><thead><tr><th>Hour</th><th>Board</th><th class="n">Tix</th><th class="n">Bisc</th><th class="n">Bone-in</th><th class="n">Crew</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="card"><p class="label">Kitchen · ${esc(hourRange(hourX.hour))}</p><h3>${esc(kl.label)}</h3><p>${esc(kl.detail)}</p>
      <ul class="drivers">${(hourX.drivers || []).slice(0, 6).map(d => `<li><b>${esc(d.label)}</b><div class="small muted">${esc(d.detail || "")}</div></li>`).join("")}</ul></div>
  </div>`;
}
function contextList(day) {
  const notes = day.context || [];
  if (!notes.length) return "";
  return `<div class="card" style="margin-top:12px"><p class="label">On the calendar · does not change the count</p><ul class="notes">${notes.map(n => `<li><b>${esc(n.label)}</b> — ${esc(n.detail)}${n.source ? ` <a href="${esc(n.source)}" target="_blank" rel="noopener">Source</a>` : ""}</li>`).join("")}</ul></div>`;
}
function selectedDay(fc) { return fc.days.find(d => d.dateKey === state.sel) || fc.days[0]; }
function pickedHour(fc, day) {
  if (state.selHour != null && day.hours[state.selHour]?.open) return day.hours[state.selHour];
  if (day.isToday && fc.current.open) return fc.current;
  return day.peak || day.hours.find(x => x.open);
}

function viewData(fc) {
  const p = state.pos, d = state.daily, u = fc.uncertainty;
  const active = { estimate: "None — assumption curves", daily: "Daily sales, split by the default hourly curve", pos: "Hourly sales" }[fc.mode];
  return `<section class="fade" aria-labelledby="data-h">
    <p class="label">Private to this phone</p>
    <h1 id="data-h">Sales stay on this device</h1>
    <p class="muted">Drop a file or paste a CSV. It is parsed in the browser and saved in local storage, with IndexedDB as a backup. Nothing is uploaded. Export or clear it here. Real sales files are not part of the public site.</p>
    ${state.synthetic ? `<div class="banner fake" role="status">FAKE EXAMPLE on screen. Clear it before you load real sales. It was not written to storage.</div>` : ""}
    <div class="grid g2" style="margin-top:12px">
      ${fileCard("daily", "Daily sales", "One row per day. Easiest place to start.", "date, tickets, net_sales. Optional biscuits, chicken_pieces, tenders, labor_hours.", d, state.dailySource, state.dailyError, state.dailyWhere)}
      ${fileCard("pos", "Hourly sales", "One row per date and hour. This replaces the hourly shape.", "date, hour, tickets, plus optional items and channels.", p, state.posSource, state.posError, state.posWhere)}
    </div>
    <div class="card" style="margin-top:12px">
      <p class="label">Paste</p>
      <label class="small" for="paste">CSV text <span class="faint">(daily if the header has no hour column, hourly if it does)</span></label>
      <textarea id="paste" aria-label="Paste sales CSV"></textarea>
      <div class="btns"><button class="btn" id="pastebtn" type="button">Use pasted CSV</button>
        <button class="btn ghost" id="fakebtn" type="button">Preview a labeled fake example</button>
        ${d || p ? `<button class="btn ghost" id="clearall" type="button">Clear saved sales</button>` : ""}</div>
      <p id="pasteerr" class="small err" role="alert"></p>
    </div>
    ${learnedCard(fc, active, u)}
    ${contextCard()}
    ${menuCard()}
    <details class="card" style="margin-top:12px"><summary>Sources and what does not move the forecast</summary>${sourcesBody(fc)}</details>
  </section>`;
}
function fileCard(kind, title, lede, cols, parsed, source, error, where) {
  const template = kind === "daily" ? "data/daily_template.csv" : "data/pos_template.csv";
  return `<div class="card"><p class="label">${esc(title)}</p><h3>${esc(lede)}</h3><p class="small muted">${esc(cols)}</p>
    <div class="drop" data-kind="${kind}"><p><b>Drop a CSV here</b> or choose a file. ${esc(template.split("/").pop())} is the header to copy.</p>
      <div class="btns"><label class="btn accent file">${icon("upload")} Choose file<input type="file" id="${kind}file" accept=".csv,text/csv" aria-label="Load ${esc(title)} CSV"></label>
        <a class="btn ghost" href="${template}" download>Template</a>
        ${parsed ? `<button class="btn ghost" type="button" data-export="${kind}">Export</button><button class="btn ghost" type="button" data-clear="${kind}">Clear</button>` : ""}</div></div>
    ${error ? `<p class="small err" role="alert">${esc(error)}</p>` : ""}
    ${parsed ? `<p class="small">Loaded ${esc(source || "")}${where ? ` · saved in ${esc(where)}` : ""}. <b>${kind === "pos" ? `${n0(parsed.rows.length)} rows · ` : ""}${parsed.days} days · ${esc(parsed.first)} → ${esc(parsed.last)}</b>${parsed.badLines?.length ? ` · ${parsed.badLines.length} rows skipped` : ""}.</p>` : `<p class="xs faint">Nothing loaded.</p>`}</div>`;
}
function learnedCard(fc, active, u) {
  const dl = fc.dailyLearned, up = fc.uplift, wx = fc.wxLearn, heat = fc.heatLearn, dr = fc.dailyRatios, calr = fc.calendar;
  const upRows = up ? Object.values(up.factors).sort((a, b) => b.n - a.n) : [];
  const bd = state.btDaily, bt = state.bt;
  const fmt = o => Object.entries(o || {}).filter(([, v]) => v).map(([k, v]) => `${k} ${pct(v.mape)} (${v.n} h)`).join(" · ") || "—";
  return `<div class="card" style="margin-top:12px"><p class="label">What the board is using</p><h2>${esc(active)}</h2>
    <p class="small muted">${esc(u.detail)} Weekday shares are ${fc.dowSharesAssumption ? "an assumption from the default curves." : "from your sales."}</p>
    ${dl ? `<div class="scroll"><table><thead><tr><th>Day total</th>${WDL.map(w => `<th class="n">${w.slice(0, 3)}</th>`).join("")}</tr></thead><tbody>
      <tr><td>Median tickets</td>${dl.base.map(v => `<td class="n tnum">${n0(v)}</td>`).join("")}</tr>
      <tr><td>Days used</td>${dl.samples.map(v => `<td class="n">${v}</td>`).join("")}</tr></tbody></table></div>` : ""}
    ${fc.learned ? `<div class="row"><span>Hourly item ratios</span><b>${fc.learned.learnedRatios.length ? esc(fc.learned.learnedRatios.join(", ")) : "none yet"}</b></div>` : ""}
    ${!fc.learned && dr ? `<div class="row"><span>Daily item ratios</span><b>${dr.learned.length ? esc(dr.learned.join(", ")) : "need 7 days with item columns"}</b></div>` : ""}
    ${upRows.map(f => `<div class="row"><span>${esc(UPLIFT_NAMES[f.kind] || f.kind)} <span class="xs faint">${f.n} day${f.n === 1 ? "" : "s"}</span></span><b>${f.learned ? `learned ×${f.factor.toFixed(2)}` : `assumption until ${UPLIFT_MIN_DAYS - f.n} more`}</b></div>`).join("")}
    ${calr ? Object.values(calr).map(f => `<div class="row"><span>${esc(f.label)}</span><b>${f.learned ? `learned ×${f.factor.toFixed(2)} (${f.n} days)` : `assumption · ${f.n} day${f.n === 1 ? "" : "s"} so far`}</b></div>`).join("") : ""}
    ${wx ? `<p class="small"><b>Rain.</b> ${esc(wx.reason)}</p>` : ""}
    ${heat ? `<p class="small"><b>Heat.</b> ${esc(heat.reason)}</p>` : ""}
    ${bd ? `<p class="small"><b>Daily backtest, last ${bd.dates} days</b> (walk-forward, no weather). ${bd.daily ? `Your daily model ${pct(bd.daily.mape, 1)} MAPE, 80th percentile error ${pct(bd.daily.p80, 1)}, bias ${bd.bias.daily == null ? "—" : `${(bd.bias.daily * 100).toFixed(1)} pts`}` : "Not enough history for the daily model"}. Assumption curves ${pct(bd.estimate.mape, 1)} MAPE.</p>` : `<p class="small muted">Load about 3 weeks of sales to see a backtest. Repo tests use a labeled synthetic file only.</p>`}
    ${bt ? `<p class="small"><b>Hourly backtest, last ${bt.dates} days.</b> Yours: ${fmt(bt.pos)}. Assumption curves: ${fmt(bt.estimate)}.</p>` : ""}
  </div>`;
}
function contextCard() {
  const t = state.traffic, pr = state.promos;
  const ahead = (state.cal?.events || []).filter(e => !e.history && e.date >= state.fc.dateKey).slice(0, 8);
  return `<div class="card" style="margin-top:12px"><p class="label">Around the store</p><h2>Context that is not a live multiplier</h2>
    ${t ? `<p class="small"><b>Highway 280 traffic is static.</b> ALDOT station ${esc(t.nearest.station)}, ${esc(t.nearest.description)}, ${n0(t.nearest.aadt)} vehicles a day in ${t.nearest.year}, about ${t.nearest.milesFromStore} mi from the store. Queried ${esc(t.queriedAt)}. Not a live speed. <a href="${esc(t.viewer)}" target="_blank" rel="noopener">ALDOT viewer</a></p>` : ""}
    ${pr ? `<p class="small"><b>National promos, checked ${esc(pr.checkedAt)}.</b> None are confirmed at Chelsea and none change the count.</p><ul class="notes">${pr.items.map(p => `<li><b>${esc(p.name)}</b> — ${esc(p.detail)} <a href="${esc(p.source)}" target="_blank" rel="noopener">Source</a></li>`).join("")}</ul>` : ""}
    <p class="small"><b>Dated events ahead</b></p>
    ${ahead.map(e => `<div class="row"><span>${e.date.slice(5)} · ${esc(shortEvent(e.label))}${e.confidence ? ` <span class="tag off">${esc(e.confidence)}</span>` : ""}</span><b>${e.lift === 1 ? "note" : signPct((e.lift - 1) * 100)} · <a href="${esc(e.source)}" target="_blank" rel="noopener">source</a></b></div>`).join("") || `<p class="muted">No dated events ahead.</p>`}
  </div>`;
}
function menuCard() {
  const m = state.menu;
  if (!m) return "";
  return `<div class="card" style="margin-top:12px"><p class="label">Menu · checked ${esc(m.checkedAt)}</p><h2>What this board counts</h2>
    <div class="items">${(m.tracked || []).map(t => `<div><span>${esc(t.board || t.key)}</span><b>${esc(t.key)}</b></div>`).join("")}</div>
    ${m.notSold?.length ? `<p class="small"><b>Not sold here:</b> ${esc(m.notSold.join(", "))}. Boneless chicken on this board is Bo’s Tenders.</p>` : ""}
    <p class="xs muted">${(m.sources || []).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`).join(" · ")}</p></div>`;
}
function sourcesBody() {
  const wx = state.weather;
  const blocks = [
    ["Live weather", `Open-Meteo hourly temperature, rain chance, and inches, then NWS hourly (api.weather.gov) for about 7 days. NWS does not include a precip amount, so inches stay from Open-Meteo. ${wx ? `Last fetch: ${esc(wx.sources.join("; "))}.` : ""}`],
    ["Alerts", "Active NWS alerts for Shelby County (ALC117) and forecast zone ALZ025. Tornado, severe thunderstorm, and flash flood warnings and watches change the hour. Other alerts are shown and do not change the count."],
    ["Past weather", "Open-Meteo archive, only after you load sales, to test rain and heat. Used only when the sample is large enough."],
    ["Schools and events", `Shelby County Schools calendar, Chelsea and nearby games, Alabama, Auburn, and UAB, City of Chelsea, Oak Mountain. Every dated row in data/events.json has a source. Unconfirmed kickoffs stay marked unconfirmed. Updated ${esc(state.calJson?.updated || "?")}.`],
    ["Pay, SNAP, Social Security, DST", "1st, 15th, Friday, and month-end are priors. Alabama SNAP (4th–23rd by case number) and Social Security payment dates are notes with no percent. Spring-forward trims the first two open hours by a −3% prior. Fall-back is a note only."],
    ["Highway 280", "ALDOT annual counts, newest year on the public layer for the nearest station is 2017. Static. Not used in the hourly math."],
    ["Promos", "National Bojangles posts. Not confirmed at this store. Not used in the math."],
  ];
  return blocks.map(([a, b]) => `<p><b>${a}.</b> <span class="muted">${b}</span></p>`).join("");
}

const THEMES = [["auto", "auto", "Auto"], ["light", "sun", "Light"], ["dark", "moon", "Dark"]];
function paintChrome(fc) {
  const clock = $("#clock");
  if (clock) clock.textContent = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(state.now) + " CT";
  const mp = $("#modepill");
  if (mp && fc) { mp.className = `mode-pill ${fc.mode}`; mp.textContent = MODE_TXT[fc.mode]; mp.setAttribute("aria-label", `${MODE_TXT[fc.mode]}. Open sales`); }
  const cur = document.documentElement.dataset.theme || "auto";
  const spec = THEMES.find(t => t[0] === cur) || THEMES[0];
  const tb = $("#themebtn");
  if (tb) { tb.innerHTML = `${icon(spec[1])}<span class="lbl">${spec[2]}</span>`; tb.setAttribute("aria-label", `Theme: ${spec[2]}. Switch theme`); }
  document.querySelectorAll("[data-nav]").forEach(b => { if (b.dataset.nav === state.view) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
}
function measure() {
  const vw = document.documentElement.clientWidth || 390;
  state.chartW = Math.max(300, Math.min(1040, vw - (vw >= 760 ? 96 : 64)));
}
function render() {
  const fc = compute();
  measure();
  if (!state.sel || !fc.days.some(d => d.dateKey === state.sel)) state.sel = fc.dateKey;
  const root = $("#app");
  if (state.view === "now") root.innerHTML = viewNow(fc);
  else if (state.view === "week") root.innerHTML = viewWeek(fc);
  else if (state.view === "cook") root.innerHTML = viewCook(fc);
  else if (state.view === "crew") root.innerHTML = viewCrew(fc);
  else root.innerHTML = viewData(fc);
  const foot = $("#foot");
  if (foot) foot.innerHTML = `One restaurant: Bojangles at 15392 US-280, Chelsea, Alabama. Hours Mon–Sat 5 AM–10 PM, Sunday 6 AM–10 PM. All times Central. A wreck, a sell-out, or a closed lobby can beat the model. Not affiliated with or endorsed by Bojangles.`;
  paintChrome(fc);
  root.focus({ preventScroll: true });
}
const announce = t => { const a = $("#announce"); if (a) a.textContent = t; };
function setView(v) {
  if (!VIEWS.includes(v)) v = "now";
  state.view = v;
  ls.set(VIEW_KEY, v);
  const url = new URL(location.href);
  if (v === "now") url.searchParams.delete("view"); else url.searchParams.set("view", v);
  history.replaceState(null, "", url);
  render();
  announce(`${v} view`);
}

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("bo-watch", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbOp(mode, fn) {
  return idb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction("files", mode);
    const out = fn(tx.objectStore("files"));
    tx.oncomplete = () => resolve(out?.result);
    tx.onerror = () => reject(tx.error);
  }));
}
const idbGet = k => idb().then(db => new Promise((resolve, reject) => {
  const tx = db.transaction("files", "readonly");
  const req = tx.objectStore("files").get(k);
  req.onsuccess = () => resolve(req.result ?? null);
  req.onerror = () => reject(req.error);
}));
const idbSet = (k, v) => idbOp("readwrite", s => s.put(v, k));
const idbDel = k => idbOp("readwrite", s => s.delete(k));

async function persist(key, text) {
  const ok = ls.set(key, text);
  let idbOk = false;
  try { await idbSet(key, text); idbOk = true; } catch { /* private mode can block both */ }
  if (ok && idbOk) return "this browser";
  if (ok) return "local storage";
  if (idbOk) return "IndexedDB (local storage was full)";
  return null;
}
async function forget(key) { ls.del(key); try { await idbDel(key); } catch {} }
function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function saveDaily(text, source, { remember = true } = {}) {
  state.daily = parseDaily(text);
  state.dailyText = text;
  state.dailySource = source;
  state.dailyError = null;
  if (source.startsWith("TEST")) { state.synthetic = true; state.dailyWhere = "not saved"; return; }
  state.synthetic = false;
  if (!remember) return;
  state.dailyWhere = await persist(DAILY_KEY, text);
  if (!state.dailyWhere) state.dailyError = "Read the file, but this browser would not store it.";
}
async function savePOS(text, source, { remember = true } = {}) {
  state.pos = parsePOS(text);
  state.posText = text;
  state.posSource = source;
  state.posError = null;
  state.synthetic = false;
  if (!remember) return;
  state.posWhere = await persist(POS_KEY, text);
  if (!state.posWhere) state.posError = "Read the file, but this browser would not store it.";
}
function fakeExample() {
  const lines = ["date,tickets,net_sales,notes"];
  const base = [540, 610, 560, 590, 620, 760, 840];
  let k = "2026-08-03";
  for (let i = 0; i < 70; i++) {
    const d = new Date(`${k}T00:00:00Z`).getUTCDay();
    lines.push(`${k},${base[d]},0,TEST synthetic — not Chelsea sales`);
    k = addDays(k, 1);
  }
  return lines.join("\n");
}

function afterData() {
  try { state.bt = state.pos && !state.synthetic ? backtest(state.pos, state.cal) : null; } catch (e) { state.bt = null; console.warn(e); }
  const totals = !state.synthetic && (state.daily || state.pos) ? dailyTotals(state.daily, state.pos) : null;
  try { state.btDaily = totals && totals.size >= 21 ? backtestDaily(totals, state.cal) : null; } catch (e) { state.btDaily = null; console.warn(e); }
  state.fcKey = "";
  render();
  if (totals && totals.size >= 20) loadWxHist(totals);
}
async function loadWxHist(totals) {
  const keys = [...totals.keys()].sort();
  const today = chicagoNow(state.now).dateKey;
  const start = keys[0];
  const end = keys[keys.length - 1] < addDays(today, -3) ? keys[keys.length - 1] : addDays(today, -3);
  if (start > end) return;
  try {
    const c = JSON.parse(ls.get(WXH_KEY) || "null");
    if (c && c.start <= start && c.end >= end) { state.wxHist = c; state.fcKey = ""; render(); return; }
  } catch { /* ignore a bad cache */ }
  try {
    const h = await fetchWeatherHistory(start, end);
    state.wxHist = h; state.wxHistNote = null; ls.set(WXH_KEY, JSON.stringify(h));
  } catch (e) { state.wxHistNote = e.message; }
  state.fcKey = ""; render();
}
async function loadWeather() {
  try {
    const c = JSON.parse(ls.get(WX_KEY) || "null");
    if (c && Date.now() - Date.parse(c.fetchedAt) < 30 * 60e3 && c.ok) { state.weather = c; render(); return; }
  } catch { /* refetch */ }
  try {
    const wx = await fetchWeather();
    state.weather = wx;
    if (wx.ok) ls.set(WX_KEY, JSON.stringify(wx));
  } catch (e) { state.weather = state.weather || { ok: false, sources: [e.message], byHour: {}, byDay: {}, alerts: [] }; }
  render();
}

document.addEventListener("click", async e => {
  const nav = e.target.closest("[data-nav]");
  if (nav) { setView(nav.dataset.nav); return; }
  if (e.target.closest("#themebtn")) {
    const order = THEMES.map(t => t[0]);
    const cur = document.documentElement.dataset.theme || "auto";
    const nx = order[(order.indexOf(cur) + 1) % order.length];
    document.documentElement.dataset.theme = nx;
    ls.set(THEME_KEY, nx);
    paintChrome(state.fc);
    announce(`Theme ${nx}`);
    return;
  }
  if (e.target.closest("#modepill")) { setView("data"); return; }
  const day = e.target.closest("[data-day]");
  if (day) { state.sel = day.dataset.day; state.selHour = null; if (state.view === "now") setView("week"); else render(); return; }
  const hour = e.target.closest("[data-hour]");
  if (hour) { state.selHour = Number(hour.dataset.hour); render(); return; }
  const exp = e.target.closest("[data-export]");
  if (exp) {
    if (exp.dataset.export === "daily" && state.dailyText) download(state.synthetic ? "TEST-synthetic-daily.csv" : "daily.csv", state.dailyText);
    if (exp.dataset.export === "pos" && state.posText) download("hourly.csv", state.posText);
    return;
  }
  const clr = e.target.closest("[data-clear]");
  if (clr) {
    if (state.synthetic) { await reloadStored(); afterData(); return; }
    if (clr.dataset.clear === "daily") { await forget(DAILY_KEY); state.daily = null; state.dailyText = null; state.dailySource = null; }
    if (clr.dataset.clear === "pos") { await forget(POS_KEY); state.pos = null; state.posText = null; state.posSource = null; state.bt = null; }
    afterData();
    return;
  }
  if (e.target.closest("#clearall")) {
    if (state.synthetic) { await reloadStored(); afterData(); announce("Fake example dismissed"); return; }
    if (!confirm("Clear saved sales on this device?")) return;
    await forget(DAILY_KEY); await forget(POS_KEY);
    state.daily = state.pos = null; state.dailyText = state.posText = null; state.bt = state.btDaily = null;
    afterData();
    return;
  }
  if (e.target.closest("#fakebtn")) {
    try {
      state.pos = null; state.bt = null;
      await saveDaily(fakeExample(), "TEST/synthetic preview", { remember: false });
      afterData();
      announce("Fake example, not saved");
    } catch (err) { const p = $("#pasteerr"); if (p) p.textContent = err.message; }
    return;
  }
  if (e.target.closest("#pastebtn")) {
    const text = $("#paste")?.value || "";
    const err = $("#pasteerr");
    try {
      if (/^date\s*,\s*hour\b/i.test(text)) await savePOS(text, "pasted");
      else await saveDaily(text, "pasted");
      if (err) err.textContent = "";
      afterData();
      announce("Sales loaded on this device");
    } catch (ex) { if (err) err.textContent = ex.message; }
  }
});
document.addEventListener("change", async e => {
  const f = e.target.files?.[0];
  if (!f) return;
  const text = await f.text();
  try {
    if (e.target.id === "posfile") await savePOS(text, f.name);
    else if (e.target.id === "dailyfile") await saveDaily(text, f.name);
    else return;
    afterData();
    announce("Sales loaded on this device");
  } catch (err) {
    if (e.target.id === "posfile") state.posError = err.message;
    if (e.target.id === "dailyfile") state.dailyError = err.message;
    render();
  }
});
document.addEventListener("change", e => {
  if (e.target.id === "daypick" || e.target.id === "daypick2") { state.sel = e.target.value; state.selHour = null; render(); }
});
document.addEventListener("keydown", e => {
  const t = e.target;
  if (t.matches?.("rect.hit, tr[data-hour], tr[data-day]") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); t.click(); }
  if (t.matches?.("rect.hit") && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
    e.preventDefault();
    const day = state.view === "now" ? state.fc.days[0] : selectedDay(state.fc);
    const open = day.hours.filter(x => x.open).map(x => x.hour);
    const cur = state.selHour ?? open[0];
    const i = Math.max(0, open.indexOf(cur));
    state.selHour = open[Math.max(0, Math.min(open.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)))];
    render();
    document.querySelector(`rect.hit[data-hour="${state.selHour}"]`)?.focus();
  }
});
document.addEventListener("dragover", e => {
  if (![...e.dataTransfer?.types || []].includes("Files")) return;
  const z = e.target.closest?.(".drop");
  if (!z) return;
  e.preventDefault();
  z.classList.add("hot");
});
document.addEventListener("dragleave", e => e.target.closest?.(".drop")?.classList.remove("hot"));
document.addEventListener("drop", async e => {
  const z = e.target.closest?.(".drop");
  if (!z) return;
  e.preventDefault();
  z.classList.remove("hot");
  const f = e.dataTransfer.files?.[0];
  if (!f) return;
  try {
    const text = await f.text();
    if (z.dataset.kind === "pos") await savePOS(text, f.name);
    else await saveDaily(text, f.name);
    afterData();
  } catch (err) {
    if (z.dataset.kind === "pos") state.posError = err.message; else state.dailyError = err.message;
    render();
  }
});

async function reloadStored() {
  state.synthetic = false;
  state.daily = state.pos = null;
  state.dailyText = state.posText = null;
  state.dailySource = state.posSource = null;
  state.bt = state.btDaily = null;
  const savedP = await readSaved(POS_KEY), savedD = await readSaved(DAILY_KEY);
  if (savedP) { try { await savePOS(savedP.text, "saved on this device", { remember: false }); state.posWhere = savedP.where; } catch (e) { state.posError = e.message; } }
  if (savedD) { try { await saveDaily(savedD.text, "saved on this device", { remember: false }); state.dailyWhere = savedD.where; } catch (e) { state.dailyError = e.message; } }
}
async function readSaved(key) {
  const mem = ls.get(key);
  if (mem) return { text: mem, where: "local storage" };
  try { const text = await idbGet(key); if (text) return { text, where: "IndexedDB" }; } catch { /* storage off */ }
  return null;
}
async function boot() {
  const q = new URLSearchParams(location.search);
  const qv = q.get("view");
  state.view = VIEWS.includes(qv) ? qv : (VIEWS.includes(ls.get(VIEW_KEY)) ? ls.get(VIEW_KEY) : "now");
  const [events, menu, promos, traffic, holidays] = await Promise.all([
    fetch("data/events.json", { cache: "no-cache" }).then(r => r.json()).catch(() => ({})),
    fetch("data/menu.json", { cache: "no-cache" }).then(r => r.json()).catch(() => null),
    fetch("data/promos.json", { cache: "no-cache" }).then(r => r.json()).catch(() => null),
    fetch("data/traffic.json", { cache: "no-cache" }).then(r => r.json()).catch(() => null),
    fetch("data/holidays.json", { cache: "no-cache" }).then(r => r.json()).catch(() => null),
  ]);
  state.calJson = events; state.menu = menu; state.promos = promos; state.traffic = traffic; state.holidays = holidays;
  state.cal = makeCalendar(events);
  const savedP = await readSaved(POS_KEY), savedD = await readSaved(DAILY_KEY);
  if (savedP) { try { await savePOS(savedP.text, "saved on this device", { remember: false }); state.posWhere = savedP.where; } catch (e) { state.posError = e.message; } }
  if (savedD) { try { await saveDaily(savedD.text, "saved on this device", { remember: false }); state.dailyWhere = savedD.where; } catch (e) { state.dailyError = e.message; } }
  afterData();
  loadWeather();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  setInterval(() => {
    const prev = chicagoNow(state.now).hour;
    state.now = new Date();
    if (chicagoNow(state.now).hour !== prev) { state.fcKey = ""; render(); }
    else paintChrome(state.fc);
  }, 30e3);
  setInterval(() => { ls.del(WX_KEY); loadWeather(); }, 30 * 60e3);
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { const w = state.chartW; measure(); if (Math.abs(w - state.chartW) > 8) render(); }, 150); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => paintChrome(state.fc));
}
boot();
