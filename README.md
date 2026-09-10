# Philly Council, Proportionally

A one-page simulator: what would Philadelphia City Council look like if seats were elected proportionally with ranked-choice (single transferable vote, STV) ballots, compared with today's 10 single-member districts plus 7 at-large seats by limited voting?

Live site: enable GitHub Pages (Settings → Pages → Source: *GitHub Actions*) and push to `main`; `.github/workflows/deploy.yml` runs the tests and publishes `site/`.

## Run locally

```sh
npm test                 # STV / limited-vote / plurality / slider-math unit tests (node:test, no deps)
npm run test:browser     # headless Chrome: drags a slider and checks the page follows (scripts/browser.js drives Chrome over DevTools protocol)
npm run serve            # http://localhost:8080 (plain static files, no build step; must be served over HTTP, file:// will not work)
npm run screenshot       # headless Chrome screenshots of several states into ./screenshots
```

## How it works

- **Inputs** (`site/src/data/inputs.js`): each *input type* (party, race, gender, car access, renters/owners, age, education, birthplace, income, commute) is a table of real per-district counts. City-wide sliders scale every district by the same proportion; per-district sliders move one district. State is mirrored in the URL hash (`#type=race&city=Asian:20&d7=Hispanic:60&focus=Asian`), so any scenario is shareable.
- **Model** (`site/src/model/`): `count.js` implements plurality, Philadelphia's limited vote (vote for 5, top 7 win) and a real STV count (Droop quota, weighted inclusive Gregory transfers, batch elimination of zero-vote candidates). `systems.js` defines the four council layouts and the proportionality metrics (Loosemore–Hanby "mirror score", Gallagher index, groups shut out).
- **Visualizations** (`site/src/viz/`): a tiny registry. A chart is `{ id, title, lede, order, render(el, ctx) }`; `ctx` carries the electorate, the results for every system, and the colour map. Add a file, `registerViz(...)`, import it from `main.js`, done.

Voters are modelled as perfect blocs: every voter ranks only candidates from their own group. This is the simplification the page's disclaimer describes; it makes the results deterministic and makes STV look, if anything, *less* helpful to small groups than real transfers would.

## Data

All figures are for the current (2024) council district map.

| Input | Source | Method |
|---|---|---|
| Party | Nov 2023 Council at-large general (D / WFP / R), by division (City Commissioners via OpenDataPhilly) | Joined to the Commissioners' official division→council-district table (`scripts/data/division_to_district_2022.csv`); each party's votes divided by candidates fielded (5 / 2 / 2). Party *registration* by district is not published anywhere. `scripts/build_party.py` rebuilds `party.js`. |
| Faction | May 2023 mayoral primaries, by division | Voters grouped by the candidate they chose (Parker, Rhynhart, Gym, Domb, Jeff Brown, other Democrats, Republican primary). |
| Party (2024 presidential) | Nov 2024 presidential vote, by division | Kept as the lopsided two-party comparison. |
| Race / ethnicity | 2020 Census PL 94-171, voting-age population | Every block assigned to its district (`scripts/data/race_vap_2020.csv`; reconciles with the redistricting ordinance to ±2 people). |
| Everything else | ACS 5-year (latest) block groups via the Census Reporter API | Area-weighted crosswalk to districts (`scripts/build_data.py`). Birthplace is tract-level. |

Rebuild: `python3 -m venv .venv && .venv/bin/pip install shapely && .venv/bin/python scripts/build_data.py`.

## Layout options compared

1. **Today** – 10 single-member districts (plurality) + 7 at-large seats by limited voting.
2. **STV at-large** – same districts; the 7 at-large seats become one 7-winner STV contest.
3. **5 × 3** – no at-large seats; neighbouring districts paired (1+2, 3+4, 5+7, 8+9, 6+10), 3 STV seats each (15).
4. **10 × 3** – today's districts, 3 STV seats each (30).

Extra layouts are one entry in `SYSTEMS` (`site/src/model/systems.js`).
