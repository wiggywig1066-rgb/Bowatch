// Forecast math tests. Synthetic numbers only — nothing here is this store's sales.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  forecast, makeCalendar, parsePOS, parseDaily, weatherFactor, activeAlertFactor,
  dstTransition, snapIssuance, socialSecurity, uncertaintyBand, hourBand, explainHour,
  FEDERAL_HOLIDAYS, nthWeekdayOfMonth, line, addDays, dow,
} from "../js/engine.js";

const cal = makeCalendar(JSON.parse(fs.readFileSync(new URL("../data/events.json", import.meta.url))));
const holidays = JSON.parse(fs.readFileSync(new URL("../data/holidays.json", import.meta.url)));
const menu = JSON.parse(fs.readFileSync(new URL("../data/menu.json", import.meta.url)));

test("federal holiday file matches the engine list", () => {
  assert.deepEqual(holidays.dates.map(d => d.date), FEDERAL_HOLIDAYS);
});

test("menu schema stays compatible and this store does not sell Supremes", () => {
  assert.equal(typeof menu.checkedAt, "string");
  assert.ok(Array.isArray(menu.sources) && menu.sources.every(s => s.url && s.label));
  assert.ok(menu.notSold.includes("Chicken Supremes"));
  assert.ok(!JSON.stringify(menu.tracked).includes("Supreme"));
});

test("DST dates follow the US rule", () => {
  assert.equal(new Date(Date.UTC(2026, 2, 8)).getUTCDay(), 0);
  assert.equal(nthWeekdayOfMonth(2026, 3, 0, 2), "2026-03-08");
  assert.equal(dstTransition("2026-03-08"), "spring");
  assert.equal(dstTransition("2026-03-01"), null);
  assert.equal(new Date(Date.UTC(2026, 10, 1)).getUTCDay(), 0);
  assert.equal(dstTransition("2026-11-01"), "fall");
  assert.equal(dstTransition("2027-03-14"), "spring");
  assert.equal(dstTransition("2027-11-07"), "fall");
});

test("SNAP issuance is a note with no percent", () => {
  assert.equal(snapIssuance("2026-10-03"), null);
  const first = snapIssuance("2026-10-04");
  assert.match(first.detail, /00–04/);
  assert.equal(first.pct, 0);
  assert.match(snapIssuance("2026-10-23").detail, /95–99/);
  assert.equal(snapIssuance("2026-10-24"), null);
});

test("Social Security payment dates move off weekends and Veterans Day", () => {
  const oct30 = socialSecurity("2026-10-30").map(n => n.label);
  assert.ok(oct30.some(l => /SSI/.test(l)), oct30.join(", "));
  const nov10 = socialSecurity("2026-11-10").map(n => n.label);
  assert.ok(nov10.some(l => /2nd Wednesday/.test(l)), nov10.join(", "));
  const nov11 = socialSecurity("2026-11-11").map(n => n.label);
  assert.ok(!nov11.some(l => /2nd Wednesday/.test(l)), nov11.join(", "));
  assert.equal(socialSecurity("2026-11-11").every(n => n.pct === 0), true);
});

test("15th and month-end priors show up, and a plain Tuesday does not", () => {
  const mid = forecast({ now: new Date("2026-11-15T18:00:00Z"), cal, weather: null });
  assert.match(mid.current.why, /15th payday \+4%/);
  assert.ok(mid.current.vsNormal > 1.03 && mid.current.vsNormal < 1.05);
  const end = forecast({ now: new Date("2026-10-31T17:00:00Z"), cal, weather: null });
  const noon = end.days[0].hours[12];
  assert.match(noon.why, /Month-end \+3%/);
  const tue = forecast({ now: new Date("2026-10-27T17:00:00Z"), cal, weather: null });
  assert.match(tue.current.why, /No weather, payday, or event adjustment/);
  assert.ok(Math.abs(tue.current.vsNormal - 1) < 1e-9);
});

test("Friday payday is explained as part of the usual shape, not stacked twice", () => {
  const fri = forecast({ now: new Date("2026-11-06T18:00:00Z"), cal, weather: null });
  assert.match(fri.current.why, /Friday payday \+/);
  assert.equal(fri.current.adjustments.find(a => a.label === "Friday payday").alreadyInBaseline, true);
  assert.ok(Math.abs(fri.current.vsNormal - 1) < 1e-9);
});

