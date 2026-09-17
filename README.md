# Philly Council, Proportionally

A one-page simulator: what would Philadelphia City Council look like if seats were elected proportionally with ranked-choice (single transferable vote, STV) ballots, compared with today's 10 single-member districts plus 7 at-large seats by limited voting?

Link previews use `site/og.png`; the deploy workflow rewrites the `og:image` tag to the absolute Pages URL. For the repository card on GitHub itself, upload the same image under Settings → General → Social preview (GitHub has no API for that).

Live site: enable GitHub Pages (Settings → Pages → Source: *GitHub Actions*) and push to `main`; `.github/workflows/deploy.yml` runs the tests and publishes `site/`.

## Run locally

```sh
npm test                 # STV / limited-vote / plurality / slider-math unit tests (node:test, no deps)
npm run test:browser     # headless Chrome: drags a slider and checks the page follows (scripts/browser.js drives Chrome over DevTools protocol)
npm run serve            # http://localhost:8080 (plain static files, no build step; must be served over HTTP, file:// will not work)
npm run screenshot       # headless Chrome screenshots of several states into ./screenshots
npm run social           # regenerate site/og.png (1200×630 link preview) and the PNG favicons from site/favicon.svg
```

## How it works

- **Inputs** (`site/src/data/inputs.js`): each *input type* (party, race, gender, car access, renters/owners, age, education, birthplace, income, commute) is a table of real counts per *cell*. Three district maps are compared (today's 10 districts, a 7-district plan and a 5-district plan) and their lines cut across each other, so the unit is the piece of the city inside one district of each map: cell `3-2-4` is in council district 3, district 2 of the 7-plan and district 4 of the 5-plan (35 cells in all). Any district of any map is a set of cells. City-wide sliders scale every cell by the same proportion; per-district sliders scale the cells of one council district. State is mirrored in the URL hash, so any scenario is shareable: `#type=race&systems=current,stv-7x3&charts=headline,map&city=Asian:20&d7=Hispanic:60&advanced=1`. Defaults: `systems=current,stv-7x3`, `charts=headline` (use `charts=all` for everything); sliders stay hidden behind the “Advanced” button unless `advanced=1` or an override is present, and the “Show the math” section stays collapsed unless `math=1` (or `open=1`, which also expands every table). Change `DEFAULT_SYSTEMS` / `DEFAULT_CHARTS` in `main.js` to alter the landing view.
- **Model** (`site/src/model/`): `count.js` implements plurality, Philadelphia's limited vote (vote for 5, top 7 win) and a real STV count (Droop quota, weighted inclusive Gregory transfers, batch elimination of zero-vote candidates). `systems.js` defines the four council layouts and the proportionality metrics (Loosemore–Hanby "mirror score", Gallagher index, groups shut out).
- **Visualizations** (`site/src/viz/`): a tiny registry. A chart is `{ id, title, lede, order, render(el, ctx) }`; `ctx` carries the electorate, the results for every system, and the colour map. Add a file, `registerViz(...)`, import it from `main.js`, done.

Voters are modelled as perfect blocs: every voter ranks only candidates from their own group. This is the simplification the page's disclaimer describes; it makes the results deterministic and makes STV look, if anything, *less* helpful to small groups than real transfers would.

## Data

Everything is tabulated by cell (see above), so the same figures serve all three maps.

| Input | Source | Method |
|---|---|---|
| Party | Nov 2023 Council at-large general (D / WFP / R), by division (City Commissioners via OpenDataPhilly; `scripts/fetch_elections.py`) | Council district from the Commissioners' official division→council-district table (`scripts/data/division_to_district_2022.csv`); plan districts from the 2020 precinct each division overlaps most (`scripts/data/division_to_cell.csv`; only 2 of 3,406 placements have under 90% of the division's area in one plan district). Each party's votes divided by candidates fielded (5 / 2 / 2). Party *registration* by district is not published anywhere. `scripts/build_party.py` rebuilds `party.js`. |
| Faction | May 2023 mayoral primaries, by division | Voters grouped by the candidate they chose (Parker, Rhynhart, Gym, Domb, Jeff Brown, other Democrats, Republican primary). |
| Party (2024 presidential) | Nov 2024 presidential vote, by division | Kept as the lopsided two-party comparison. |
| Race / ethnicity | 2020 Census PL 94-171, voting-age population | Every block assigned to its council district by interior point (reconciles with the redistricting ordinance to ±2 people) and to plan districts by its 2020 precinct (exact). |
| Everything else | ACS 5-year (latest) block groups via the Census Reporter API | Each block group split between cells in proportion to the 2020 population of its blocks (`scripts/build_data.py`). Birthplace is tract-level. |
| 7- and 5-district plans | Drawn in [Dave's Redistricting](https://davesredistricting.org/) from 2020 Census voting districts (precincts); assignments in `scripts/data/plans/` (CC BY-SA 4.0) | Populations 221,771–233,313 (7-plan) and 320,037–321,248 (5-plan). Outlines are the precincts dissolved by district, clipped to the city outline. To try another plan, export its precinct data from DRA, replace the CSV, and rebuild. |

Rebuild: `python3 -m venv .venv && .venv/bin/pip install shapely pyshp && .venv/bin/python scripts/build_data.py && python3 scripts/build_party.py` (downloads ~60 MB of Census files into `scripts/.cache/` the first time).

## Swapping in a new plan from Dave's Redistricting

The 7- and 5-district maps are just precinct assignments, so a redrawn plan is a data swap plus a few labels.

1. In DRA, export the map's **precinct data** and unzip it. Check `precinct-data.csv` before using it: every `GEOID20` must start with `42101` (Philadelphia; a DC export once arrived by mistake), there should be 1,703 rows, and none should start with `B_` (a split precinct; un-split it in DRA, the build places whole precincts only). DRA's own demographic and election columns are not used.
2. Keep only the first three columns (`GEOID20,Name,District`) and save it over the matching file in `scripts/data/plans/` (or add a file and a key to `PLANS` in `scripts/build_data.py`).
3. Rebuild: `.venv/bin/python scripts/build_data.py && python3 scripts/build_party.py`. The build prints each plan district's 2020 population (compare with DRA's numbers; they should match exactly), the number of cells, and how many election divisions straddle a plan line.
4. Re-check the hand-written labels, because district numbers move when a map is redrawn: the area names in `PLANS` in `site/src/model/systems.js`, and the figures quoted in prose (the population deviations and "35 pieces" in the assumptions list in `site/index.html`, and the population ranges and cell count in this README). Look at the result with `#charts=map&systems=stv-7x3,stv-5x5`.
5. `npm test && npm run test:browser && npm run screenshot && npm run social`.

