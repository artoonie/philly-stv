// Categorical colours: fixed slots (validated CVD-safe order), assigned by
// group position and never re-ordered when a group shrinks. Party gets the
// conventional semantic colours (blue / red) plus violet for everyone else.
const SLOTS = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'];
const PARTY = { Democrats: '--s1', Republicans: '--s8', 'Working Families': '--s7', Other: '--s7' };
const SYSTEM_VARS = { current: '--sys-today', 'stv-atlarge': '--sys-1', 'stv-5x3': '--sys-2', 'stv-10x3': '--sys-3' };

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
export function groupColors(inputType, groups) {
  const out = {};
  groups.forEach((g, i) => {
    const v = inputType.palette === 'party' && PARTY[g] ? PARTY[g] : SLOTS[i % SLOTS.length];
    out[g] = cssVar(v);
  });
  return out;
}
export function systemColor(systemId) { return cssVar(SYSTEM_VARS[systemId] || '--sys-today'); }
export const ink = () => cssVar('--ink');
export const ink2 = () => cssVar('--ink-2');
export const muted = () => cssVar('--muted');
export const grid = () => cssVar('--grid');
export const surface = () => cssVar('--surface');
