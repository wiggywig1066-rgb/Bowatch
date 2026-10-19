// Sanity check: node tools/check.mjs [pos.csv]   (fetches live weather, prints the 14-day board)
import fs from "node:fs";
import { forecast, makeCalendar, fetchWeather, parsePOS, dayTotals, line, backtest } from "../js/engine.js";
const cal = makeCalendar(JSON.parse(fs.readFileSync(new URL("../data/events.json", import.meta.url))));
const pos = process.argv[2] ? parsePOS(fs.readFileSync(process.argv[2], "utf8")) : null;
const weather = await fetchWeather();
const fc = forecast({ cal, pos, weather });
console.log("mode:", fc.mode, "| weather:", weather.sources.join("; "), "| hours:", Object.keys(weather.byHour).length);
const problems = [];
for (const d of fc.days) {
  const t = dayTotals(d, fc.ratios, fc.mode !== "pos");
  console.log(d.dateKey, d.weekdayShort, `tix ${t.tickets} bisc ${t.biscuits} chk ${t.chicken} crew<=${t.peakCrew}`, d.hours.filter(x => x.open).map(x => x.label[0]).join(""), "|", d.headline, d.weather ? `| ${d.weather.high}/${d.weather.low} ${d.weather.rain}%` : "| no wx", d.events.map(e => e.label.slice(0, 30)).join("; "));
  for (const x of d.hours) { const L = line(x, fc.ratios);
    if (x.open && (!Number.isFinite(x.tickets) || x.tickets <= 0 || x.tickets > 400)) problems.push(`${d.dateKey} ${x.hour} tickets ${x.tickets}`);
    if (!x.open && L.biscuits) problems.push(`${d.dateKey} ${x.hour} closed but biscuits`); }
  if (t.biscuits < 150 || t.biscuits > 3000) problems.push(`${d.dateKey} biscuits/day ${t.biscuits}`);
}
if (pos) console.log("backtest:", JSON.stringify(backtest(pos, cal)));
console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "sanity: OK");
process.exit(problems.length ? 1 : 0);
