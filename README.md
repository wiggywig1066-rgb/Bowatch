# Bo Watch — Chelsea line board

Hourly ticket, biscuit, bone-in chicken, Bo’s Tenders, and crew forecast for **one restaurant**: the Bojangles at 15392 US-280, Chelsea, Alabama (Shelby County). Built for production and crew planning on a phone.

This is not an official Bojangles product. It does not use the Bojangles logo.

Live site: https://wiggywig1066-rgb.github.io/Bowatch/

Plain HTML, CSS, and JavaScript. No build step and no API key. Open `index.html` from any static server. GitHub Actions runs the forecast checks, then publishes this repo to GitHub Pages on every push to `main`.

## The board

Five tabs along the bottom:

| Tab | What it is for |
| --- | --- |
| Now | What to cook and staff this hour and the next two, with a plain-English reason and an hourly chart |
| Outlook | The next 7 days, then days 8–14. Tap a day for its hours |
| Cook | Drop-and-cook card for each open hour (pans at :00, :20, :40) |
| Crew | Crew by shift, plus a 14-day call sheet |
| Sales | Load, export, or clear sales. Files never leave the phone |

The header theme button cycles Auto, Light, and Dark. `?theme=light`, `?theme=dark`, or `?theme=auto` does the same. `?view=now|week|cook|crew|data` opens a tab directly.

Add to Home Screen uses the web manifest. `sw.js` keeps a network-first copy of the board for offline use. Live weather still needs a connection.

Each open hour shows why it differs from a usual hour of that weekday, for example `Rain +0%, Friday payday +6%, Home game −8%`. A chip without a “your sales” tag is an **assumption**. The likely range is an assumption until a walk-forward backtest on your own file replaces it.

## How a count is built

| What you have loaded | Mode | Day total | Hourly shape | Starting range |
| --- | --- | --- | --- | --- |
| Nothing | Assumptions | Hand-set weekday curves | Same curves, plus the weekly rhythm | ±25% |
| Daily CSV | Daily sales | Median of the last 8 same weekdays | Default curve | ±18%, narrower once 4 or more samples exist |
| Hourly CSV | Hourly sales | Median of that weekday and hour | From your file | ±15%, narrower with more samples |

Hourly sales win over a daily file when the hourly file has enough recent rows. With either file, holiday and event multipliers are learned only after 3 comparable days. Rain is learned only with at least 6 wet and 10 dry days and a clear difference. Heat is learned only with at least 4 hot and 8 milder days. Until then the prior stays, and the screen says so.

The band becomes the 80th percentile of absolute percent error from the daily walk-forward backtest once that backtest exists, clamped between 8% and 45%. That band is no longer labeled an assumption.

Things a weekday median does not already contain are layered on top: dated events, no-school weekdays, early dismissal, the 1st, the 15th, month-end, a spring-forward trim on the first two open hours, and live weather. Friday payday is already inside the Friday curve in assumption mode, and already inside a Friday median once you load sales, so it is not applied twice. SNAP issuance and Social Security payment dates are notes with **no percent**. Fall-back is a note with no percent.

Line counts (16 biscuits to a pan, drops every 20 minutes, crew roles) use the same thresholds as the earlier board. This store does not sell Chicken Supremes. A `supremes` column in an old export is read as Bo’s Tenders.

## Data sources

| Source | URL | Live or static |
| --- | --- | --- |
| NWS hourly forecast | https://api.weather.gov/points/33.3401,-86.6303 | Live, about 7 days. No precip amount on the hourly product |
| NWS alerts, Shelby County and zone ALZ025 | https://api.weather.gov/alerts/active?zone=ALC117,ALZ025 | Live. Tornado, severe thunderstorm, and flash-flood warnings and watches change the hour. Other alerts are shown only |
| Open-Meteo forecast | https://api.open-meteo.com/v1/forecast | Live backup, and the hourly precip amount |
| Open-Meteo archive | https://archive-api.open-meteo.com/v1/archive | Live, only after sales are loaded, for the rain and heat tests |
| Shelby County Schools and dated local events | `data/events.json` (each row has its own source URL) | Static file. Unconfirmed kickoffs stay marked unconfirmed. Nothing in that file was given a date that was not on a source |
| US public holidays, used to move Social Security off weekends | https://date.nager.at/api/v3/PublicHolidays/2026/US (2025 and 2027 too), copied into `data/holidays.json` | Static snapshot fetched 2026-10-26. The list itself does not change guest counts |
| Social Security payment rules | https://www.ssa.gov/pubs/calendar.htm and https://www.ssa.gov/kc/rp_paybenefits.htm | Computed. Notes only |
| Daylight saving time | https://www.nist.gov/pml/time-and-frequency-division/popular-links/daylight-saving-time | Rule. Spring-forward is a −3% prior on the first two open hours. Fall-back is a note |
| Alabama SNAP issuance | https://fns-prod.azureedge.us/sites/default/files/resource-files/Monthly-Issuance-Schedule-All-States.pdf | Static schedule, 4th–23rd by case number. Note only |
| ALDOT traffic counts on US-280 | https://aldotgis.dot.state.al.us/pubgis2/rest/services/EGISATDServices/TDMPublic/MapServer/0 | Static. Nearest station’s newest year on that layer was 2017. Not used in the hourly math |
| Bojangles national promos | https://www.bojangles.com/news-and-community/pepsi-boojangles/ and the other URLs in `data/promos.json` | Static check on 2026-10-26. Not confirmed at Chelsea. Not used in the math |

## Privacy

Real daily sales, tickets, and POS exports stay on the device. The Sales tab reads a file or pasted text in the browser and stores it in `localStorage`, with IndexedDB if local storage cannot hold it. Export and Clear are on that tab. `data/daily.csv`, `*.daily.csv`, `data/pos.csv`, and `*.pos.csv` are gitignored, and `tools/publish.sh` strips them. Do not add a sales file to this public repo. A clearly named `TEST` / synthetic series is fine for tests.

## Menu

`data/menu.json` keeps `checkedAt`, `sources`, and `tracked` so the weekly menu check can keep updating it. Do not add Chicken Supremes.

## Checks

```bash
node tools/check.mjs --offline
node --test tools/forecast.test.mjs
```

`tools/check.mjs` prints a walk-forward backtest on a **synthetic** series (labeled in the script, not this store). `.github/workflows/ci.yml` runs both commands on push and pull request. The Pages workflow runs them before upload.

`tools/deploy.sh` only runs those checks. It does not deploy. The old flypod host is not used.

## Run locally

```bash
python3 -m http.server 8787
```

Open http://localhost:8787 . File URLs will not load the JSON data or the module script reliably; use a static server.

## Known limits

- With no sales file, every count and the ±25% band is an assumption.
- SNAP, Social Security, fall-back, the 2017 traffic count, and national promos do not change the forecast.
- NWS hourly has no precip amount. The hourly inches come from Open-Meteo. The NWS grid’s 6-hour precipitation is not fetched.
- Some kickoffs are still unconfirmed (UAB, the Iron Bowl window, Auburn where the school only says “early”). The Blood Rock 100 page lists both 10:00 AM and 11:00 AM. The Chelsea High game on Oct 30, 2026 follows the later MaxPreps listing after an earlier Thursday listing.
- Thanksgiving and Christmas use a prior, and store hours that day are not confirmed. Add `"closed": true` on the event if the store is dark.
- Accuracy numbers from `check.mjs` are synthetic. They are not this store’s error.
