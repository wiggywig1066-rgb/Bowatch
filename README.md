# Bo Watch — Chelsea 280 line board (standalone rebuild)

Hourly customer, biscuit, chicken and crew forecasts for Bojangles at 15392 US-280, Chelsea, AL.
Rebuilt from the Grok app-builder version (botime.grok.me) as a plain static site: no build step,
no server, no API keys. Open `index.html` through any static web server.

Live: https://wiggywig1066-rgb.github.io/bowatch/ — redeploys automatically on push to `main`
(see "Hosting" below). The old temporary host was https://87ff2e09478743d4.flypod.page.

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `css/style.css` | Page shell and the original Bo Watch look (Fraunces / Outfit, cayenne palette) |
| `js/engine.js` | Forecast engine (also runs in Node) — baselines, rules, weather, POS learning, line production, crew |
| `js/app.js` | UI: drop card, Cook / Manager / Scheduler views, 14-day guide, hourly chart + table, drivers, events, POS panel |
| `data/events.json` | **Editable** calendar: dated events + Shelby County Schools calendar |
| `data/pos_template.csv` | Header for POS exports |
| `tools/check.mjs` | Sanity check: `node tools/check.mjs [pos.csv]` prints the 14-day board with live weather |
| `tools/publish.sh`, `tools/deploy.sh` | Copy site files to `/workspace/bowatch-public` and redeploy |

## How the forecast works

* **Estimate mode (no POS loaded):** the original app's weekday curves plus the same weekly rules
  (280 rush, church, payday, delivery windows, 4x4 staging…). An on-screen banner says the baselines
  are estimates until real POS data is loaded, and biscuit ranges are widened to ±25%.
* **POS mode:** baseline for each weekday × hour = median tickets of the last 8 same weekdays
  (event days excluded). Biscuits / chicken / tenders per ticket by daypart are learned when a daypart
  has 200+ tickets with those columns. App share comes from the channel columns. Ranges ±15%.
* **Both modes** layer on things a weekday median can't know: dated events (`lift` multipliers),
  no-school weekdays and early dismissals, the 1st of the month, and **live hourly weather** fetched in
  the browser (NWS hourly for ~7 days, Open-Meteo for the rest; cached 30 min).
* Line production and crew roles use the original board's rules (16/pan, drops every 20 min, crew thresholds).
  The old flat "+30 ezCater biscuits every weekday morning" was dropped.

## Menu

`data/menu.json` lists the menu items the board tracks, what it doesn't track, and the sources, with a
`checkedAt` date (last check 2026-10-20). This store sells **no Chicken Supremes**. Its boneless chicken
is Bo's Chicken Tenders and Bo Bites, so the board shows "Bo's Tenders" where it used to show Supremes.
The tenders-per-ticket ratio is the old Supremes estimate until POS data with a `tenders` column is loaded.
POS files with the old `supremes` column still load; that column is read as tenders.
To re-check the menu, compare the store's delivery menu and bojangles.com/menu against `menu.json`,
then update the file and bump `checkedAt`.

## Update events

Edit `data/events.json`, then redeploy. Each entry:

```json
{"date":"2026-11-28","start":13,"end":20,"lift":1.08,"kind":"college",
 "label":"Iron Bowl: Auburn at Alabama","detail":"…","source":"https://…"}
```

* `start`/`end` are 24-hour clock, `end` not included. `lift` 1.10 = +10%, 0.90 = −10%.
* Add `"closed": true` to mark the store closed all day (e.g. if it closes Thanksgiving/Christmas).
* Always put a checkable `source` URL. When the SEC sets a flex kickoff, narrow the window.
* `schoolCalendar.closed` / `earlyDismissal` come from the Shelby County Schools PDF linked in the file.
* Bump `"updated"` so the page shows when the calendar was last refreshed.

## Load POS data

1. Export hourly sales from the POS (one row per date + hour; 8+ weeks is ideal) in the
   `pos_template.csv` columns: `date,hour,tickets,net_sales,biscuits,chicken_pieces,tenders,channel_drive_thru,channel_lobby,channel_doordash,channel_ubereats,channel_grubhub,channel_app,labor_hours,notes`.
   Only `date`, `hour`, `tickets` are required. Dates `YYYY-MM-DD` or `M/D/YYYY`; hour 0–23.
2. On the page, **Calibrate → Load real POS history → choose file**. It's parsed in the browser and
   saved in that browser's local storage only (each device loads its own). "Remove POS data" clears it.
3. The panel shows rows loaded, how many weekday-hours are calibrated, which ratios were learned, and a
   28-day backtest (MAPE by daypart) of the POS model vs the old estimated curves.

Optional shared file: put the CSV at `data/pos.csv` and add `"posFile": "data/pos.csv"` to
`events.json`. **Don't do this on a public host** — anyone with the link could download the sales data.
`publish.sh` strips `data/pos.csv` from deploys for that reason.

## Run locally

```bash
cd /workspace/bowatch-app && python3 -m http.server 8787   # open http://localhost:8787
node tools/check.mjs                                        # engine sanity check with live weather
```

## Redeploy

```bash
/workspace/bowatch-app/tools/deploy.sh    # runs check.mjs, publishes, `flypod update` to the same URL
```

## Hosting

The site is live at https://wiggywig1066-rgb.github.io/bowatch/ and redeploys automatically on every push to `main`. GitHub Actions publishes the repo root to GitHub Pages; there is no build step.

**Old temporary host:** flypod anonymous deploy (no account) at https://87ff2e09478743d4.flypod.page. Updates went to that URL with `tools/deploy.sh`. It expires **Nov 2, 2026 (5:16 PM CT)**. To keep it, someone runs `npx flypod login` on this box (free account) — that claims the site, same URL, no expiry.

Cursor Origin can store the git repo but has no static-site/Pages serving, and creating a repo needs James's approval.
