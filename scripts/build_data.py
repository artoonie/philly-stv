#!/usr/bin/env python3
"""Rebuild the site's geographic data from public sources.

Three district maps are in play: today's 10 council districts, and two proposed
multi-member plans drawn in Dave's Redistricting (7 districts and 5 districts; precinct
assignments in scripts/data/plans/). Their boundaries cut across each other, so every
figure is tabulated by *cell*: the piece of the city that falls in one district of each
map. A cell id is "<council district>-<7-plan district>-<5-plan district>", and any
district of any map is simply a set of cells.

Sources
- Council district boundaries (2024 map): City of Philadelphia ArcGIS "Council_Districts_2024".
- 2020 Census PL 94-171 (blocks): population, voting-age population by race, and each
  block's 2020 voting district (VTD), which is the precinct unit the two plans assign.
- 2020 VTD shapes (Census TIGER) for the plan outlines; current division shapes (City of
  Philadelphia "Political_Divisions") to place today's election divisions in the plans.
- American Community Survey 5-year estimates at block-group (tract for nativity) level via
  the Census Reporter API (api.censusreporter.org, "latest" release).

Blocks nest inside block groups, tracts and VTDs, so each block is assigned to a council
district by its interior point and to plan districts by its VTD; block-group (or tract)
estimates are then split between cells in proportion to the 2020 population of their blocks.

Writes site/src/data/{acs,race,districts.geojson,plans.geojson}.js and
scripts/data/division_to_cell.csv (consumed by build_party.py).

Usage:  python3 -m venv .venv && .venv/bin/pip install shapely pyshp && .venv/bin/python scripts/build_data.py
"""
import csv, io, json, collections, os, sys, urllib.request, zipfile
import shapefile
from shapely.geometry import shape, mapping, Point, Polygon, MultiPolygon
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely.prepared import prep
from shapely.strtree import STRtree

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '.cache')
DATA = os.path.join(HERE, 'data')
OUT = os.path.join(HERE, '..', 'site', 'src', 'data')
os.makedirs(CACHE, exist_ok=True)

ARCGIS = 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/'
DISTRICTS_URL = ARCGIS + 'Council_Districts_2024/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson'
DIVISIONS_URL = ARCGIS + 'Political_Divisions/FeatureServer/0/query?where=1%3D1&outFields=division_num&outSR=4326&f=geojson'
VTD_URL = 'https://www2.census.gov/geo/tiger/TIGER2020PL/LAYER/VTD/2020/tl_2020_42101_vtd20.zip'
PL_URL = 'https://www2.census.gov/programs-surveys/decennial/2020/data/01-Redistricting_File--PL_94-171/Pennsylvania/pa2020.pl.zip'
CR_DATA = 'https://api.censusreporter.org/1.0/data/show/latest?table_ids={table}&geo_ids={sumlev}|05000US42101'
# Proposed plans: map key -> precinct assignment in scripts/data/plans/. The order here is the order of the
# plan districts inside a cell id, after the council district; MAP_INDEX in site/src/model/electorate.js must
# list the same keys in the same order. See "Swapping in a new plan" in the README for the full checklist.
#
# Each CSV is a Dave's Redistricting "precinct data" export (Export -> Precinct Data, unzip, precinct-data.csv)
# trimmed to its first three columns: GEOID20,Name,District. Requirements the code below relies on:
# - every row's GEOID20 starts with 42101 (Philadelphia) and all 1,703 2020 VTDs are assigned;
# - no split precincts (DRA writes those as "B_<geoid>_<suffix>"); blocks are placed by whole VTD.
PLANS = {'p7': 'philadelphia-7x3.csv', 'p5': 'philadelphia-5x5.csv'}

