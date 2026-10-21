# Bo Watch — Chelsea 280 line board (standalone rebuild)

Hourly customer, biscuit, chicken and crew forecasts for Bojangles at 15392 US-280, Chelsea, AL.
Rebuilt from the Grok app-builder version (botime.grok.me) as a plain static site: no build step,
no server, no API keys. Open `index.html` through any static web server.

Live: https://wiggywig1066-rgb.github.io/Bowatch/ — redeploys automatically on push to `main`
(see "Hosting" below). The old temporary host was https://87ff2e09478743d4.flypod.page.

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `css/style.css` | Page shell, inline SVG icon set, mobile-first light/dark theme (system fonts, no CDN) |
| `favicon.svg`, `manifest.webmanifest` | Icon (generic biscuit mark — no Bojangles logos) and "add to home screen" manifest |
| `js/engine.js` | Forecast engine (also runs in Node) — baselines, rules, weather, hourly POS + daily sales learning, line production, crew |
| `js/app.js` | UI: Right-now card, 7-day outlook, SVG hourly chart with range band, Cook / Manager / Scheduler views, hour table, drivers, events, data panel, menu |
| `data/events.json` | **Editable** calendar: dated events, past holidays (`history`, for learning), Shelby County Schools calendar |
| `data/menu.json` | Menu items the board tracks, with sources and the last check date |
| `data/pos_template.csv`, `data/daily_template.csv` | Headers for hourly POS and daily sales exports |
| `tools/check.mjs` | Self-tests + sanity check: `node tools/check.mjs [pos.csv] [--daily daily.csv] [--wxhist wx.json] [--offline]` |
| `tools/publish.sh`, `tools/deploy.sh` | Copy site files (never sales CSVs) to `/workspace/bowatch-public`; old flypod redeploy |

## The board (UI)

* **Right now** card: this hour's tickets (with likely range), the next biscuit drop (time, pans, biscuits),
  chicken pieces, crew needed with roles, and what changes next hour (add / cut crew).
* **7-day outlook**: weather icon, high/low, rain chance, expected tickets bar colored by the peak, event
  and no-school badges, "call in" flag. Week 2 is a compact row. Tap any day to load its shift.
* **Hourly chart** (inline SVG): bars colored by intensity, shaded likely range (low–high), NOW marker,
  top two peaks labeled. Tap / arrow-key through hours; the selected hour drives the views below.
* Cook / Manager / Scheduler tabs, hour-by-hour table, drivers, kitchen load, events, data panel, menu, sources.
* Theme: Auto (follows the device), Light, Dark — header button, saved per device. `?theme=dark` forces it.
* Keyboard: Tab to the chart, ←/→ moves hours, Enter selects rows; tabs use ←/→. Reduced-motion respected.

## How the forecast works

| Data loaded | Mode | Day total | Hourly shape | Range |
| --- | --- | --- | --- | --- |
| none | estimate | original curves + weekly rules | same | ±25% |
| daily CSV only | daily | median of the last 8 same weekdays | default curve (original curves + weekly rules) | ±18% |
| hourly POS (with or without daily) | pos | median per weekday × hour, last 8 weeks | from POS | ±15% |

* **Estimate mode:** the original app's weekday curves plus the same weekly rules (280 rush, church,
  payday, delivery windows, 4x4 staging…). A banner says the numbers are estimates.
* **Daily mode:** each weekday's day total = median tickets of the last 8 same weekdays (event,
  holiday and no-school days left out; needs 3+ samples for 3+ weekdays, thin weekdays are scaled from
  the others). The total is split across hours with the default hourly curve for that weekday.
  If the file has `biscuits`, `chicken_pieces` or `tenders` (7+ days), the default per-ticket ratios are
  scaled so the day matches. `labor_hours` gives a tickets-per-labor-hour figure (shown, not used for crew).
* **Hourly POS mode:** as before — median for each weekday × hour, item ratios by daypart (200+ tickets),
  app share from channel columns. It takes priority for the hourly shape whenever enough rows exist.
