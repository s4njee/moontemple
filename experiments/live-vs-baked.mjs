// Story 8.3, second half: what the baked loops (experiments/live-vs-baked.test.ts) cost to play
// against the effects themselves, each filling a 1920 × 1080 window in headless Chrome: frame
// rate, main-thread time from Chrome's Performance metrics, and the GPU process from a trace, as
// experiments/css-fallbacks-cost.mjs measures them, plus the video's dropped frames. Writes
// docs/studies/live-vs-baked.md from output/baked/encodes.json and these readings.
//
//   node experiments/live-vs-baked.mjs [--base http://localhost:5450] [--seconds 6]
//
// Bake first, start the dev server, and leave the GPU otherwise idle.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { FULLSCREEN_STAGE, launchChrome, sleep, waitForEffect } from '../scripts/chrome.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const base = option('--base', 'http://localhost:5450').replace(/\/$/, '');
const SECONDS = Number(option('--seconds', 6));
const width = 1920;
const height = 1080;
const baked = JSON.parse(readFileSync('output/baked/encodes.json', 'utf8'));
const bundles = JSON.parse(readFileSync('docs/studies/bundle-sizes.json', 'utf8'));

/** Union of top-level task time per thread group, in ms over the whole trace. */
function busyTime(events) {
  const names = new Map();
  for (const e of events) {
    if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name);
  }
  const groups = {
    gpu: (name) => name === 'CrGpuMain' || name === 'VizCompositorThread',
    media: (name) => /media|video|decod/i.test(name),
  };
  const intervals = new Map();
  for (const e of events) {
    if (e.ph !== 'X' || !String(e.cat).includes('toplevel') || !e.dur) continue;
    const key = `${e.pid}:${e.tid}`;
    if (!intervals.has(key)) intervals.set(key, []);
    intervals.get(key).push([e.ts, e.ts + e.dur]);
  }
  const totals = { gpu: 0, media: 0 };
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

const VIDEO_STATE = `(() => {
  const v = document.querySelector('video');
  if (!v) return null;
  const q = v.getVideoPlaybackQuality();
  return { time: v.currentTime, total: q.totalVideoFrames, dropped: q.droppedVideoFrames, playing: !v.paused, error: v.error && v.error.message };
})()`;

async function measure(test) {
  chrome.errors.length = 0;
  await chrome.page('Page.navigate', { url: test.url });
  if (test.effect) {
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
  const videoBefore = await chrome.evaluate(VIDEO_STATE);
  await sleep(SECONDS * 1000);
  const after = await metric();
  const videoAfter = await chrome.evaluate(VIDEO_STATE);
  const frames = await chrome.evaluate('window.__frames');
  await chrome.browser('Tracing.end');
  await done;
  const busy = busyTime(events);
  const perSecond = (key) => (1000 * ((after[key] ?? 0) - (before[key] ?? 0))) / SECONDS;
  return {
    ...test,
    fps: frames / SECONDS,
    main: perSecond('TaskDuration'),
    gpu: busy.gpu / SECONDS,
    media: busy.media / SECONDS,
    video: videoAfter && {
      playing: videoAfter.playing,
      error: videoAfter.error,
      decoded: (videoAfter.total - videoBefore.total) / SECONDS,
      dropped: videoAfter.dropped - videoBefore.dropped,
    },
    errors: chrome.errors.length,
  };
}

const chrome = await launchChrome();
const rows = [];
try {
  await chrome.page('Performance.enable', { timeDomain: 'timeTicks' });
  await chrome.page('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const cases = [{ id: 'empty page', kind: 'floor', url: `${base}/experiments/video-loop.html` }];
  for (const result of baked.results) {
    cases.push({
      id: result.id,
      kind: 'live',
      effect: true,
      url: `${base}/?effect=${result.id}`,
    });
    for (const encode of result.encodes) {
      cases.push({
        id: result.id,
        kind: `${encode.size} ${encode.codec}`,
        url: `${base}/experiments/video-loop.html?src=/${encode.path}`,
        encode,
      });
    }
  }
  for (const test of cases) {
    const row = await measure(test);
    rows.push(row);
    console.log(
      row.id,
      row.kind,
      row.fps.toFixed(0),
      row.main.toFixed(1),
      row.gpu.toFixed(1),
      row.media.toFixed(1),
      JSON.stringify(row.video),
    );
  }
} finally {
  chrome.close();
}

writeFileSync(
  'docs/studies/live-vs-baked.json',
  JSON.stringify(
    { measuredAt: new Date().toISOString(), width, height, seconds: SECONDS, baked, rows },
    null,
    2,
  ) + '\n',
);

const f0 = (v) => v.toFixed(0);
const f1 = (v) => v.toFixed(1);
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} kB`;
const floor = rows.find((r) => r.kind === 'floor');
const lines = [
  '# Live versus baked',
  '',
  `Story 8.3. \`bokeh-drift\` and \`night-street\` as the shader and as looping video, on this machine (Apple M1 Max), ${new Date().toISOString().slice(0, 10)}.`,
  '',
  `**The loops.** Each effect was rendered on Dawn at ${baked.width} × ${baked.height}, ${baked.fps} frames a second, for ${baked.loop + baked.fade} seconds, and the last ${baked.fade} were cross-faded over the first so the ${baked.loop}-second loop has no seam (\`experiments/live-vs-baked.test.ts\`). That lossless loop was encoded with ffmpeg: H.264 (x264, CRF 23, slow), VP9 (CRF 33), and AV1 (SVT-AV1, CRF 35) in 8 and 10 bits. SSIM is the decoded video against the lossless loop, at 1080p.`,
  '',
  '**Playback.** Each case filled a 1920 × 1080 window in headless Chrome for ' +
    SECONDS +
    " seconds (`experiments/live-vs-baked.mjs`, after `css-fallbacks-cost.mjs`): main thread from Chrome's Performance metrics; GPU process the union of its main and compositor threads' top-level tasks from a trace; media the threads named for media or decoding. All in milliseconds per second of running.",
  '',
  `The empty page costs ${f1(floor.main)} ms/s of main thread and ${f1(floor.gpu)} ms/s of GPU process at ${f0(floor.fps)} frames a second; the rows below include it.`,
  '',
  '| Effect | As | Download | Bit rate | SSIM | Frames a second | Main thread (ms/s) | GPU process (ms/s) | Media (ms/s) | Video frames decoded a second, dropped |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ...rows
    .filter((r) => r.kind !== 'floor')
    .map((r) => {
      const e = r.encode;
      const download = e ? kb(e.bytes) : `${kb(bundles.effects[r.id].gzip)} of code, gzipped`;
      const video = r.video
        ? `${f0(r.video.decoded)}, ${r.video.dropped}${r.video.playing ? '' : ' (not playing)'}${r.video.error ? ` (${r.video.error})` : ''}`
        : '';
      return `| ${r.id} | ${r.kind === 'live' ? 'the shader' : r.kind} | ${download} | ${e ? `${f0(e.kbps)} kbit/s` : ''} | ${e ? e.ssim.toFixed(4) : ''} | ${f0(r.fps)} | ${f1(r.main)} | ${f1(r.gpu)} | ${f1(r.media)} | ${video} |`;
    }),
  '',
];
const OUT = 'docs/studies/live-vs-baked.md';
const HEADING = '## What the run says';
const previous = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
const reading = previous.includes(HEADING) ? previous.slice(previous.indexOf(HEADING)) : '';
writeFileSync(OUT, `${lines.join('\n')}${reading ? `\n${reading.trimEnd()}\n` : ''}`);
console.log(`wrote ${OUT}`);
