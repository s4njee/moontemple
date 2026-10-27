## How it works

A headline drawn as lights through a lens. The word is set from the shared MSDF atlas (`src/gpu/ui/atlas.ts`, Anton capitals and digits, copied from Fire Temple) in one, two or three lines, whichever sets the capitals largest in the frame, so "MOON TEMPLE" is one line at 16:9 and two in portrait. Then it is sampled on the CPU (`glyph-points.ts`): the atlas is decoded to bytes anyway to measure the glyphs, so the same bytes answer "is this point ink?" by a bilinear sample of the three channels and their median, as `msdf.wgsl` reads it. A fine grid measures the ink's area; that sets the spacing of a jittered hexagonal grid that lands about one point per orb inside the letters, kept a little in from the outline; the few over or under are trimmed or topped up so there is exactly one point per orb. No GPU read-back and no Canvas 2D, so it runs the same in a test as in a browser: about 10 to 13 ms once per word, orb count or line break.

Each orb owns one point, in the focal plane, and a depth of its own off it (three in five behind focus, the rest in front, spread in log depth by **depth spread**), and starts at a scattered place round its point (**scatter**, in image heights, wider across a wide frame). Its _gather_ (0 to 1) moves it in log depth to the focal plane, so the thin-lens model (`src/gpu/optics/lens.ts`: an 85 mm lens focused at 2 m, the disc size set by **f-number**) shrinks its circle of confusion; it travels to its point a little ahead of focusing (ease-out against smoothstep), so the letters gather first as soft blobs and then sharpen. Perspective about the image centre (**depth parallax**) and a slow wander die away as it arrives. A sharp orb keeps a small disc (**sharp dot**, a share of the grid spacing) so a dense word reads as filled strokes rather than a dot screen. The structure is `bokeh-loader`'s, with the ring's slots replaced by the glyph samples and a thousand or more orbs instead of a few dozen.

Everything is drawn by the shared point layer (`src/gpu/points.ts`), one instanced quad per orb, and the shared HDR tail. The layer keeps each orb's light whatever its size, so the word brightens as it resolves; the light per orb is set by the grid spacing squared, so the resolved word has the same brightness per area of ink at any frame size or orb count. Progress gathers the orbs in an **order**: scattered (at random), left to right, or from the centre out, with a front 0.55 of the run wide. **mode** `loop` rises over **rise** seconds, holds, dissolves back the way it came and rests; `reveal` plays once and holds (a new word plays again); `progress` follows a value a page sets, eased with a 0.25 s time constant. Soft orbs breathe a little through the capped flicker signal (`src/gpu/optics/flicker.ts`, rate 1.5, no shimmer); sharp ones hold still. The held frame of reduced motion shows the word resolved and still, except in `progress` mode, where the page's value stands.

## Cost

Not measured yet on a GPU: no `npm run study` or browser-check run has timed it. The GPU work is one quad per orb (1400 by default, up to 4000) plus the HDR tail; the soft phase is the expensive one, since a thousand discs of 20 to 40 px radius at 1080p overlap several deep, and the resolved word is cheap. On the CPU, measured on Dawn in Node at 1920 x 1080 (a laptop, one run): about 0.5 ms a frame to place 1400 orbs and encode the frame, 1.3 ms for 4000; sampling the word, once per change, about 10 to 13 ms. Bundle size not measured yet.

## Pitfalls

- The orbs are added light on an opaque night, so on a light page this is a dark block; it needs a dark region of its own.
- Energy conservation means a resolved orb carries all its soft disc's light in two or three pixels, so the letters clip to white and the palette shows mostly in the soft phase and in the bloom. Lower **brightness** or raise **sharp dot** for more colour in the letters.
- Legibility needs orbs: below about 500 a long word's counters and thin joins (the P and E of TEMPLE) break up. The `few and large` preset uses a five-letter word for that reason.
- The atlas has Anton capitals and digits only: anything else but a space is dropped. A page may write any such string into `params.word`; the select lists a few.
- Not opened in the hero context. The hero's own headline sits on a plate at the left, so a centred orb word behind it clashes, and the page-text tracker (`src/gpu/ui/page-text.ts`) would form the orbs on the real headline, which stays visible under them and spoils the reveal. Forming the page's headline (with the real text hidden until the word has resolved) is not built.
- The flash sweep (`tests/flash.test.ts`, 8 s per preset, one run) measures every preset `low` and `held half way` `none`: single cells see up to four brightness changes in a second as orbs pass, over at most about 6000 px (`gold hexagons`), below the small-area threshold.
- The word is laid out by the atlas's ink widths with no kerning, so pairs like "AV" and "LT" sit a little loose.

## When to use it

A reveal for a landing hero, a title card or an event name on a dark page, where the headline should arrive as photographed light: play it once with `reveal`, or drive `progress` from scroll. Tier B: a few thousand overlapping discs during the soft phase. For a light page, or where WebGPU may be missing, show the real headline with a CSS `filter: blur()` animated to zero and a `text-shadow` glow; it loses the orbs and the brightening as they gather.

## References

- Potmesil and Chakravarty, _A Lens and Aperture Camera Model for Synthetic Image Generation_ (SIGGRAPH 1981): the circle of confusion used for each orb.
- Chlumský, [msdfgen](https://github.com/Chlumsky/msdfgen) and _Shape Decomposition for Multi-channel Distance Fields_ (2015): the atlas the glyphs are read from, and the median that reads it.
- W3C, [WCAG 2.2 success criterion 2.3.1, Three Flashes or Below Threshold](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html): the cap behind the breathing signal.
