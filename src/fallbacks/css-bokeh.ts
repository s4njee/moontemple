// CSS fallbacks for the bokeh family (plan story 7.4): the best version of an effect a front-end
// developer can build without WebGPU, from soft discs drawn as radial gradients, screen-blended so
// overlaps brighten, moved by a few CSS keyframes. Story 4.1's experiment (experiments/
// css-bokeh.html) is the model: one fixed keyframe travel per layer, so every animation stays on
// the compositor (a custom property inside keyframes would make Chrome recompute style every
// frame), and per-disc variety only through duration and delay.
//
//   const unmount = mountCssFallback(container, CSS_FALLBACKS['bokeh-drift']!);
//
// No dependencies, and the plan is a pure function of the config (`planCssFallback`), so the
// layout and the flash limits can be checked without a DOM. Sizes are container query units:
// the fallback fills its container, whatever its size. Under `prefers-reduced-motion: reduce` every
// animation is paused where its negative delay put it, so the field is still and evenly spread.

/** A colour as `#rrggbb`. */
export type Hex = `#${string}`;
/** A position as fractions of the container's width and height. */
export type Point = readonly [x: number, y: number];
/** A range to draw uniformly from. */
export type Range = readonly [min: number, max: number];

/**
 * How a disc is drawn: `disc` is a flat out-of-focus disc with a slightly brighter rim, `glow` a
 * soft falloff with no edge, `point` an in-focus light (a white core in a coloured halo), `hex` a
 * flat hexagon (a lens ghost through six blades).
 */
export type Profile = 'disc' | 'glow' | 'point' | 'hex';

export type Placement =
  | { kind: 'scatter'; x?: Range; y?: Range }
  | {
      /** Along a quadratic curve from `from` through `via` to `to`, e.g. a string of bulbs. */
      kind: 'path';
      from: Point;
      via?: Point;
      to: Point;
      /** `even` spaces the discs along the curve; `random` scatters them on it. */
      spacing: 'even' | 'random';
      /** Bunches even spacing towards `from` when above 1, as perspective does. */
      bunching?: number;
      /** Jitter across the curve, in percent of the container's height. */
      spread?: number;
      /** Grow the discs from the smallest at `from` to the largest at `to`. */
      sizeAlong?: boolean;
    }
  | {
      /** Round a centre: angles in degrees clockwise from three o'clock, radius in % of height. */
      kind: 'ring';
      centre: Point;
      radius: number;
      start?: number;
      sweep?: number;
      spacing: 'even' | 'random';
    };

export type Motion =
  /** Across the container and round again, off one edge and in at the other. */
  | { kind: 'travel'; direction: 'up' | 'down' | 'left' | 'right'; duration: Range; skew?: number }
  /** Back and forth by (dx, dy), in percent of the container's height. */
  | { kind: 'sway'; dx: number; dy: number; duration: Range };

/** A slow opacity dip on each disc, out of phase with its neighbours. */
export interface Twinkle {
  /** Seconds for a full dip and recovery. */
  period: Range;
  /** How far the opacity dips: 0.3 takes it to 70% and back. */
  amplitude: number;
}

export interface DiscLayer {
  count: number;
  placement: Placement;
  /** Diameter in percent of the container's height. */
  size: Range;
  /** Above 1 favours the small end of `size`, as distance does. */
  sizeBias?: number;
  /** Width over height: above 1 stretches the discs into ellipses (a bank of cloud). */
  aspect?: number;
  profile: Profile;
  palette: readonly Hex[];
  alpha: Range;
  motion?: Motion;
  twinkle?: Twinkle;
  /** Moves the layer as one: a string swaying, a ring spinning. */
  layerMotion?:
    | { kind: 'sway'; dx: number; dy: number; duration: number }
    | { kind: 'spin'; centre: Point; duration: number };
  /** A CSS mask over the layer, e.g. a beam the dust shows only inside. */
  mask?: string;
  /** Default `screen`, so overlaps add up towards white. */
  blend?: 'screen' | 'normal' | 'plus-lighter';
}

/** A star glint: a core and thin diffraction spikes. */
export interface Star {
  at: Point;
  /** Spike length, in percent of the container's height. */
  length: number;
  /** Core diameter, in percent of the container's height. */
  core: number;
  rays: 4 | 6 | 8;
  /** Degrees. */
  angle?: number;
  colour: Hex;
  alpha?: number;
  twinkle?: Twinkle;
}