def download(url, name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print('fetching', name, file=sys.stderr)
        with urllib.request.urlopen(url, timeout=900) as r, open(path, 'wb') as f:
            while chunk := r.read(1 << 20): f.write(chunk)
    return path

def fetch(url, name): return json.load(open(download(url, name)))

# ---- the three maps ----
districts = fetch(DISTRICTS_URL, 'districts2024.geojson')
D = {int(f['properties']['district_num']): shape(f['geometry']).buffer(0) for f in districts['features']}
D_prep = {d: prep(g) for d, g in D.items()}
city = unary_union(list(D.values()))

plan_of = {}  # plan -> { VTD geoid: district }
for plan, fname in PLANS.items():
    plan_of[plan] = {r['GEOID20']: int(r['District']) for r in csv.DictReader(open(os.path.join(DATA, 'plans', fname)))}
    bad = [g for g in plan_of[plan] if not g.startswith('42101')]
    assert not bad, f'{fname}: not a whole-precinct Philadelphia export (e.g. {bad[0]}); see the notes above PLANS'

# ---- census blocks: council district by interior point, plan districts by VTD ----
def council_district(lon, lat):
    p = Point(lon, lat)
    for d, g in D_prep.items():
        if g.contains(p): return d
    return min(D, key=lambda d: D[d].distance(p))  # a few shoreline blocks sit just outside the city's outline

RACE = {'Black': 81, 'White': 80, 'Hispanic': 77, 'Asian': 83}  # P4 (18+): columns in PL segment 2
VAP_TOTAL = 76
blocks = {}  # logrecno -> block
with zipfile.ZipFile(download(PL_URL, 'pa2020.pl.zip')) as z:
    for line in io.TextIOWrapper(z.open('pageo2020.pl'), encoding='latin-1'):
        f = line.rstrip('\n').split('|')
        if f[2] != '750' or f[14] != '101': continue
        vtd = '42101' + f[77]
        blocks[f[7]] = {'geoid': f[9], 'pop': int(f[-7]), 'district': council_district(float(f[-4]), float(f[-5])),
                        **{plan: plan_of[plan][vtd] for plan in PLANS}}
    for line in io.TextIOWrapper(z.open('pa000022020.pl'), encoding='latin-1'):
        f = line.rstrip('\n').split('|')
        b = blocks.get(f[4])
        if b is None: continue
        b['race'] = {k: int(f[i]) for k, i in RACE.items()}
        b['race']['Other'] = int(f[VAP_TOTAL]) - sum(b['race'].values())
for b in blocks.values(): b['cell'] = '-'.join(str(b[k]) for k in ['district', *PLANS])
cell_key = lambda c: tuple(int(x) for x in c.split('-'))
print(len(blocks), 'blocks,', len({b['cell'] for b in blocks.values()}), 'cells', file=sys.stderr)

race = collections.defaultdict(lambda: collections.OrderedDict((k, 0) for k in [*RACE, 'Other']))
for b in blocks.values():
    for k, v in b['race'].items(): race[b['cell']][k] += v
race = {c: race[c] for c in sorted(race, key=cell_key) if sum(race[c].values()) > 0}
with open(os.path.join(OUT, 'race.js'), 'w') as f:
    f.write('// Generated by scripts/build_data.py — do not edit by hand.\n')
    f.write('// 2020 Census PL 94-171, voting-age population (18+) by race/ethnicity, block by block, keyed by cell\n')
    f.write('// ("<council district>-<7-plan district>-<5-plan district>").\n')
    f.write('export const RACE_VAP_2020 = ' + json.dumps(race, separators=(',', ':')).replace('},', '},\n ') + ';\n')

# ---- ACS: block-group (tract) estimates split between cells by 2020 block population ----
def weights(prefix_len):
    pops = collections.defaultdict(lambda: collections.defaultdict(float))
    for b in blocks.values(): pops[b['geoid'][:prefix_len]][b['cell']] += b['pop'] or 1e-6  # unpopulated areas: split evenly by block
    return {g: {c: v / sum(cells.values()) for c, v in cells.items()} for g, cells in pops.items()}
Wbg, Wtr = weights(12), weights(11)

def load(table, sumlev):
    d = fetch(CR_DATA.format(table=table, sumlev=sumlev), f'{sumlev}_{table}.json')
    rel = d.get('release', {})
    return {gid.split('US')[1]: v[table]['estimate'] for gid, v in d['data'].items()}, rel.get('name', 'ACS 5-year')

def agg(est, W, cols):
    out = collections.defaultdict(lambda: collections.OrderedDict((k, 0.0) for k in cols))
    for gid, e in est.items():
        for c, frac in W.get(gid, {}).items():
            for k, ids in cols.items():
                out[c][k] += frac * sum((e.get(i) or 0) for i in ids)
    return out

def rng(t, a, b): return [f"{t}{i:03d}" for i in range(a, b + 1)]

results, releases = {}, {}
b01, releases['B01001'] = load('B01001', 150)
results['gender'] = agg(b01, Wbg, {'Women': rng('B01001', 31, 49), 'Men': rng('B01001', 7, 25)})
results['age'] = agg(b01, Wbg, {'18–34': rng('B01001', 7, 12) + rng('B01001', 31, 36),
                                '35–64': rng('B01001', 13, 19) + rng('B01001', 37, 43),
                                '65+': rng('B01001', 20, 25) + rng('B01001', 44, 49)})
b25, releases['B25044'] = load('B25044', 150)
r = agg(b25, Wbg, {'Total': ['B25044001'], 'No car': ['B25044003', 'B25044010']})
for c in r:
    tot = r[c].pop('Total'); nc = r[c].pop('No car'); r[c]['Has a car'] = tot - nc; r[c]['No car'] = nc
results['cars'] = r
b2503, releases['B25003'] = load('B25003', 150)
results['tenure'] = agg(b2503, Wbg, {'Owners': ['B25003002'], 'Renters': ['B25003003']})
b15, releases['B15003'] = load('B15003', 150)
results['education'] = agg(b15, Wbg, {'High school or less': rng('B15003', 2, 18), 'Some college': rng('B15003', 19, 21), "Bachelor's or more": rng('B15003', 22, 25)})
b08, releases['B08301'] = load('B08301', 150)
results['commute'] = agg(b08, Wbg, {'Drive': ['B08301002'], 'Transit': ['B08301010'], 'Walk or bike': ['B08301018', 'B08301019'], 'Work from home / other': ['B08301016', 'B08301017', 'B08301020', 'B08301021']})
b19, releases['B19001'] = load('B19001', 150)
results['income'] = agg(b19, Wbg, {'Under $50k': rng('B19001', 2, 10), '$50k–$100k': rng('B19001', 11, 13), 'Over $100k': rng('B19001', 14, 17)})
b05, releases['B05002'] = load('B05002', 140)
results['nativity'] = agg(b05, Wtr, {'US-born': ['B05002002'], 'Foreign-born': ['B05002013']})

out = {}
for k, v in results.items():
    rows = {c: {kk: round(vv) for kk, vv in v[c].items()} for c in sorted(v, key=cell_key)}
    out[k] = {c: row for c, row in rows.items() if sum(row.values()) > 0}
release = sorted(set(releases.values()))
with open(os.path.join(OUT, 'acs.js'), 'w') as f:
    f.write('// Generated by scripts/build_data.py — do not edit by hand. Keyed by cell ("<council district>-<7-plan district>-<5-plan district>").\n')
    f.write(f'export const ACS_RELEASE = {json.dumps(", ".join(release))};\n')
    f.write('export const ACS = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')).replace('},', '},\n ') + ';\n')

