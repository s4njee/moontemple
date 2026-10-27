// The "Moonlight" page (moon.html): moon-through-cloud fixed behind a whole page, the way a site
// would use it, tinged blue by a layer over it (moon.css). Ordinary page code: mount the effect and
// wire up the toolbar.

import { createGpuSession } from '../../gpu/device.ts';
import { mountEffect } from '../../shell/host.ts';
import { reserveToolbar } from '../backdrop/page.ts';
// The shared backdrop page's layout and plates, in a moonlit sky's colours (moon.css imports it).
import './moon.css';

const EFFECT = 'moon-through-cloud';

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`moon page: #${id} is missing`);
  return node as T;
}

if (import.meta.env.DEV) {
  const { installShaderOverlay } = await import('../../gpu/shader-overlay.ts');
  installShaderOverlay();
}

const stage = byId('stage');
const status = byId('status');
const phaseName = byId('phase-name');
const pauseButton = byId<HTMLButtonElement>('pause');
const phaseSlider = byId<HTMLInputElement>('phase');
const coverSlider = byId<HTMLInputElement>('cover');
const windSlider = byId<HTMLInputElement>('wind');
const tintBox = byId<HTMLInputElement>('tint-toggle');
const sweepBox = byId<HTMLInputElement>('sweep');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const settings: Record<string, unknown> = {
  phase: Number(phaseSlider.value),
  cover: Number(coverSlider.value),
  wind: Number(windSlider.value),
};

const session = await createGpuSession();
let playing = !reducedMotion;
/** The moon's phase, 0..1 (0.5 full): the sweep's own, which the slider only shows. */
let phase = Number(phaseSlider.value);

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
    : `The cloud is ${playing ? 'drifting' : 'still'}`;
  pauseButton.textContent = playing ? 'Pause' : 'Play';
  if (!ok) pauseButton.disabled = true;
}

/** Names the phase in the status line: 0 and 1 are new, 0.5 full, waxing before and waning after. */
function showPhase() {
  const away = Math.abs(phase - 0.5);
  const waxing = phase < 0.5;
  phaseName.textContent =
    away < 0.04
      ? 'Full moon'
      : away < 0.2
        ? waxing
          ? 'Waxing gibbous'
          : 'Waning gibbous'
        : away < 0.29
          ? waxing
            ? 'First quarter'
            : 'Last quarter'
          : waxing
            ? 'Waxing crescent'
            : 'Waning crescent';
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
showPhase();
render();

reserveToolbar(document.querySelector<HTMLElement>('.toolbar')!);

// --- The toolbar -----------------------------------------------------------------------------------

pauseButton.addEventListener('click', () => {
  playing = !playing;
  if (playing) host.resume();
  else host.pause();
  render();
});

phaseSlider.addEventListener('input', () => {
  // Taking the phase by hand stops the sweep.
  sweepBox.checked = false;
  phase = Number(phaseSlider.value);
  set('phase', phase);
  showPhase();
});

// --- The phases ------------------------------------------------------------------------------------
// The page sweeps the moon through a month a minute while the sky plays: new to full to new, then
// round again (0.03 and 0.97 are both a thin crescent, so the wrap barely shows). The slider follows,
// and dragging it stops the sweep. The phase is kept here, not read back from the slider: a frame
// moves it less than the slider's step, which the slider would round away.

/** Seconds for one month: new moon to new moon. */
const MONTH = 60;
const PHASE_MIN = Number(phaseSlider.min);
const PHASE_SPAN = Number(phaseSlider.max) - PHASE_MIN;
let last = performance.now();

function sweep(now: number) {
  const delta = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (sweepBox.checked && playing && !document.hidden) {
    phase = PHASE_MIN + ((phase - PHASE_MIN + (delta * PHASE_SPAN) / MONTH) % PHASE_SPAN);
    set('phase', phase);
    phaseSlider.value = String(phase);
    showPhase();
  }
  requestAnimationFrame(sweep);
}
requestAnimationFrame(sweep);

coverSlider.addEventListener('input', () => set('cover', Number(coverSlider.value)));

windSlider.addEventListener('input', () => set('wind', Number(windSlider.value)));

// The tint is the page's, not the effect's: a layer over the canvas, shown or hidden.
const showTint = () => (document.body.dataset.tint = tintBox.checked ? 'on' : 'off');
showTint();
tintBox.addEventListener('change', showTint);

addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  host.destroy();
  session.destroy();
});
