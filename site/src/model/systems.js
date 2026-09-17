import { plurality, limitedVoting, stv } from './count.js';
import { DISTRICT_IDS, districtOf } from './electorate.js';

// Two proposed multi-member maps, drawn in Dave's Redistricting from 2020 precincts with equal
// populations (scripts/data/plans/). Keys match PLANS in scripts/build_data.py and PLAN_GEO in
// data/plans.geojson.js; `areas` must list every district number of the plan, because the contests
// are built from it. Area names are rough guides to where each district sits, written by hand after
// looking at the map: when a plan is replaced its numbering changes, so re-check every name
// (README, "Swapping in a new plan").
export const PLANS = {
  p7: { name: '7-district plan', areas: { 1: 'Far Northeast', 2: 'Northwest', 3: 'South', 4: 'Center City & River Wards', 5: 'Lower Northeast', 6: 'North', 7: 'West' } },
  p5: { name: '5-district plan', areas: { 1: 'Northeast', 2: 'Northwest & Upper North', 3: 'South & Center City', 4: 'Kensington & Lower Northeast', 5: 'West & North Central' } },
};

const councilDistricts = () => DISTRICT_IDS.map(d => ({ id: `d${d}`, name: `District ${d}`, map: 'council', district: d, seats: 1, method: 'plurality' }));
const planDistricts = (map, seats) => Object.entries(PLANS[map].areas).map(([d, area]) => ({ id: `${map}-${d}`, name: `District ${d} (${area})`, map, district: +d, seats, method: 'stv' }));

// `map` is the district map a system draws its (non-at-large) contests on.
export const SYSTEMS = [
  {
    id: 'current',
    short: 'Today',
    name: 'Today’s system',
    summary: '10 single-member districts + 7 at-large seats by limited voting (vote for 5, top 7 win)',
    detail: 'How Philly votes now. Each of 10 districts elects one member, winner takes all. For the 7 at-large seats you pick 5 names and the top 7 win, which by rule gives 5 to the biggest party and 2 to the runner-up.',
    stv: false, map: 'council',
    build: () => [...councilDistricts(), { id: 'al', name: 'At-large', atLarge: true, seats: 7, method: 'limited', votesPerVoter: 5 }],
  },
  {
    id: 'stv-atlarge',
    short: 'STV at-large',
    name: 'Option 1 (STV at-large): 9 at-large seats by STV',
    summary: 'Keep the 10 single-member districts; elect 9 at-large seats with STV (one city-wide 9-winner contest)',
    detail: 'Smallest change. Keep the 10 one-member districts as they are; grow the at-large bench from 7 to 9 and elect it in one city-wide ranked-choice contest so the seats split in proportion to the vote.',
    stv: true, map: 'council',
    build: () => [...councilDistricts(), { id: 'al', name: 'At-large', atLarge: true, seats: 9, method: 'stv' }],
  },
  {
    id: 'stv-7x3',
    short: '7 × 3 STV',
    name: 'Option 2 (7 × 3 STV): 7 districts, 3 seats each',
    summary: 'No at-large seats; a new map of 7 equal-population districts, each electing 3 members by STV (21 total)',
    detail: 'A new map of 7 bigger districts with equal populations, each electing 3 members by ranked choice, so a district’s minority gets a seat too. No at-large seats.',
    stv: true, map: 'p7',
    build: () => planDistricts('p7', 3),
  },
  {
    id: 'stv-5x5',
    short: '5 × 5 STV',
    name: 'Option 3 (5 × 5 STV): 5 districts, 5 seats each',
    summary: 'No at-large seats; a new map of 5 equal-population districts, each electing 5 members by STV (25 total)',
    detail: 'A new map of 5 large districts with equal populations, each electing 5 members by ranked choice. With 5 seats, a group needs about a sixth of a district’s votes to win one. No at-large seats.',
    stv: true, map: 'p5',
    build: () => planDistricts('p5', 5),
  },
];

const inContest = (contest, cell) => contest.atLarge || districtOf(cell, contest.map) === contest.district;

/** Vote totals for a contest: shares × weights over the cells inside it. */
export function contestVotes(contest, shares, weights, groups) {
  const votes = Object.fromEntries(groups.map(g => [g, 0]));
  for (const c of Object.keys(shares)) {
    if (!inContest(contest, c)) continue;
    const w = weights[c] ?? 1;
    for (const g of groups) votes[g] += (shares[c][g] ?? 0) * w;
  }
  return groups.map(g => ({ id: g, votes: votes[g] }));
}

export function runContest(contest, shares, weights, groups) {
  const gv = contestVotes(contest, shares, weights, groups);
  let r;
  if (contest.method === 'plurality') r = plurality(gv);
  else if (contest.method === 'limited') r = limitedVoting(gv, { seats: contest.seats, votesPerVoter: contest.votesPerVoter });
  else r = stv(gv, { seats: contest.seats });
  const total = gv.reduce((s, g) => s + g.votes, 0);
  return { ...contest, votes: gv, voteShare: Object.fromEntries(gv.map(g => [g.id, g.votes / (total || 1)])), winners: r.winners, rounds: r.rounds || [], quota: r.quota };
}

/** Run every system. Returns [{ system, contests, seats: {group: n}, totalSeats, metrics }] */
export function runAll(shares, weights, groups) {
  const city = cityVotes(shares, weights, groups);
  return SYSTEMS.map(system => {
    const contests = system.build().map(c => runContest(c, shares, weights, groups));
    const seats = Object.fromEntries(groups.map(g => [g, 0]));
    for (const c of contests) for (const w of c.winners) seats[w]++;
    const totalSeats = contests.reduce((s, c) => s + c.seats, 0);
    return { system, contests, seats, totalSeats, metrics: metrics(city, seats, totalSeats, groups) };
  });
}

export function cityVotes(shares, weights, groups) {
  const gv = contestVotes({ atLarge: true }, shares, weights, groups);
  const total = gv.reduce((s, g) => s + g.votes, 0);
  return Object.fromEntries(gv.map(g => [g.id, g.votes / (total || 1)]));
}

/**
 * Proportionality metrics.
 *  - loosemoreHanby: ½ Σ|vote% − seat%| — the share of seats that would have to
 *    change hands for the council to mirror the voters. 0 = perfect mirror.
 *  - match: 100 × (1 − LH) — the "mirror score" shown to readers.
 *  - gallagher: √(½ Σ (vote% − seat%)²) — the least-squares index.
 *  - shutOut: groups with ≥ 5% of voters and zero seats.
 */
export function metrics(city, seats, totalSeats, groups) {
  let lh = 0, sq = 0, shutOut = [];
  for (const g of groups) {
    const v = city[g] ?? 0, s = (seats[g] ?? 0) / (totalSeats || 1);
    lh += Math.abs(v - s); sq += (v - s) ** 2;
    if (v >= 0.05 && (seats[g] ?? 0) === 0) shutOut.push(g);
  }
  lh /= 2;
  return { loosemoreHanby: lh, match: Math.round(100 * (1 - lh)), gallagher: Math.sqrt(sq / 2), shutOut };
}
