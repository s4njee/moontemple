// The "Light, divided" page (prism.html): prism fixed behind a whole page, the way a site would use
// it. Ordinary page code: mount the effect, orbit its view with the pointer, and wire up the toolbar.

import { createGpuSession } from '../../gpu/device.ts';
import { mountEffect } from '../../shell/host.ts';
import { reserveToolbar } from '../backdrop/page.ts';
// The shared backdrop page's layout and plates, in black and white (prism.css imports it).
import './prism.css';

const EFFECT = 'prism';

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`prism page: #${id} is missing`);
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
const glassSelect = byId<HTMLSelectElement>('glass');
const sourceSelect = byId<HTMLSelectElement>('source');
const sweepSlider = byId<HTMLInputElement>('sweep');
const sweepValue = byId<HTMLOutputElement>('sweep-value');
const hazeSlider = byId<HTMLInputElement>('haze');
const zoomSlider = byId<HTMLInputElement>('zoom');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A gas lamp's lines are bright against no continuum: the effect's own presets expose them less. */
const EXPOSURE: Record<string, number> = { white: 1.6, hydrogen: 0.9, mercury: 0.9, sodium: 0.9 };

/**
 * The prism swings about minimum deviation, where by definition the light's direction hardly
 * changes as the glass turns: within the effect's default ±8° the band barely moves. So the page
 * turns it ±18° (its "turning wide" preset) and a little faster, a swing every 30 s.
 */
const PERIOD = 30;

/**
 * Where the view starts: a little nearer than the effect's standing view, so the band of colours on
 * the wall is bigger (a double-click comes back here).
 */
const DEFAULT_DISTANCE = 0.85;

const settings: Record<string, unknown> = {
  period: PERIOD,
  orbitDistance: DEFAULT_DISTANCE,
  glass: glassSelect.value,
  source: sourceSelect.value,
  exposure: EXPOSURE[sourceSelect.value],
  sweep: Number(sweepSlider.value),
  haze: Number(hazeSlider.value),
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
    : `The prism is ${playing ? 'turning' : 'still'}`;
  pauseButton.textContent = playing ? 'Pause' : 'Play';
  if (!ok) pauseButton.disabled = true;
}

/** "White light, flint glass", "Mercury lamp, diamond". */
function showLamp() {
  const lamp = sourceSelect.selectedOptions[0]?.textContent ?? 'White';
  const glass = glassSelect.selectedOptions[0]?.textContent ?? 'Flint';
  const light = sourceSelect.value === 'white' ? 'White light' : `${lamp} lamp`;
  lampName.textContent =
    glassSelect.value === 'diamond'
      ? `${light}, diamond`
      : `${light}, ${glass.toLowerCase()} glass`;
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

/**
 * The prism's angle for each glass: diamond bends so hard that a 60° prism of it traps the light
 * inside, so it is cut to 40°, as in the effect's own preset.
 */
const GLASS_APEX: Record<string, number> = { crown: 60, flint: 60, diamond: 40 };

glassSelect.addEventListener('change', () => {
  set('glass', glassSelect.value);
  set('apex', GLASS_APEX[glassSelect.value]);
  showLamp();
});

sourceSelect.addEventListener('change', () => {
  set('source', sourceSelect.value);
  set('exposure', EXPOSURE[sourceSelect.value]);
  showLamp();
});

sweepSlider.addEventListener('input', () => {
  set('sweep', Number(sweepSlider.value));
  sweepValue.textContent = `±${sweepSlider.value}°`;
});

hazeSlider.addEventListener('input', () => set('haze', Number(hazeSlider.value)));

// --- Orbit controls --------------------------------------------------------------------------------
// The canvas lies behind the page and never takes the pointer, so the page orbits it: drag anywhere
// over the room that is not text or a control to swing the view round the prism, pinch (or Ctrl and
// scroll) or the Zoom slider to move in and out, double-click to stand where you started. A plain
// wheel still scrolls the page, and a finger still scrolls on a phone; only a mouse or pen orbits.
// The effect clamps the orbit to stay above the table and in front of the wall.

const orbit = { yaw: 0, pitch: 0, distance: Number(zoomSlider.value) };

function showOrbit() {
  set('orbitYaw', orbit.yaw);
  set('orbitPitch', orbit.pitch);
  set('orbitDistance', orbit.distance);
  zoomSlider.value = String(orbit.distance);
}

/** Whether a press on `target` at (x, y) is on the room rather than on the page's own content. */
function onRoom(target: EventTarget | null, x: number, y: number): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('a, button, input, select, label, .plate, .toolbar, .note')) return false;
  const box = stage.getBoundingClientRect();
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

let dragging: { id: number; x: number; y: number } | undefined;

addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch' || event.button !== 0) return;
  if (!onRoom(event.target, event.clientX, event.clientY)) return;
  event.preventDefault();
  dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
  document.body.dataset.orbiting = 'true';
});

addEventListener('pointermove', (event) => {
  if (dragging && event.pointerId === dragging.id) {
    // A quarter of a degree a pixel: across the room is a good half-turn.
    orbit.yaw = Math.max(-60, Math.min(60, orbit.yaw - (event.clientX - dragging.x) * 0.25));
    orbit.pitch = Math.max(-10, Math.min(40, orbit.pitch + (event.clientY - dragging.y) * 0.25));
    dragging.x = event.clientX;
    dragging.y = event.clientY;
    showOrbit();
  }
  document.body.dataset.overRoom = onRoom(event.target, event.clientX, event.clientY)
    ? 'true'
    : 'false';
});

const stopDragging = (event: PointerEvent) => {
  if (!dragging || event.pointerId !== dragging.id) return;
  dragging = undefined;
  delete document.body.dataset.orbiting;
};
addEventListener('pointerup', stopDragging);
addEventListener('pointercancel', stopDragging);

addEventListener(
  'wheel',
  (event) => {
    // A trackpad pinch arrives as a wheel with Ctrl held; a plain wheel scrolls the page.
    if (!event.ctrlKey || !onRoom(event.target, event.clientX, event.clientY)) return;
    event.preventDefault();
    orbit.distance = Math.max(0.35, Math.min(1.6, orbit.distance * Math.exp(event.deltaY * 0.01)));
    showOrbit();
  },
  { passive: false },
);

addEventListener('dblclick', (event) => {
  if (!onRoom(event.target, event.clientX, event.clientY)) return;
  orbit.yaw = 0;
  orbit.pitch = 0;
  orbit.distance = DEFAULT_DISTANCE;
  showOrbit();
});

zoomSlider.addEventListener('input', () => {
  orbit.distance = Number(zoomSlider.value);
  showOrbit();
});

addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  host.destroy();
  session.destroy();
});
