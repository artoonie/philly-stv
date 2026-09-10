import test from 'node:test';
import assert from 'node:assert/strict';
import { plurality, limitedVoting, stv } from '../site/src/model/count.js';

const G = (obj) => Object.entries(obj).map(([id, votes]) => ({ id, votes }));
const tally = (w) => w.reduce((m, g) => (m[g] = (m[g] || 0) + 1, m), {});

test('plurality picks largest group', () => {
  assert.deepEqual(plurality(G({ D: 40, R: 35, I: 25 })).winners, ['D']);
});

test('limited voting 7 seats / 5 votes gives 5 + 2', () => {
  const r = limitedVoting(G({ D: 76, R: 12, O: 12 }), { seats: 7, votesPerVoter: 5 });
  assert.deepEqual(tally(r.winners), { D: 5, R: 2 });
});

test('STV 3 seats: 60/30/10 -> 2/1/0', () => {
  const r = stv(G({ A: 60, B: 30, C: 10 }), { seats: 3 });
  assert.deepEqual(tally(r.winners), { A: 2, B: 1 });
});

test('STV 3 seats: 55/25/20 -> 2/1/0 (largest remainder for third seat)', () => {
  const r = stv(G({ A: 55, B: 25, C: 20 }), { seats: 3 });
  // quota 25: A 2 quotas (rem 5), B 1 quota (rem 0), C 0 (rem 20). Seats: A2 B1, then C(20) vs A(5): C wins
  // Wait: A=55 -> 2 quotas = 50, remainder 5; B=25 exactly 1 quota; C=20. 3 seats filled: A,A,B.
  assert.deepEqual(tally(r.winners), { A: 2, B: 1 });
});

test('STV 3 seats: 50/22/28 -> 2/0/1', () => {
  const r = stv(G({ A: 50, B: 22, C: 28 }), { seats: 3 });
  assert.deepEqual(tally(r.winners), { A: 2, C: 1 });
});

test('STV 7 seats mirrors shares: 45/30/15/10 -> 3/2/1/1', () => {
  const r = stv(G({ A: 45, B: 30, C: 15, D: 10 }), { seats: 7 });
  // quota 12.5: A 3 (7.5 rem), B 2 (5 rem), C 1 (2.5 rem), D 0 (10 rem) => 6 filled, last seat to D (10)
  assert.deepEqual(tally(r.winners), { A: 3, B: 2, C: 1, D: 1 });
});

test('STV: group below quota with no remainder competition gets nothing', () => {
  const r = stv(G({ A: 90, B: 10 }), { seats: 3 });
  assert.deepEqual(tally(r.winners), { A: 3 });
});

test('STV: 7 seats, 51/49 -> 4/3', () => {
  const r = stv(G({ A: 51, B: 49 }), { seats: 7 });
  assert.deepEqual(tally(r.winners), { A: 4, B: 3 });
});

test('STV total elected equals seats and rounds recorded', () => {
  const r = stv(G({ A: 34, B: 33, C: 33 }), { seats: 3 });
  assert.equal(r.winners.length, 3);
  assert.ok(r.rounds.length >= 1);
});
