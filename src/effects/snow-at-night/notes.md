## How it works

Snow falling past one street lamp, through an 85 mm lens at f/1.8 focused 5 m out. Each flake is a point in metres between 0.5 and 30 m from the lens; it falls and drifts with the wind, flutters, and wraps round a slab a little bigger than the view at its depth, so the snow never runs out.

A flake's light is the lamp's light falling on it, scattered towards the lens. It falls off with the square of the flake's distance from the lamp and is dimmed by the fog on the way; the scattering follows a Henyey–Greenstein phase with asymmetry 0.6, so a flake between the lens and the lamp scatters forwards and shines while one beside the lamp is dim. Then the light falls off again with the flake's distance from the lens, and the point layer draws it as a disc at its circle of confusion: far flakes are specks, flakes near the focus are sharp, and the few that pass close to the lens are huge faint discs (flipped, being in front of the focus).

Flakes spread evenly through the view's volume grow in number with depth cubed, which leaves almost none within a couple of metres of the lens: about 0.4 of 1 400. So 1.5% of them are spread through the first 4 m instead; that is more big discs than real snow gives, and the reason the look works.

Behind the snow, one fullscreen pass draws the lamp's glow in the fog with the closed-form single scattering of story 2.8 (`src/wgsl/scatter.wgsl`), through the same pinhole the flakes are projected with, and the lamp itself is a point dimmed by the fog between it and the lens.

## Cost

On an Apple M1 Max: 0.52 ms per frame at 1080p on Dawn ([docs/studies/epic-4.md](../../../docs/studies/epic-4.md)), against 0.48 ms for the HDR tail alone in the same run; the 4 000-flake blizzard reads 0.61 ms, and focusing near (so the far flakes all blur into discs) 0.76 ms, the most of any preset: fill rate, not flake count, is the cost. The download is 21.3 kB gzipped. No Chrome reading yet: the browser pane was hidden when these were built, which throttles the page. Tier A on this machine, provisional.

## Pitfalls

- The near flakes are an artistic choice, not the physics: see above.
- **Flash.** A flake half a metre from an 85 mm lens falling at 1 m/s crosses about seven view heights a second, and a big disc sweeping by that fast flickered the area it crossed: the flash analyser measured three flashes a second in one cell at the defaults, and over the limit with the LED lamp. No flake now crosses faster than 0.3 view heights a second, which slows only the near ones; the worst cell measures one flash, `low`, and every preset passes.
- Flakes do not cast or catch shadows and do not occlude the lamp; at this density nobody can tell.
- The glow is isotropic (story 2.8's closed form) while the flakes scatter forwards: the glow round the lamp is a little wider than the flakes' own light would suggest.
- The scene is CPU-built every frame: a 5 000-flake blizzard is 5 000 points uploaded each frame.

## When to use it

A winter hero or seasonal section on a dark page. Particle snow in CSS or a looped video does the plain version; this one earns its place with the lamp lighting the flakes that pass it and with real depth of field.

## References

- Sun, Ramamoorthi, Narasimhan and Nayar, _A Practical Analytic Single Scattering Model for Real Time Rendering_ (SIGGRAPH 2005).
- Henyey and Greenstein, _Diffuse Radiation in the Galaxy_ (Astrophysical Journal, 1941) — the phase function.
