// Minimal headless-Chrome driver over the DevTools protocol (no npm deps; Node 22+).
// Usage from other scripts:  const b = await launch(); await b.goto(url); await b.eval('1+1'); await b.close();
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

export const CHROME = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'].find(existsSync);

export async function launch({ port = 9333, width = 1280, height = 900 } = {}) {
  const proc = spawn(CHROME, [`--headless=new`, '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pending = new Map(); const events = [];
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else if (msg.method) events.push(msg); };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  return {
    events,
    async goto(url, { settle = 600 } = {}) {
      await send('Page.navigate', { url });
      for (let i = 0; i < 100; i++) { if (events.some(e => e.method === 'Page.loadEventFired')) break; await new Promise(r => setTimeout(r, 50)); }
      events.length = 0;
      await new Promise(r => setTimeout(r, settle));
    },
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval failed');
      return r.result?.result?.value;
    },
    async screenshot(file, { fullPage = true } = {}) {
      const { writeFileSync } = await import('node:fs');
      let clip;
      if (fullPage) {
        const { contentSize } = (await send('Page.getLayoutMetrics')).result;
        await send('Emulation.setDeviceMetricsOverride', { width: Math.ceil(contentSize.width), height: Math.ceil(contentSize.height), deviceScaleFactor: 1, mobile: false });
        clip = { x: 0, y: 0, width: contentSize.width, height: contentSize.height, scale: 1 };
      }
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, ...(clip ? { clip } : {}) });
      writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    },
    async screenshotClip(file, { x, y, w, h, scale = 1 }) {
      const { writeFileSync } = await import('node:fs');
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x, y, width: w, height: h, scale } });
      writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    },
    async setViewport(width, height, mobile = false) { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile }); },
    consoleErrors() { return events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text); },
    async close() { ws.close(); proc.kill(); },
  };
}