* **Learned special days (any sales data):** day totals from the daily file (and hourly POS days with
  10+ hours) are compared with the same-weekday median of the 8 weeks before. For each event kind in
  `events.json` (holiday, sports, college, local…) and for listed no-school weekdays, the board takes the
  median of *actual ÷ (median × what the default lifts predicted)*. With **3+ comparable days** the kind
  gets a learned day factor on top of the default hourly lifts; with fewer, defaults stay and the panel
  says how many more days it needs. Past holidays are listed under `history` in `events.json` so a few
  months of data already has comparable days.
* **Learned rain effect:** the browser fetches past daily rain (Open-Meteo archive) for your sales dates
  and compares rainy days (≥0.25 in) with dry days (<0.02 in). It is used only with 6+ rainy and 10+ dry
  days, a clear difference (Welch t ≥ 2) and an effect ≥3%; then it replaces the default rain rules,
  scaled by each hour's rain chance. Otherwise it is skipped and the panel says why.
* **Backtests:** daily — each of the last 28 days is forecast from the data before it and compared on
  the day total (MAPE, vs the estimated curves). Hourly — MAPE by daypart, as before. Neither uses weather.
* **All modes** layer on things a weekday median can't know: dated events (`lift`), no-school weekdays,
  early dismissals, the 1st of the month, and live hourly weather (NWS ~7 days, then Open-Meteo; 30-min cache).
* Line production and crew roles use the original board's rules (16/pan, drops every 20 min, crew thresholds).

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

## Load sales data

**Daily (easiest):** export one row per day with `date,tickets,net_sales,notes` (see
`data/daily_template.csv`); optional `biscuits,chicken_pieces,tenders,labor_hours`. Dates `YYYY-MM-DD` or
`M/D/YYYY`; `$` and thousands commas are fine; a later row for the same date replaces an earlier one.
8+ weeks gives every weekday a full median; 3+ weeks is the minimum.

**Hourly POS (most accurate):** one row per date + hour in the `pos_template.csv` columns:
`date,hour,tickets,net_sales,biscuits,chicken_pieces,tenders,channel_drive_thru,channel_lobby,channel_doordash,channel_ubereats,channel_grubhub,channel_app,labor_hours,notes`.
Only `date`, `hour`, `tickets` are required.

On the page: **Your sales data → Load daily CSV / Load hourly CSV**. Files are parsed in the browser and
saved in that browser's local storage only (each device loads its own). "Remove" clears them. The panel
shows the active data (none / daily / hourly), the weekday baselines, learned ratios, special-day
factors, the rain test result and the backtests.

**Never commit sales data.** `.gitignore` blocks `data/pos.csv`, `data/daily.csv`, `*.pos.csv`, `*.daily.csv`,
and `publish.sh` strips them. Test with a clearly labeled synthetic file kept outside the repo.

Optional shared file: put the CSV at `data/pos.csv` and add `"posFile": "data/pos.csv"` to
`events.json`. **Don't do this on a public host** — anyone with the link could download the sales data.
`publish.sh` strips `data/pos.csv` from deploys for that reason.

## Run locally

```bash
cd /workspace/bowatch-app && python3 -m http.server 8787   # open http://localhost:8787
node tools/check.mjs                                        # self-tests + 14-day board with live weather
node tools/check.mjs --daily /path/daily.csv               # same, with a daily file
```

## Redeploy

```bash
/workspace/bowatch-app/tools/deploy.sh    # runs check.mjs, publishes, `flypod update` to the same URL
```

## Hosting

The site is live at https://wiggywig1066-rgb.github.io/Bowatch/ and redeploys automatically on every push to `main`. GitHub Actions publishes the repo root to GitHub Pages; there is no build step.

**Old temporary host:** flypod anonymous deploy (no account) at https://87ff2e09478743d4.flypod.page. Updates went to that URL with `tools/deploy.sh`. It expires **Nov 2, 2026 (5:16 PM CT)**. To keep it, someone runs `npx flypod login` on this box (free account) — that claims the site, same URL, no expiry.

Cursor Origin can store the git repo but has no static-site/Pages serving, and creating a repo needs James's approval.
