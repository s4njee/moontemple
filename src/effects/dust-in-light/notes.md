## How it works

A shaft of sunlight slanting through a dark room from the top left, coming towards a 50 mm lens at f/1.8 focused at 1.8 m, and the dust drifting in it.

The beam's glow is the light the air in it scatters towards the lens (`beam.wgsl`). Its brightness falls off across it as a Gaussian about its axis; along a view ray the distance from the axis squared is a quadratic in the distance along the ray, so the integral of the profile along the ray has a closed form, a Gaussian's integral, an error function (Abramowitz and Stegun's approximation). That is scaled by a Henyey–Greenstein phase for the angle between the beam and the way to the lens (asymmetry 0.55), so the beam is brightest where it comes towards you.

The motes are 2 500 points placed round the beam's axis, a little wider than the beam so some drift in and out of its edge, each wandering a few centimetres and sinking slowly along it. A mote is lit by the same profile and scatters by the same phase, so motes are bright in the beam's core and fade at its edge; outside it they are not drawn. Where the beam crosses the plane of focus they are sharp specks; where it comes close to the lens they are discs.

## Cost

On an Apple M1 Max: 0.48 ms per frame at 1080p on Dawn ([docs/studies/epic-4.md](../../../docs/studies/epic-4.md)), the tail alone; 0.54 ms of CPU a frame for the motes. No Chrome reading. Tier A on this machine, provisional.

## Pitfalls

- The beam is infinite and unshadowed: no window frame casts its edge, and it does not fade along its length.
- The motes are lit by the beam's profile at their own position, not by light that has crossed the dust in front of them; at this density nobody can tell.

## When to use it

A quiet, cinematic hero for editorial, architecture and interior sites, on a dark page.

## References

- Henyey and Greenstein, _Diffuse Radiation in the Galaxy_ (Astrophysical Journal, 1941).
- Abramowitz and Stegun, _Handbook of Mathematical Functions_ (1964), 7.1.26 — the error function.