A plan with a **different number of districts or seats** (say 6 × 4) also needs: a new key in `PLANS` (build_data.py) and the same key, in the same position, in `MAP_INDEX` (`site/src/model/electorate.js`), since a cell id is `<council>-<plan 1>-<plan 2>…` in that order; a `PLANS` entry and a `SYSTEMS` entry in `systems.js` (`planDistricts(key, seats)`); a colour in `SYSTEM_VARS` (`site/src/viz/palette.js`); and updates to `DEFAULT_SYSTEMS` (`main.js`), the expected seat totals and district counts in `tests/systems.test.js`, the system list in `scripts/screenshot.js`, and the quota sentence in the verdict text (`site/src/viz/headline.js`). Removing a plan is the reverse. Old share links naming a removed system fall back to the defaults.

## Layout options compared

1. **Today** – 10 single-member districts (plurality) + 7 at-large seats by limited voting.
2. **STV at-large** – same districts; 9 at-large seats (two more than today) elected in one 9-winner STV contest (19).
3. **7 × 3** – no at-large seats; a new map of 7 equal-population districts, 3 STV seats each (21).
4. **5 × 5** – no at-large seats; a new map of 5 equal-population districts, 5 STV seats each (25).

Extra layouts are one entry in `SYSTEMS` (`site/src/model/systems.js`).
