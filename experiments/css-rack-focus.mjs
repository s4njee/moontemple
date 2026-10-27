// Story 6.8: rack-focus-transition against the same transition in CSS
// (experiments/css-rack-focus.html), in one headless Chrome. Each case runs one whole loop (hold,
// rack, hold, rack back: 6.4 s) under a Chrome trace and reports frames a second and each thread's
// busy time: the main thread, the renderer's compositor, raster workers and the GPU process (as
// in experiments/css-blur-cost.mjs). The WebGPU cases also read the performance HUD's GPU time,
// once looping and once held mid-rack, the dearest frame. Screenshots of both at the same moments
// of the loop go to --out. Prints a Markdown table; writes nothing else.
//
//   node experiments/css-rack-focus.mjs [--base http://localhost:5450] [--out output/css-rack-focus]
//                                       [--size 1280x720]
//
// Start the dev server first, and leave the GPU otherwise idle. CSS work is the compositor's and
// the GPU process's, which no WebGPU timestamp sees; the effect's GPU time is not in the thread
// times, which count CPU work only.

import { mkdirSync, writeFileSync } from 'node:fs';
import { FULLSCREEN_STAGE, launchChrome, sleep, waitForEffect } from '../scripts/chrome.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const base = option('base', 'http://localhost:5450').replace(/\/$/, '');
const out = option('out', 'output/css-rack-focus');
const [width, height] = option('size', '1280x720').split('x').map(Number);
const LOOP = 6.4;
const SHOTS = [0.5, 2.4, 2.6, 3.0];

const css = (query) => `${base}/experiments/css-rack-focus.html?${query}`;
const effect = (query = '') => `${base}/?effect=rack-focus-transition${query}`;
const CASES = [
  { name: 'CSS, no transition (floor)', url: css('mode=none') },
  { name: 'CSS, one blur on the stack', url: css('mode=stack') },
  { name: 'CSS, a blur on each view', url: css('mode=each') },
  // The HUD redraws its numbers every frame, which costs main-thread time of its own.
  { name: 'WebGPU, looping, no HUD', url: effect(), shader: true },
  { name: 'WebGPU, looping', url: effect('&hud=1'), shader: true },
  { name: 'WebGPU, held mid-rack', url: effect('&hud=1&p.auto=0&p.progress=0.5'), shader: true },
];

const GROUPS = {
  main: (name) => name === 'CrRendererMain',
  compositor: (name) => name === 'Compositor',
  raster: (name) => name.startsWith('CompositorTileWorker'),
  gpu: (name) => name === 'CrGpuMain' || name === 'VizCompositorThread',
};

/** Each thread group's busy time, ms: the union of its threads' top-level tasks. */
function busyTime(events) {
  const names = new Map();
  for (const e of events) {
    if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name);
  }
  const intervals = new Map();
  for (const e of events) {
    if (e.ph !== 'X' || !String(e.cat).includes('toplevel') || !e.dur) continue;
    const key = `${e.pid}:${e.tid}`;
    if (!intervals.has(key)) intervals.set(key, []);
    intervals.get(key).push([e.ts, e.ts + e.dur]);
  }
  const totals = Object.fromEntries(Object.keys(GROUPS).map((g) => [g, 0]));
  for (const [key, list] of intervals) {
    const name = names.get(key) ?? '';
    const group = Object.keys(GROUPS).find((g) => GROUPS[g](name));
    if (!group) continue;
    list.sort((a, b) => a[0] - b[0]);
    let busy = 0;
    let [start, end] = list[0];
    for (const [s, e] of list.slice(1)) {
      if (s > end) {
        busy += end - start;
        [start, end] = [s, e];
      } else end = Math.max(end, e);
    }
    busy += end - start;
    totals[group] += busy / 1000;
  }
  return totals;
}

const hud = (chrome) =>
  chrome.evaluate(
    `document.querySelector('.mt-effect__hud')?.innerText.replace(/\\n+/g, ' | ').slice(0, 400) ?? null`,
  );

const chrome = await launchChrome();
const rows = [];
mkdirSync(out, { recursive: true });
try {
  await chrome.page('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (const test of CASES) {
    chrome.errors.length = 0;
    await chrome.page('Page.navigate', { url: test.url });
    if (test.shader) {
      await waitForEffect(chrome);
      await chrome.evaluate(FULLSCREEN_STAGE);
    }
    await sleep(2500);
    await chrome.evaluate(`(() => {
      window.__frames = 0;
      const tick = () => { window.__frames++; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    })()`);
    const events = [];
    const done = new Promise((resolve) => {
      const off = chrome.on((message) => {
        if (message.method === 'Tracing.dataCollected') events.push(...message.params.value);
        if (message.method === 'Tracing.tracingComplete') {
          off();
          resolve();
        }
      });
    });
    await chrome.browser('Tracing.start', { categories: 'toplevel', transferMode: 'ReportEvents' });
    await sleep(LOOP * 1000);
    const frames = await chrome.evaluate('window.__frames');
    await chrome.browser('Tracing.end');
    await done;
    const row = { name: test.name, fps: frames / LOOP, errors: chrome.errors.length };
    for (const [group, ms] of Object.entries(busyTime(events))) row[group] = ms / LOOP;
    if (test.url.includes('hud=1')) {
      const text = await hud(chrome);
      row.hud = text;
      row.gpuMs = Number(/GPU \| ([\d.]+) ms/.exec(text ?? '')?.[1] ?? NaN);
    }
    rows.push(row);
    console.log(row);
  }

  // The same moments of the loop, both ways.
  for (const at of SHOTS) {
    await chrome.page('Page.navigate', { url: css(`mode=stack&at=${at}`) });
    await sleep(1500);
    const shot = await chrome.page('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${out}/css-${at}s.png`, Buffer.from(shot.data, 'base64'));
  }
} finally {
  chrome.close();
}

const f = (v) => (Number.isFinite(v) ? v.toFixed(0) : '–');
console.log(
  [
    '',
    `Headless Chrome, ${width} × ${height}, one ${LOOP} s loop per case, ${new Date().toISOString().slice(0, 10)}. Thread times in ms per second.`,
    '',
    '| Case | Frames a second | Main thread | Compositor | Raster workers | GPU process | HUD GPU time |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map(
      (r) =>
        `| ${r.name} | ${f(r.fps)} | ${f(r.main)} | ${f(r.compositor)} | ${f(r.raster)} | ${f(r.gpu)} | ${Number.isFinite(r.gpuMs) ? `${r.gpuMs.toFixed(2)} ms` : '–'} |`,
    ),
  ].join('\n'),
);
