#!/usr/bin/env node
// Generates site/og.png (1200×630 social preview) from the live headline cards, and PNG
// favicons from site/favicon.svg. Usage: node scripts/social.js
import { spawn, execFileSync } from 'node:child_process';
import { launch } from './browser.js';

const port = 8769;
const server = spawn('python3', ['-m', 'http.server', String(port), '--directory', 'site'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 700));
const b = await launch({ width: 1200, height: 900 });
try {
  // 1. Social preview: the "Voters vs council" block for the default (party) view, light theme.
  await b.setViewport(1200, 900);
  await b.goto(`http://localhost:${port}/#type=party&theme=light`);
  const rect = await b.eval(`(() => {
    const el = document.querySelector('#viz-headline'); el.scrollIntoView();
    const r = el.getBoundingClientRect();
    return { x: r.left + window.scrollX - 12, y: r.top + window.scrollY - 8, w: r.width + 24, h: r.height + 12 };
  })()`);
  const scale = Math.min(1200 / rect.w, 630 / rect.h);
  await b.screenshotClip('site/og.png', { ...rect, scale });
  // pad to exactly 1200×630 on the page background colour
  execFileSync('sips', ['--padToHeightWidth', '630', '1200', '--padColor', 'F9F9F7', 'site/og.png'], { stdio: 'ignore' });
  console.log('wrote site/og.png');
  // 2. Favicons from the SVG
  for (const [file, size] of [['site/favicon.png', 32], ['site/apple-touch-icon.png', 180], ['site/icon-512.png', 512]]) {
    await b.setViewport(size, size);
    await b.goto(`http://localhost:${port}/favicon.svg`, { settle: 200 });
    await b.eval(`document.documentElement.style.margin='0';document.documentElement.style.background='transparent';document.documentElement.style.width='${size}px';document.documentElement.style.height='${size}px'`);
    await b.screenshotClip(file, { x: 0, y: 0, w: size, h: size, scale: 1 });
    console.log('wrote', file);
  }
} finally { await b.close(); server.kill(); }
