import test from 'node:test';
import assert from 'node:assert/strict';
import { cityShares, setCityShare, setDistrictShare, districtView } from '../site/src/model/electorate.js';

const groups = ['D', 'R'];
const shares = { 1: { D: 0.9, R: 0.1 }, 2: { D: 0.8, R: 0.2 } };
const weights = { 1: 100, 2: 100 };

test('city shares are weighted averages', () => {
  const c = cityShares(shares, weights, groups);
  assert.ok(Math.abs(c.D - 0.85) < 1e-9);
});

test('adjusting city-wide 85/15 -> 90/10 scales districts proportionally', () => {
  const s = setCityShare(shares, weights, groups, 'D', 0.9);
  const c = cityShares(s, weights, groups);
  assert.ok(Math.abs(c.D - 0.9) < 1e-6, `got ${c.D}`);
  // district 1 gets 0.9*(90/85) then renormalized -> ~0.953 ; district 2 -> ~0.847
  assert.ok(Math.abs(s[1].D - 0.9 * 0.9 / 0.85) < 1e-6);
  assert.ok(Math.abs(s[2].D - 0.8 * 0.9 / 0.85) < 1e-6);
});

test('multi-group city adjustment converges and keeps rows normalized', () => {
  const g3 = ['A', 'B', 'C'];
  const sh = { 1: { A: 0.5, B: 0.3, C: 0.2 }, 2: { A: 0.2, B: 0.5, C: 0.3 }, 3: { A: 0.6, B: 0.1, C: 0.3 } };
  const w = { 1: 10, 2: 30, 3: 20 };
  const s = setCityShare(sh, w, g3, 'C', 0.5);
  const c = cityShares(s, w, g3);
  assert.ok(Math.abs(c.C - 0.5) < 1e-6);
  for (const d of Object.keys(s)) {
    const sum = Object.values(s[d]).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
  }
  // the untouched groups keep (approximately) their relative sizes
  const before = cityShares(sh, w, g3);
  assert.ok(Math.abs(c.A / c.B - before.A / before.B) < 0.05);
});

// cells are "<council district>-<7-plan district>-<5-plan district>"
const cellShares = { '1-1-1': { D: 0.9, R: 0.1 }, '1-2-1': { D: 0.7, R: 0.3 }, '2-2-1': { D: 0.6, R: 0.4 } };
const cellWeights = { '1-1-1': 100, '1-2-1': 300, '2-2-1': 200 };

test('district view sums cells up to the districts of a map', () => {
  const v = districtView(cellShares, cellWeights, groups);
  assert.deepEqual(v.weights, { 1: 400, 2: 200 });
  assert.ok(Math.abs(v.shares[1].D - 0.75) < 1e-9);
  const p7 = districtView(cellShares, cellWeights, groups, 'p7');
  assert.ok(Math.abs(p7.shares[2].D - 0.66) < 1e-9);
});

test('district adjustment moves the whole council district and nothing else', () => {
  const s = setDistrictShare(cellShares, cellWeights, groups, 1, 'R', 0.5);
  assert.deepEqual(s['2-2-1'], cellShares['2-2-1']);
  assert.ok(Math.abs(districtView(s, cellWeights, groups).shares[1].R - 0.5) < 1e-6);
  assert.ok(s['1-2-1'].R > s['1-1-1'].R, 'cells keep their relative lean');
});
