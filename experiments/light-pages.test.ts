import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, it, vi } from 'vitest';
import { getTestDevice } from '../tests/gpu.ts';
import { BACKDROPS, mountHeadless, writePng } from '../tests/headless.ts';

// Story 7.5: bokeh on a light page. Bokeh is added light, and a white page has no room for it.
// Each bokeh effect is rendered once at its defaults (opaque, on its own night), and its light is
// then laid over a light page four ways, numerically, the way Fire Temple's compositing study did:
//
//   additive        page + light, clamped: what an emissive canvas over a page does by default.
//   luminance       the overlay default (OVERLAY_PARAMS): alpha = the brightest channel, so each
//                   disc hides as much page as it is bright and shows its own colour there.
//   shadow          "shadow bokeh": the page darkened where the light was, page x (1 - s L), with
//                   s = 0.55. The discs become shade, like dappled light through leaves inverted.
//   tinted          coloured glass: each disc's colour at full saturation, laid over the page with
//                   coverage k L (k = 0.7): the page tinted rather than darkened.
//
// Two numbers per strategy: how visible the discs are (mean |difference| from the bare page in
// 8-bit levels, over the pixels where the effect has light), and how much page they cost (the
// share of all pixels whose luminance drops by more than 20%, which is where text would suffer).
// Writes docs/studies/light-pages.md and docs/studies/light-pages/<id>.png (night | four strategies).
//
//   npx vitest run --config experiments/vite.config.ts experiments/light-pages.test.ts

vi.setConfig({ testTimeout: 300_000 });

const EFFECTS = [
  'bokeh-drift',
  'fairy-lights',
  'focus-cursor',
  'focus-pull',
  'fireflies',
  'snow-at-night',
  'night-street',
  'dust-in-light',
  'glitter',
  'bokeh-loader',
];
const WIDTH = 320;
const HEIGHT = 200;
const PAGE = BACKDROPS.light!;

type Strategy = (
  light: [number, number, number],
  page: readonly number[],
) => [number, number, number];

const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const STRATEGIES: Record<string, Strategy> = {
  additive: (l, p) =>
    [0, 1, 2].map((c) => Math.min(255, p[c]! + l[c]!)) as [number, number, number],
  luminance: (l, p) => {
    const alpha = Math.max(...l) / 255;
    return [0, 1, 2].map((c) => Math.min(255, l[c]! + (1 - alpha) * p[c]!)) as [
      number,
      number,
      number,
    ];
  },
  shadow: (l, p) => {
    const shade = 1 - (0.55 * luminance(...l)) / 255;
    return [0, 1, 2].map((c) => p[c]! * shade) as [number, number, number];
  },
  tinted: (l, p) => {
    const peak = Math.max(...l, 1);
    const cover = (0.7 * luminance(...l)) / 255;
    return [0, 1, 2].map((c) => {
      // The disc's hue at full strength, darkened a little so a white disc still shows as grey glass.
      const tint = (0.8 * (255 * l[c]!)) / peak;
      return p[c]! * (1 - cover) + tint * cover;
    }) as [number, number, number];
  },
};

/** The decision this study supports, kept with it so a re-run writes it back. */
const VERDICT = `- **Additive is never the answer.** A light page has five to ten 8-bit steps of headroom, and every effect here moved it by 5 to 7: invisible, as Fire Temple's 3.3 found for fire.
- **Luminance alpha, the overlay default, is the one that works for warm, sparse lights.** Each disc hides as much page as it is bright and shows its own colour there: fairy-lights, focus-cursor, fireflies, snow-at-night and bokeh-loader all read clearly (20 to 40 levels) and darken almost none of the page. \`fairy-lights\` now has it as \`page: light\` (the preset "over a light page", \`lightPage: 'underlay'\`); the others are the same change (spread \`OVERLAY_PARAMS\`, clear to transparent) when they are wanted on a light page.
- **Dense or cool fields stay in a dark section.** bokeh-drift's violet field under luminance alpha reads as ink, not light, and darkens a quarter of the page past what text tolerates. Low-light scenes (night-street, dust-in-light, focus-pull) barely show at all. Their \`lightPage\` stays \`no\`: give them a dark band of their own.
- **Shadow bokeh is a different picture, not a fallback.** Grey discs read as shade: dappled light inverted. It is the most visible strategy (20 to 56 levels) and it is the only one that costs real page, so it belongs to an effect whose subject is shade, which none of these is.
- **Tinted glass is the gentle option.** Pastel discs a third as visible as luminance alpha, never darkening the page: for a light page that carries text over the whole effect, as a hero background would.`;

