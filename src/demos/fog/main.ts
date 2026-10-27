// The "Into the fog" page (fog.html): lamp-in-fog fixed behind a whole page, the way a site would
// use it. Ordinary page code: mount the effect, colour the page's accents by the lamp, and wire up
// the toolbar.

import { createGpuSession } from '../../gpu/device.ts';
import { mountEffect } from '../../shell/host.ts';
import { reserveToolbar } from '../backdrop/page.ts';
// The shared backdrop page's layout and plates, in a foggy night's colours (fog.css imports it).
import './fog.css';

const EFFECT = 'lamp-in-fog';

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`fog page: #${id} is missing`);
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
const colourSelect = byId<HTMLSelectElement>('colour');
const lampsSlider = byId<HTMLInputElement>('lamps');
const lampsValue = byId<HTMLOutputElement>('lamps-value');
const fogSlider = byId<HTMLInputElement>('fog');
const driftSlider = byId<HTMLInputElement>('drift');
const moonBox = byId<HTMLInputElement>('moon');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Each lamp's name in the toolbar and the accent it gives the page, near its light's colour. */
const LAMPS: Record<string, { name: string; accent: string }> = {
  sodium: { name: 'sodium', accent: '#ffa75c' },
  'warm led': { name: 'warm LED', accent: '#ffcf9e' },
  'cool led': { name: 'cool LED', accent: '#d6e6ff' },
};

/**
 * What the page asks of the effect: the dim, steady lamp of its `behind text` preset (kept in step
 * with it by hand, so the page need not load the effect's code to read it), then the toolbar's
 * controls, which start on a row of eight lamps in light fog under the moon (fog.html).
 */
const settings: Record<string, unknown> = {
  lamp: 0.6,
  breath: 0,
  bloom: 0.3,
  colour: colourSelect.value,
  lamps: Number(lampsSlider.value),
  fog: Number(fogSlider.value),
  drift: Number(driftSlider.value),
  moon: moonBox.checked,
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
    : `The fog is ${playing ? 'drifting' : 'still'}`;
  pauseButton.textContent = playing ? 'Pause' : 'Play';
  if (!ok) pauseButton.disabled = true;
}

function showLamp() {
  const lamp = LAMPS[colourSelect.value] ?? LAMPS.sodium!;
  const count = Number(lampsSlider.value);
  // "One sodium lamp", "5 cool LED lamps".
  lampName.textContent = count === 1 ? `One ${lamp.name} lamp` : `${count} ${lamp.name} lamps`;
  document.documentElement.style.setProperty('--lamp', lamp.accent);
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
showLamp();
render();

reserveToolbar(document.querySelector<HTMLElement>('.toolbar')!);

// --- The toolbar -----------------------------------------------------------------------------------

pauseButton.addEventListener('click', () => {
  playing = !playing;
  if (playing) host.resume();
  else host.pause();
  render();
});

colourSelect.addEventListener('change', () => {
  set('colour', colourSelect.value);
  showLamp();
});

lampsSlider.addEventListener('input', () => {
  set('lamps', Number(lampsSlider.value));
  lampsValue.textContent = lampsSlider.value;
  showLamp();
});

fogSlider.addEventListener('input', () => set('fog', Number(fogSlider.value)));

driftSlider.addEventListener('input', () => set('drift', Number(driftSlider.value)));

moonBox.addEventListener('change', () => set('moon', moonBox.checked));

addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  host.destroy();
  session.destroy();
});