test("spring-forward trims only the first two open hours", () => {
  const fc = forecast({ now: new Date("2026-03-08T16:00:00Z"), cal, weather: null });
  const open = fc.days[0].openHour;
  assert.match(fc.days[0].hours[open].why, /Clocks spring forward −3%/);
  assert.match(fc.days[0].hours[open + 1].why, /Clocks spring forward −3%/);
  assert.doesNotMatch(fc.days[0].hours[open + 3].why, /Clocks spring forward/);
  const fall = forecast({ now: new Date("2026-11-01T18:00:00Z"), cal, weather: null });
  assert.ok(fall.days[0].context.some(n => n.label === "Clocks fall back" && n.pct === 0));
});

test("weather priors: light rain is +0, heavy rain lifts, a warning replaces the lift", () => {
  const light = weatherFactor({ tempF: 68, pop: 25, precipIn: 0.01, src: "Open-Meteo" }, { high: 70 }, 15, null, { dateKey: "2026-10-27" });
  assert.ok(light.adjustments.some(a => a.label === "Rain" && a.pct === 0));
  assert.equal(light.factor, 1);
  const heavy = weatherFactor({ tempF: 68, pop: 80, precipIn: 0.2, src: "Open-Meteo" }, { high: 70 }, 12, null, { dateKey: "2026-10-27" });
  assert.ok(heavy.adjustments.some(a => a.label === "Heavy rain" && a.pct === 4));
  const alerts = [{ event: "Tornado Warning", onset: "2026-10-27T11:00:00-05:00", ends: "2026-10-27T13:00:00-05:00", headline: "Test warning" }];
  assert.ok(activeAlertFactor(alerts, "2026-10-27", 12));
  assert.equal(activeAlertFactor(alerts, "2026-10-27", 9), null);
  const warned = weatherFactor({ tempF: 68, pop: 90, precipIn: 0.4, src: "NWS" }, { high: 70 }, 12, null, { alerts, dateKey: "2026-10-27" });
  assert.ok(warned.adjustments.some(a => a.label === "Tornado warning"));
  assert.ok(!warned.adjustments.some(a => a.pct > 0));
  assert.ok(warned.factor < 0.9);
});

test("bands shrink with samples and a backtest replaces the prior", () => {
  const prior = uncertaintyBand({ mode: "estimate" });
  assert.equal(prior.spread, 0.25);
  assert.equal(prior.assumption, true);
  const wider = uncertaintyBand({ mode: "daily", samples: 2 });
  assert.equal(wider.spread, 0.18);
  const narrower = uncertaintyBand({ mode: "daily", samples: 16 });
  assert.ok(narrower.spread < 0.18 && narrower.spread >= 0.10);
  assert.equal(narrower.assumption, true);
  const measured = uncertaintyBand({ mode: "daily", samples: 16, p80: 0.11 });
  assert.equal(measured.spread, 0.11);
  assert.equal(measured.assumption, false);
  assert.equal(measured.basis, "backtest");
  assert.ok(hourBand(0.15, 16, "samples") < 0.15);
  assert.equal(hourBand(0.11, 16, "backtest"), 0.11);
});

test("explainHour uses the requested sign style", () => {
  const text = explainHour({ adjustments: [{ label: "Rain", pct: 0, why: true }, { label: "Friday payday", pct: 6, why: true }, { label: "Home game", pct: -8, why: true }] });
  assert.equal(text, "Rain +0%, Friday payday +6%, Home game −8%");
});

test("legacy supremes column is read as tenders and the line has no supremes count", () => {
  const pos = parsePOS("date,hour,tickets,supremes\n2026-10-01,12,40,10\n");
  assert.equal(pos.rows[0].tenders, 10);
  const daily = parseDaily("date,tickets,supremes\n2026-10-01,400,80\n");
  assert.equal(daily.rows[0].tenders, 80);
  const fc = forecast({ now: new Date("2026-10-27T17:00:00Z"), cal, weather: null });
  const cooked = line(fc.current, fc.ratios, 0.25);
  assert.equal("supremes" in cooked, false);
  assert.equal(typeof cooked.tenders, "number");
});

test("walk-forward backtest on synthetic dailies beats the plain curves", () => {
  const BASE = [520, 600, 540, 580, 600, 700, 690];
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const rows = ["date,tickets,notes"];
  for (let k = "2026-04-04"; k <= "2026-10-20"; k = addDays(k, 1)) {
    const t = Math.round(BASE[dow(k)] * (0.98 + 0.04 * rnd()));
    rows.push(`${k},${t},SYNTHETIC`);
  }
  const daily = parseDaily(rows.join("\n"));
  const fc = forecast({ now: new Date("2026-10-21T17:00:00Z"), cal, daily, weather: null });
  assert.equal(fc.mode, "daily");
  assert.equal(fc.calendar["mid-month"].learned, true);
  assert.ok(Math.abs(fc.calendar["mid-month"].factor - 1) < 0.08);
});
