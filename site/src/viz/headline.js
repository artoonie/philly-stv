import { registerViz, tooltip, pct } from './registry.js';
import { surface } from './palette.js';

function donut(el, groups, values, colors, { size = 190, thickness = 26, label, reference } = {}) {
  const d3 = window.d3;
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${size} ${size}`).attr('class', 'donut').attr('role', 'img');
  const r = size / 2;
  const tip = tooltip();
  const g = svg.append('g').attr('transform', `translate(${r},${r})`);
  const pie = d3.pie().value(d => d.v).sort(null).padAngle(0.012);
  let outer = r - 2;
  if (reference) {
    // thin outer ring = the voters, for direct visual comparison with the council ring inside
    const ref = groups.map(g => ({ g, v: reference[g] || 0 })).filter(d => d.v > 0);
    const refArc = d3.arc().innerRadius(r - 9).outerRadius(r - 2).cornerRadius(1.5);
    g.selectAll('path.ref').data(pie(ref)).join('path').attr('class', 'ref').attr('d', refArc).attr('fill', d => colors[d.data.g]).attr('opacity', 0.55)
      .on('mousemove', (ev, d) => tip.show(`<b>Voters</b>: ${d.data.g} ${pct(d.data.v, 1)}`, ev)).on('mouseleave', () => tip.hide());
    outer = r - 13;
  }
  const data = groups.map(g => ({ g, v: values[g] || 0 })).filter(d => d.v > 0);
  const total = d3.sum(data, d => d.v) || 1;
  const arc = d3.arc().innerRadius(outer - thickness).outerRadius(outer).cornerRadius(2);
  g.selectAll('path.main').data(pie(data)).join('path').attr('class', 'main')
    .attr('d', arc).attr('fill', d => colors[d.data.g]).attr('stroke', surface()).attr('stroke-width', 1)
    .on('mousemove', (ev, d) => tip.show(`<b>${d.data.g}</b><br>${pct(d.data.v / total, 1)}${label ? ` (${Math.round(d.data.v)} of ${Math.round(total)} ${label})` : ''}${reference ? `<br>Voters: ${pct(reference[d.data.g] || 0, 1)}` : ''}`, ev))
    .on('mouseleave', () => tip.hide());
  const lab = d3.arc().innerRadius(outer - thickness / 2).outerRadius(outer - thickness / 2);
  g.selectAll('text').data(pie(data).filter(d => (d.endAngle - d.startAngle) > 0.42)).join('text')
    .attr('transform', d => `translate(${lab.centroid(d)})`).attr('text-anchor', 'middle').attr('dy', '0.35em')
    .attr('font-size', 11).attr('font-weight', 700).attr('fill', '#fff').style('paint-order', 'stroke').attr('stroke', 'rgba(0,0,0,.25)').attr('stroke-width', 2)
    .text(d => pct(d.data.v / total));
  return svg;
}

registerViz({
  id: 'headline', order: 10,
  title: 'Voters vs. council',
  lede: 'The thick ring is the council; the thin ring around it is the voters. Where the colours line up, the council mirrors the city. Where they don’t, a group is over- or under-represented.',
  render(el, ctx) {
    const { groups, colors, city, results, inputType, totalPeople } = ctx;
    const cards = document.createElement('div'); cards.className = 'cards';
    // voters
    const vc = document.createElement('div'); vc.className = 'card voters';
    vc.innerHTML = `<h4>Voters</h4><div class="sub">${inputType.question} (real data, then your sliders)</div>`;
    donut(vc, groups, city, colors, { label: '' });
    const vl = document.createElement('div'); vl.className = 'foot';
    vl.innerHTML = groups.map(g => `<span style="white-space:nowrap"><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${colors[g]};margin-right:4px"></i>${g} ${pct(city[g])}</span>`).join(' &nbsp; ');
    vc.appendChild(vl);
    cards.appendChild(vc);
    const best = Math.max(...results.filter(r => r.system.stv).map(r => r.metrics.match), -1);
    for (const r of results) {
      const c = document.createElement('div'); c.className = 'card' + (r.system.stv && r.metrics.match === best ? ' best' : '');
      c.innerHTML = `<h4>${r.system.short}${r.system.stv ? '<span class="stv-tag">STV</span>' : ''}</h4><div class="sub">${r.system.summary}</div>`;
      const seatCounts = Object.fromEntries(groups.map(g => [g, r.seats[g]]));
      donut(c, groups, seatCounts, colors, { label: 'seats', reference: city });
      const score = document.createElement('div'); score.className = 'score';
      score.innerHTML = `<b>${r.metrics.match}</b><span>/ 100 mirror score</span>`;
      const meter = document.createElement('div'); meter.className = 'meter';
      meter.innerHTML = `<i style="width:${r.metrics.match}%"></i>`;
      const foot = document.createElement('div'); foot.className = 'foot';
      const seatsTxt = groups.filter(g => r.seats[g] > 0).map(g => `${r.seats[g]} ${g}`).join(', ');
      const shut = r.metrics.shutOut;
      foot.innerHTML = `${r.totalSeats} seats: ${seatsTxt}.` + (shut.length ? ` <span class="bad">${shut.join(' and ')} voters (${shut.map(g => pct(city[g])).join(', ')}) get no seat.</span>` : ' Every group above 5% wins a seat.');
      c.append(score, meter, foot);
      cards.appendChild(c);
    }
    el.appendChild(cards);
    // one-sentence verdict for people who won't read anything else
    const today = results.find(r => r.system.id === 'current');
    const stvs = results.filter(r => r.system.stv).sort((a, b) => b.metrics.match - a.metrics.match);
    const bestR = stvs[0];
    const v = document.createElement('div'); v.className = 'verdict';
    const name = inputType.name.toLowerCase();
    let html;
    if (today && bestR) {
      const gap = bestR.metrics.match - today.metrics.match;
      const stillShut = today.metrics.shutOut.filter(g => bestR.metrics.shutOut.includes(g));
      const fixed = today.metrics.shutOut.filter(g => !bestR.metrics.shutOut.includes(g));
      if (gap > 0) {
        html = `<b>Today's council mirrors ${name} at ${today.metrics.match}/100. With STV (${bestR.system.short}) it would be ${bestR.metrics.match}/100.</b>`;
        if (fixed.length) html += ` Today, ${fixed.join(' and ')} voters hold no seat at all; under STV they win representation.`;
        if (stillShut.length) html += ` ${stillShut.join(' and ')} voters (${stillShut.map(g => pct(city[g])).join(', ')}) still win nothing: with everyone voting strictly by ${name}, they are below the quota in every contest. In real STV elections, votes transfer between groups, which usually helps groups this size.`;
      } else {
        html = `<b>With these numbers, today's rule lands at ${today.metrics.match}/100 and the STV layout${stvs.length > 1 ? 's score' : ' scores'} ${stvs.map(r => r.metrics.match).join(', ')}.</b> Today's at-large rule hands the runner-up group exactly 2 seats whether it has 5% or 45% of voters; here that fixed number happens to be about right. Three-seat districts need a group to reach 25% somewhere to win a seat, which is why the smaller STV layouts score lower for a thinly spread minority.`;
      }
    } else if (today) {
      html = `<b>Today's council mirrors ${name} at ${today.metrics.match}/100.</b> Add an STV method in step 1 to compare.` + (today.metrics.shutOut.length ? ` ${today.metrics.shutOut.join(' and ')} voters hold no seat at all.` : '');
    } else {
      html = `<b>${results.map(r => `${r.system.short}: ${r.metrics.match}/100`).join(' · ')}.</b> Add “Today” in step 1 to compare with the current system.`;
    }
    v.innerHTML = html;
    el.appendChild(v);
  },
});
