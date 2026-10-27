// The "Moonlit water" page (water.html): moonlit-water fixed behind a whole page, the way a site
// would use it, its moon and path on the right-hand third (water.css). Ordinary page code: mount
// the effect, pass the pointer on to it so it pulls the focus, and wire up the toolbar.

import { createGpuSession } from '../../gpu/device.ts';
import { mountEffect } from '../../shell/host.ts';
import { forwardPointer, reserveToolbar } from '../backdrop/page.ts';
// The shared backdrop page's layout and plates, in a night sea's colours (water.css imports it).
import './water.css';

const EFFECT = 'moonlit-water';

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`water page: #${id} is missing`);
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
const followBox = byId<HTMLInputElement>('follow');
const focusSlider = byId<HTMLInputElement>('focus');
const focusValue = byId<HTMLOutputElement>('focus-value');
const heightSlider = byId<HTMLInputElement>('height');
const heightValue = byId<HTMLOutputElement>('height-value');
const phaseSlider = byId<HTMLInputElement>('phase');
const wavesSlider = byId<HTMLInputElement>('waves');
const windSlider = byId<HTMLInputElement>('wind');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The focus distance, metres, at `v` 0..1 of the focus slider: the effect's own pointer mapping,
 * 0.6 m to 400 m evenly in log distance. The pointer's `v` is 1 at the top of the page (out to sea)
 * and 0 at the bottom (close).
 */
const focusAt = (v: number) => 0.6 * Math.pow(400 / 0.6, Math.min(1, Math.max(0, v)));

const settings: Record<string, unknown> = {
  pointerFocus: followBox.checked,
  focus: focusAt(Number(focusSlider.value)),
  moonHeight: Number(heightSlider.value),
  phase: Number(phaseSlider.value),
  waves: Number(wavesSlider.value),
  wind: Number(windSlider.value),
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
  status.textContent = !ok ? 'WebGPU is unavailable' : `The sea is ${playing ? 'moving' : 'still'}`;
  pauseButton.textContent = playing ? 'Pause' : 'Play';
  if (!ok) pauseButton.disabled = true;
}

/** Shows the focus at `v` on the slider and in the status line. */
function showFocus(v: number) {
  const metres = focusAt(v);
  focusSlider.value = String(v);
  focusValue.textContent = metres < 10 ? `${metres.toFixed(1)} m` : `${Math.round(metres)} m`;
  focusName.textContent =
    metres < 4 ? 'Focused close' : metres < 60 ? 'Focused on the water' : 'Focused out to sea';
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
    if (followBox.checked) showFocus(1 - event.clientY / innerHeight);
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

followBox.addEventListener('change', () => set('pointerFocus', followBox.checked));

focusSlider.addEventListener('input', () => {
  // Taking the focus by hand stops the pointer pulling it.
  followBox.checked = false;
  set('pointerFocus', false);
  set('focus', focusAt(Number(focusSlider.value)));
  showFocus(Number(focusSlider.value));
});

heightSlider.addEventListener('input', () => {
  set('moonHeight', Number(heightSlider.value));
  heightValue.textContent = `${heightSlider.value}°`;
});

phaseSlider.addEventListener('input', () => set('phase', Number(phaseSlider.value)));

wavesSlider.addEventListener('input', () => set('waves', Number(wavesSlider.value)));

windSlider.addEventListener('input', () => set('wind', Number(windSlider.value)));

addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  host.destroy();
  session.destroy();
});
