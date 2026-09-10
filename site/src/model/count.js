// Vote-counting methods. Every method takes a list of groups ({id, votes})
// and returns { winners: [groupId, ...], rounds: [...] }.
// Voters are modelled as perfect blocs: every voter in a group ranks only
// that group's candidates (see README "Assumptions").

const EPS = 1e-9;

/** Single-winner plurality: the largest group wins. Ties -> earlier group in list. */
export function plurality(groups) {
  let best = null;
  for (const g of groups) if (!best || g.votes > best.votes + EPS) best = g;
  return { winners: best ? [best.id] : [], rounds: [] };
}

/**
 * Limited voting, as Philadelphia uses for its 7 at-large seats: each voter
 * marks up to `votesPerVoter` candidates, and the `seats` highest vote-getters win.
 * With bloc voting every group fields `votesPerVoter` candidates and each of
 * them receives the whole group's vote, so the biggest group takes
 * `votesPerVoter` seats and the next group takes the remainder.
 */
export function limitedVoting(groups, { seats, votesPerVoter }) {
  const cands = [];
  groups.forEach((g, gi) => {
    for (let i = 0; i < votesPerVoter; i++) cands.push({ group: g.id, gi, votes: g.votes, i });
  });
  cands.sort((a, b) => (b.votes - a.votes) || (a.gi - b.gi) || (a.i - b.i));
  return { winners: cands.slice(0, seats).map(c => c.group), rounds: [] };
}

/**
 * Single transferable vote, Weighted Inclusive Gregory Method, Droop quota.
 * Each group fields `seats` candidates. Every voter in a group ranks the
 * group's candidates 1..n in the same order, and ranks nobody else
 * (the strict bloc-voting assumption).
 */
export function stv(groups, { seats }) {
  const total = groups.reduce((s, g) => s + g.votes, 0);
  const quota = total / (seats + 1) + EPS; // exact Droop quota
  const cands = [];
  groups.forEach((g, gi) => {
    for (let i = 0; i < seats; i++) cands.push({ id: `${g.id}#${i + 1}`, group: g.id, gi, i, status: 'continuing', votes: 0 });
  });
  const byId = new Map(cands.map(c => [c.id, c]));
  // ballot piles: each ballot = { prefs: [candId...], weight }
  const ballots = groups.map(g => ({ prefs: cands.filter(c => c.group === g.id).map(c => c.id), weight: g.votes })).filter(b => b.weight > 0);

  const continuing = () => cands.filter(c => c.status === 'continuing');
  const elected = () => cands.filter(c => c.status === 'elected');

  function tally() {
    for (const c of cands) c.votes = 0;
    let exhausted = 0;
    for (const b of ballots) {
      const first = b.prefs.find(id => byId.get(id).status === 'continuing');
      if (first) byId.get(first).votes += b.weight; else exhausted += b.weight;
    }
    return exhausted;
  }
  // Ballots sitting with an elected candidate keep flowing at the surplus fraction.
  // We implement WIGM by keeping ballots on the elected candidate and re-weighting them.
  const rounds = [];
  let exhausted = 0;
  const snapshot = (note) => rounds.push({
    note,
    exhausted,
    quota,
    candidates: cands.map(c => ({ id: c.id, group: c.group, votes: c.votes, status: c.status })),
  });

  exhausted = tally();
  snapshot('First preferences');
  let guard = 0;
  while (elected().length < seats && guard++ < 1000) {
    const cont = continuing();
    if (elected().length + cont.length <= seats) {
      // remaining candidates fill the remaining seats
      cont.sort((a, b) => (b.votes - a.votes) || (a.gi - b.gi) || (a.i - b.i));
      for (const c of cont) if (elected().length < seats) c.status = 'elected';
      snapshot('Remaining candidates elected to fill seats');
      break;
    }
    const over = cont.filter(c => c.votes >= quota).sort((a, b) => (b.votes - a.votes) || (a.gi - b.gi) || (a.i - b.i));
    if (over.length) {
      const c = over[0];
      c.status = 'elected';
      const surplus = c.votes - quota;
      const factor = c.votes > 0 ? surplus / c.votes : 0;
      // Transfer: every ballot currently on c continues at weight * factor
      for (const b of ballots) {
        const first = b.prefs.find(id => byId.get(id).status === 'continuing' || id === c.id);
        if (first === c.id) b.weight *= factor;
      }
      c.votes = quota;
      // re-tally continuing candidates only
      const ex = tally();
      exhausted = ex;
      for (const e of elected()) e.votes = quota; // elected candidates hold exactly a quota
      snapshot(`${c.id} elected; surplus ${fmt(surplus)} transferred`);
      continue;
    }
    // eliminate: all candidates with zero votes at once (they cannot affect the outcome),
    // otherwise the single lowest candidate
    cont.sort((a, b) => (a.votes - b.votes) || (b.gi - a.gi) || (b.i - a.i));
    const zeros = cont.filter(c => c.votes <= EPS);
    const need = seats - elected().length;
    if (zeros.length > 0 && cont.length - zeros.length >= need) {
      for (const z of zeros) z.status = 'eliminated';
      exhausted = tally();
      for (const e of elected()) e.votes = quota;
      snapshot(`${zeros.length} candidate${zeros.length > 1 ? 's' : ''} with no votes eliminated`);
      continue;
    }
    const loser = cont[0];
    loser.status = 'eliminated';
    exhausted = tally();
    for (const e of elected()) e.votes = quota;
    snapshot(`${loser.id} eliminated; ${fmt(loser.votes)} votes transferred`);
  }
  return { winners: elected().map(c => c.group), rounds, quota };
}

function fmt(x) { return Math.round(x * 10) / 10; }