# ---- today's election divisions -> cells ----
# Council district: the Commissioners' official table. Plan districts: the 2020 VTD the division overlaps most
# (divisions were renumbered and a few redrawn after 2020, so ids alone don't line up).
sf = shapefile.Reader(download(VTD_URL, 'tl_2020_42101_vtd20.zip'))
vtds = [(rec['GEOID20'], shape(shp.__geo_interface__).buffer(0)) for rec, shp in zip(sf.records(), sf.shapes())]
tree = STRtree([g for _, g in vtds])
official = {r['Precinct']: int(r['Council 2022']) for r in csv.DictReader(open(os.path.join(DATA, 'division_to_district_2022.csv')))}
div_rows, straddle = [], 0
for f in fetch(DIVISIONS_URL, 'divisions.geojson')['features']:
    num = f['properties']['division_num']; div = f'{num[:2]}-{num[2:]}'
    g = shape(f['geometry']).buffer(0)
    overlap = collections.defaultdict(float)
    for i in tree.query(g):
        overlap[vtds[i][0]] += g.intersection(vtds[i][1]).area
    row = [div, official[div]]
    for plan in PLANS:
        by_d = collections.defaultdict(float)
        for v, a in overlap.items(): by_d[plan_of[plan][v]] += a
        best = max(by_d, key=by_d.get)
        if by_d[best] / sum(by_d.values()) < 0.9: straddle += 1
        row.append(best)
    div_rows.append(row)
