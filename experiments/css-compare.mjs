// Story 4.1: bokeh-drift against the same look in CSS (experiments/css-bokeh.html), in one headless
// Chrome. For each, five seconds of frame rate and main-thread time (Chrome's own Performance
// metrics: tasks, script, style recalculation, layout), and a screenshot. Writes
// docs/studies/css-bokeh.md; screenshots go to output/css-compare/.
//
//   node experiments/css-compare.mjs [--base http://localhost:5450]
//
// Start the dev server first. GPU time for the CSS page is not something Chrome reports: its
// discs are composited layers, which no WebGPU timestamp sees.

import { mkdirSync, writeFileSync } from 'node:fs';
import { FULLSCREEN_STAGE, launchChrome, sleep, waitForEffect } from '../scripts/chrome.mjs';

const args = process.argv.slice(2);
const base = (args[args.indexOf('--base') + 1] ?? 'http://localhost:5450').replace(/\/$/, '');
const width = 1280;
const height = 720;
const SECONDS = 5;

const cases = [
  { name: 'CSS, 110 discs', url: `${base}/experiments/css-bokeh.html`, shader: false },
  { name: 'CSS, 440 discs', url: `${base}/experiments/css-bokeh.html?orbs=440`, shader: false },
  { name: 'WebGPU bokeh-drift, 110 orbs', url: `${base}/?effect=bokeh-drift`, shader: true },
  { name: 'WebGPU bokeh-drift, 440 orbs', url: `${base}/?effect=bokeh-drift&p.count=440`, shader: true },
];

const chrome = await launchChrome();
const rows = [];
mkdirSync('output/css-compare', { recursive: true });
try {
  await chrome.page('Performance.enable', { timeDomain: 'timeTicks' });
  await chrome.page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  for (const test of cases) {
    chrome.errors.length = 0;
    await chrome.page('Page.navigate', { url: test.url });
    if (test.shader) {
      await waitForEffect(chrome);
      await chrome.evaluate(FULLSCREEN_STAGE);
    }
    await sleep(3000);
    const metric = async () =>
      Object.fromEntries((await chrome.page('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
    await chrome.evaluate(`(() => {
      window.__frames = 0;
      const tick = () => { window.__frames++; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    })()`);
    const before = await metric();
    await sleep(SECONDS * 1000);
    const after = await metric();
    const frames = await chrome.evaluate('window.__frames');
    const perSecond = (key) => (1000 * ((after[key] ?? 0) - (before[key] ?? 0))) / SECONDS;
    const shot = await chrome.page('Page.captureScreenshot', { format: 'png' });
    const file = `output/css-compare/${test.name.replace(/[^\w]+/g, '-').toLowerCase()}.png`;
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    rows.push({
      name: test.name,
      fps: frames / SECONDS,
      task: perSecond('TaskDuration'),
      script: perSecond('ScriptDuration'),
      style: perSecond('RecalcStyleDuration'),
      layout: perSecond('LayoutDuration'),
      errors: chrome.errors.length,
      file,
    });
    console.log(rows.at(-1));
  }
} finally {
  chrome.close();
}

const ms = (v) => v.toFixed(1);
const lines = [
  '# bokeh-drift against CSS',
  '',
  `Story 4.1. The same look two ways, in headless Chrome at ${width} × ${height} on this machine, ${new Date().toISOString().slice(0, 10)}: \`experiments/css-bokeh.html\` (discs as screen-blended radial gradients drifting on CSS keyframes, the same seeded layout and sizes) and the \`bokeh-drift\` effect page with its stage made the whole viewport. Each ran for ${SECONDS} seconds; main-thread time is Chrome's Performance metrics, in milliseconds per second of running. \`node experiments/css-compare.mjs\` re-runs it.`,
  '',
  '| Case | Frames a second | Main thread (ms/s) | Script | Style | Layout |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
  ...rows.map(
    (r) => `| ${r.name} | ${r.fps.toFixed(0)} | ${ms(r.task)} | ${ms(r.script)} | ${ms(r.style)} | ${ms(r.layout)} |`,
  ),
  '',
  "Chrome reports no GPU time for the CSS page: its discs are layers the compositor draws, which no WebGPU timestamp sees. The shader's GPU time is in the browser check and the cost studies.",
  '',
];
writeFileSync('docs/studies/css-bokeh.md', `${lines.join('\n')}\n`);
console.log('wrote docs/studies/css-bokeh.md');
