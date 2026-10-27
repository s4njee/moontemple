## How it works

The moon through a long lens (400 mm by default, so the face fills a respectable disc) behind a layer of thin cloud drifting across it. Two passes (`cloud.wgsl`):

- **Cloud depth**, at a quarter of the canvas size: the cloud's optical depth τ from fractal noise, domain-warped, in two layers that drift at different speeds and headings so the cloud changes shape as it passes instead of sliding by as one sheet, over a thin even veil. Cloud is soft at its smallest scale, so a quarter size loses nothing and costs a sixteenth.
- **Sky**, at full size: what reaches the eye through τ. The sky, the stars and the moon behind the cloud keep e^−τ of their light. The moon is the shared one (`src/wgsl/moon.wgsl`, story 5.1's light source for the whole epic): a disc 0.26° in radius, lit for its phase, scattering by Lommel–Seeliger so a full moon is a flat coin, with the maria where people expect them.

What the cloud scatters towards the eye from the moon is single scattering in a thin layer, proportional to **τ e^−τ**: nothing where there is no cloud, most where τ is about one, little again inside a thick cloud whose light is spent before it reaches the side facing us. That one factor makes the thin edges nearest the moon silver and the thick middles dark. It is multiplied by the moon's irradiance (its radiance times its solid angle, π × 0.00452²) and two angular shapes:

- the **aureole**, diffraction by droplets of about 10 µm, whose forward lobe peaks at some (ka)²/4π ≈ 1000 times the isotropic level and falls about as one over the angle squared beyond the limb;
- a broad **Henyey–Greenstein** forward glow (g = 0.85) for the light further out.

Thick cloud also glows a dim, even grey with light scattered many times. The scattered light scales with how much of the face is lit, so a crescent lights its cloud less.

The first version left out the moon's solid angle and turned the whole frame white: at a 400 mm lens the entire view is inside the forward-scattering peak, and only the 6.4 × 10⁻⁵ steradians of the moon keep that glow at night levels.

## Cost

Not measured on Dawn or in Chrome yet. Two fullscreen passes, the expensive one (eight octaves of noise in all) at a sixteenth of the pixels, and the tail.

## Pitfalls

- **Exposure is a choice.** At the default brightness the face burns to white in a glow, as the eye sees a bright moon; detail in the maria needs a radiance near paper white, and then the aureole is a camera's: faint. "Exposed for the face" is that photograph.
- The cloud's domain warp leaves brushed streaks at large cloud sizes; it reads as wind-torn cirrus more than cumulus.
- Stars show through thin cloud at e^−τ, as they should, but there is no airglow or light pollution: the sky is darker than most people's.
- Earthshine on the unlit part is a fixed 0.08% of the full face's brightness. Real earthshine depends on the Earth's own phase.

## When to use it

A calm night hero or section background, behind text on a plate. Tier A provisionally: two light passes. The moon is the source the other Epic 5 effects (corona, halo, glitter path) share.

## References

- Sun, Ramamoorthi, Narasimhan and Nayar, _A Practical Analytic Single Scattering Model for Real Time Rendering_ (SIGGRAPH 2005).
- Henyey and Greenstein, _Diffuse radiation in the galaxy_ (Astrophysical Journal, 1941).
- Hapke, _Theory of Reflectance and Emittance Spectroscopy_ (2012): Lommel–Seeliger and the lunar surface.
- Lynch and Livingston, _Color and Light in Nature_ (2001): aureoles and coronas round the moon.
