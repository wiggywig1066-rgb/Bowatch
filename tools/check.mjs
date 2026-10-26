// Sanity check:  node tools/check.mjs [hourly_pos.csv] [--daily daily.csv] [--wxhist past_weather.json] [--offline]
// 1. Self-tests for the daily import (parsing, calibration, uplift / weather learning, backtest) on an
//    in-memory SYNTHETIC dataset (made-up numbers, never written to disk).
// 2. Prints the 14-day board with live weather (skipped with --offline or when the network is down).
import fs from "node:fs";
import { forecast, makeCalendar, fetchWeather, parsePOS, parseDaily, dailyTotals, backtestDaily, dayTotals, line, backtest, addDays, dow } from "../js/engine.js";

const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
const dailyFile = opt("--daily"), wxFile = opt("--wxhist"), offline = args.includes("--offline"); const posFile = args.find(a => !a.startsWith("--"));
const calJson = JSON.parse(fs.readFileSync(new URL("../data/events.json", import.meta.url)));
const cal = makeCalendar(calJson);
const problems = [], ok = (cond, msg) => { if (!cond) problems.push(msg); console.log(`${cond ? "  ok  " : "  FAIL"} ${msg}`); };
const throwsMsg = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };

// ---------- 1. daily import self-tests (SYNTHETIC) ----------
console.log("Daily import self-tests (synthetic data, not real sales):");
const tpl = fs.readFileSync(new URL("../data/daily_template.csv", import.meta.url), "utf8");
ok(tpl.split("\n")[0].startsWith("date,tickets,net_sales"), "daily_template.csv header starts date,tickets,net_sales");
ok(throwsMsg(() => parseDaily(tpl), /No usable rows/), "template EXAMPLE rows are skipped");
ok(throwsMsg(() => parseDaily("date,hour,tickets\n2026-10-01,5,9"), /hourly export/), "hourly file rejected by the daily parser");
ok(throwsMsg(() => parseDaily("date,net_sales\n2026-10-01,5"), /Missing column "tickets"/), "missing tickets column reported");
const p1 = parseDaily('date,tickets,net_sales,notes\n10/1/2026,512,"$4,601.50",ok\n2026-10-02,abc,1,bad\n2026-10-01,520,4700,dup wins\n');
ok(p1.rows.length === 1 && p1.rows[0].date === "2026-10-01" && p1.rows[0].tickets === 520 && p1.badLines.length === 1, "M/D/YYYY dates, $/comma money, bad lines, duplicate dates");
ok(parseDaily('date,tickets,net_sales,notes\n2026-10-01,500,4500,\n').rows[0].net_sales === 4500, "plain numbers");

const NOW = new Date("2026-10-21T17:00:00Z"); // Wed noon CT
const BASE = [520, 600, 540, 580, 600, 700, 690]; let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const HOL = { "2026-05-25":0.85, "2026-06-19":0.88, "2026-07-04":0.80, "2026-09-07":0.86, "2026-10-12":0.90 };
const synth = ["date,tickets,net_sales,biscuits,chicken_pieces,tenders,labor_hours,notes"], wxHist = { byDay: {} };
for (let k = "2026-04-04"; k <= "2026-10-20"; k = addDays(k, 1)) {
  const wet = rnd() < 0.25, precip = wet ? 0.4 + rnd() : 0; wxHist.byDay[k] = { precip };
  const t = Math.round(BASE[dow(k)] * (HOL[k] ?? 1) * (wet ? 1.08 : 1) * (0.97 + 0.06 * rnd()));
  synth.push(`${k},${t},${(t * 9).toFixed(2)},${Math.round(t * 1.3)},${Math.round(t * 1.6)},${Math.round(t * 0.3)},${(t / 6).toFixed(1)},SYNTHETIC`);
}
const daily = parseDaily(synth.join("\n"));
const fcD = forecast({ now: NOW, cal, daily, wxHist, weather: null });
ok(fcD.mode === "daily" && fcD.spread === 0.18, `daily-only data -> mode "daily", ±18% (got ${fcD.mode}, ${fcD.spread})`);
const tue = fcD.days.find(d => d.weekday === 2 && !d.events.length && d.schoolDay);
const tueSum = tue.hours.reduce((s, x) => s + x.tickets, 0);
ok(Math.abs(tueSum - fcD.dailyLearned.base[2]) / fcD.dailyLearned.base[2] < 0.03, `plain Tuesday total ≈ median of last 8 Tuesdays (${tueSum.toFixed(0)} vs ${fcD.dailyLearned.base[2].toFixed(0)})`);
ok(Math.abs(fcD.dailyLearned.base[2] - 540 * 1.02) < 40, `Tuesday baseline near the synthetic 540–560 (${fcD.dailyLearned.base[2].toFixed(0)})`);
const hol = fcD.uplift.factors.holiday;
ok(hol && hol.learned && hol.n >= 3 && hol.factor < 0.97, `holiday uplift learned from ${hol?.n} days: ×${hol?.factor.toFixed(2)}`);
ok(fcD.wxLearn.learned && fcD.wxLearn.effect > 1.03, `rain effect learned: ${fcD.wxLearn.reason}`);
const noWx = forecast({ now: NOW, cal, daily, weather: null });
ok(!noWx.wxLearn.learned && /not tested/.test(noWx.wxLearn.reason), "rain effect skipped (and says so) without past weather");
const flatWx = { byDay: Object.fromEntries(Object.keys(wxHist.byDay).map((k, i) => [k, { precip: i % 4 === 0 ? 0.5 : 0 }])) };
const fcFlat = forecast({ now: NOW, cal, daily, wxHist: flatWx, weather: null });
ok(!fcFlat.wxLearn.learned, `rain effect skipped when data doesn't support it: ${fcFlat.wxLearn.reason}`);
ok(fcD.dailyRatios.learned.length === 3 && fcD.ratios.lunch.biscuits !== 0.95, `per-ticket ratios learned from daily columns: ${fcD.dailyRatios.learned.join(", ")}`);
const short = parseDaily(synth.slice(0, 8).join("\n"));
const fcS = forecast({ now: NOW, cal, daily: short, weather: null });
ok(fcS.mode === "estimate" && fcS.dailyInsufficient, "a week-old file is too short: stays in estimate mode and flags it");
ok(!fcS.uplift.factors.holiday?.learned, "no uplift learned without enough comparable days (defaults stay)");
const bt = backtestDaily(dailyTotals(daily, null), cal, { days: 28 });
ok(bt.dates === 28 && bt.daily && bt.daily.mape < bt.estimate.mape, `daily backtest, 28 days: daily model ${(bt.daily.mape * 100).toFixed(1)}% MAPE (p80 ${(bt.daily.p80 * 100).toFixed(1)}%, bias ${((bt.bias.daily) * 100).toFixed(1)} pts) vs estimate ${(bt.estimate.mape * 100).toFixed(1)}% MAPE`);
// Hourly POS wins for the shape.
const posRows = ["date,hour,tickets"]; for (let k = "2026-09-20"; k < "2026-10-21"; k = addDays(k, 1)) for (let h = 6; h < 22; h++) posRows.push(`${k},${h},${20 + (h === 12 ? 40 : 0)}`);
const fcP = forecast({ now: NOW, cal, daily, pos: parsePOS(posRows.join("\n")), weather: null });
ok(fcP.mode === "pos" && fcP.spread === 0.15, "hourly + daily -> hourly POS mode, ±15%");
const tueP = fcP.days.find(d => d.weekday === 2 && !d.events.length && d.schoolDay);
ok(tueP.hours[12].tickets > tueP.hours[10].tickets * 1.5, "hourly POS shape used (synthetic noon spike shows up)");
const fcE = forecast({ now: NOW, cal, weather: null });
ok(fcE.mode === "estimate" && fcE.spread === 0.25, "no data -> estimate mode, ±25%");
const L = line(tue.hours.find(x => x.open && x.hour === 12), fcD.ratios, fcD.spread);
ok(L.ticketLow < L.tickets && L.ticketHigh > L.tickets && Math.abs(L.biscuitHigh / L.biscuits - 1.18) < 0.08, "line() ranges use the mode spread");

