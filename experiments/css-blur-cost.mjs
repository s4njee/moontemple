// Story 6.1: what CSS filter: blur() costs on a long page (experiments/css-blur-page.html), where
// the work happens: the main thread, the renderer's compositor, raster workers and the GPU
// process. No WebGPU timestamp sees any of it. Each case scrolls for five seconds under a Chrome
// trace; a thread's time is the union of its top-level tasks. Writes docs/studies/css-blur.md.
//
//   node experiments/css-blur-cost.mjs [--base http://localhost:5450]
//
// Start the dev server first, and leave the GPU otherwise idle.

import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../scripts/chrome.mjs';

const args = process.argv.slice(2);
const base = (args[args.indexOf('--base') + 1] ?? 'http://localhost:5450').replace(/\/$/, '');
const SECONDS = 5;
const MODES = ['none', 'static', 'scroll', 'scroll-wc', 'visible'];
const SCALES = [1, 2];

/** Thread groups by Chrome's thread names. */
const GROUPS = {
  main: (name) => name === 'CrRendererMain',
  compositor: (name) => name === 'Compositor',
  raster: (name) => name.startsWith('CompositorTileWorker'),
  gpu: (name) => name === 'CrGpuMain' || name === 'VizCompositorThread',
};

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

const chrome = await launchChrome();
const rows = [];
try {
  for (const scale of SCALES) {
    await chrome.page('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: scale,
      mobile: false,
    });
    for (const mode of MODES) {
      await chrome.page('Page.navigate', {
        url: `${base}/experiments/css-blur-page.html?mode=${mode}`,
      });
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
      await chrome.browser('Tracing.start', {
        categories: 'toplevel',
        transferMode: 'ReportEvents',
      });
      await sleep(SECONDS * 1000);
      const frames = await chrome.evaluate('window.__frames');
      await chrome.browser('Tracing.end');
      await done;
      const busy = busyTime(events);
      const row = { scale, mode, fps: frames / SECONDS };
      for (const [group, ms] of Object.entries(busy)) row[group] = ms / SECONDS;
      rows.push(row);
      console.log(row);
    }
  }
} finally {
  chrome.close();
}

const f = (v) => v.toFixed(0);
const lines = [
  '# CSS blur on a long page',
  '',
  `Story 6.1. \`experiments/css-blur-page.html\`: sixty sections of headings, paragraphs, a gradient "photo" and three cards, scrolled by script at 6 px a frame, in headless Chrome at 1280 × 800 CSS pixels on this machine (Apple M1 Max), ${new Date().toISOString().slice(0, 10)}. Each case ran for ${SECONDS} seconds under a Chrome trace. Times are milliseconds of work per second of scrolling: the union of each thread's top-level tasks, so a thread that is busy 1 000 ms a second is saturated. \`node experiments/css-blur-cost.mjs\` re-runs it.`,
  '',
  '- **none**: no blur.',
  '- **static**: every section blurred by a fixed 0 to 12 px.',
  "- **scroll**: each section's blur set every frame from its distance to a focal band, as a focus pull in CSS alone.",
  '- **scroll-wc**: the same, with `will-change: filter` on every section.',
  '- **visible**: the same as scroll, writing only the sections on screen.',
  '',
  '| Device pixels per CSS pixel | Case | Frames a second | Main thread | Compositor | Raster workers | GPU process |',
  '| ---: | --- | ---: | ---: | ---: | ---: | ---: |',
  ...rows.map(
    (r) =>
      `| ${r.scale} | ${r.mode} | ${f(r.fps)} | ${f(r.main)} | ${f(r.compositor)} | ${f(r.raster)} | ${f(r.gpu)} |`,
  ),
  '',
];
writeFileSync('docs/studies/css-blur.md', `${lines.join('\n')}\n`);
console.log('wrote docs/studies/css-blur.md');
