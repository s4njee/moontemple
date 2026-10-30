// Story 8.4: story 7.4's pairs, the CSS version and the WebGPU effect, measured the same way on
// the same machine, and where each breaks. Each case fills a 1280 × 720 window in headless Chrome
// (as experiments/css-fallbacks-cost.mjs): frame rate, main-thread time from Chrome's Performance
// metrics, and the GPU process from a trace. Then bokeh-drift, the densest honest pair, with its
// disc count raised until the frame rate falls, at full speed and with the CPU throttled four
// times (Chrome's stand-in for a phone's main thread; the GPU is not slowed). Writes
// docs/studies/css-vs-webgpu.{json,md}.
//
//   node experiments/css-vs-webgpu.mjs [--base http://localhost:5450] [--seconds 5]
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

/** Union of top-level task time of the GPU process's main and compositor threads, ms. */
function gpuBusy(events) {
  const names = new Map();
  for (const e of events) {
    if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name);
  }
  const intervals = new Map();
  for (const e of events) {
    if (e.ph !== 'X' || !String(e.cat).includes('toplevel') || !e.dur) continue;
    const name = names.get(`${e.pid}:${e.tid}`) ?? '';
    if (name !== 'CrGpuMain' && name !== 'VizCompositorThread') continue;
    const key = `${e.pid}:${e.tid}`;
    if (!intervals.has(key)) intervals.set(key, []);
    intervals.get(key).push([e.ts, e.ts + e.dur]);
  }
  let total = 0;
  for (const list of intervals.values()) {
    list.sort((a, b) => a[0] - b[0]);
    let [start, end] = list[0];
    for (const [s, e] of list.slice(1)) {
      if (s > end) {
        total += end - start;
        [start, end] = [s, e];
      } else end = Math.max(end, e);
    }
    total += end - start;
  }
  return total / 1000;
}

