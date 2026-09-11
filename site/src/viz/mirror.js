import { registerViz, tooltip, pct, legend } from './registry.js';
import { systemColor, ink, muted, grid, ink2 } from './palette.js';

registerViz({
  id: 'mirror', order: 20,
  title: 'How far is each group from its fair share?',
  lede: 'The diamond is the group’s share of voters. Each dot is its share of council seats under one system. Dots far from the diamond mean over- or under-representation.',
  render(el, ctx) {
    const d3 = window.d3;
    const { groups, city, results, colors } = ctx;
    const W = Math.min(el.clientWidth || 900, 1100), rowH = 34, m = { top: 26, right: 24, bottom: 8, left: 130 };
    const H = m.top + rowH * groups.length + m.bottom;
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('role', 'img');
    const x = d3.scaleLinear().domain([0, 1]).range([m.left, W - m.right]);
    const y = d3.scaleBand().domain(groups).range([m.top, H - m.bottom]).paddingInner(0.2);
    svg.append('g').selectAll('line').data([0, .25, .5, .75, 1]).join('line')
      .attr('x1', d => x(d)).attr('x2', d => x(d)).attr('y1', m.top - 6).attr('y2', H - m.bottom).attr('stroke', grid());
    svg.append('g').selectAll('text').data([0, .25, .5, .75, 1]).join('text')
      .attr('x', d => x(d)).attr('y', m.top - 10).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', muted()).text(d => pct(d));
    const tip = tooltip();
    const rows = svg.append('g').selectAll('g').data(groups).join('g').attr('transform', g => `translate(0,${y(g) + y.bandwidth() / 2})`);
    rows.append('text').attr('x', m.left - 12).attr('text-anchor', 'end').attr('dy', '0.35em').attr('font-size', 13).attr('fill', ink()).text(g => g);
    rows.append('rect').attr('x', m.left - 4).attr('width', 4).attr('y', -y.bandwidth() / 2).attr('height', y.bandwidth()).attr('rx', 2).attr('fill', g => colors[g]);
    rows.append('line').attr('x1', x(0)).attr('x2', x(1)).attr('stroke', grid());
    // connecting line from voters to today's dot (emphasis on the gap)
    const today = results.find(r => r.system.id === 'current');
    if (today) rows.append('line').attr('x1', g => x(city[g])).attr('x2', g => x(today.seats[g] / today.totalSeats))
      .attr('stroke', systemColor('current')).attr('stroke-width', 2).attr('stroke-dasharray', '2 3');
    for (const r of results) {
      rows.append('circle').attr('cx', g => x(r.seats[g] / r.totalSeats)).attr('r', r.system.id === 'current' ? 7 : 6)
        .attr('fill', systemColor(r.system.id)).attr('stroke', 'var(--surface)').attr('stroke-width', 2)
        .on('mousemove', (ev, g) => tip.show(`<b>${r.system.short}</b>: ${g} hold ${r.seats[g]} of ${r.totalSeats} seats (${pct(r.seats[g] / r.totalSeats)})<br>Voters: ${pct(city[g], 1)}`, ev))
        .on('mouseleave', () => tip.hide());
    }
    rows.append('path').attr('d', d3.symbol(d3.symbolDiamond).size(110)).attr('transform', g => `translate(${x(city[g])},0)`)
      .attr('fill', ink()).attr('stroke', 'var(--surface)').attr('stroke-width', 1.5)
      .on('mousemove', (ev, g) => tip.show(`<b>Voters</b>: ${g} are ${pct(city[g], 1)} of the electorate`, ev)).on('mouseleave', () => tip.hide());
    legend(el, [{ kind: 'diamond', label: 'Share of voters' }, ...results.map(r => ({ color: systemColor(r.system.id), label: r.system.short + ' seats' }))]);
  },
});
