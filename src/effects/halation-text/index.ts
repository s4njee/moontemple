import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { flickerIntensity, type FlickerSettings } from '../../gpu/optics/flicker.ts';
import { createHalation } from '../../gpu/post/halation.ts';
import { createHdrTail, OVERLAY_PARAMS, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createRenderTarget } from '../../gpu/targets.ts';
import { createUniformBuffer, defineUniformStruct, uniformArray } from '../../gpu/uniforms.ts';
import { createTextAtlas, layoutText, type TextAtlas } from '../../gpu/ui/atlas.ts';
import msdf from '../../gpu/ui/msdf.wgsl';
import { trackPageText } from '../../gpu/ui/page-text.ts';
import { defineEffect } from '../types.ts';
import maskShader from './mask.wgsl';
import { meta } from './meta.ts';
import signShader from './sign.wgsl';

type Rgb = readonly [number, number, number];

const MAX_GLYPHS = 16;
/** The atlas cell is 48 px high at 36 px per em. */
const EM_PER_CELL = 36 / 48;

const MaskParams = defineUniformStruct('MaskParams', {
  glyphs: uniformArray('vec4f', MAX_GLYPHS / 2),
  origin: 'vec4f',
  aspect: 'f32',
  pixel: 'f32',
  count: 'u32',
});

/** Shown only where there is no page headline to light (the bare canvas, posters, tests). */
const WORDS = ['LATE SHOW', 'OPEN ALL NIGHT', 'MOON TEMPLE', 'CINEMA', 'HOTEL'] as const;

/** Linear colour of the sign's light, before brightness. */
const COLOURS: Record<string, Rgb> = {
  tungsten: [1, 0.58, 0.28],
  white: [1, 0.96, 0.9],
  'neon red': [1, 0.09, 0.05],
  sodium: [1, 0.42, 0.07],
  ice: [0.5, 0.78, 1],
};

/**
 * The canvas has to be in front of the headline to light it, but the mock pages (and many real
 * ones) put their text above the effect. This lifts the canvas over its stacking context's
 * content and lets the pointer through to the page; `destroy` puts the old values back.
 */
function liftCanvas(canvas: HTMLCanvasElement): () => void {
  const style = canvas.style as Partial<CSSStyleDeclaration> | undefined;
  if (!style) return () => {};
  const saved = [style.position, style.zIndex, style.pointerEvents] as const;
  style.position = 'relative';
  style.zIndex = '1';
  style.pointerEvents = 'none';
  return () => {
    style.position = saved[0];
    style.zIndex = saved[1];
    style.pointerEvents = saved[2];
  };
}

