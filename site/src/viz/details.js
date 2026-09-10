import { pct } from './registry.js';
import { INPUT_TYPES } from '../data/inputs.js';

const fmtN = n => Math.round(n).toLocaleString();

/** Skeptic's section: every contest, vote shares, winners, and STV rounds. */
export function renderDetails(el, ctx) {
  const { groups, colors, results, inputType, city } = ctx;
  el.innerHTML = '';
  // seats table (table-view twin of the donuts)
  const t = document.createElement('table'); t.className = 'grid';
  t.innerHTML = `<thead><tr><th>Group</th><th class="num">Voters</th>${results.map(r => `<th class="num">${r.system.short}<br><span style="font-weight:400">${r.totalSeats} seats</span></th>`).join('')}</tr></thead>` +
    `<tbody>${groups.map(g => `<tr><td><i class="winners"><i style="background:${colors[g]}"></i></i> ${g}</td><td class="num">${pct(city[g], 1)}</td>${results.map(r => `<td class="num">${r.seats[g]} <span style="color:var(--muted)">(${pct(r.seats[g] / r.totalSeats)})</span></td>`).join('')}</tr>`).join('')}` +
    `<tr><td><b>Mirror score</b> (100 − Loosemore–Hanby)</td><td></td>${results.map(r => `<td class="num"><b>${r.metrics.match}</b></td>`).join('')}</tr>` +
    `<tr><td>Gallagher index (lower is better)</td><td></td>${results.map(r => `<td class="num">${(100 * r.metrics.gallagher).toFixed(1)}</td>`).join('')}</tr></tbody>`;
  const tw = document.createElement('details'); tw.className = 'sys-details'; tw.open = true; tw.innerHTML = '<summary>Seats by group (table view)</summary>';
  const inner = document.createElement('div'); inner.className = 'inner'; inner.appendChild(t); tw.appendChild(inner); el.appendChild(tw);

  for (const r of results) {
    const d = document.createElement('details'); d.className = 'sys-details';
    d.innerHTML = `<summary>${r.system.name} — contest by contest</summary>`;
    const inn = document.createElement('div'); inn.className = 'inner';
    const tb = document.createElement('table'); tb.className = 'grid';
    tb.innerHTML = `<thead><tr><th>Contest</th><th>Method</th><th class="num">Seats</th>${groups.map(g => `<th class="num">${g}</th>`).join('')}<th>Winners</th></tr></thead>`;
    const body = document.createElement('tbody');
    for (const c of r.contests) {
      const tr = document.createElement('tr');
      const meth = c.method === 'plurality' ? 'Plurality' : c.method === 'limited' ? `Limited vote (vote for ${c.votesPerVoter})` : `STV (quota ${pct(1 / (c.seats + 1), 1)})`;
      tr.innerHTML = `<td>${c.name}</td><td>${meth}</td><td class="num">${c.seats}</td>${groups.map(g => `<td class="num">${pct(c.voteShare[g], 1)}</td>`).join('')}<td><span class="winners">${c.winners.map(w => `<i style="background:${colors[w]}" title="${w}"></i>`).join('')}</span> ${c.winners.join(', ')}</td>`;
      body.appendChild(tr);
      if (c.method === 'stv' && c.rounds.length) {
        const tr2 = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 4 + groups.length; td.style.whiteSpace = 'normal';
        const det = document.createElement('details'); det.className = 'rounds';
        det.innerHTML = `<summary>Show the ${c.rounds.length} count rounds (quota ${fmtN(c.quota)} of ${fmtN(c.votes.reduce((s, g) => s + g.votes, 0))} ${inputType.unit})</summary>`;
        const rt = document.createElement('table'); rt.className = 'grid';
        // only show candidates who ever held votes; the rest never matter
        const keep = c.rounds[0].candidates.map((x, i) => i).filter(i => c.rounds.some(rd => rd.candidates[i].votes > 0));
        const cands = keep.map(i => c.rounds[0].candidates[i].id);
        rt.innerHTML = `<thead><tr><th style="min-width:230px">Round</th>${cands.map(id => `<th class="num">${id}</th>`).join('')}<th class="num">Exhausted</th></tr></thead><tbody>` +
          c.rounds.map((rd, i) => `<tr><td style="white-space:normal">${i + 1}. ${rd.note}</td>${keep.map(k => rd.candidates[k]).map(x => `<td class="num" style="${x.status === 'elected' ? 'font-weight:700' : x.status === 'eliminated' ? 'color:var(--muted);text-decoration:line-through' : ''}">${fmtN(x.votes)}</td>`).join('')}<td class="num">${fmtN(rd.exhausted)}</td></tr>`).join('') + '</tbody>';
        const note = document.createElement('p'); note.className = 'hint'; note.style.margin = '6px 0 0';
        note.textContent = `Bold = elected (holding exactly one quota). Struck through = eliminated. ${c.rounds[0].candidates.length - keep.length} candidates who never received a vote are hidden.`;
        rt.after && null;
        det.appendChild(rt); det.appendChild(note); td.appendChild(det); tr2.appendChild(td); body.appendChild(tr2);
      }
    }
    tb.appendChild(body); inn.appendChild(tb); d.appendChild(inn); el.appendChild(d);
  }
}

export function renderSources(el) {
  el.innerHTML = '<h3>Data sources</h3>';
  const ul = document.createElement('ul');
  for (const t of INPUT_TYPES) {
    const li = document.createElement('li');
    li.innerHTML = `<b>${t.name}</b> (${t.unit}): <a href="${t.source.url}" target="_blank" rel="noopener">${t.source.label}</a>. ${t.source.method || ''} ${t.method || ''}`;
    ul.appendChild(li);
  }
  el.appendChild(ul);
  const p = document.createElement('p');
  p.innerHTML = 'District boundaries: <a href="https://opendataphilly.org/datasets/city-council-districts/" target="_blank" rel="noopener">City of Philadelphia, Council Districts 2024</a>.</code>.';
  el.appendChild(p);
}
