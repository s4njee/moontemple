// Story 7.4: what each Tier A effect's CSS version (src/fallbacks/) costs on its own, filling a
// 1280 × 720 window in headless Chrome: frame rate, main-thread time from Chrome's Performance
// metrics (as story 4.1's experiments/css-compare.mjs), and the GPU process from a trace (as
// story 6.1's experiments/css-blur-cost.mjs), since composited discs are drawn there and no
// WebGPU timestamp sees them. Writes docs/studies/css-fallbacks.md.
//
//   node experiments/css-fallbacks-cost.mjs [--base http://localhost:5450] [--seconds 5]
//
// Start the dev server first, and leave the GPU otherwise idle.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { FULLSCREEN_STAGE, launchChrome, sleep, waitForEffect } from '../scripts/chrome.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const base = option('--base', 'http://localhost:5450').replace(/\/$/, '');
const SECONDS = Number(option('--seconds', 5));
const width = 1280;
const height = 720;
const page = (id) => `${base}/experiments/css-fallbacks.html?only=${id}`;

/** Union of top-level task time per thread group, in ms over the whole trace. */
function busyTime(events) {
  const names = new Map();
  for (const e of events) {
    if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name);
  }
  const groups = {
    compositor: (name) => name === 'Compositor',
    gpu: (name) => name === 'CrGpuMain' || name === 'VizCompositorThread',
  };
  const intervals = new Map();
  for (const e of events) {
    if (e.ph !== 'X' || !String(e.cat).includes('toplevel') || !e.dur) continue;
    const key = `${e.pid}:${e.tid}`;
    if (!intervals.has(key)) intervals.set(key, []);
    intervals.get(key).push([e.ts, e.ts + e.dur]);
  }
  const totals = { compositor: 0, gpu: 0 };
  for (const [key, list] of intervals) {
    const group = Object.keys(groups).find((g) => groups[g](names.get(key) ?? ''));
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

async function measure(test) {
  chrome.errors.length = 0;
  await chrome.page('Page.navigate', { url: test.url ?? page(test.query) });
  if (test.url) {
    await waitForEffect(chrome);
    await chrome.evaluate(FULLSCREEN_STAGE);
  }
  await sleep(2500);
  await chrome.evaluate(`(() => {
    window.__frames = 0;
    const tick = () => { window.__frames++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })()`);
  const metric = async () =>
    Object.fromEntries(
      (await chrome.page('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]),
    );
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
  const before = await metric();
  await sleep(SECONDS * 1000);
  const after = await metric();
  const frames = await chrome.evaluate('window.__frames');
  await chrome.browser('Tracing.end');
  await done;
  const busy = busyTime(events);
  const perSecond = (key) => (1000 * ((after[key] ?? 0) - (before[key] ?? 0))) / SECONDS;
  return {
    ...test,
    fps: frames / SECONDS,
    main: perSecond('TaskDuration'),
    style: perSecond('RecalcStyleDuration'),
    compositor: busy.compositor / SECONDS,
    gpu: busy.gpu / SECONDS,
    errors: chrome.errors.length,
  };
}

const chrome = await launchChrome();
const rows = [];
let entries;
try {
  await chrome.page('Performance.enable', { timeDomain: 'timeTicks' });
  await chrome.page('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await chrome.page('Page.navigate', { url: page('none') });
  await sleep(2000);
  entries = await chrome.evaluate('window.__cssFallbacks');
  const cases = [
    { id: 'none', query: 'none', elements: 0, cannot: '', verdict: '' },
    ...entries.filter((e) => e.elements !== null).map((e) => ({ ...e, query: e.id })),
    // The densest honest fallback with every animation held, as under reduced motion.
    ...entries
      .filter((e) => e.id === 'bokeh-drift')
      .map((e) => ({ ...e, id: 'bokeh-drift, held still', query: 'bokeh-drift&still' })),
    // The effects themselves, for scale: the closest CSS match and the costliest.
    ...['bokeh-drift', 'glitter'].map((id) => ({
      id: `${id}: the WebGPU effect`,
      url: `${base}/?effect=${id}`,
      elements: null,
      cannot: '',
      verdict: '',
    })),
  ];

  for (const test of cases) {
    // A page reload during the run (the dev server's registry changing under other work) resets
    // the frame counter; measure that case again.
    for (let attempt = 0; attempt < 3; attempt++) {
      const row = await measure(test);
      if (Number.isFinite(row.fps)) {
        rows.push(row);
        console.log(row.id, row.fps, row.main.toFixed(1), row.gpu.toFixed(1));
        break;
      }
    }
  }
} finally {
  chrome.close();
}

const f0 = (v) => v.toFixed(0);
const f1 = (v) => v.toFixed(1);
const cell = (text) => text.replace(/\|/g, '\\|');
const measured = rows.filter((r) => r.id !== 'none' && r.id === r.query);
const reference = rows.filter((r) => r.id !== 'none' && r.id !== r.query);
const floor = rows.find((r) => r.id === 'none');
const missing = entries.filter((e) => e.elements === null);
const lines = [
  '# CSS fallbacks for the Tier A effects',
  '',
  `Story 7.4. Each Tier A effect's CSS version (\`src/fallbacks/css-fallbacks.ts\`, drawn by \`src/fallbacks/css-bokeh.ts\`: radial-gradient discs, screen-blended, on a few compositor keyframes) alone in \`experiments/css-fallbacks.html?only=<id>\`, filling a ${width} × ${height} window in headless Chrome on this machine, ${new Date().toISOString().slice(0, 10)}. Each ran for ${SECONDS} seconds. Main thread is Chrome's Performance metric (all tasks), as story 4.1 measured it; style is the style-recalculation part of it; GPU process is the union of the GPU process's top-level tasks from a trace, as story 6.1 measured it. All in milliseconds per second of running. \`node experiments/css-fallbacks-cost.mjs\` re-runs it; \`experiments/css-fallbacks.html\` shows each beside the effect.`,
  '',
  `The empty page costs ${f1(floor.main)} ms/s of main thread and ${f1(floor.gpu)} ms/s of GPU process at ${f0(floor.fps)} frames a second; the rows below include it.`,
  '',
  '| Effect | CSS elements | Frames a second | Main thread (ms/s) | Style | GPU process (ms/s) | What it cannot do | Verdict |',
  '| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ...measured.map(
    (r) =>
      `| ${r.id} | ${r.elements} | ${f0(r.fps)} | ${f1(r.main)} | ${f1(r.style)} | ${f1(r.gpu)} | ${cell(r.cannot)} | ${r.verdict} |`,
  ),
  '',
  'For scale, the same measures for the densest honest fallback held still (as under `prefers-reduced-motion`, or a poster) and for two of the WebGPU effects themselves, their stage filling the window:',
  '',
  '| Case | Frames a second | Main thread (ms/s) | Style | GPU process (ms/s) |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...reference.map(
    (r) => `| ${r.id} | ${f0(r.fps)} | ${f1(r.main)} | ${f1(r.style)} | ${f1(r.gpu)} |`,
  ),
  '',
  'No CSS version:',
  '',
  ...missing.map((e) => `- **${e.id}**: ${e.cannot}`),
  '',
];
// The written reading below the table survives a re-run; check it still matches the numbers.
const OUT = 'docs/studies/css-fallbacks.md';
const HEADING = '## What the run says';
const previous = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
const reading = previous.includes(HEADING) ? previous.slice(previous.indexOf(HEADING)) : '';
writeFileSync(OUT, `${lines.join('\n')}\n${reading ? `\n${reading.trimEnd()}\n` : ''}`);
console.log(`wrote ${OUT}`);