async function measure(test) {
  chrome.errors.length = 0;
  await chrome.page('Emulation.setCPUThrottlingRate', { rate: test.throttle ?? 1 });
  await chrome.page('Page.navigate', { url: test.url });
  if (test.effect) {
    await waitForEffect(chrome);
    await chrome.evaluate(FULLSCREEN_STAGE);
  }
  await sleep(3000);
  await chrome.evaluate(`(() => {
    window.__frames = 0;
    window.__long = 0;
    let last = performance.now();
    const tick = (now) => {
      window.__frames++;
      if (now - last > 25) window.__long++;
      last = now;
      requestAnimationFrame(tick);
    };
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
  const long = await chrome.evaluate('window.__long');
  await chrome.browser('Tracing.end');
  await done;
  const perSecond = (key) => (1000 * ((after[key] ?? 0) - (before[key] ?? 0))) / SECONDS;
  return {
    ...test,
    fps: frames / SECONDS,
    long,
    main: perSecond('TaskDuration'),
    gpu: gpuBusy(events) / SECONDS,
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
  await chrome.page('Page.navigate', { url: `${base}/experiments/css-fallbacks.html?only=none` });
  await sleep(2000);
  entries = await chrome.evaluate('window.__cssFallbacks');
  const css = (id, extra = '') => `${base}/experiments/css-fallbacks.html?only=${id}${extra}`;
  const gpu = (id, extra = '') => `${base}/?effect=${id}${extra}`;
  const BOKEH_CSS = entries.find((e) => e.id === 'bokeh-drift').elements;
  const cases = [
    { group: 'floor', id: 'empty page', side: 'css', url: css('none') },
    ...entries
      .filter((e) => e.elements !== null)
      .flatMap((e) => [
        { group: 'pair', id: e.id, side: 'css', elements: e.elements, url: css(e.id) },
        { group: 'pair', id: e.id, side: 'webgpu', effect: true, url: gpu(e.id) },
      ]),
    ...[1, 4].flatMap((throttle) => [
      ...[1, 2, 4, 8, 16].map((scale) => ({
        group: 'break',
        id: 'bokeh-drift',
        side: 'css',
        throttle,
        discs: Math.round(BOKEH_CSS * scale),
        url: css('bokeh-drift', `&scale=${scale}`),
      })),
      ...[110, 300, 600].map((count) => ({
        group: 'break',
        id: 'bokeh-drift',
        side: 'webgpu',
        throttle,
        discs: count,
        effect: true,
        url: gpu('bokeh-drift', `&p.count=${count}`),
      })),
    ]),
  ];
  for (const test of cases) {
    // A page reload during the run (the dev server's registry changing) resets the counter.
    for (let attempt = 0; attempt < 3; attempt++) {
      const row = await measure(test);
      if (Number.isFinite(row.fps) && row.fps > 0) {
        rows.push(row);
        console.log(
          row.group,
          row.id,
          row.side,
          row.throttle ?? 1,
          row.discs ?? '',
          row.fps.toFixed(0),
          row.main.toFixed(1),
          row.gpu.toFixed(1),
        );
        break;
      }
    }
  }
} finally {
  chrome.close();
}

writeFileSync(
  'docs/studies/css-vs-webgpu.json',
  JSON.stringify(
    { measuredAt: new Date().toISOString(), width, height, seconds: SECONDS, rows },
    null,
    2,
  ) + '\n',
);

const f0 = (v) => v.toFixed(0);
const f1 = (v) => v.toFixed(1);
const floor = rows.find((r) => r.group === 'floor');
const pairs = entries.filter((e) => e.elements !== null).map((e) => e.id);
const find = (group, id, side, extra = () => true) =>
  rows.find((r) => r.group === group && r.id === id && r.side === side && extra(r));
const lines = [
  '# CSS versus WebGPU',
  '',
  `Story 8.4. Story 7.4's pairs, each effect's CSS version (\`experiments/css-fallbacks.html?only=<id>\`) and the WebGPU effect (its page with the stage filling the window), filling a ${width} × ${height} window in headless Chrome on this machine (Apple M1 Max), ${new Date().toISOString().slice(0, 10)}, ${SECONDS} seconds each (\`node experiments/css-vs-webgpu.mjs\`). Main thread is Chrome's Performance metric (all tasks); GPU process is the union of its main and compositor threads' top-level tasks from a trace, which is where both composited CSS and WebGPU's command buffers are drawn. Milliseconds per second of running. Long frames are frames over 25 ms.`,
  '',
  `The empty page costs ${f1(floor.main)} ms/s of main thread and ${f1(floor.gpu)} ms/s of GPU process at ${f0(floor.fps)} frames a second; every row includes it.`,
  '',
  '## The pairs',
  '',
  '| Effect | CSS elements | CSS: frames a second | CSS: main (ms/s) | CSS: GPU process (ms/s) | WebGPU: frames a second | WebGPU: main (ms/s) | WebGPU: GPU process (ms/s) |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...pairs.map((id) => {
    const c = find('pair', id, 'css');
    const w = find('pair', id, 'webgpu');
    const cells = (r) => (r ? [f0(r.fps), f1(r.main), f1(r.gpu)] : ['—', '—', '—']);
    return `| ${id} | ${c?.elements ?? ''} | ${cells(c).join(' | ')} | ${cells(w).join(' | ')} |`;
  }),
  '',
  '## Where each breaks',
  '',
  "`bokeh-drift`, the densest honest pair: the CSS version with every layer's disc count multiplied (`?scale=<k>`), and the effect with its `orbs` parameter raised to its maximum. At 4× the CPU is throttled four times by Chrome (`Emulation.setCPUThrottlingRate`), a stand-in for a phone's main thread; the GPU is not slowed, so this finds where the main thread gives out, not the GPU.",
  '',
  '| CPU | Version | Discs | Frames a second | Long frames | Main (ms/s) | GPU process (ms/s) |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
  ...rows
    .filter((r) => r.group === 'break')
    .map(
      (r) =>
        `| ${r.throttle}× | ${r.side === 'css' ? 'CSS' : 'WebGPU'} | ${r.discs} | ${f0(r.fps)} | ${r.long} | ${f1(r.main)} | ${f1(r.gpu)} |`,
    ),
  '',
];
const OUT = 'docs/studies/css-vs-webgpu.md';
const HEADING = '## What the run says';
const previous = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
const reading = previous.includes(HEADING) ? previous.slice(previous.indexOf(HEADING)) : '';
writeFileSync(OUT, `${lines.join('\n')}${reading ? `\n${reading.trimEnd()}\n` : ''}`);
console.log(`wrote ${OUT}`);
