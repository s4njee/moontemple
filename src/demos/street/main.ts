// The "Night street" page (street.html): night-street fixed behind a whole page, the way a site
// would use it. Ordinary page code: mount the effect, pass the pointer on to it so it pulls the
// focus, and wire up the toolbar.

import { createGpuSession } from '../../gpu/device.ts';
import { mountEffect } from '../../shell/host.ts';
import { forwardPointer, reserveToolbar } from '../backdrop/page.ts';
// The shared backdrop page's layout and plates, in the street page's colours (street.css imports it).
import './street.css';

const EFFECT = 'night-street';

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`street page: #${id} is missing`);
  return node as T;
}

if (import.meta.env.DEV) {
  const { installShaderOverlay } = await import('../../gpu/shader-overlay.ts');
  installShaderOverlay();
}

const stage = byId('stage');
const status = byId('status');
const focusName = byId('focus-name');
const pauseButton = byId<HTMLButtonElement>('pause');
const lensSelect = byId<HTMLSelectElement>('lens');
const followBox = byId<HTMLInputElement>('follow');
const focusSlider = byId<HTMLInputElement>('focus');
const focusValue = byId<HTMLOutputElement>('focus-value');
const trafficSlider = byId<HTMLInputElement>('traffic');
const wetSlider = byId<HTMLInputElement>('wet');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The aperture each lens choice sets; every key is set by each, so switching never leaves one. */
const LENSES: Record<string, Record<string, number>> = {
  round: { blades: 0, curvature: 0.2, rotation: 0, rim: 0.25, vignette: 0.3 },
  nine: { blades: 9, curvature: 0.25, rotation: 0, rim: 0.1, vignette: 0.3 },
  bubble: { blades: 0, curvature: 0.2, rotation: 0, rim: 0.9, vignette: 0.3 },
  swirl: { blades: 0, curvature: 0.2, rotation: 0, rim: 0.25, vignette: 0.9 },
};

/**
 * The focus distance, metres, at `v` 0..1 of the page's height (or of the focus slider): the
 * effect's own pointer mapping, 0.8 m at the top to 120 m at the bottom, evenly in log distance.
 * The page uses it to show where the lens is focused.
 */
const focusAt = (v: number) => 0.8 * Math.pow(120 / 0.8, Math.min(1, Math.max(0, v)));

const settings: Record<string, unknown> = {
  pointerFocus: followBox.checked,
  focus: focusAt(Number(focusSlider.value)),
  traffic: Number(trafficSlider.value),
  wet: Number(wetSlider.value),
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
    : `The street is ${playing ? 'moving' : 'paused'}`;
  pauseButton.textContent = playing ? 'Pause' : 'Play';
  if (!ok) pauseButton.disabled = true;
}

/** Shows the focus at `v` on the slider and in the status line. */
function showFocus(v: number) {
  const metres = focusAt(v);
  focusSlider.value = String(v);
  focusValue.textContent = metres < 10 ? `${metres.toFixed(1)} m` : `${Math.round(metres)} m`;
  focusName.textContent =
    metres < 3 ? 'Focused close' : metres < 25 ? 'Focused on the street' : 'Focused far away';
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
showFocus(Number(focusSlider.value));
render();

forwardPointer(host);
reserveToolbar(document.querySelector<HTMLElement>('.toolbar')!);

// While the pointer pulls the focus, the slider follows it, so the toolbar always says where the
// lens is aimed. Leaving the page hands the focus back to the slider, as the effect does.
addEventListener(
  'pointermove',
  (event) => {
    if (followBox.checked) showFocus(event.clientY / innerHeight);
  },
  { passive: true },
);

// --- The toolbar -----------------------------------------------------------------------------------

pauseButton.addEventListener('click', () => {
  playing = !playing;
  if (playing) host.resume();
  else host.pause();
  render();
});

lensSelect.addEventListener('change', () => {
  for (const [key, value] of Object.entries(LENSES[lensSelect.value] ?? {})) set(key, value);
});

followBox.addEventListener('change', () => set('pointerFocus', followBox.checked));

focusSlider.addEventListener('input', () => {
  // Taking the focus by hand stops the pointer pulling it.
  followBox.checked = false;
  set('pointerFocus', false);
  set('focus', focusAt(Number(focusSlider.value)));
  showFocus(Number(focusSlider.value));
});

trafficSlider.addEventListener('input', () => set('traffic', Number(trafficSlider.value)));

wetSlider.addEventListener('input', () => set('wet', Number(wetSlider.value)));

addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  host.destroy();
  session.destroy();
});
