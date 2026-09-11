import { registerViz, tooltip, pct, legend } from './registry.js';
import { muted, ink2, grid } from './palette.js';
import GEO from '../data/districts.geojson.js';

registerViz({
  id: 'map', order: 50,
  title: 'Where each seat comes from',
  lede: 'District winners on the map (one dot per seat); at-large seats sit below the map. Single-winner districts are shaded by their winner.',
  render(el, ctx) {
    const d3 = window.d3;
    const { groups, colors, results, shares } = ctx;
    const wrap = document.createElement('div'); wrap.className = 'multiples';
    const tip = tooltip();
    const W = 240, H = 250;
    const proj = d3.geoMercator().fitExtent([[6, 6], [W - 6, H - 6]], GEO);
    const path = d3.geoPath(proj);
    const byDistrict = Object.fromEntries(GEO.features.map(f => [f.properties.district, f]));
    for (const r of results) {
      const m = document.createElement('div'); m.className = 'multiple';
      m.innerHTML = `<h4>${r.system.short}${r.system.stv ? '<span class="stv-tag">STV</span>' : ''}</h4><p class="sub">${r.system.summary ?? r.system.detail ?? ''}</p>`;
      const svg = d3.select(m).append('svg').attr('viewBox', `0 0 ${W} ${H + 26}`).attr('role', 'img');
      const districtContests = r.contests.filter(c => c.districts.length < 10);
      const fillFor = {}; // district -> colour when single winner
      for (const c of districtContests) if (c.seats === 1) for (const d of c.districts) fillFor[d] = colors[c.winners[0]];
      svg.append('g').selectAll('path').data(GEO.features).join('path')
        .attr('d', path).attr('fill', f => fillFor[f.properties.district] || 'var(--surface-2)').attr('fill-opacity', f => fillFor[f.properties.district] ? 0.55 : 1)
        .attr('stroke', 'var(--surface)').attr('stroke-width', 1.2)
        .on('mousemove', (ev, f) => {
          const d = f.properties.district; const c = r.contests.find(c => c.districts.includes(d) && c.districts.length < 10);
          const sh = shares[d];
          tip.show(`<b>District ${d}</b>${c && c.districts.length > 1 ? ` (in ${c.name})` : ''}<br>` + groups.map(g => `${g} ${pct(sh[g])}`).join(' · ') + `<br>Seats: ${c ? c.winners.join(', ') : '—'}`, ev);
        }).on('mouseleave', () => tip.hide());
      // merged-district outlines
      for (const c of districtContests) if (c.districts.length > 1) {
        const merged = { type: 'FeatureCollection', features: c.districts.map(d => byDistrict[d]) };
        svg.append('path').datum(merged).attr('d', path).attr('fill', 'none').attr('stroke', ink2()).attr('stroke-width', 1.6).attr('pointer-events', 'none');
      }
      svg.append('g').selectAll('path.b').data(GEO.features).join('path').attr('d', path).attr('fill', 'none').attr('stroke', ink2()).attr('stroke-width', districtContests.some(c => c.districts.length > 1) ? 0.4 : 1).attr('pointer-events', 'none');
      // seat dots
      for (const c of districtContests) {
        const merged = { type: 'FeatureCollection', features: c.districts.map(d => byDistrict[d]) };
        const [cx, cy] = path.centroid(merged);
        const n = c.winners.length, rdot = 5.5, gap = 13;
        c.winners.forEach((g, i) => {
          svg.append('circle').attr('cx', cx + (i - (n - 1) / 2) * gap).attr('cy', cy).attr('r', rdot).attr('fill', colors[g]).attr('stroke', 'var(--surface)').attr('stroke-width', 1.5).attr('pointer-events', 'none');
        });
      }
      // district numbers (small)
      svg.append('g').selectAll('text').data(GEO.features).join('text')
        .attr('transform', f => { const [x, y] = path.centroid(f); return `translate(${x},${y - 12})`; })
        .attr('text-anchor', 'middle').attr('font-size', 9).attr('fill', ink2()).attr('pointer-events', 'none').text(f => f.properties.district);
      // at-large row
      const al = r.contests.find(c => c.districts.length === 10);
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
