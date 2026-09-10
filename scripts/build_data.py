#!/usr/bin/env python3
"""Rebuild site/src/data/acs.js from public sources.

Sources
- Council district boundaries (2024 map): City of Philadelphia ArcGIS feature service
  "Council_Districts_2024" (the map adopted in the 2022 redistricting, first used in 2023).
- American Community Survey 5-year estimates at block-group (tract for nativity)
  level via the Census Reporter API (api.censusreporter.org, "latest" release).

Block groups don't nest inside council districts, so each block group's estimates are
split between districts in proportion to the area of overlap (area-weighted crosswalk).

Usage:  python3 -m venv .venv && .venv/bin/pip install shapely && .venv/bin/python scripts/build_data.py
"""
import json, collections, os, sys, urllib.request
from shapely.geometry import shape, mapping

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '.cache')
OUT = os.path.join(HERE, '..', 'site', 'src', 'data')
os.makedirs(CACHE, exist_ok=True)

DISTRICTS_URL = ('https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/'
                 'Council_Districts_2024/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson')
CR_DATA = 'https://api.censusreporter.org/1.0/data/show/latest?table_ids={table}&geo_ids={sumlev}|05000US42101'
CR_GEO = 'https://api.censusreporter.org/1.0/geo/show/tiger2023?geo_ids={sumlev}|05000US42101'

def fetch(url, name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print('fetching', name, file=sys.stderr)
        with urllib.request.urlopen(url, timeout=300) as r, open(path, 'wb') as f:
            f.write(r.read())
    return json.load(open(path))

districts = fetch(DISTRICTS_URL, 'districts2024.geojson')
D = {int(f['properties']['district_num']): shape(f['geometry']).buffer(0) for f in districts['features']}

def build_weights(g):
    W = {}
    for f in g['features']:
        geom = shape(f['geometry']).buffer(0)
        if geom.area == 0: continue
        w = {d: geom.intersection(p).area / geom.area for d, p in D.items()}
        w = {d: v for d, v in w.items() if v > 0}
        s = sum(w.values())
        if s > 0: W[f['properties']['geoid']] = {d: v / s for d, v in w.items()}
    return W

Wbg = build_weights(fetch(CR_GEO.format(sumlev=150), 'bgs.geojson'))
Wtr = build_weights(fetch(CR_GEO.format(sumlev=140), 'tracts.geojson'))

def load(table, sumlev):
    d = fetch(CR_DATA.format(table=table, sumlev=sumlev), f'{sumlev}_{table}.json')
    rel = d.get('release', {})
    return {gid: v[table]['estimate'] for gid, v in d['data'].items()}, rel.get('name', 'ACS 5-year')

def agg(est, W, cols):
    out = {d: collections.OrderedDict((k, 0.0) for k in cols) for d in D}
    for gid, e in est.items():
        for d, frac in W.get(gid, {}).items():
            for k, ids in cols.items():
                out[d][k] += frac * sum((e.get(i) or 0) for i in ids)
    return out

def rng(t, a, b): return [f"{t}{i:03d}" for i in range(a, b + 1)]

results, releases = {}, {}
b01, releases['B01001'] = load('B01001', 150)
results['gender'] = agg(b01, Wbg, {'Women': rng('B01001', 31, 49), 'Men': rng('B01001', 7, 25)})
results['age'] = agg(b01, Wbg, {'18–34': rng('B01001', 7, 12) + rng('B01001', 31, 36),
                                '35–64': rng('B01001', 13, 19) + rng('B01001', 37, 43),
                                '65+': rng('B01001', 20, 25) + rng('B01001', 44, 49)})
b03, releases['B03002'] = load('B03002', 150)
r = agg(b03, Wbg, {'Total': ['B03002001'], 'Black': ['B03002004'], 'White': ['B03002003'], 'Hispanic': ['B03002012'], 'Asian': ['B03002006']})
for d in r:
    tot = r[d].pop('Total'); r[d]['Other'] = tot - sum(r[d].values())
results['race'] = r
b25, releases['B25044'] = load('B25044', 150)
r = agg(b25, Wbg, {'Total': ['B25044001'], 'No car': ['B25044003', 'B25044010']})
for d in r:
    tot = r[d].pop('Total'); nc = r[d].pop('No car'); r[d]['Has a car'] = tot - nc; r[d]['No car'] = nc
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

out = {k: {str(d): {kk: round(vv) for kk, vv in v[d].items()} for d in sorted(v)} for k, v in results.items()}
release = sorted(set(releases.values()))
with open(os.path.join(OUT, 'acs.js'), 'w') as f:
    f.write('// Generated by scripts/build_data.py — do not edit by hand.\n')
    f.write(f'export const ACS_RELEASE = {json.dumps(", ".join(release))};\n')
    f.write('export const ACS = ' + json.dumps(out, ensure_ascii=False, indent=1) + ';\n')

# simplified district outlines for the map
feats = []
for f in districts['features']:
    g = shape(f['geometry']).simplify(0.0008, preserve_topology=True)
    gj = mapping(g)
    def rnd(c):
        if isinstance(c, (list, tuple)):
            if c and isinstance(c[0], float): return [round(c[0], 4), round(c[1], 4)]
            return [rnd(x) for x in c]
        return c
    feats.append({'type': 'Feature', 'properties': {'district': int(f['properties']['district_num'])}, 'geometry': {'type': gj['type'], 'coordinates': rnd(gj['coordinates'])}})
feats.sort(key=lambda f: f['properties']['district'])
with open(os.path.join(OUT, 'districts.geojson.js'), 'w') as f:
    f.write('// Generated by scripts/build_data.py — City of Philadelphia council districts (2024 map), simplified.\n')
    f.write('export default ' + json.dumps({'type': 'FeatureCollection', 'features': feats}, separators=(',', ':')) + ';\n')
print('wrote', OUT, release)
