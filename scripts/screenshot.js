#!/usr/bin/env node
// Headless-Chrome screenshots of the page in several states (no npm deps).
// Usage: node scripts/screenshot.js [--out screenshots] [--width 1280]
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]] : []).filter(x => x.length));
const out = resolve(args.out || 'screenshots'); mkdirSync(out, { recursive: true });
const width = +(args.width || 1280);
const CHROME = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'].find(existsSync);
if (!CHROME) { console.error('No Chrome found; set CHROME=/path/to/chrome'); process.exit(1); }

const port = 8765;
const server = spawn('python3', ['-m', 'http.server', String(port), '--directory', 'site'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 700));
const SHOTS = [
  ['party-light', 'type=party&theme=light'],
  ['faction-light', 'type=faction&theme=light'],
  ['party-dark', 'type=party&theme=dark'],
  ['race-light', 'type=race&theme=light'],
  ['race-mobile', 'type=race&theme=light', 420],
  ['cars-light', 'type=cars&theme=light'],
  ['tenure-dark', 'type=tenure&theme=dark'],
  ['race-asian-20', 'type=race&city=Asian:20&focus=Asian&theme=light'],
  ['race-details-open', 'type=race&theme=light&open=1', 1280, 9000],
];
try {
  for (const [name, hash, w = width, tall] of SHOTS) {
    let url = `http://localhost:${port}/#${hash}`;
    const file = `${out}/${name}.png`;
    let winW = w;
    if (w < 500) {
      // Chrome refuses windows narrower than ~500px; frame the page in a narrow iframe instead.
      const h = 4600;
      writeFileSync('site/_mobile.html', `<!doctype html><body style="margin:0;background:#888"><iframe src="${url}" style="width:${w}px;height:${h}px;border:0;display:block"></iframe></body>`);
      url = `http://localhost:${port}/_mobile.html`; winW = 520;
    }
    execSync(`"${CHROME}" --headless=new --disable-gpu --hide-scrollbars --window-size=${winW},${tall || (w < 500 ? 4600 : 3400)} --virtual-time-budget=5000 --screenshot="${file}" "${url}"`, { stdio: 'ignore' });
    console.log('wrote', file);
  }
} finally { server.kill(); rmSync('site/_mobile.html', { force: true }); }
