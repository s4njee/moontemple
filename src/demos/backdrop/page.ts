// What the pages with an effect behind the whole of them share (snow.html, street.html): keeping
// the hero clear of the toolbar, and passing the pointer on to an effect that follows it.

import type { EffectHost } from '../../shell/host.ts';

/**
 * The toolbar is fixed over the page and wraps to more rows on a narrow window; the hero keeps its
 * height clear (backdrop/page.css), so the caption above it is never covered. Measured once now,
 * as a hidden tab runs no resize observers, and again whenever the toolbar changes size.
 */
export function reserveToolbar(toolbar: HTMLElement) {
  const measure = () =>
    document.documentElement.style.setProperty('--toolbar-height', `${toolbar.offsetHeight}px`);
  measure();
  new ResizeObserver(measure).observe(toolbar);
}

/**
 * The canvas lies behind the page and never receives the pointer itself, and an effect listens
 * only on its canvas. So the page passes movement on, announcing an entry first (the tracker only
 * counts the pointer as present after one).
 */
export function forwardPointer(host: EffectHost) {
  let entered = false;
  const forward = (event: PointerEvent, type = event.type) => {
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
  };
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
}
