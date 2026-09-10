// Electorate state: for one "input type" (party, race, ...), the share of each
// group in each of the 10 council districts, plus the weight (number of people)
// of each district so city-wide shares are population-weighted.

export const DISTRICT_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Deep-copy a shares table { [district]: { [group]: share } } */
export function cloneShares(shares) {
  const out = {};
  for (const d of Object.keys(shares)) out[d] = { ...shares[d] };
  return out;
}

/** Normalize a district's shares to sum to 1. */
export function normalize(row) {
  const s = Object.values(row).reduce((a, b) => a + b, 0);
  if (s <= 0) return row;
  for (const k of Object.keys(row)) row[k] = row[k] / s;
  return row;
}

/** Population-weighted city-wide shares. weights: { [district]: number } */
export function cityShares(shares, weights, groups) {
  const out = Object.fromEntries(groups.map(g => [g, 0]));
  let W = 0;
  for (const d of Object.keys(shares)) {
    const w = weights[d] ?? 1;
    W += w;
    for (const g of groups) out[g] += (shares[d][g] ?? 0) * w;
  }
  for (const g of groups) out[g] /= W || 1;
  return out;
}

/**
 * Set one group's share inside a single row (district or city vector),
 * scaling the other groups proportionally so the row still sums to 1.
 */
export function setShareInRow(row, group, value, groups) {
  value = Math.max(0, Math.min(1, value));
  const others = groups.filter(g => g !== group);
  const otherSum = others.reduce((s, g) => s + (row[g] ?? 0), 0);
  const out = { ...row, [group]: value };
  if (otherSum > 1e-12) {
    for (const g of others) out[g] = (row[g] / otherSum) * (1 - value);
  } else {
    for (const g of others) out[g] = (1 - value) / others.length;
  }
  return out;
}

/**
 * Move the city-wide share of `group` to `value`, adjusting every district
 * proportionally: each district's share of the group is scaled by the same
 * factor, then the district is renormalized. Iterated (IPF-style) so the
 * population-weighted city total lands exactly on the target.
 */
export function setCityShare(shares, weights, groups, group, value) {
  value = Math.max(0, Math.min(1, value));
  let s = cloneShares(shares);
  for (let it = 0; it < 40; it++) {
    const cur = cityShares(s, weights, groups)[group];
    if (Math.abs(cur - value) < 1e-9) break;
    const f = cur > 1e-12 ? value / cur : 0;
    for (const d of Object.keys(s)) {
      const nv = cur > 1e-12 ? Math.min(1, (s[d][group] ?? 0) * f) : value;
      s[d] = setShareInRow(s[d], group, nv, groups);
    }
  }
  return s;
}

/** Fit every district to a full city-wide target vector (IPF-style). Used for URL presets. */
export function fitToCityTarget(shares, weights, groups, target, iters = 40) {
  let s = cloneShares(shares);
  for (let it = 0; it < iters; it++) {
    const cur = cityShares(s, weights, groups);
    let maxErr = 0;
    for (const g of groups) {
      const f = cur[g] > 1e-12 ? target[g] / cur[g] : (target[g] > 0 ? 1 : 0);
      maxErr = Math.max(maxErr, Math.abs(target[g] - cur[g]));
      for (const d of Object.keys(s)) {
        // a group that is zero everywhere but has a positive target gets seeded evenly
        if (cur[g] <= 1e-12 && target[g] > 0) s[d][g] = target[g];
        else s[d][g] = (s[d][g] ?? 0) * f;
      }
    }
    for (const d of Object.keys(s)) normalize(s[d]);
    if (maxErr < 1e-7) break;
  }
  return s;
}

/** Set one group's share in one district (others in that district scale proportionally). */
export function setDistrictShare(shares, groups, district, group, value) {
  const s = cloneShares(shares);
  s[district] = setShareInRow(s[district], group, value, groups);
  return s;
}
