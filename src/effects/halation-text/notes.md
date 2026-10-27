## How it works

The headline is lit as a sign and then photographed on film. Three steps, all in linear HDR:

1. **A coverage mask of the headline**, at canvas resolution, made only when the text or its geometry changes. On a page, `src/gpu/ui/page-text.ts` finds the headline (an element marked `data-mt-headline`, else the mock hero's headline, else the first `h1`, and only if it overlaps the canvas), measures every word where the browser laid it out with a Range (`getClientRects`), and draws the same words with Canvas 2D `fillText` in the element's computed font, letter spacing and text-transform into an `OffscreenCanvas` the size of the WebGPU canvas. That is uploaded with `copyExternalImageToTexture`. Where there is no page (the bare canvas, posters, the tests) the effect draws a stand-in word from the Anton MSDF atlas copied from Fire Temple (`src/gpu/ui/atlas.ts`, `msdf.wgsl`; `mask.wgsl` bakes it into the same mask).
2. **The sign** (`sign.wgsl`): every frame, one fullscreen pass writes the mask times the sign's colour and brightness (4x paper white by default) into the scene. The letters are flat, like a lightbox; a gentle hum multiplies the brightness through the capped flicker signal (`src/gpu/optics/flicker.ts`).
3. **Film**: story 2.5's halation (`src/gpu/post/halation.ts`) moves part of each channel's light (red most, green a third, blue a twentieth) into a blurred halo, so the red-orange fringe is light taken from the letters' own core. Its width is set in ems of the headline (0.16 em by default), so a small heading and a hero title look like the same film. The HDR tail then adds a faint bloom (0.15), burns the cores towards white, tonemaps, and writes luminance alpha over the page.

The page keeps the real text for selection, search and screen readers. The mock pages put their text on plates above the effect, so when the effect finds a headline it lifts its own canvas over the page (`position: relative; z-index: 1; pointer-events: none`) and puts the old values back when the headline goes or the effect is destroyed. A real site would place the canvas over the heading itself.

## Cost

GPU time: not measured yet with `npm run study`. One reading from the performance HUD in Chrome on the development machine, hero layout, 962 x 884 canvas: 2.3 ms of GPU time a frame. That includes the browser's timing floor of about 1 ms, and the HUD's per-pass numbers overlap, so they are not usable on their own. The per-frame work is the sign pass, halation (a half-size copy, a separable blur and a composite) and the HDR tail; the mask is not redrawn while the headline stays put.

- Texture memory: the mask (`rgba8unorm`, canvas size), halation's two half-size `rgba16float` targets plus its blur's, and the tail's. Not added up yet.
- Main thread: two `getBoundingClientRect` calls a frame and a string compare. A change (resize, the headline moving, new text) costs a Range per word, a `fillText` per word and one upload. Not measured yet.
- Bundle: the atlas is 56 kB of base64 in `atlas-data.ts`, loaded with the effect's chunk even when the page path is used. Not measured as gzip yet.

## Pitfalls

- **The atlas cannot redraw a page's headline.** It has Anton's capitals and digits only. Drawn over a mixed-case heading in another face, it would leave the real words showing round its edges. Canvas 2D uses the browser's own shaping and the page's loaded web fonts, so its glyphs land on the DOM's. The MSDF path is kept for the case with no page.
- **A text Range's box is the font's content area**, not the em box, so the baseline is the box's top plus `fontBoundingBoxAscent`. In Chrome the redrawn words sit on the real ones with no visible double edge (checked by eye in the hero layout, dark and light).
- **Text under the canvas does not get lit.** In every mock layout the text sits above the effect, so the canvas has to be lifted. On a page whose heading sits inside its own stacking context (a transformed or `isolation: isolate` parent), `z-index` on the canvas will not reach over it.
- **Light pages.** The sign's cores burn to cream and its halo is orange. On a near-white plate that is pale text on a pale ground. The underlay uses the bloom as its mask, and the bloom is deliberately faint, so even `underlay` 1 barely darkens round the letters. The effect needs a dark ground (`lightPage: no`).
- **Strength is easy to overdo.** With halation 0.4 and bloom 0.3 at 6x white, the halo ran into an orange slab that filled the counters and joined the words. Halation 0.25, bloom 0.15 and 4x white keep a red-orange fringe a little wider than a stroke.
- Words are measured once per change, so a CSS transition on the heading's font size is followed only when the computed style is read again (every 30 frames), and a word broken across lines (hyphenation) is drawn at its first fragment only.
- The redrawn headline is a stand-in in the tests and posters: the page path has only been looked at in Chrome, not tested.

## When to use it

A hero title that should read as a lit marquee or a backlit sign on a dark page: a film, theatre, music or night-time event page. Tier B as planned. It costs more than a `text-shadow`, and it needs a dark ground. A tight bright `text-shadow` with a wider red one gets close in CSS, with no WebGPU. The shader earns its place when you want the halo to be the letters' own light, moved rather than painted, and to scale with the type. The real heading must stay in the markup. Under reduced motion the hum stops and the sign holds at its mean brightness.

## References

- Moon Temple story 2.5, `src/gpu/post/halation.ts`: halation as light moved from the red layer into a blurred halo.
- Fire Temple's `fire-text` and `src/gpu/ui/atlas.ts`: the Anton MSDF atlas and its layout.
- Viktor Chlumský, [msdfgen](https://github.com/Chlumsky/msdfgen): multi-channel distance fields, which made the atlas.
- Chris Green, [Improved Alpha-Tested Magnification for Vector Textures and Special Effects](https://steamcdn-a.akamaihd.net/apps/valve/2007/SIGGRAPH2007_AlphaTestedMagnification.pdf) (SIGGRAPH 2007): distance-field text.
- MDN, [`TextMetrics.fontBoundingBoxAscent`](https://developer.mozilla.org/en-US/docs/Web/API/TextMetrics/fontBoundingBoxAscent) and [`Range.getClientRects`](https://developer.mozilla.org/en-US/docs/Web/API/Range/getClientRects).
