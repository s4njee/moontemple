// The "Night snow" page (snow.html): snow-at-night fixed behind a whole page, on its blizzard
// preset, the way a site would use it. Ordinary page code: mount the effect, colour the page's
// accents by the lamp, and wire up the toolbar. The effect takes no pointer, so none is passed on.

import { createGpuSession } from '../../gpu/device.ts';
import { mountEffect } from '../../shell/host.ts';
import { rotateHue, type Rgb } from '../../effects/snow-at-night/hue.ts';
import { reserveToolbar } from '../backdrop/page.ts';
// The shared backdrop page's layout and plates, in the snow page's colours (snow.css imports it).
import './snow.css';

const EFFECT = 'snow-at-night';

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`snow page: #${id} is missing`);
  return node as T;
}

if (import.meta.env.DEV) {
  const { installShaderOverlay } = await import('../../gpu/shader-overlay.ts');
  installShaderOverlay();
}

const stage = byId('stage');
const status = byId('status');
const lampName = byId('lamp-name');
const pauseButton = byId<HTMLButtonElement>('pause');
const lampSelect = byId<HTMLSelectElement>('lamp');
const windSlider = byId<HTMLInputElement>('wind');
const windValue = byId<HTMLOutputElement>('wind-value');
const focusSlider = byId<HTMLInputElement>('focus');
const focusValue = byId<HTMLOutputElement>('focus-value');
const hueSlider = byId<HTMLInputElement>('hue');
const hueValue = byId<HTMLOutputElement>('hue-value');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Each lamp's name in the toolbar and the accent it gives the page, near its light's colour. */
const LAMPS: Record<string, { name: string; accent: Rgb }> = {
  sodium: { name: 'Sodium lamp', accent: [255, 164, 92] },
  warm: { name: 'Warm lamp', accent: [255, 200, 154] },
  led: { name: 'LED lamp', accent: [216, 230, 255] },
};

/**
 * What the page asks of the effect: the effect's `blizzard` preset (kept in step with it by hand,
 * so the page need not load the effect's code to read it), then the toolbar's controls.
 */
const settings: Record<string, unknown> = {
  flakes: 4000,
  wind: Number(windSlider.value),
  fall: 1.6,
  fog: 1.6,
  focus: Number(focusSlider.value),
  colour: lampSelect.value,
  hue: Number(hueSlider.value),
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
    : `The snow is ${playing ? 'falling' : 'paused'}`;
  pauseButton.textContent = playing ? 'Pause' : 'Play';
  if (!ok) pauseButton.disabled = true;
}

function showLamp() {
  const lamp = LAMPS[lampSelect.value] ?? LAMPS.sodium!;
  lampName.textContent = lamp.name;
  // The accent turns with the lamp, by the same rotation the effect gives its light.
  const [r, g, b] = rotateHue(lamp.accent, Number(hueSlider.value)).map((v) =>
    Math.round(Math.min(255, v)),
  ) as Rgb;
  document.documentElement.style.setProperty('--lamp', `rgb(${r} ${g} ${b})`);
}

const host = mountEffect(session, stage, EFFECT, {
  initialParams: settings,
  paused: !playing,
  allowHdr: true,
  // A blizzard at a little over half speed: the same storm, but calm enough to sit behind reading.
  timeScale: 0.5625,
});
host.onLoad(() => {
  pauseButton.disabled = false;
  render();
});
session.onChange(render);
showLamp();
render();

// --- The toolbar -----------------------------------------------------------------------------------

reserveToolbar(document.querySelector<HTMLElement>('.toolbar')!);

pauseButton.addEventListener('click', () => {
  playing = !playing;
  if (playing) host.resume();
  else host.pause();
  render();
});

lampSelect.addEventListener('change', () => {
  set('colour', lampSelect.value);
  showLamp();
});

windSlider.addEventListener('input', () => {
  set('wind', Number(windSlider.value));
  windValue.textContent = `${windSlider.value} m/s`;
});

hueSlider.addEventListener('input', () => {
  set('hue', Number(hueSlider.value));
  hueValue.textContent = `${hueSlider.value}°`;
  showLamp();
});

focusSlider.addEventListener('input', () => {
  set('focus', Number(focusSlider.value));
  focusValue.textContent = `${focusSlider.value} m`;
});

addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  host.destroy();
  session.destroy();
});
