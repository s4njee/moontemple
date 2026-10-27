## How it works

A sheet of glitter in front of a 50 mm lens at f/1.8, receding up and away from 0.7 to about 2.5 m, focused at 1.1 m. Each of its 24 000 facets is a tiny mirror at a point on the sheet, its normal tilted from the sheet's by a random angle of about 20°. A facet glints only when its normal lies along the half vector between the directions to the light and to the lens, as a mirror does: its brightness is a Gaussian in the angle between them, `glint width` wide (4°). The light hangs above and a little behind the lens and sweeps slowly from side to side, or follows the pointer, eased so a jump becomes a sweep; as it moves, a band of sparks ripples across the sheet.

The glinting facets go to the shared point layer as points of light: sharp where the sheet crosses the focus, discs nearer and farther. Gold, silver or holographic, where each facet has its own hue.

## Cost

On an Apple M1 Max: 0.50 ms per frame at 1080p on Dawn ([docs/studies/epic-4.md](../../../docs/studies/epic-4.md)), about the tail alone: only a few hundred facets glint at once. The cost is on the CPU: testing 24 000 facets a frame takes about 2.7 ms of main-thread time (`experiments/cpu.test.ts`), more than the GPU spends. Doing the test on the GPU (a vertex stage that discards facets that do not glint) is the fix if this is shipped. In Chrome, 0.93 ms for one frame on a 1920 × 1080 canvas (`npm run browser-check`, median of three loads; [docs/studies/browser-check.md](../../../docs/studies/browser-check.md)). Tier A for the GPU on this machine; the CPU time is the concern.

## Pitfalls

- **Flash.** Glints are what the flash analyser exists for. Each facet's glint lasts as long as the light takes to cross its 4° lobe, about half a second at the default sweep, and the analyser passes every preset; a narrower glint or a faster light makes them shorter and denser, so check it again after changing either.
- The sheet itself is not drawn: between glints it is black, as glitter on dark card is.
- Facets are flat mirrors: no colour from thin films or diffraction, except the holographic hue, which is a random colour per facet, not optics.

## When to use it

Fashion, beauty, celebration and jewellery heroes, or a product reveal on a dark page. Move the facet test to the GPU before shipping it.

## References

- Water Temple's `sun-glint` (stable hashed glitter on water).
- Jakob, Hašan, Yan, Lawrence, Ramamoorthi and Marschner, _Discrete Stochastic Microfacet Models_ (SIGGRAPH 2014) — glints from many small facets.
