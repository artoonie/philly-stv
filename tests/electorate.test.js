import test from 'node:test';
import assert from 'node:assert/strict';
import { cityShares, setCityShare, setDistrictShare } from '../site/src/model/electorate.js';

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

test('district adjustment only touches that district', () => {
  const s = setDistrictShare(shares, groups, 1, 'R', 0.5);
  assert.deepEqual(s[2], shares[2]);
  assert.ok(Math.abs(s[1].D - 0.5) < 1e-9);
});
