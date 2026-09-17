#!/usr/bin/env python3
"""Download division-level results for the contests the site uses into scripts/data/.

Source: City Commissioners' results, published as the OpenDataPhilly "Election Results"
ArcGIS layer. Output CSVs (division,candidate,party,votes) are committed so the rest of
the build is reproducible offline. Usage: python3 scripts/fetch_elections.py
"""
import csv, json, os, sys, urllib.parse, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
URL = 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/Election_Results/FeatureServer/0/query'
CONTESTS = {
    'atlarge_2023_by_division.csv': ('2023 General', 'COUNCIL AT-LARGE'),
    'mayor_primary_2023_by_division.csv': ('2023 Primary', 'MAYOR'),
    'president_2024_by_division.csv': ('2024 General', 'PRESIDENT AND VICE-PRESIDENT OF THE UNITED STATES'),
}

def rows(election, contest):
    offset = 0
    while True:
        q = urllib.parse.urlencode({
            'where': f"election_name='{election}' AND contest_name='{contest}'",
            'outFields': 'ward,division,precinct_name,candidate_name,candidate_party,total_votes',
            'orderByFields': 'objectid', 'returnGeometry': 'false', 'f': 'json',
            'resultOffset': offset, 'resultRecordCount': 2000})
        with urllib.request.urlopen(f'{URL}?{q}', timeout=300) as r:
            d = json.load(r)
        if 'error' in d: raise SystemExit(d['error'])
        for f in d['features']: yield f['attributes']
        offset += len(d['features'])
        print(f'  {election} / {contest}: {offset}', file=sys.stderr)
        if not d.get('exceededTransferLimit') or not d['features']: break

for name, (election, contest) in CONTESTS.items():
    out = []
    for a in rows(election, contest):
        ward, div = (a['ward'] or '').strip(), (a['division'] or '').strip()
        # non-geographic buckets (provisional / federal ballots) have no ward-division
        key = f'{int(ward):02d}-{int(div):02d}' if ward.isdigit() and div.isdigit() else (a['precinct_name'] or '').strip()
        out.append((key, (a['candidate_name'] or '').strip(), (a['candidate_party'] or '').strip(), a['total_votes'] or 0))
    out.sort()
    with open(os.path.join(HERE, 'data', name), 'w', newline='') as f:
        w = csv.writer(f); w.writerow(['division', 'candidate', 'party', 'votes']); w.writerows(out)
    print('wrote', name, len(out), 'rows')
