// The "Slow spectrum" page (spectrum.html): bokeh-drift fixed behind a whole page, on its rgb
// palette, the way a site would use it. Ordinary page code: mount the effect, turn its hue, pass
// the pointer on to it for parallax, and wire up the toolbar.

import { createGpuSession } from '../../gpu/device.ts';
import { mountEffect } from '../../shell/host.ts';
import { hueColour } from '../../effects/bokeh-drift/index.ts';
import './page.css';

const EFFECT = 'bokeh-drift';

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`spectrum page: #${id} is missing`);
  return node as T;
}

if (import.meta.env.DEV) {
  const { installShaderOverlay } = await import('../../gpu/shader-overlay.ts');
  installShaderOverlay();
}

const stage = byId('stage');
const status = byId('status');
const hueName = byId('hue-name');
const pauseButton = byId<HTMLButtonElement>('pause');
const cycleSlider = byId<HTMLInputElement>('cycle');
const cycleValue = byId<HTMLOutputElement>('cycle-value');
const spreadSlider = byId<HTMLInputElement>('spread');
const lensSelect = byId<HTMLSelectElement>('lens');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The aperture each lens choice sets; every key is set by each, so switching never leaves one. */
const LENSES: Record<string, Record<string, number>> = {
  round: { blades: 0, curvature: 0.2, rotation: 0, rim: 0.25, vignette: 0.3 },
  hexagon: { blades: 6, curvature: 0.1, rotation: 10, rim: 0.1, vignette: 0.3 },
  bubble: { blades: 0, curvature: 0.2, rotation: 0, rim: 0.9, vignette: 0.3 },
  swirl: { blades: 0, curvature: 0.2, rotation: 0, rim: 0.25, vignette: 0.9 },
};

/** Seconds the page takes to turn the field once round the hue wheel. */
let cycle = Number(cycleSlider.value);

/**
 * What the page asks of the effect. The page turns the hue itself (`cycle` 0 holds the effect's
 * own sweep), so the toolbar always names the colour the field is showing. A full window is a
 * wider field than the gallery's canvas, so a few more lights.
 */
const settings: Record<string, unknown> = {
  palette: 'rgb',
  cycle: 0,
  hue: 0,
  count: 140,
  spread: Number(spreadSlider.value),
  ...LENSES[lensSelect.value],
};

const session = await createGpuSession();
let playing = !reducedMotion;

function set(key: string, value: unknown) {
  settings[key] = value;
  const params = host.loaded?.params;
  if (params) params[key] = value as (typeof params)[string];
}

function render() {
  const ok = session.state.ok;
  document.body.dataset.state = !ok ? 'fallback' : playing ? 'live' : 'paused';
  status.textContent = !ok
    ? 'WebGPU is unavailable'
    : `The field is ${playing ? 'drifting' : 'paused'}`;
  pauseButton.textContent = playing ? 'Pause' : 'Play';
  if (!ok) pauseButton.disabled = true;
}

const host = mountEffect(session, stage, EFFECT, {
  initialParams: settings,
  paused: !playing,
  allowHdr: true,
});
host.onLoad(() => {
  pauseButton.disabled = false;
  render();
});
session.onChange(render);
render();

// --- The colour --------------------------------------------------------------------------------------
// The page owns the sweep: it moves the hue on while the field plays, hands it to the effect, and
// paints the toolbar's swatch and the page's accents the same colour.

const NAMES = [
  'Red',
  'Orange',
  'Yellow',
  'Lime',
  'Green',
  'Teal',
  'Cyan',
  'Azure',
  'Blue',
  'Violet',
  'Magenta',
  'Rose',
];
/** How far round the wheel, in turns. */
let turn = 0;
let last = performance.now();
let lastName = '';

function turnHue(now: number) {
  if (playing && !document.hidden) {
    turn = (turn + Math.min(0.1, (now - last) / 1000) / cycle) % 1;
    set('hue', turn);
  }
  last = now;
  const [r, g, b] = hueColour(turn);
  const peak = Math.max(r, g, b, 1e-6);
  const channel = (v: number) => Math.round((255 * v) / peak);
  document.documentElement.style.setProperty(
    '--hue',
    `rgb(${channel(r)} ${channel(g)} ${channel(b)})`,
  );
  const name = NAMES[Math.round(turn * NAMES.length) % NAMES.length]!;
  if (name !== lastName) {
    lastName = name;
    hueName.textContent = name;
  }
  requestAnimationFrame(turnHue);
}
requestAnimationFrame(turnHue);

// --- The pointer ---------------------------------------------------------------------------------
// The canvas lies behind the page and never receives the pointer itself, and the effect listens
// only on its canvas. So the page passes movement on, announcing an entry first (the tracker only
// counts the pointer as present after one): the nearer lights then shift with it.

let entered = false;

function forward(event: PointerEvent, type = event.type) {
  const canvas = host.canvas;
  if (event.target === canvas) return;
  canvas.dispatchEvent(
    new PointerEvent(type, {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      isPrimary: event.isPrimary,
      clientX: event.clientX,
      clientY: event.clientY,
    }),
  );
}

addEventListener(
  'pointermove',
  (event) => {
    if (!entered) {
      entered = true;
      forward(event, 'pointerenter');
    }
    forward(event);
  },
  { passive: true },
);
document.documentElement.addEventListener('pointerleave', (event) => {
  entered = false;
  forward(event);
});

// --- The toolbar -----------------------------------------------------------------------------------

pauseButton.addEventListener('click', () => {
  playing = !playing;
  if (playing) host.resume();
  else host.pause();
  render();
});

cycleSlider.addEventListener('input', () => {
  // Only the pace changes: the colour carries on from where it is.
  cycle = Number(cycleSlider.value);
  cycleValue.textContent = `${cycleSlider.value} s`;
});

spreadSlider.addEventListener('input', () => set('spread', Number(spreadSlider.value)));

lensSelect.addEventListener('change', () => {
  for (const [key, value] of Object.entries(LENSES[lensSelect.value] ?? {})) set(key, value);
});

addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  host.destroy();
  session.destroy();
});
