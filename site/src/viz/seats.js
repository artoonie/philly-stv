import { registerViz, tooltip, pct, legend } from './registry.js';
import { ink2, muted } from './palette.js';

/** Hemicycle layout: returns [{x, y, r}] for n seats in a semicircle of given width. */
function hemicycle(n, width) {
  const rows = n <= 10 ? 1 : n <= 20 ? 2 : n <= 32 ? 3 : 4;
  const R = width / 2 - 6, inner = R * (rows === 1 ? 0.55 : 0.42);
  const radii = [];
  for (let i = 0; i < rows; i++) radii.push(inner + (R - inner) * (rows === 1 ? 0.5 : i / (rows - 1)));
  const total = radii.reduce((s, r) => s + r, 0);
  let counts = radii.map(r => Math.floor(n * r / total));
  let left = n - counts.reduce((a, b) => a + b, 0);
  for (let i = rows - 1; left > 0; i = (i - 1 + rows) % rows, left--) counts[i]++;
  const pts = [];
  radii.forEach((r, i) => {
    const k = counts[i];
    for (let j = 0; j < k; j++) {
      const a = k === 1 ? Math.PI / 2 : Math.PI - (Math.PI * j) / (k - 1);
      pts.push({ x: width / 2 + r * Math.cos(a), y: R + 8 - r * Math.sin(a), a });
    }
  });
  // sort by angle so seats fill left to right
  pts.sort((p, q) => q.a - p.a);
  const dot = Math.max(4.5, Math.min(9, (R - inner) / (rows - 1 || 1) / 2.6));
  return { pts, dot, height: R + 20 };
}

registerViz({
  id: 'seats', order: 40,
  title: 'Seat by seat',
  lede: 'Every dot is one council member, coloured by the group whose voters elected them.',
  render(el, ctx) {
    const d3 = window.d3;
    const { groups, colors, results, city } = ctx;
    const wrap = document.createElement('div'); wrap.className = 'multiples';
    const tip = tooltip();
    for (const r of results) {
      const m = document.createElement('div'); m.className = 'multiple';
      m.innerHTML = `<h4>${r.system.short}${r.system.stv ? '<span class="stv-tag">STV</span>' : ''}</h4><p class="sub">${r.totalSeats} seats · mirror score ${r.metrics.match}</p>`;
      const W = 220; const { pts, dot, height } = hemicycle(r.totalSeats, W);
      const seatList = groups.flatMap(g => Array(r.seats[g]).fill(g));
      const svg = d3.select(m).append('svg').attr('viewBox', `0 0 ${W} ${height}`).attr('role', 'img');
      svg.selectAll('circle').data(pts.map((p, i) => ({ ...p, g: seatList[i] }))).join('circle')
        .attr('cx', d => d.x).attr('cy', d => d.y).attr('r', dot).attr('fill', d => colors[d.g]).attr('stroke', 'var(--surface)').attr('stroke-width', 1.5)
        .on('mousemove', (ev, d) => tip.show(`<b>${d.g}</b> seat · ${r.seats[d.g]} of ${r.totalSeats} (${pct(r.seats[d.g] / r.totalSeats)}); voters ${pct(city[d.g], 1)}`, ev)).on('mouseleave', () => tip.hide());
      wrap.appendChild(m);
    }
    el.appendChild(wrap);
    legend(el, groups.map(g => ({ color: colors[g], label: g })));
  },
});
