## How it works

Strings of bulbs in metres in front of a 35 mm lens focused close (0.7 m at f/1.4), so every bulb is behind the focus and becomes a disc of nearly the same size. Each string runs across the whole view and a little past it, between 1.8 and 6.3 m away, its two ends at slightly different depths; it sags in a parabola (close enough to a catenary at this sag), with a bulb every 18 cm. The strings are dealt bands of the frame's height in a shuffled order, so near and far ones are spread over the view instead of bunching.

A string sways by changing its sag and swinging forward and back together, so its bulbs move in depth as well as across the frame and their discs breathe a little. Each bulb's light falls off with its distance squared, and is multiplied by Fire Temple's flicker signal (`src/gpu/optics/flicker.ts`, story 2.9) with its own seed: a slow swing of `twinkle depth`, at most four knots a second, and a 2% shimmer. That signal cannot make more than three WCAG 2.3.1 flashes a second whatever the settings (`tests/flicker.test.ts` checks it over 200 seeds at the worst safe settings).

The bulbs are drawn by the shared point layer, so each disc carries exactly its bulb's light and overlapping discs add.

## Cost

On an Apple M1 Max: 0.44 ms per frame at 1080p on Dawn ([docs/studies/epic-4.md](../../../docs/studies/epic-4.md)), against 0.48 ms for the HDR tail alone in the same run: the bulbs cost nothing measurable. Six strings are about 300 bulbs, each a quad covering its disc; every preset reads 0.42 to 0.50 ms. The download is 19.9 kB gzipped beyond the first load. In Chrome, 1.16 ms for one frame on a 1920 × 1080 canvas (`npm run browser-check`, median of three loads; [docs/studies/browser-check.md](../../../docs/studies/browser-check.md)). Tier A on this machine, provisional.

## Pitfalls

- The near strings are bright and the far ones dim, by the inverse square; past about 6 m a string fades into the dark, which is why they stop there.
- The multicolour palette's saturated reds are where the flash analyser looks hardest; it passes at every preset.
- No wire is drawn: out of focus it would be invisible anyway, and in the `one string sharp` preset the bulbs float.

## When to use it

A seasonal or festive hero on a dark page. A dozen soft dots in CSS do the still version; the shader earns its place with hundreds of bulbs that sway in depth, keep their light as they blur and twinkle without ever flashing.

## References

- Fire Temple's flicker signal (its story 3.6) and the WCAG 2.2 Success Criterion 2.3.1.
