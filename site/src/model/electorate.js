// Electorate state: for one "input type" (party, race, ...), the share of each
// group in each cell of the city, plus the weight (number of people) of each cell
// so city-wide and district shares are population-weighted.
//
// Three district maps are compared and their lines cut across each other, so the
// unit is the cell: the area inside one district of each map. A cell id is
// "<council district>-<7-plan district>-<5-plan district>" (e.g. "3-2-4"), and a
// district of any map is the set of cells carrying its number in that position.

export const DISTRICT_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
// Position of each map's district number inside a cell id. Must match the cell ids the build scripts write:
// council district first, then the plans in the order of PLANS in scripts/build_data.py.
const MAP_INDEX = { council: 0, p7: 1, p5: 2 };

/** The district a cell belongs to in one of the maps. */
export const districtOf = (cell, map) => +String(cell).split('-')[MAP_INDEX[map]];

/** The cells of `shares` that make up one district of a map. */
export const cellsIn = (shares, map, district) => Object.keys(shares).filter(c => districtOf(c, map) === +district);

/** Deep-copy a shares table { [cell]: { [group]: share } } */
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

/** Population-weighted shares over `cells` (default: the whole city). weights: { [cell]: number } */
export function cityShares(shares, weights, groups, cells = Object.keys(shares)) {
  const out = Object.fromEntries(groups.map(g => [g, 0]));
  let W = 0;
  for (const d of cells) {
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
 * Move the city-wide share of `group` to `value`, adjusting every cell
 * proportionally: each cell's share of the group is scaled by the same
 * factor, then the cell is renormalized. Iterated (IPF-style) so the
 * population-weighted total lands exactly on the target. Pass `cells` to
 * move the share of just that part of the city.
 */
export function setCityShare(shares, weights, groups, group, value, cells = Object.keys(shares)) {
  value = Math.max(0, Math.min(1, value));
  let s = cloneShares(shares);
  for (let it = 0; it < 40; it++) {
    const cur = cityShares(s, weights, groups, cells)[group];
    if (Math.abs(cur - value) < 1e-9) break;
    const f = cur > 1e-12 ? value / cur : 0;
    for (const d of cells) {
      const nv = cur > 1e-12 ? Math.min(1, (s[d][group] ?? 0) * f) : value;
      s[d] = setShareInRow(s[d], group, nv, groups);
    }
  }
  return s;
}

/** Fit every cell to a full city-wide target vector (IPF-style). Used for URL presets. */
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

/** Set one group's share in one council district: its cells scale together, the rest of the city is untouched. */
export function setDistrictShare(shares, weights, groups, district, group, value) {
  return setCityShare(shares, weights, groups, group, value, cellsIn(shares, 'council', district));
}

/** Shares and weights summed up to the districts of one map: { shares: { [district]: row }, weights }. */
export function districtView(shares, weights, groups, map = 'council') {
  const out = { shares: {}, weights: {} };
  for (const d of [...new Set(Object.keys(shares).map(c => districtOf(c, map)))].sort((a, b) => a - b)) {
    const cells = cellsIn(shares, map, d);
    out.shares[d] = cityShares(shares, weights, groups, cells);
    out.weights[d] = cells.reduce((s, c) => s + (weights[c] ?? 1), 0);
  }
  return out;
}
