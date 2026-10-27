// The "Through the lens" page (lens.html): lens-model fixed behind a whole page, the way a site
// would use it. Ordinary page code: mount the effect and make the toolbar its camera.

import { createGpuSession } from '../../gpu/device.ts';
import { mountEffect } from '../../shell/host.ts';
import { reserveToolbar } from '../backdrop/page.ts';
// The shared backdrop page's layout and plates, in the lens page's colours (lens.css imports it).
import './lens.css';

const EFFECT = 'lens-model';

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`lens page: #${id} is missing`);
  return node as T;
}

if (import.meta.env.DEV) {
  const { installShaderOverlay } = await import('../../gpu/shader-overlay.ts');
  installShaderOverlay();
}

const stage = byId('stage');
const status = byId('status');
const lensName = byId('lens-name');
const pauseButton = byId<HTMLButtonElement>('pause');
const apertureSelect = byId<HTMLSelectElement>('aperture');
const fNumberSlider = byId<HTMLInputElement>('f-number');
const fNumberValue = byId<HTMLOutputElement>('f-number-value');
const focalSlider = byId<HTMLInputElement>('focal');
const focalValue = byId<HTMLOutputElement>('focal-value');
const walkBox = byId<HTMLInputElement>('walk');
const focusSlider = byId<HTMLInputElement>('focus');
const focusValue = byId<HTMLOutputElement>('focus-value');
const conserveBox = byId<HTMLInputElement>('conserve');
const rowsSlider = byId<HTMLInputElement>('rows');
const rowsValue = byId<HTMLOutputElement>('rows-value');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The aperture each choice sets, after the effect's own presets; every key is set by each, so
 * switching never leaves one behind.
 */
const APERTURES: Record<string, Record<string, number>> = {
  round: {
    blades: 0,
    curvature: 0.2,
    rotation: 0,
    rim: 0.15,
    rings: 0,
    vignette: 0.3,
    obstruction: 0,
  },
  hexagon: {
    blades: 6,
    curvature: 0,
    rotation: 0,
    rim: 0,
    rings: 0,
    vignette: 0.3,
    obstruction: 0,
  },
  zoom: {
    blades: 7,
    curvature: 0.1,
    rotation: 0,
    rim: 0.15,
    rings: 0.18,
    ringCount: 5,
    vignette: 0.3,
    obstruction: 0,
  },
  bubble: {
    blades: 0,
    curvature: 0.2,
    rotation: 0,
    rim: 0.9,
    rings: 0,
    vignette: 0.3,
    obstruction: 0,
  },
  swirl: {
    blades: 0,
    curvature: 0.2,
    rotation: 0,
    rim: 0.15,
    rings: 0,
    vignette: 0.9,
    obstruction: 0,
  },
  mirror: {
    blades: 0,
    curvature: 0.2,
    rotation: 0,
    rim: 0.3,
    rings: 0,
    vignette: 0.3,
    obstruction: 0.5,
  },
};

/** The focus distance, metres, at `v` 0..1 of the focus slider: 0.5 m to 80 m, evenly in log. */
const focusAt = (v: number) => 0.5 * Math.pow(80 / 0.5, Math.min(1, Math.max(0, v)));

const settings: Record<string, unknown> = {
  shape: 'blades',
  fNumber: Number(fNumberSlider.value),
  focalLength: Number(focalSlider.value),
  sweep: walkBox.checked,
  focus: focusAt(Number(focusSlider.value)),
  conserve: conserveBox.checked,
  rows: Number(rowsSlider.value),
  ...APERTURES[apertureSelect.value],
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
    : !playing
      ? 'The lens is paused'
      : walkBox.checked
        ? 'The focus is walking'
        : `Focused at ${focusValue.textContent}`;
  pauseButton.textContent = playing ? 'Pause' : 'Play';
  if (!ok) pauseButton.disabled = true;
}

/** Names the lens in the status line, as a photographer would: "85 mm f/2.8". */
function showLens() {
  fNumberValue.textContent = fNumberSlider.value;
  focalValue.textContent = `${focalSlider.value} mm`;
  lensName.textContent = `${focalSlider.value} mm f/${fNumberSlider.value}`;
}

function showFocus() {
  const metres = focusAt(Number(focusSlider.value));
  focusValue.textContent = metres < 10 ? `${metres.toFixed(1)} m` : `${Math.round(metres)} m`;
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
showLens();
showFocus();
render();

reserveToolbar(document.querySelector<HTMLElement>('.toolbar')!);

// --- The toolbar -----------------------------------------------------------------------------------

pauseButton.addEventListener('click', () => {
  playing = !playing;
  if (playing) host.resume();
  else host.pause();
  render();
});

apertureSelect.addEventListener('change', () => {
  for (const [key, value] of Object.entries(APERTURES[apertureSelect.value] ?? {})) set(key, value);
});

fNumberSlider.addEventListener('input', () => {
  set('fNumber', Number(fNumberSlider.value));
  showLens();
});

focalSlider.addEventListener('input', () => {
  set('focalLength', Number(focalSlider.value));
  showLens();
});

walkBox.addEventListener('change', () => {
  set('sweep', walkBox.checked);
  render();
});

focusSlider.addEventListener('input', () => {
  // Taking the focus by hand stops it walking.
  walkBox.checked = false;
  set('sweep', false);
  set('focus', focusAt(Number(focusSlider.value)));
  showFocus();
  render();
});

conserveBox.addEventListener('change', () => set('conserve', conserveBox.checked));

rowsSlider.addEventListener('input', () => {
  set('rows', Number(rowsSlider.value));
  rowsValue.textContent = rowsSlider.value;
});

addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  host.destroy();
  session.destroy();
});
