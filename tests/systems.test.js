import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT_TYPES, electorateFromCounts } from '../site/src/data/inputs.js';
import { districtOf } from '../site/src/model/electorate.js';
import { SYSTEMS, runAll } from '../site/src/model/systems.js';

test('layouts have the expected seats', () => {
  const seats = Object.fromEntries(SYSTEMS.map(s => [s.id, s.build().reduce((n, c) => n + c.seats, 0)]));
  assert.deepEqual(seats, { current: 17, 'stv-atlarge': 19, 'stv-7x3': 21, 'stv-5x5': 25 });
});

test('every input type covers every district of all three maps, and each system counts every voter once', () => {
  for (const t of INPUT_TYPES) {
    const { groups, shares, weights } = electorateFromCounts(t.counts);
    for (const [map, n] of [['council', 10], ['p7', 7], ['p5', 5]]) {
      assert.equal(new Set(Object.keys(shares).map(c => districtOf(c, map))).size, n, `${t.id} ${map}`);
    }
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const r of runAll(shares, weights, groups)) {
      const counted = r.contests.filter(c => !c.atLarge).reduce((s, c) => s + c.votes.reduce((a, g) => a + g.votes, 0), 0);
      assert.ok(Math.abs(counted - total) < 1e-6 * total, `${t.id} ${r.system.id}`);
      assert.equal(Object.values(r.seats).reduce((a, b) => a + b, 0), r.totalSeats);
    }
  }
});
