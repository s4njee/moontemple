// The focus pull page (focus.html, story 6.2): focus-pull fixed behind a long page, racked by the
// scroll. One lens (src/effects/focus-pull/lens.ts) sets the canvas's focus and every section's
// CSS blur from the same focus distance.

import { createGpuSession } from '../../gpu/device.ts';
import { adaptQuality } from '../../lib/quality.ts';
import { mountEffect } from '../../shell/host.ts';
import { cssBlur, focusAt, pullLens, sectionDepth } from '../../effects/focus-pull/lens.ts';
import './focus.css';

const EFFECT = 'focus-pull';

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`focus page: #${id} is missing`);
  return node as T;
}

const stage = byId('stage');
const status = byId('status');
const blurToggle = byId<HTMLInputElement>('blur');
const apertureSelect = byId<HTMLSelectElement>('aperture');
const sections = [...document.querySelectorAll<HTMLElement>('section.pull')];

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Under reduced motion the scroll moves nothing: no blur, no rack (WCAG 2.3.3).
if (reducedMotion) blurToggle.checked = false;

sections.forEach((section, i) => {
  const depth = section.querySelector('.depth');
  if (depth) depth.textContent = `${sectionDepth(i).toFixed(1)} M`;
});

const settings: Record<string, unknown> = {
  drive: 'page',
  focus: sectionDepth(0),
  fNumber: Number(apertureSelect.value),
};

const session = await createGpuSession();
const host = mountEffect(session, stage, EFFECT, {
  initialParams: settings,
  paused: reducedMotion,
  allowHdr: true,
});

function set(key: string, value: unknown) {
  settings[key] = value;
  const params = host.loaded?.params;
  if (params) params[key] = value as (typeof params)[string];
}

/** Where the middle of the screen is, in sections: 2.5 is halfway from the third's middle to the fourth's. */
function scrollPosition(): number {
  const middle = innerHeight / 2;
  const centres = sections.map((s) => {
    const box = s.getBoundingClientRect();
    return (box.top + box.bottom) / 2;
  });
  if (middle <= centres[0]!) return 0;
  for (let i = 0; i + 1 < centres.length; i++) {
    const a = centres[i]!;
    const b = centres[i + 1]!;
    if (middle <= b) return i + (middle - a) / (b - a);
  }
  return centres.length - 1;
}

const written = new Map<HTMLElement, string>();
/** The quality rung in use, shown after the focus when it is not full quality. */
let rungLabel = '';

function update() {
  const focus = reducedMotion ? sectionDepth(0) : focusAt(scrollPosition());
  set('focus', focus);
  const dpr = devicePixelRatio || 1;
  const lens = pullLens(focus, Number(apertureSelect.value), innerHeight * dpr);
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    const box = section.getBoundingClientRect();
    // Off screen, a blur is invisible and costs the same to change: leave it (docs/backdrop-strategy.md).
    if (box.bottom < -200 || box.top > innerHeight + 200) continue;
    const blur = blurToggle.checked ? cssBlur(lens, sectionDepth(i), dpr) : 0;
    const value = blur < 0.15 ? 'none' : `blur(${blur.toFixed(1)}px)`;
    if (written.get(section) !== value) {
      section.style.filter = value;
      written.set(section, value);
    }
  }
  status.textContent = `Focused at ${focus.toFixed(1)} m${rungLabel ? ` · ${rungLabel}` : ''}`;
}

let queued = false;
function queue() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    update();
  });
}
addEventListener('scroll', queue, { passive: true });
addEventListener('resize', queue);
blurToggle.addEventListener('change', queue);
apertureSelect.addEventListener('change', () => {
  set('fNumber', Number(apertureSelect.value));
  queue();
});

let fellBack = false;
function render() {
  document.body.dataset.state = session.state.ok && !fellBack ? 'live' : 'fallback';
}
// Tier A's budget. Past the ladder's last rung the canvas gives way to the page's CSS lights; the
// CSS focus pull itself goes on.
host.onLoad(() => {
  adaptQuality(host, {
    budgetMs: 4,
    onChange: (rung, index) => {
      rungLabel = index > 0 ? rung.label : '';
      queue();
    },
    onFallback: () => {
      fellBack = true;
      host.pause();
      render();
    },
  });
  render();
});
session.onChange(render);
render();
update();