div_rows.sort()
assert {r[0] for r in div_rows} == set(official), 'division shapes and the official district table disagree'
with open(os.path.join(DATA, 'division_to_cell.csv'), 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['division', 'council', *PLANS]); w.writerows(div_rows)
print(f'{len(div_rows)} divisions placed; {straddle} division-plan pairs with < 90% of their area in one plan district', file=sys.stderr)

# ---- simplified outlines for the map ----
def rnd(c):
    if isinstance(c, (list, tuple)):
        if c and isinstance(c[0], float): return [round(c[0], 4), round(c[1], 4)]
        return [rnd(x) for x in c]
    return c

def feature(d, geom):
    geom = geom.simplify(0.0008, preserve_topology=True)
    polys = [orient(p, -1) for p in getattr(geom, 'geoms', [geom])]  # D3 wants clockwise outer rings
    gj = mapping(polys[0] if len(polys) == 1 else MultiPolygon(polys))
    return {'type': 'Feature', 'properties': {'district': d}, 'geometry': {'type': gj['type'], 'coordinates': rnd(gj['coordinates'])}}

def collection(geoms):
    return {'type': 'FeatureCollection', 'features': [feature(d, geoms[d]) for d in sorted(geoms)]}

def keep_polygons(g):  # clipping to the city outline leaves stray slivers, lines and pinhole gaps
    parts = [p for p in getattr(g, 'geoms', [g]) if p.geom_type == 'Polygon' and p.area > 1e-7]
    g = unary_union([Polygon(p.exterior, [h for h in p.interiors if Polygon(h).area > 2e-6]) for p in parts])
    return g.buffer(-0.0002, join_style=2).buffer(0.0002, join_style=2)  # shave off hair-thin spikes (~20 m) along precinct lines

with open(os.path.join(OUT, 'districts.geojson.js'), 'w') as f:
    f.write('// Generated by scripts/build_data.py — City of Philadelphia council districts (2024 map), simplified.\n')
    f.write('export default ' + json.dumps(collection(D), separators=(',', ':')) + ';\n')
with open(os.path.join(OUT, 'plans.geojson.js'), 'w') as f:
    f.write('// Generated by scripts/build_data.py — proposed multi-member plans: 2020 VTDs dissolved by plan district,\n')
    f.write('// clipped to the city outline, simplified.\n')
    f.write('export const PLAN_GEO = {\n')
    for plan in PLANS:
        parts = collections.defaultdict(list)
        for geoid, g in vtds: parts[plan_of[plan][geoid]].append(g)
        geoms = {d: keep_polygons(unary_union(gs).intersection(city)) for d, gs in parts.items()}
        f.write(f' {plan}: ' + json.dumps(collection(geoms), separators=(',', ':')) + ',\n')
    f.write('};\n')

# ---- checks ----
for plan in PLANS:
    pop = collections.Counter()
    for b in blocks.values(): pop[b[plan]] += b['pop']
    print(plan, 'population:', dict(sorted(pop.items())), file=sys.stderr)
vap = collections.Counter()
for b in blocks.values(): vap[b['district']] += sum(b['race'].values())
print('council district VAP:', dict(sorted(vap.items())), file=sys.stderr)
print('wrote', OUT, release)
