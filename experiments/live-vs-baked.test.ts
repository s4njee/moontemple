import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { describe, it, vi } from 'vitest';
import { BACKDROPS, compositeOver, mountHeadless } from '../tests/headless.ts';

// Story 8.3, first half: `bokeh-drift` and `night-street` baked to looping video. Each effect is
// rendered on Dawn at 1920 × 1080 and 30 frames a second for LOOP + FADE seconds, and the last
// FADE seconds are cross-faded over the first, so the loop has no seam: frame t of the loop is
// the render's frame t for t ≥ FADE, and a mix of frames t + LOOP and t, weighted by t / FADE,
// below it. The loop is kept losslessly (FFV1) and encoded from that as H.264, VP9 and AV1 at
// 1080p and 720p; sizes and SSIM against the lossless loop go to output/baked/encodes.json, and
// experiments/live-vs-baked.mjs measures playback in Chrome.
//
//   npx vitest run --config experiments/vite.config.ts experiments/live-vs-baked.test.ts

vi.setConfig({ testTimeout: 3_600_000 });

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const LOOP = 10;
const FADE = 2;
const OUT = 'output/baked';
const EFFECTS = ['bokeh-drift', 'night-street'];

const ENCODES: { codec: string; ext: string; pix?: string; args: string[] }[] = [
  {
    codec: 'h264',
    ext: 'mp4',
    args: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-movflags', '+faststart'],
  },
  {
    codec: 'vp9',
    ext: 'webm',
    args: ['-c:v', 'libvpx-vp9', '-crf', '33', '-b:v', '0', '-row-mt', '1'],
  },
  { codec: 'av1', ext: 'webm', args: ['-c:v', 'libsvtav1', '-crf', '35', '-preset', '6'] },
  // Ten bits a channel: the same rate, and much less banding in the halos (8-bit codecs drop the
  // effect's dither and step the gradients into rings).
  {
    codec: 'av1-10bit',
    ext: 'webm',
    pix: 'yuv420p10le',
    args: ['-c:v', 'libsvtav1', '-crf', '35', '-preset', '6'],
  },
];
const SIZES = [
  { name: '1080p', scale: '1920:1080' },
  { name: '720p', scale: '1280:720' },
];

/** An ffmpeg process taking raw RGB frames on stdin. */
function rawWriter(path: string) {
  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-loglevel',
      'error',
      '-y',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-s',
      `${WIDTH}x${HEIGHT}`,
    ].concat(['-r', String(FPS), '-i', '-', '-c:v', 'ffv1', path]),
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  const closed = new Promise<void>((resolve, reject) =>
    ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`)))),
  );
  return {
    async write(frame: Uint8Array) {
      if (!ffmpeg.stdin.write(frame)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
    },
    async close() {
      ffmpeg.stdin.end();
      await closed;
    },
  };
}

function ffmpeg(args: string[]): string {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-y', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stderr;
}

async function bake(id: string) {
  mkdirSync(OUT, { recursive: true });
  const mounted = await mountHeadless(id, { width: WIDTH, height: HEIGHT, fps: FPS });
  const fadeFrames = FADE * FPS;
  const loopFrames = LOOP * FPS;
  const head: Uint8Array[] = [];
  // The loop's frames FADE..LOOP are the render's; 0..FADE are written last, blended.
  const body = rawWriter(`${OUT}/${id}-body.mkv`);
  const start = performance.now();
  for (let frame = 0; frame < loopFrames + fadeFrames; frame++) {
    mounted.step();
    const rgb = compositeOver(await mounted.read(), BACKDROPS.black!);
    if (frame < fadeFrames) head.push(rgb);
    else if (frame < loopFrames) await body.write(rgb);
    else {
      const i = frame - loopFrames;
      const w = i / fadeFrames;
      const mixed = new Uint8Array(rgb.length);
      const early = head[i]!;
      for (let k = 0; k < rgb.length; k++) mixed[k] = Math.round(rgb[k]! * (1 - w) + early[k]! * w);
      head[i] = mixed;
    }
  }
  await body.close();
  const renderSeconds = (performance.now() - start) / 1000;
  mounted.destroy();
  const fade = rawWriter(`${OUT}/${id}-head.mkv`);
  for (const frame of head) await fade.write(frame);
  await fade.close();
  writeFileSync(`${OUT}/${id}-list.txt`, `file '${id}-head.mkv'\nfile '${id}-body.mkv'\n`);
  const master = `${OUT}/${id}-loop.mkv`;
  ffmpeg([
    '-loglevel',
    'error',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    `${OUT}/${id}-list.txt`,
    '-c',
    'copy',
    master,
  ]);

  const encodes = [];
  for (const size of SIZES) {
    for (const encode of ENCODES) {
      const path = `${OUT}/${id}-${size.name}.${encode.codec}.${encode.ext}`;
      const began = performance.now();
      ffmpeg([
        '-loglevel',
        'error',
        '-i',
        master,
        '-vf',
        `scale=${size.scale}:flags=lanczos`,
        '-pix_fmt',
        encode.pix ?? 'yuv420p',
        '-an',
        ...encode.args,
        path,
      ]);
      const encodeSeconds = (performance.now() - began) / 1000;
      // SSIM of the decoded video against the lossless loop, at the loop's size.
      const report = ffmpeg([
        '-i',
        path,
        '-i',
        master,
        '-lavfi',
        `[0:v]scale=${WIDTH}:${HEIGHT}:flags=bicubic[a];[a][1:v]ssim`,
        '-f',
        'null',
        '-',
      ]);
      const ssim = Number(/All:([\d.]+)/.exec(report)?.[1]);
      encodes.push({
        size: size.name,
        codec: encode.codec,
        path,
        bytes: statSync(path).size,
        kbps: (statSync(path).size * 8) / LOOP / 1000,
        ssim,
        encodeSeconds,
      });
      console.log(id, size.name, encode.codec, statSync(path).size, ssim);
    }
  }
  return { id, renderSeconds, masterBytes: statSync(master).size, encodes };
}

describe('live versus baked', () => {
  it('bakes the loops', async () => {
    const results = [];
    for (const id of EFFECTS) results.push(await bake(id));
    writeFileSync(
      `${OUT}/encodes.json`,
      JSON.stringify(
        { width: WIDTH, height: HEIGHT, fps: FPS, loop: LOOP, fade: FADE, results },
        null,
        2,
      ) + '\n',
    );
  });
});
