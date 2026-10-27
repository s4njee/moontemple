// The "Moonlit water" page (water.html): moonlit-water fixed behind a whole page, the way a site
// would use it, its moon and path on the right-hand third (water.css). Ordinary page code: mount
// the effect, sweep its focus slowly out to sea and back, and wire up the toolbar.

import { createGpuSession } from '../../gpu/device.ts';
import { mountEffect } from '../../shell/host.ts';
import { reserveToolbar } from '../backdrop/page.ts';
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
const sweepBox = byId<HTMLInputElement>('sweep');
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
 * 0.6 m (close) to 400 m (out to sea) evenly in log distance.
 */
const focusAt = (v: number) => 0.6 * Math.pow(400 / 0.6, Math.min(1, Math.max(0, v)));

const settings: Record<string, unknown> = {
  // The page moves the focus itself (the sweep below), so the effect's pointer stays out of it.
  pointerFocus: false,
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
  // Soft discs need no retina detail, and the cost of the blurriest frames goes with the pixels:
  // 1.5 device pixels per CSS pixel is about half of 2's, and keeps the far sparkle crisp.
  maxDpr: 1.5,
});
host.onLoad(() => {
  pauseButton.disabled = false;
  render();
});
session.onChange(render);
showFocus(Number(focusSlider.value));
render();

reserveToolbar(document.querySelector<HTMLElement>('.toolbar')!);

// --- The focus sweep -------------------------------------------------------------------------------
// While the sea plays, the page walks the focus slowly from close to far out to sea and back, so
// the river of discs sharpens into sparkle and softens again. It eases at each end, and the effect
// eases it further, like a focus ring. The slider follows, and dragging it stops the sweep. The
// sweep's place is kept here: a frame moves it less than the slider's step.

/** Seconds for the focus to go out to sea and come back. */
const SWEEP = 30;
/**
 * The sweep's near end, as a slider position: 2.5 m, already a river of large discs. Nearer, every
 * glint's disc keeps growing (its radius goes as one over the focus distance) and the frame is
 * slow to fill. Measured on an M1 Max at this page's settings, a retina laptop's widened canvas
 * (4032 x 1964): 23 ms at 1.5 m, 13 ms at 2.5 m, 2.5 ms at 400 m; at 0.6 m a 1080p one took 44 ms.
 * The slider still goes that close by hand.
 */
const NEAREST = Math.log(2.5 / 0.6) / Math.log(400 / 0.6);
/** How far through the sweep, in turns; it starts close, on the discs. */
let turn = 0;
let last = performance.now();

function sweep(now: number) {
  const delta = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (sweepBox.checked && playing && !document.hidden) {
    turn = (turn + delta / SWEEP) % 1;
    const v = NEAREST + (1 - NEAREST) * (0.5 - 0.5 * Math.cos(2 * Math.PI * turn));
    set('focus', focusAt(v));
    showFocus(v);
  }
  requestAnimationFrame(sweep);
}
requestAnimationFrame(sweep);

// --- The toolbar -----------------------------------------------------------------------------------

pauseButton.addEventListener('click', () => {
  playing = !playing;
  if (playing) host.resume();
  else host.pause();
  render();
});

focusSlider.addEventListener('input', () => {
  // Taking the focus by hand stops the sweep.
  sweepBox.checked = false;
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