/** A card, for effects that light the page's own elements. */
export interface Panel {
  at: Point;
  /** Width and height as fractions of the container. */
  w: number;
  h: number;
  /** A star on this corner that brightens while the card is hovered. */
  glint?: Omit<Star, 'at'> & { corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' };
}

export interface CssFallbackConfig {
  /** Seeds the layout, so the field is the same on every load. */
  seed: number;
  /** The container's own background: a scene in CSS gradients. */
  background: string;
  layers: readonly DiscLayer[];
  stars?: readonly Star[];
  panels?: readonly Panel[];
  /** Opacity of a panel's glint when the pointer is elsewhere. */
  glintRest?: number;
  /** What the CSS version cannot do that the effect does. */
  cannot: string;
  /** Whether a site should ship the CSS version, or the poster (or nothing) is the better fallback. */
  verdict: 'honest fallback' | 'poster is better' | 'leave it out';
}

/**
 * Flash limits every config is held to, by construction (WCAG 2.3.1 allows three flashes a second;
 * these stay far under it). A twinkle is a slow, partial dip on a small light, each out of phase
 * with the rest, so no large area brightens and darkens together.
 */
export const FLASH_LIMITS = {
  /** Seconds: at most one dip in 1.5 s, a fifth of the threshold rate. */
  minTwinklePeriod: 1.5,
  /** The opacity never dips below 40% and back. */
  maxTwinkleAmplitude: 0.6,
  /** A twinkling light is at most this wide, in percent of the container's height. */
  maxTwinkleSize: 10,
  /** Seconds for any travel, sway or spin: motion, not flicker. */
  minMotionDuration: 4,
} as const;

/** Everything in a config that breaks the flash limits; empty when it is safe. */
export function flashProblems(config: CssFallbackConfig): string[] {
  const problems: string[] = [];
  const twinkle = (where: string, t: Twinkle | undefined, size: number) => {
    if (!t) return;
    if (t.period[0] < FLASH_LIMITS.minTwinklePeriod)
      problems.push(`${where}: twinkle period ${t.period[0]} s`);
    if (t.amplitude > FLASH_LIMITS.maxTwinkleAmplitude)
      problems.push(`${where}: twinkle amplitude ${t.amplitude}`);
    if (size > FLASH_LIMITS.maxTwinkleSize)
      problems.push(`${where}: twinkling light ${size}% high`);
  };
  const motion = (where: string, seconds: number) => {
    if (seconds < FLASH_LIMITS.minMotionDuration) problems.push(`${where}: motion in ${seconds} s`);
  };
  config.layers.forEach((layer, i) => {
    twinkle(`layer ${i}`, layer.twinkle, layer.size[1]);
    if (layer.motion) motion(`layer ${i}`, layer.motion.duration[0]);
    if (layer.layerMotion) motion(`layer ${i}`, layer.layerMotion.duration);
  });
  config.stars?.forEach((star, i) => twinkle(`star ${i}`, star.twinkle, star.core));
  config.panels?.forEach((panel, i) =>
    twinkle(`glint ${i}`, panel.glint?.twinkle, panel.glint?.core ?? 0),
  );
  return problems;
}

// --- The plan: elements and keyframes as data -----------------------------------------------------

export interface ElementPlan {
  className: string;
  /** Kebab-case CSS properties. */
  style: Record<string, string>;
  children?: ElementPlan[];
}

/** One animation as it will run on one element, for the flash and cost checks. */
export interface AnimationPlan {
  kind: 'travel' | 'sway' | 'spin' | 'twinkle';
  /** Seconds. */
  duration: number;
  /** Twinkle only. */
  amplitude?: number;
  /** Twinkle only: the light's diameter in percent of the container's height. */
  size?: number;
}

export interface FallbackPlan {
  /** Scoped under `.${scope}`: the keyframes and the reduced-motion rule. */
  css: string;
  root: ElementPlan;
  /** Elements in the fallback, the root included. */
  elements: number;
  animations: AnimationPlan[];
}

/** Mulberry32, the generator the effects and story 4.1's experiment use. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ASPECT = 16 / 9;
const n = (v: number, digits = 2) => Number(v.toFixed(digits)).toString();
const lerp = (range: Range, t: number) => range[0] + (range[1] - range[0]) * t;

function rgb(hex: Hex, alpha: number): string {
  const v = parseInt(hex.slice(1), 16);
  return `rgb(${(v >> 16) & 255} ${(v >> 8) & 255} ${v & 255} / ${n(Math.min(1, alpha), 3)})`;
}

function gradient(profile: Profile, colour: Hex, alpha: number): string {
  const c = (a: number) => rgb(colour, a);
  switch (profile) {
    case 'disc':
    case 'hex':
      return `radial-gradient(closest-side, ${c(alpha)} 0 66%, ${c(alpha * 1.3)} 88%, ${c(0)} 100%)`;
    case 'glow':
      return `radial-gradient(closest-side, ${c(alpha)} 0, ${c(alpha * 0.6)} 30%, ${c(alpha * 0.2)} 60%, ${c(0)} 100%)`;
    case 'point':
      return `radial-gradient(closest-side, rgb(255 255 255 / ${n(alpha, 3)}) 0 14%, ${c(alpha)} 34%, ${c(alpha * 0.35)} 60%, ${c(0)} 100%)`;
  }
}

/** Stand-in lines of text on a panel, so a bare panel reads as a card: a title and three lines. */
const CARD_TEXT = ['8% 20% / 22% 5%', '8% 42% / 55% 7%', '8% 64% / 78% 4.5%', '8% 76% / 60% 4.5%']
  .map((box, i) => {
    const ink = `rgb(255 255 255 / ${i === 1 ? 0.5 : 0.18})`;
    return `linear-gradient(${ink}, ${ink}) ${box} no-repeat`;
  })
  .join(', ');

const HEXAGON = 'polygon(25% 6.7%, 75% 6.7%, 100% 50%, 75% 93.3%, 25% 93.3%, 0 50%)';

/** A position: a fraction of the width or height plus an offset in percent of the height. */
const at = (fraction: number, axis: 'cqw' | 'cqh', offset: number) =>
  axis === 'cqh'
    ? `${n(fraction * 100 + offset)}cqh`
    : `calc(${n(fraction * 100)}cqw + ${n(offset)}cqh)`;

interface Spot {
  x: number;
  y: number;
  ox: number;
  oy: number;
  t: number;
}

function place(placement: Placement, i: number, count: number, r: () => number): Spot {
  switch (placement.kind) {
    case 'scatter': {
      const x = lerp(placement.x ?? [0, 1], r());
      const y = lerp(placement.y ?? [0, 1], r());
      return { x, y, ox: 0, oy: 0, t: r() };
    }
    case 'path': {
      const even = (i + 0.5) / count;
      const t =
        placement.spacing === 'even'
          ? Math.pow(even, placement.bunching ?? 1)
          : Math.pow(r(), placement.bunching ?? 1);
      const [x0, y0] = placement.from;
      const [x2, y2] = placement.to;
      const [x1, y1] = placement.via ?? [(x0 + x2) / 2, (y0 + y2) / 2];
      const u = 1 - t;
      const x = u * u * x0 + 2 * u * t * x1 + t * t * x2;
      const y = u * u * y0 + 2 * u * t * y1 + t * t * y2;
      // Across the curve, in percent of the height: the tangent in height units, turned 90°.
      const tx = (2 * u * (x1 - x0) + 2 * t * (x2 - x1)) * ASPECT;
      const ty = 2 * u * (y1 - y0) + 2 * t * (y2 - y1);
      const length = Math.hypot(tx, ty) || 1;
      const s = (placement.spread ?? 0) * (r() + r() - 1);
      return { x, y, ox: (-ty / length) * s, oy: (tx / length) * s, t };
    }
    case 'ring': {
      const sweep = placement.sweep ?? 360;
      const f =
        placement.spacing === 'even'
          ? sweep === 360
            ? i / count
            : i / Math.max(1, count - 1)
          : r();
      const angle = (((placement.start ?? 0) + sweep * f) * Math.PI) / 180;
      return {
        x: placement.centre[0],
        y: placement.centre[1],
        ox: placement.radius * Math.cos(angle),
        oy: placement.radius * Math.sin(angle),
        t: f,
      };
    }
  }
}

/** Every element and keyframe of a fallback, under the class `scope`. Pure: no DOM. */
export function planCssFallback(config: CssFallbackConfig, scope = 'cssfb'): FallbackPlan {
  const problems = flashProblems(config);
  if (problems.length)
    throw new Error(`CSS fallback over the flash limits: ${problems.join('; ')}`);
  const r = random(config.seed);
  const keyframes: string[] = [];
  const animations: AnimationPlan[] = [];
  let elements = 1;
  const name = (k: string) => `${scope}-${k}`;
  const animation = (key: string, seconds: number, delay: number, timing: string) =>
    `${name(key)} ${n(seconds, 2)}s ${timing} ${n(-delay, 2)}s infinite`;
  const twinkleFrames = (key: string, t: Twinkle) =>
    keyframes.push(
      `@keyframes ${name(key)} { 0%, 100% { opacity: 1; } 50% { opacity: ${n(1 - t.amplitude, 3)}; } }`,
    );

  const layers: ElementPlan[] = config.layers.map((layer, li) => {
    const discs: ElementPlan[] = [];
    const maxSize = layer.size[1];
    const aspect = layer.aspect ?? 1;
    const maxWidth = maxSize * aspect;
    const motion = layer.motion;
    if (motion?.kind === 'travel') {
      const span = `${n(100 + 2 * maxSize)}cqh`;
      const skew = `${n(motion.skew ?? 0)}cqh`;
      const across =
        motion.direction === 'up' || motion.direction === 'down'
          ? `${skew}, ${motion.direction === 'up' ? '-' : ''}${span}`
          : `calc(${motion.direction === 'left' ? '-1 * ' : ''}(100cqw + ${n(2 * maxWidth)}cqh)), ${skew}`;
      keyframes.push(
        `@keyframes ${name(`l${li}-m`)} { from { transform: translate(0, 0); } to { transform: translate(${across}); } }`,
      );
    } else if (motion?.kind === 'sway') {
      const a = `${n(motion.dx / 2)}cqh, ${n(motion.dy / 2)}cqh`;
      const b = `${n(-motion.dx / 2)}cqh, ${n(-motion.dy / 2)}cqh`;
      const c = `${n(-motion.dx / 2)}cqh, ${n(motion.dy / 2)}cqh`;
      const d = `${n(motion.dx / 2)}cqh, ${n(-motion.dy / 2)}cqh`;
      // Two mirrored paths, so neighbours do not all lean the same way.
      keyframes.push(
        `@keyframes ${name(`l${li}-m`)} { from { transform: translate(${b}); } to { transform: translate(${a}); } }`,
        `@keyframes ${name(`l${li}-n`)} { from { transform: translate(${c}); } to { transform: translate(${d}); } }`,
      );
    }
    if (layer.twinkle) twinkleFrames(`l${li}-t`, layer.twinkle);

    for (let i = 0; i < layer.count; i++) {
      const spot = place(layer.placement, i, layer.count, r);
      const sizeT =
        layer.placement.kind === 'path' && layer.placement.sizeAlong
          ? spot.t
          : Math.pow(r(), layer.sizeBias ?? 1);
      const size = lerp(layer.size, sizeT);
      const colour = layer.palette[Math.floor(r() * layer.palette.length)] ?? '#ffffff';
      const alpha = lerp(layer.alpha, r());
      const style: Record<string, string> = {
        width: `${n(size * aspect)}cqh`,
        height: `${n(size)}cqh`,
        background: gradient(layer.profile, colour, alpha),
      };
      if (layer.profile === 'hex') style['clip-path'] = HEXAGON;
      const running: string[] = [];
      if (motion?.kind === 'travel') {
        const seconds = lerp(motion.duration, r());
        running.push(animation(`l${li}-m`, seconds, r() * seconds, 'linear'));
        animations.push({ kind: 'travel', duration: seconds });
        // Start just past the edge it enters from; the negative delay spreads the field.
        const vertical = motion.direction === 'up' || motion.direction === 'down';
        style.left = vertical
          ? at(spot.x, 'cqw', spot.ox - (size * aspect) / 2)
          : motion.direction === 'left'
            ? `calc(100cqw + ${n(maxWidth - size * aspect)}cqh)`
            : `${n(-maxWidth)}cqh`;
        style.top = !vertical
          ? at(spot.y, 'cqh', spot.oy - size / 2)
          : motion.direction === 'up'
            ? `${n(100 + maxSize - size)}cqh`
            : `${n(-maxSize)}cqh`;
      } else {
        style.left = at(spot.x, 'cqw', spot.ox - (size * aspect) / 2);
        style.top = at(spot.y, 'cqh', spot.oy - size / 2);
        if (motion?.kind === 'sway') {
          const seconds = lerp(motion.duration, r());
          const key = i % 2 ? `l${li}-n` : `l${li}-m`;
          running.push(
            `${name(key)} ${n(seconds)}s ease-in-out ${n(-r() * 2 * seconds)}s infinite alternate`,
          );
          animations.push({ kind: 'sway', duration: seconds });
        }
      }
      if (layer.twinkle) {
        const seconds = lerp(layer.twinkle.period, r());
        running.push(animation(`l${li}-t`, seconds, r() * seconds, 'ease-in-out'));
        animations.push({
          kind: 'twinkle',
          duration: seconds,
          amplitude: layer.twinkle.amplitude,
          size,
        });
      }
      if (running.length) {
        style.animation = running.join(', ');
        style['will-change'] = layer.twinkle && !motion ? 'opacity' : 'transform';
      }
      discs.push({ className: 'cssfb-disc', style });
      elements++;
    }

    const style: Record<string, string> = {};
    if (layer.mask) {
      style['mask-image'] = layer.mask;
      style['-webkit-mask-image'] = layer.mask;
    }
    if (layer.blend && layer.blend !== 'screen') style['--cssfb-blend'] = layer.blend;
    const lm = layer.layerMotion;
    if (lm?.kind === 'spin') {
      keyframes.push(`@keyframes ${name(`l${li}-s`)} { to { transform: rotate(1turn); } }`);
      style['transform-origin'] = `${n(lm.centre[0] * 100)}% ${n(lm.centre[1] * 100)}%`;
      style.animation = `${name(`l${li}-s`)} ${n(lm.duration)}s linear infinite`;
      animations.push({ kind: 'spin', duration: lm.duration });
    } else if (lm?.kind === 'sway') {
      keyframes.push(
        `@keyframes ${name(`l${li}-s`)} { from { transform: translate(${n(-lm.dx / 2)}cqh, ${n(-lm.dy / 2)}cqh); } to { transform: translate(${n(lm.dx / 2)}cqh, ${n(lm.dy / 2)}cqh); } }`,
      );
      style.animation = `${name(`l${li}-s`)} ${n(lm.duration)}s ease-in-out ${n(-r() * lm.duration)}s infinite alternate`;
      animations.push({ kind: 'sway', duration: lm.duration });
    }
    if (style.animation) style['will-change'] = 'transform';
    elements++;
    return { className: 'cssfb-layer', style, children: discs };
  });

  const starPlan = (star: Omit<Star, 'at'>, key: string, extra: Record<string, string>) => {
    const children: ElementPlan[] = [];
    const lines = star.rays / 2;
    const alpha = star.alpha ?? 1;
    for (let k = 0; k < lines; k++) {
      const angle = (star.angle ?? 0) + (180 / lines) * k;
      children.push({
        className: 'cssfb-spike',
        style: {
          width: `${n(star.length)}cqh`,
          background: `linear-gradient(90deg, ${rgb(star.colour, 0)}, ${rgb(star.colour, alpha * 0.55)} 42%, ${rgb('#ffffff', alpha)} 50%, ${rgb(star.colour, alpha * 0.55)} 58%, ${rgb(star.colour, 0)})`,
          transform: `translate(-50%, -50%) rotate(${n(angle)}deg)`,
        },
      });
    }
    children.push({
      className: 'cssfb-core',
      style: {
        width: `${n(star.core)}cqh`,
        height: `${n(star.core)}cqh`,
        background: gradient('point', star.colour, alpha),
      },
    });
    elements += 1 + children.length;
    const style = { ...extra };
    if (star.twinkle) {
      twinkleFrames(key, star.twinkle);
      const seconds = lerp(star.twinkle.period, r());
      style.animation = animation(key, seconds, r() * seconds, 'ease-in-out');
      animations.push({
        kind: 'twinkle',
        duration: seconds,
        amplitude: star.twinkle.amplitude,
        size: star.core,
      });
    }
    return { className: 'cssfb-star', style, children };
  };

  const stars = (config.stars ?? []).map((star, i) =>
    starPlan(star, `s${i}`, { left: at(star.at[0], 'cqw', 0), top: at(star.at[1], 'cqh', 0) }),
  );

  const panels = (config.panels ?? []).map((panel, i): ElementPlan => {
    elements++;
    const children: ElementPlan[] = [];
    if (panel.glint) {
      const right = panel.glint.corner.endsWith('right');
      const bottom = panel.glint.corner.startsWith('bottom');
      children.push(
        starPlan(panel.glint, `g${i}`, {
          left: right ? '100%' : '0',
          top: bottom ? '100%' : '0',
        }),
      );
      children[0]!.className = 'cssfb-star cssfb-glint';
    }
    return {
      className: 'cssfb-panel',
      style: {
        left: `${n(panel.at[0] * 100)}cqw`,
        top: `${n(panel.at[1] * 100)}cqh`,
        width: `${n(panel.w * 100)}cqw`,
        height: `${n(panel.h * 100)}cqh`,
      },
      children,
    };
  });

  const s = `.${scope}`;
  const css = [
    `${s} { position: absolute; inset: 0; overflow: hidden; container-type: size; isolation: isolate; pointer-events: none; }`,
    `${s} .cssfb-bg { position: absolute; inset: 0; }`,
    `${s} .cssfb-layer { position: absolute; inset: 0; mix-blend-mode: var(--cssfb-blend, screen); }`,
    `${s} .cssfb-disc { position: absolute; border-radius: 50%; mix-blend-mode: screen; }`,
    `${s} .cssfb-star { position: absolute; width: 0; height: 0; mix-blend-mode: screen; }`,
    `${s} .cssfb-spike { position: absolute; left: 0; top: 0; height: max(1px, 0.18cqh); border-radius: 50%; }`,
    `${s} .cssfb-core { position: absolute; left: 0; top: 0; border-radius: 50%; transform: translate(-50%, -50%); }`,
    `${s} .cssfb-panel { position: absolute; box-sizing: border-box; border: 1px solid rgb(255 255 255 / 0.09); border-radius: 1.4cqh; pointer-events: auto; background: ${CARD_TEXT}, rgb(255 255 255 / 0.025); }`,
    `${s} .cssfb-glint { opacity: ${n(config.glintRest ?? 0.35)}; transition: opacity 0.4s ease; }`,
    `${s} .cssfb-panel:hover .cssfb-glint { opacity: 1; }`,
    ...keyframes,
    // Reduced motion: every animation held where its negative delay put it, so the field stays
    // spread out instead of collapsing to the start of each travel.
    `@media (prefers-reduced-motion: reduce) { ${s} *, ${s} { animation-play-state: paused !important; } }`,
    `${s}.cssfb-still *, ${s}.cssfb-still { animation-play-state: paused !important; }`,
  ].join('\n');

  return {
    css,
    root: {
      className: scope,
      style: {},
      // The scene on a child, not the root: the root is the size container, and container units
      // on the container itself resolve against the viewport.
      children: [
        { className: 'cssfb-bg', style: { background: config.background } },
        ...layers,
        ...stars,
        ...panels,
      ],
    },
    elements: elements + 1,
    animations,
  };
}

// --- Mounting -------------------------------------------------------------------------------------

let mounts = 0;

export interface MountOptions {
  /** False holds every animation still, as reduced motion does. */
  motion?: boolean;
}

/** Builds the fallback inside `container` (made a positioning context if it is not one). */
export function mountCssFallback(
  container: HTMLElement,
  config: CssFallbackConfig,
  options: MountOptions = {},
): () => void {
  const scope = `cssfb-${++mounts}`;
  const plan = planCssFallback(config, scope);
  const style = document.createElement('style');
  style.textContent = plan.css;
  document.head.append(style);

  const build = (p: ElementPlan): HTMLElement => {
    const el = document.createElement('div');
    el.className = p.className;
    for (const [key, value] of Object.entries(p.style)) el.style.setProperty(key, value);
    for (const child of p.children ?? []) el.append(build(child));
    return el;
  };
  const root = build(plan.root);
  root.setAttribute('aria-hidden', 'true');
  root.classList.add('cssfb');
  if (options.motion === false) root.classList.add('cssfb-still');

  const previous = container.style.position;
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.append(root);
  return () => {
    root.remove();
    style.remove();
    container.style.position = previous;
  };
}
