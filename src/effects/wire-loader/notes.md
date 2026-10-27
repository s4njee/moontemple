## How it works

A Platonic solid (an icosahedron by default) turns on a turntable: one fixed axis, leaned towards the camera so its top shows, with a corner standing up so it spins like a top. Each frame it is projected in perspective (`src/gpu/wire/solids.ts`), and three things are drawn into the HDR scene:

- **The wire** (story 10.1, `src/gpu/wire/wireframe.ts` and `wire-shade.wgsl`): every edge is one segment in the shared stroke renderer (`src/gpu/strokes.ts`, from Storm Temple), blended with `max`. The core is a line of constant width in device pixels whose profile across integrates to the width, so light per unit length is the same on every edge: a long edge carries light in proportion to its length, and a foreshortened one is short rather than hot. Because the layer keeps the brightest segment at each pixel, the corner where five edges meet is as bright as one edge, not five. An edge whose two faces both turn away from the camera is hidden; it is drawn at `hidden-edge fade`, crossing over smoothly as it rounds the outline, and the far side is dimmed by `depth cue`, so the near edges lead and the turn reads one way round. A tight glow rides in a second channel, and both are composited in their colours as the scene's first pass.
- **The corner flares** (story 10.3, `src/gpu/wire/vertex-flares.ts`): each corner gets a starburst whose level is `max(n · L, 0)^4` for its outward normal and a light up and to the left, faded as the solid hides the corner, times a twinkle on the capped flicker (2.9). Thirty per cent of its light is a sharp point and seventy per cent four diagonal diffraction spikes (`src/gpu/glare/glare.ts`, 2.6), so a flare's total light is what its level says.
- **The halo**: the HDR tail's bloom, then the tonemap. This is the one stage story 10.2's spectral bloom will replace (`createHalo` in `index.ts`).

On a turntable every normal goes round one circle per turn, so a corner's flare rises and falls about once a turn. The turn is capped at one turn a second (`FLARE_SAFE_MAX_TURN`), the control at half that, which keeps each flare inside the same two-swings-a-second bound the flicker caps put on a twinkle. A held frame (reduced motion) shows a fixed, flattering pose with the flares at 55% and no twinkle.

## Cost

Not measured yet. What it draws: one instanced stroke pass of 6 to 30 thin quads, one fullscreen composite, a point pass and a glare pass of at most 20 corners with four rays each, then the HDR tail (bloom and tonemap), which is likely most of the time. Texture memory, beyond the tail: the stroke layer's `rg16float` ping-pong pair at canvas size, 8 bytes a pixel (about 16.6 MB at 1920 × 1080). The CPU side is a few hundred floating-point operations a frame.

## Pitfalls

- The stroke layer allocates a full-canvas target pair even though the solid covers a small part of it. A loader on a page should be given a canvas the size of the loader, not the page.
- With `max` blending a hidden edge crossing a front edge never brightens it, which is the point, but two lines of different colours would not mix either: one colour per wire.
- Below about one device pixel the line gets dimmer rather than thinner (its light per length is kept), and a turning sub-pixel wire shimmers a little as any thin line does.
- The front-or-hidden test is exact only for convex solids; a concave one would need a depth test.
- Bloom spreads the bright corners wider than the edges: the halo is brightest where edges meet, as it should be, but it is the plain three-channel bloom until 10.2 lands.
- Measured on Dawn in tests and rendered in Chrome for the poster; not checked on a phone.

## When to use it

A loading indicator or an animated logo mark on a dark page, where a few hundred pixels of something precise and luminous fits the brand. Tier A: no compute and no glass. Over a light page the wire washes out; put it on its own dark plate. For a progress loader with a value to show, `bokeh-loader` carries progress; this one is indeterminate. For the full prism with a refracting glass body, see the showpiece (10.5), which builds on the same modules.

## References

- Storm Temple's shared stroke renderer (its story 6.3), `src/gpu/strokes.ts`.
- Fire Temple's capped flicker (its story 3.6), ported as `src/gpu/optics/flicker.ts`.
- Moon Temple's analytic diffraction spikes (story 2.6), `src/gpu/glare/glare.ts`.
- [WCAG 2.3.1 Three Flashes or Below Threshold](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html).
