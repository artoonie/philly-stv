// Browser-level check: dragging a slider must not destroy the slider mid-drag, and the state must follow.
// Run: node tests/drag.browser.js   (needs Chrome; starts its own static server)
import { spawn } from 'node:child_process';
import { launch } from '../scripts/browser.js';

const port = 8767;
const server = spawn('python3', ['-m', 'http.server', String(port), '--directory', 'site'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 700));
const b = await launch();
let ok = true;
try {
  await b.goto(`http://localhost:${port}/#type=race&advanced=1`);
  const r = await b.eval(`(async () => {
    const input = document.querySelector('#city-controls input[type=range]');
    const before = input; input.focus();
    for (const v of [40, 45, 50, 55, 60]) { input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); }
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)));
    const g = input.getAttribute('aria-label').replace(' share', '');
    const city = window.__sim.context().city;
    return { sameElement: document.querySelector('#city-controls input[type=range]') === before, sliderValue: input.value, cityShare: +(100 * city[g]).toFixed(1), group: g,
             score: document.querySelector('.card .score b').textContent };
  })()`);
  console.log(JSON.stringify(r));
  ok = r.sameElement && r.sliderValue === '60' && Math.abs(r.cityShare - 60) < 0.01;
  // district slider too
  const r2 = await b.eval(`(async () => {
    const input = document.querySelector('#district-controls .district-card input[type=range]');
    const before = input; input.focus();
    for (const v of [70, 75, 80]) { input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); }
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)));
    return { sameElement: document.querySelector('#district-controls .district-card input[type=range]') === before, value: input.value, d1: +(100 * window.__sim.context().districts.shares['1'][input.getAttribute('aria-label').replace(' share','')]).toFixed(1) };
  })()`);
  console.log(JSON.stringify(r2));
  ok = ok && r2.sameElement && r2.value === '80' && Math.abs(r2.d1 - 80) < 0.01;
  const errs = b.consoleErrors(); if (errs.length) { console.log('console errors:', errs); ok = false; }
} finally { await b.close(); server.kill(); }
console.log(ok ? 'DRAG OK' : 'DRAG FAILED'); process.exit(ok ? 0 : 1);
