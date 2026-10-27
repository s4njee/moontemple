# Accessibility (story 7.3)

What Moon Temple checks, and how, so that an effect behind or over a page never costs a visitor the page.

## Flash (WCAG 2.3.1)

Fire Temple's flash analyser runs over every effect and every preset in `npm test` (`tests/flash.test.ts`, `tests/flash.ts`): general flashes and red flashes, counted per 10° of visual field at a typical viewing distance, three a second at most. Every twinkle, glint and hum goes through the capped flicker signal (`src/gpu/optics/flicker.ts`, story 2.9), so a field of glints stays under the threshold by construction rather than by luck; `tests/flicker.test.ts` checks the caps. Each effect's scorecard reports what the analyser measured (`flash: 'none' | 'low'`), not what was hoped: `bokeh-loader` was declared `none` and measured `low` (one cell, one flash, as an orb arrives) and says `low`.

## Held frames (reduced motion)

Under `prefers-reduced-motion`, or when the visitor pauses, the host draws one frame and holds it, and tells the effect so (`FrameTime.still`). `tests/still.test.ts` renders every effect and preset that way and checks the held frame shows the subject and no flare at full brightness (Storm Temple's 6.2: a frozen flash is a hazard for as long as the visitor looks). Effects choose their held frame deliberately: `bokeh-loader` at 70%, `focus-pull` focused on its second section, `photo-focus` on its subject, `halation-text` at its hum's mean.

## Motion from interaction (WCAG 2.3.3)

Every pointer- or scroll-driven motion stops under reduced motion, because a paused host stops its frame loop: pointer input reaches the effect but nothing is drawn until the visitor asks for motion. The standalone pages start paused under reduced motion and say so.

| Where                                                                      | Motion from interaction                                                                                                                                                                                             | Under reduced motion                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Gallery and effect pages (every effect)                                    | pointer parallax (`bokeh-drift`), focus racks (`focus-cursor`, `night-street`, `fireflies`, `photo-focus`), flares and glints that follow the pointer (`flare-cursor`, `glint-hover`, `lens-light`, `aperture-lab`) | the host holds one frame (`src/shell/motion.ts` follows the system setting until the visitor chooses) |
| `spectrum.html`, `street.html`, `snow.html`, `fireflies.html`, `lens.html` | the field, pointer parallax                                                                                                                                                                                         | start paused; Play is the visitor's explicit choice                                                   |
| `focus.html`                                                               | the scroll racks the lens and blurs the page's sections                                                                                                                                                             | no rack, no CSS blur, effect paused; a "Blur the page" switch turns the blur off for anyone           |
| `photo-focus`                                                              | a click racks focus                                                                                                                                                                                                 | the held frame focuses on the subject; a click changes nothing until motion is on                     |

The scroll-linked blur of `focus.html` is the one case that could make text hard to read rather than just moving; the switch and the reduced-motion default are for that.

## Text over bright, moving bokeh

Text that sits over an effect in the page contexts always sits on a plate: the surface colour at 90%, or the article's 82% over the Backdrop veil's 62% of the page colour (`src/shell/contexts.css`). That makes contrast something to prove for every effect at once rather than measure per effect: the browser blends a plate over the canvas in sRGB, and luminance rises with every channel, so the worst an effect can put under a plate is black (for dark text) or white (for light text). `tests/contrast.test.ts` reads the colours from `theme.css` and the plates from the contexts and checks the worst case.

| Theme | Text style      | Plate             | Worst over any SDR effect | Over an HDR highlight at 3× |
| ----- | --------------- | ----------------- | ------------------------: | --------------------------: |
| dark  | text            | plate             |                      12.6 |                        10.1 |
| dark  | muted text      | plate             |                       5.6 |                    **4.46** |
| dark  | accent (labels) | plate             |                       5.8 |                         4.6 |
| dark  | muted text      | article over veil |                       6.2 |                         5.4 |
| light | text            | plate             |                      14.6 |                        20.9 |
| light | muted text      | plate             |                       5.4 |                         7.7 |
| light | accent (labels) | plate             |                       5.7 |                         8.1 |

Every style keeps WCAG AA (4.5 for text, 3 for large text and labels) over any effect on an SDR canvas, in both themes, on both plates. One case fails narrowly: on an **HDR canvas** (`?hdr`, opt-in), the tail lets highlights reach three times SDR white, and the 10% of such a highlight that shows through the plate takes muted text on the dark theme to 4.46. Pages that opt into HDR behind text should use a 92% plate or more, or keep muted text off the parts of the plate that can sit over a highlight.

The standalone pages are their own sites and carry their own plates: `spectrum.html` and `focus.html` put text on near-opaque dark plates (`#06060cc4`, `#07070ed0`).

## Still to check

- The analyser's thresholds are for a typical viewing distance and screen; a phone held close makes every cell larger. Not yet checked on a phone (8.2).
- The contrast proof covers the shell's mock pages. A site that puts text straight on the canvas, with no plate, has no such guarantee.
- Screen readers: the mock pages are `inert`, and the standalone pages' canvases are `aria-hidden`. The pages themselves have not been checked with a screen reader.
