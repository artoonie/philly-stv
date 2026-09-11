import { plurality, limitedVoting, stv } from './count.js';
import { DISTRICT_IDS } from './electorate.js';

// "Nearby" pairings used to combine 10 districts into 5 (no fancy redistricting):
// 1+2 South Philly & Center City, 3+4 West & Northwest-west, 5+7 North Philly & Kensington,
// 8+9 Northwest & Upper North, 6+10 Northeast.
export const MERGED_DISTRICTS = [
  { id: 'A', name: 'South & Center City (1+2)', districts: [1, 2] },
  { id: 'B', name: 'West & Northwest (3+4)', districts: [3, 4] },
  { id: 'C', name: 'North & Kensington (5+7)', districts: [5, 7] },
  { id: 'D', name: 'Germantown to Oak Lane (8+9)', districts: [8, 9] },
  { id: 'E', name: 'Northeast (6+10)', districts: [6, 10] },
];

export const SYSTEMS = [
  {
    id: 'current',
    short: 'Today',
    name: 'Today’s system',
    summary: '10 single-member districts + 7 at-large seats by limited voting (vote for 5, top 7 win)',
    detail: 'How Philly votes now. Each of 10 districts elects one member, winner takes all. For the 7 at-large seats you pick 5 names and the top 7 win, which by rule gives 5 to the biggest party and 2 to the runner-up.',
    stv: false,
    build: () => [
      ...DISTRICT_IDS.map(d => ({ id: `d${d}`, name: `District ${d}`, districts: [d], seats: 1, method: 'plurality' })),
      { id: 'al', name: 'At-large', districts: DISTRICT_IDS, seats: 7, method: 'limited', votesPerVoter: 5 },
    ],
  },
  {
    id: 'stv-atlarge',
    short: 'STV at-large',
    name: 'Option 1 (STV at-large): STV for the 7 at-large seats',
    summary: 'Keep the 10 single-member districts; elect the 7 at-large seats with STV (one city-wide 7-winner contest)',
    detail: 'Smallest change. Keep the 10 one-member districts as they are; elect the 7 at-large seats in one city-wide ranked-choice contest so they split in proportion to the vote.',
    stv: true,
    build: () => [
      ...DISTRICT_IDS.map(d => ({ id: `d${d}`, name: `District ${d}`, districts: [d], seats: 1, method: 'plurality' })),
      { id: 'al', name: 'At-large', districts: DISTRICT_IDS, seats: 7, method: 'stv' },
    ],
  },
  {
    id: 'stv-5x3',
    short: '5 × 3 STV',
    name: 'Option 2 (5 × 3 STV): 5 districts, 3 seats each',
    summary: 'No at-large seats; neighbouring districts paired into 5, each electing 3 members by STV (15 total)',
    detail: 'Fewer, bigger districts. Pair today’s districts with their neighbours to make 5, and let each elect 3 members by ranked choice. No at-large seats.',
    stv: true,
    build: () => MERGED_DISTRICTS.map(m => ({ id: `m${m.id}`, name: m.name, districts: m.districts, seats: 3, method: 'stv' })),
  },
  {
    id: 'stv-10x3',
    short: '10 × 3 STV',
    name: 'Option 3 (10 × 3 STV): 10 districts, 3 seats each',
    summary: 'Today’s 10 districts, each electing 3 members by STV (30 total)',
    detail: 'Same districts, three voices each. Keep today’s 10 districts but let each elect 3 members by ranked choice, so a district’s minority gets a seat too. A bigger council.',
    stv: true,
    build: () => DISTRICT_IDS.map(d => ({ id: `d${d}`, name: `District ${d}`, districts: [d], seats: 3, method: 'stv' })),
  },
];

/** Vote totals for a set of districts: shares × weights. */
export function contestVotes(contest, shares, weights, groups) {
  const votes = Object.fromEntries(groups.map(g => [g, 0]));
  for (const d of contest.districts) {
    const w = weights[d] ?? 1;
    for (const g of groups) votes[g] += (shares[d][g] ?? 0) * w;
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
  const gv = contestVotes({ districts: DISTRICT_IDS }, shares, weights, groups);
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
