import { registerViz, tooltip, pct, legend } from './registry.js';
import { muted, ink2, grid } from './palette.js';
import COUNCIL_GEO from '../data/districts.geojson.js';
import { PLAN_GEO } from '../data/plans.geojson.js';

const GEO = { council: COUNCIL_GEO, ...PLAN_GEO };

registerViz({
  id: 'map', order: 50,
  title: 'Where each seat comes from',
  lede: 'District winners on the map (one dot per seat); at-large seats sit below the map. Single-winner districts are shaded by their winner. The 7- and 5-district layouts use their own new maps.',
  render(el, ctx) {
    const d3 = window.d3;
    const { groups, colors, results } = ctx;
    const wrap = document.createElement('div'); wrap.className = 'multiples';
    const tip = tooltip();
    const W = 240, H = 250;
    const proj = d3.geoMercator().fitExtent([[6, 6], [W - 6, H - 6]], COUNCIL_GEO);
    const path = d3.geoPath(proj);
    for (const r of results) {
      const geo = GEO[r.system.map];
      const m = document.createElement('div'); m.className = 'multiple';
      m.innerHTML = `<h4>${r.system.short}${r.system.stv ? '<span class="stv-tag">STV</span>' : ''}</h4><p class="sub">${r.system.summary ?? r.system.detail ?? ''}</p>`;
      const svg = d3.select(m).append('svg').attr('viewBox', `0 0 ${W} ${H + 26}`).attr('role', 'img');
      const districtContests = r.contests.filter(c => !c.atLarge);
      const contestOf = Object.fromEntries(districtContests.map(c => [c.district, c]));
      const fillFor = f => { const c = contestOf[f.properties.district]; return c && c.seats === 1 ? colors[c.winners[0]] : null; }; // shaded when single winner
      svg.append('g').selectAll('path').data(geo.features).join('path')
        .attr('d', path).attr('fill', f => fillFor(f) || 'var(--surface-2)').attr('fill-opacity', f => fillFor(f) ? 0.55 : 1)
        .attr('stroke', ink2()).attr('stroke-width', 1)
        .on('mousemove', (ev, f) => {
          const c = contestOf[f.properties.district];
          tip.show(`<b>${c.name}</b><br>` + groups.map(g => `${g} ${pct(c.voteShare[g])}`).join(' · ') + `<br>Seats: ${c.winners.join(', ')}`, ev);
        }).on('mouseleave', () => tip.hide());
      // seat dots, with the district number above them
      for (const f of geo.features) {
        const c = contestOf[f.properties.district];
        const [cx, cy] = path.centroid(f);
        const n = c.winners.length, rdot = 5.5, gap = 13;
        c.winners.forEach((g, i) => {
          svg.append('circle').attr('cx', cx + (i - (n - 1) / 2) * gap).attr('cy', cy).attr('r', rdot).attr('fill', colors[g]).attr('stroke', 'var(--surface)').attr('stroke-width', 1.5).attr('pointer-events', 'none');
        });
        svg.append('text').attr('x', cx).attr('y', cy - 12).attr('text-anchor', 'middle').attr('font-size', 9).attr('fill', ink2()).attr('pointer-events', 'none').text(c.district);
      }
      // at-large row
      const al = r.contests.find(c => c.atLarge);
      if (al) {
        const n = al.winners.length, gap = 15, x0 = W / 2 - (n - 1) * gap / 2;
        svg.append('text').attr('x', W / 2).attr('y', H + 4).attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', muted()).text(`At-large (${al.method === 'stv' ? 'STV' : 'vote for 5, top 7 win'})`);
        al.winners.forEach((g, i) => svg.append('circle').attr('cx', x0 + i * gap).attr('cy', H + 16).attr('r', 5.5).attr('fill', colors[g]).attr('stroke', 'var(--surface)').attr('stroke-width', 1.5));
      }
      wrap.appendChild(m);
    }
    el.appendChild(wrap);
    legend(el, groups.map(g => ({ color: colors[g], label: g })));
  },
});