describe('bokeh on a light page', () => {
  it('composites every bokeh effect four ways', async () => {
    const device = await getTestDevice();
    mkdirSync('docs/studies/light-pages', { recursive: true });
    const rows: string[] = [];
    for (const id of EFFECTS) {
      const mounted = await mountHeadless(id, { width: WIDTH, height: HEIGHT, device });
      await mounted.runTo(2);
      const rgba = await mounted.read();
      mounted.destroy();
      // The night's own ground is not light: take the darkest level in the frame as its black.
      let floor = 255;
      for (let i = 0; i < rgba.length; i += 4)
        floor = Math.min(floor, Math.max(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!));
      const strip = new Uint8Array(WIDTH * 5 * HEIGHT * 3);
      const put = (panel: number, x: number, y: number, rgb: readonly number[]) => {
        const o = (y * WIDTH * 5 + panel * WIDTH + x) * 3;
        for (let c = 0; c < 3; c++) strip[o + c] = Math.round(Math.max(0, Math.min(255, rgb[c]!)));
      };
      const scores: string[] = [];
      Object.entries(STRATEGIES).forEach(([, strategy], k) => {
        let visible = 0;
        let lit = 0;
        let costly = 0;
        const pageL = luminance(PAGE[0]!, PAGE[1]!, PAGE[2]!);
        for (let y = 0; y < HEIGHT; y++) {
          for (let x = 0; x < WIDTH; x++) {
            const i = (y * WIDTH + x) * 4;
            const light: [number, number, number] = [0, 1, 2].map((c) =>
              Math.max(0, rgba[i + c]! - floor),
            ) as [number, number, number];
            if (k === 0) put(0, x, y, [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!]);
            const out = strategy(light, PAGE);
            put(k + 1, x, y, out);
            if (Math.max(...light) > 24) {
              lit++;
              visible +=
                (Math.abs(out[0] - PAGE[0]!) +
                  Math.abs(out[1] - PAGE[1]!) +
                  Math.abs(out[2] - PAGE[2]!)) /
                3;
            }
            if (luminance(...out) < 0.8 * pageL) costly++;
          }
        }
        scores.push(
          `${(lit ? visible / lit : 0).toFixed(1)} / ${((100 * costly) / (WIDTH * HEIGHT)).toFixed(1)}%`,
        );
      });
      writePng(`docs/studies/light-pages/${id}.png`, WIDTH * 5, HEIGHT, strip);
      rows.push(`| ${id} | ${scores.join(' | ')} |`);
    }
    const lines = [
      '# Bokeh on a light page',
      '',
      'Story 7.5. Each bokeh effect rendered once at its defaults (320 × 200, two seconds in, on Dawn), its light laid over a light page (`#faf8f5`) four ways, numerically. The method and the four strategies are described in `experiments/light-pages.test.ts`; re-run with `npx vitest run --config experiments/vite.config.ts experiments/light-pages.test.ts`. Each cell: how visible the discs are (mean difference from the bare page, 8-bit levels, where the effect has light) / the share of the frame darkened by more than 20%, where text would suffer.',
      '',
      '## Decision per effect',
      '',
      VERDICT,
      '',
      '## The measurements',
      '',
      '| Effect | Additive | Luminance alpha | Shadow bokeh | Tinted glass |',
      '| --- | ---: | ---: | ---: | ---: |',
      ...rows,
      '',
      'Each image: the effect on its own night, then additive, luminance alpha, shadow bokeh and tinted glass over the light page.',
      '',
      ...EFFECTS.map((id) => `![${id}](light-pages/${id}.png)`),
      '',
    ];
    writeFileSync('docs/studies/light-pages.md', `${lines.join('\n')}\n`);
  });
});
