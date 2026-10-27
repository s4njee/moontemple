// Story 7.4's side-by-side page (experiments/css-fallbacks.html): every Tier A effect's poster, or
// the live effect where there is no poster yet, beside its CSS version from src/fallbacks/. The
// effects are read from their own files rather than the generated registry, so one added while
// the registry is stale still shows.

import type { EffectMeta, EffectModule } from '../src/effects/types.ts';
import { mount } from '../src/lib/index.ts';
import {
  CSS_FALLBACKS,
  NO_CSS_FALLBACK,
  mountCssFallback,
  planCssFallback,
} from '../src/fallbacks/css-fallbacks.ts';

const params = new URLSearchParams(location.search);
const motion = !params.has('still');
const metas = import.meta.glob<EffectMeta>('../src/effects/*/meta.ts', {
  eager: true,
  import: 'meta',
});
const posters = import.meta.glob<string>('../src/effects/*/poster.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});
const modules = import.meta.glob<EffectModule>('../src/effects/*/index.ts', { import: 'effect' });
const tierA = Object.values(metas)
  .filter((meta) => meta.tier === 'A')
  .sort((a, b) => a.title.localeCompare(b.title));
const effectPoster = (id: string) => posters[`../src/effects/${id}/poster.webp`];

declare global {
  interface Window {
    /** Read by experiments/css-fallbacks-cost.mjs. */
    __cssFallbacks?: {
      id: string;
      title: string;
      elements: number | null;
      animations: number;
      cannot: string;
      verdict: string;
    }[];
    __cssReady?: boolean;
  }
}

window.__cssFallbacks = tierA.map((meta) => {
  const config = CSS_FALLBACKS[meta.id];
  const plan = config ? planCssFallback(config) : null;
  return {
    id: meta.id,
    title: meta.title,
    elements: plan ? plan.elements : null,
    animations: plan ? plan.animations.length : 0,
    cannot: config ? config.cannot : (NO_CSS_FALLBACK[meta.id]?.reason ?? 'No entry.'),
    verdict: config ? config.verdict : 'no CSS version',
  };
});

const only = params.get('only');
if (only !== null) {
  document.body.classList.add('only');
  const stage = document.createElement('div');
  stage.className = 'only-stage';
  document.body.append(stage);
  const config = CSS_FALLBACKS[only];
  if (config) mountCssFallback(stage, config, { motion });
} else {
  renderPage();
}
window.__cssReady = true;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/** The live effect on a canvas of its own, through the library's `mount` (story 7.1). */
function liveCanvas(id: string): HTMLCanvasElement {
  const canvas = el('canvas');
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
  const load = modules[`../src/effects/${id}/index.ts`];
  if (load) void load().then((effect) => mount(canvas, effect));
  return canvas;
}

/** A page in a frame; for the gallery's effect page, its stage made the whole frame. */
function liveFrame(url: string, fullStage: boolean): HTMLIFrameElement {
  const frame = el('iframe', { src: url, title: url, loading: 'lazy' });
  if (fullStage) {
    frame.addEventListener('load', () => {
      const started = performance.now();
      const fit = () => {
        const stage = frame.contentDocument?.querySelector<HTMLElement>('.mt-effect__stage');
        if (stage) {
          Object.assign(stage.style, {
            position: 'fixed',
            inset: '0',
            width: '100vw',
            height: '100vh',
            zIndex: '100',
            border: '0',
            borderRadius: '0',
          });
        } else if (performance.now() - started < 10_000) setTimeout(fit, 200);
      };
      fit();
    });
  }
  return frame;
}

function renderPage() {
  const main = el(
    'main',
    {},
    el('h1', { textContent: 'CSS fallbacks for the Tier A effects' }),
    el('p', {
      className: 'lede',
      textContent:
        'Story 7.4. Left: the effect (its poster, or the live effect where it has none yet). Right: the best CSS version, live: radial-gradient discs, screen-blended, on a few compositor keyframes, with twinkles capped well under the flash threshold and everything held still under prefers-reduced-motion. Costs are in docs/studies/css-fallbacks.md.',
    }),
  );
  document.body.append(main);

  for (const meta of tierA) {
    const config = CSS_FALLBACKS[meta.id];
    const none = NO_CSS_FALLBACK[meta.id];
    const plan = config ? planCssFallback(config) : null;
    const verdict = config?.verdict ?? 'no CSS version';
    const pillClass =
      verdict === 'honest fallback'
        ? 'pill'
        : verdict === 'poster is better'
          ? 'pill poster'
          : 'pill none';

    const left = el('div', { className: 'frame' });
    const poster = effectPoster(meta.id);
    const useLive = params.has('live') || !poster;
    left.append(
      useLive
        ? liveCanvas(meta.id)
        : el('img', { src: poster, alt: `${meta.title} poster`, loading: 'lazy' }),
    );

    const right = el('div', { className: 'frame' });
    if (config) mountCssFallback(right, config, { motion });
    else if (none?.see) right.append(liveFrame(none.see, false));
    else right.append(el('div', { className: 'reason', textContent: 'No honest CSS version.' }));

    const row = el(
      'section',
      { className: 'row', id: meta.id },
      el(
        'h2',
        {},
        meta.title,
        el('code', { textContent: meta.id }),
        el('span', { className: pillClass, textContent: verdict }),
      ),
      el(
        'div',
        { className: 'pair' },
        el(
          'figure',
          {},
          left,
          el('figcaption', { textContent: useLive ? 'The live effect' : 'The effect’s poster' }),
        ),
        el(
          'figure',
          {},
          right,
          el('figcaption', {
            textContent: plan
              ? `CSS: ${plan.elements} elements, ${plan.animations.length} animations`
              : none?.see
                ? `Its CSS version elsewhere: ${none.see}`
                : 'No CSS version',
          }),
        ),
      ),
      el(
        'p',
        { className: 'cannot' },
        el('strong', { textContent: config ? 'What CSS cannot do: ' : 'Why no CSS version: ' }),
        config ? config.cannot : (none?.reason ?? 'No entry in CSS_FALLBACKS.'),
      ),
    );
    main.append(row);
  }
}