// ---------- optional real files ----------
const pos = posFile ? parsePOS(fs.readFileSync(posFile, "utf8")) : null;
const dFile = dailyFile ? parseDaily(fs.readFileSync(dailyFile, "utf8")) : null;
const wxH = wxFile ? JSON.parse(fs.readFileSync(wxFile, "utf8")) : null;

// ---------- 2. 14-day board ----------
let weather = { byHour: {}, byDay: {}, sources: ["offline"], ok: false };
if (!offline) try { weather = await fetchWeather(); } catch (e) { weather.sources = [`weather failed: ${e.message}`]; }
const fc = forecast({ cal, pos, daily: dFile, wxHist: wxH, weather });
console.log("\nmode:", fc.mode, `±${Math.round(fc.spread * 100)}%`, "| weather:", weather.sources.join("; "), "| hours:", Object.keys(weather.byHour).length);
if (dFile) { console.log("daily file:", dFile.days, "days", dFile.first, "→", dFile.last, "| uplift:", JSON.stringify(Object.values(fc.uplift.factors).map(f => [f.kind, f.n, +f.factor.toFixed(3), f.learned])), "| weather:", fc.wxLearn.reason);
  const b = backtestDaily(dailyTotals(dFile, pos), cal); console.log("daily backtest:", b.daily ? `${(b.daily.mape * 100).toFixed(1)}%` : "n/a", "vs estimate", `${(b.estimate.mape * 100).toFixed(1)}%`, `(${b.dates} days)`); }
for (const d of fc.days) {
  const t = dayTotals(d, fc.ratios, fc.spread);
  console.log(d.dateKey, d.weekdayShort, `tix ${t.tickets} bisc ${t.biscuits} chk ${t.chicken} crew<=${t.peakCrew}`, d.hours.filter(x => x.open).map(x => x.label[0]).join(""), "|", d.headline, d.weather ? `| ${d.weather.high}/${d.weather.low} ${d.weather.rain}%` : "| no wx", d.events.map(e => e.label.slice(0, 30)).join("; "));
  for (const x of d.hours) { const Lx = line(x, fc.ratios, fc.spread);
    if (x.open && (!Number.isFinite(x.tickets) || x.tickets <= 0 || x.tickets > 400)) problems.push(`${d.dateKey} ${x.hour} tickets ${x.tickets}`);
    if (!x.open && Lx.biscuits) problems.push(`${d.dateKey} ${x.hour} closed but biscuits`); }
  if (t.biscuits < 150 || t.biscuits > 3000) problems.push(`${d.dateKey} biscuits/day ${t.biscuits}`);
}
if (pos) console.log("backtest:", JSON.stringify(backtest(pos, cal)));
console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "sanity: OK");
process.exit(problems.length ? 1 : 0);