export const effect = defineEffect({
  meta,
  hdr: true,
  params: {
    colour: { type: 'select', default: 'tungsten', options: Object.keys(COLOURS) },
    brightness: {
      type: 'number',
      default: 4,
      min: 0,
      max: 24,
      step: 0.1,
      label: 'brightness (x paper white)',
    },
    halation: { type: 'number', default: 0.25, min: 0, max: 0.8, step: 0.01 },
    halationWidth: {
      type: 'number',
      default: 0.16,
      min: 0.02,
      max: 0.6,
      step: 0.01,
      label: 'halation width (em)',
    },
    hum: { type: 'number', default: 0.03, min: 0, max: 0.3, step: 0.005, label: 'hum (flicker)' },
    word: { type: 'select', default: 'LATE SHOW', options: WORDS, label: 'word (no page)' },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0.15 },
    burn: { type: 'number', default: 0.3, min: 0, max: 1, step: 0.01, label: 'burn to white' },
    ...OVERLAY_PARAMS,
  },
  presets: {
    'tungsten marquee': {},
    'white lightbox': { colour: 'white', halation: 0.3 },
    'red neon': { colour: 'neon red', brightness: 7, halation: 0.2, burn: 0.1 },
    'ice on film': { colour: 'ice', brightness: 5, halation: 0.35 },
    'wide halation': { halation: 0.4, halationWidth: 0.4 },
    'tired sign': { colour: 'sodium', hum: 0.22, brightness: 5 },
    'no halation': { halation: 0, bloom: 0.3 },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'halation text' });
    const halation = createHalation(device, { format: tail.scene.format });
    const atlas: TextAtlas = await createTextAtlas(device);
    const linear = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const mask = createRenderTarget(device, {
      label: 'halation text mask',
      format: 'rgba8unorm',
      width: 1,
      height: 1,
      // COPY_DST and RENDER_ATTACHMENT: the page's type arrives by copyExternalImageToTexture.
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_DST,
    });
    const maskUniforms = createUniformBuffer(device, MaskParams, 'halation text mask');
    const maskPipeline = createFullscreenPipeline(device, {
      fragment: withChunks(maskShader, {
        'msdf.wgsl': msdf.code,
        'mask-params.wgsl': MaskParams.wgsl,
      }),
      format: 'rgba8unorm',
    });
    const signPipeline = createFullscreenPipeline(device, {
      fragment: signShader,
      format: tail.scene.format,
    });
    const light = device.createBuffer({
      label: 'halation text light',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const page = trackPageText(canvas);
    const raster = typeof OffscreenCanvas === 'undefined' ? undefined : new OffscreenCanvas(1, 1);

    let width = 1;
    let height = 1;
    let clock = 0;
    /** What the mask holds: '' (nothing yet), 'page', or the stand-in's word and size. */
    let held = '';
    let em = 1;
    let signGroup: GPUBindGroup | undefined;
    let lowered: (() => void) | undefined;

    /** The stand-in sign: the word centred, as large as fits, from the MSDF atlas. */
    function bakeWord(encoder: GPUCommandEncoder) {
      const aspect = width / height;
      const line = layoutText(params.word, atlas.metrics);
      const shown = line.glyphs.slice(0, MAX_GLYPHS);
      const size = Math.min(0.26, (aspect * 0.8) / Math.max(line.width, 1e-3));
      const inks = shown.map((g) => atlas.metrics[g.glyph]!);
      const top = Math.min(...inks.map((m) => m.top));
      const bottom = Math.max(...inks.map((m) => m.bottom));
      const glyphs = new Float32Array(MAX_GLYPHS * 2);
      shown.forEach((g, i) => glyphs.set([g.glyph, g.x], i * 2));
      maskUniforms.set({
        glyphs,
        origin: [aspect / 2 - (line.width * size) / 2, 0.5 - ((top + bottom) / 2) * size, size, 0],
        aspect,
        pixel: 1 / height,
        count: shown.length,
      });
      maskUniforms.upload();
      renderFullscreen(
        encoder,
        mask.view,
        maskPipeline,
        [
          device.createBindGroup({
            layout: maskPipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: { buffer: maskUniforms.buffer } },
              { binding: 1, resource: atlas.texture.createView() },
              { binding: 2, resource: linear },
            ],
          }),
        ],
        { timestampWrites: profiler.pass('mask') },
      );
      em = size * EM_PER_CELL * height;
    }

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
        halation.resize(w, h);
        if (mask.resize(w, h) || !signGroup) {
          signGroup = device.createBindGroup({
            layout: signPipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: mask.view },
              { binding: 1, resource: { buffer: light } },
            ],
          });
        }
        held = '';
      },
      frame(time, encoder, target) {
        clock += time.delta;

        // The page's headline when there is one in the canvas, otherwise the stand-in word.
        const found = raster ? page.update() : undefined;
        if (found && found.words > 0 && raster) {
          if (found.changed || held !== 'page') {
            page.draw(raster, width, height);
            device.queue.copyExternalImageToTexture({ source: raster }, { texture: mask.texture }, [
              width,
              height,
            ]);
            held = 'page';
          }
          em = found.fontPx;
          lowered ??= liftCanvas(canvas);
        } else {
          const key = `${params.word}:${width}x${height}`;
          if (held !== key) {
            bakeWord(encoder);
            held = key;
          }
          lowered?.();
          lowered = undefined;
        }

        // A lightbox hums a little. The capped flicker cannot flash (story 2.9); a held frame shows
        // the sign at its mean brightness, never a peak.
        const hum: FlickerSettings = {
          rate: 3,
          depth: params.hum,
          shimmer: Math.min(0.04, params.hum * 0.3),
          shimmerRate: 18,
        };
        const level = time.still
          ? 1 - (hum.depth + hum.shimmer) / 2
          : flickerIntensity(clock, 6, hum);
        const colour = COLOURS[params.colour] ?? COLOURS.tungsten!;
        const k = params.brightness * level;
        device.queue.writeBuffer(
          light,
          0,
          new Float32Array([colour[0] * k, colour[1] * k, colour[2] * k, 0]),
        );
        renderFullscreen(encoder, tail.scene.view, signPipeline, [signGroup!], {
          timestampWrites: profiler.pass('sign'),
        });

        // Film's red halo: light through the emulsion, back off the base, into the red layer. Its
        // width follows the type, so a small heading and a hero title look like the same film.
        if (params.halation > 0) {
          halation.encode(
            encoder,
            tail.scene,
            { strength: params.halation, radius: params.halationWidth * em },
            profiler,
          );
        }
        tail.encode(encoder, target, time, params, profiler);
      },
      stats: () => ({ source: held === 'page' ? 'page' : 'stand-in', em: Math.round(em) }),
      destroy() {
        lowered?.();
        page.destroy();
        mask.destroy();
        maskUniforms.destroy();
        light.destroy();
        atlas.texture.destroy();
        halation.destroy();
        tail.destroy();
      },
    };
  },
});
