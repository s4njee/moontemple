#include "fullscreen.wgsl"
#include "fbm.wgsl"
#include "hash.wgsl"
#include "moon.wgsl"
#include "params.wgsl"

// The moon through thin cloud (story 5.1). Two passes:
//
//   depth    quarter size: the cloud's optical depth tau, from fractal noise drifting with the wind
//            and changing as it goes (two layers sheared at different speeds), over a thin veil.
//   sky      full size: what reaches the eye through that depth.
//
// Through optical depth tau a ray keeps e^-tau of what is behind it: the sky, the stars, the moon
// itself. What the cloud scatters towards the eye from the moon is single scattering in a thin
// layer, proportional to tau e^-tau: nothing where there is no cloud, most where tau is about one,
// and little again inside a thick cloud, whose light is used up before it reaches the side facing
// us. That one factor is why thin edges near the moon are silver and thick middles are dark. Two
// angular shapes carry it: the aureole, diffraction by the droplets, steep within a few moon radii
// (`moon_aureole`), and Henyey-Greenstein forward scattering for the broad glow further out. A
// thick cloud also glows a little with light that has scattered many times: a dim, even grey.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var depth_tex: texture_2d<f32>;
@group(0) @binding(2) var linear: sampler;

const CLOUD_PI: f32 = 3.14159265358979;

/// Optical depth of the cloud at a full-size pixel position.
fn cloud_depth(pixel: vec2f) -> f32 {
  let p = pixel / params.cloud_scale;
  // Two layers drifting at different speeds and slightly different headings: the cloud changes
  // shape as it passes instead of sliding by as one sheet.
  let warp = vec2f(fbm_2d(p * 0.5 + params.drift * 0.6 + vec2f(7.1, 3.3), 3, 2.0, 0.5),
                   fbm_2d(p * 0.5 + params.drift * 0.6 + vec2f(1.7, 9.2), 3, 2.0, 0.5));
  let n = 0.5 + 0.75 * fbm_2d(p + params.drift + 0.8 * warp, 5, 2.0, 0.5);
  let fine = 0.5 + 0.7 * fbm_2d(p * 3.1 - params.drift * 1.3, 3, 2.0, 0.5);
  // Coverage: the share of sky with cloud; the edge softens over a band of the noise.
  let body = clamp((n - (1.0 - params.cover)) / 0.32, 0.0, 1.0);
  return params.veil + params.thickness * pow(body, 1.6) * (0.65 + 0.35 * fine);
}

@fragment fn depth(in: FullscreenVarying) -> @location(0) vec4f {
  // One texel stands for 4 x 4 full-size pixels.
  return vec4f(cloud_depth(in.position.xy * 4.0), 0.0, 0.0, 1.0);
}

fn henyey_greenstein(cos_angle: f32, g: f32) -> f32 {
  let d = 1.0 + g * g - 2.0 * g * cos_angle;
  return (1.0 - g * g) / (4.0 * CLOUD_PI * d * sqrt(d));
}

/// A faint, fixed star field: a star in some cells, never twinkling (it would be a flash risk for
/// nothing: real stars twinkle near the horizon, not round a high moon).
fn stars(pixel: vec2f) -> f32 {
  let cell = floor(pixel / 9.0);
  let h = ihash_2to2(vec2i(cell) + vec2i(13, 71));
  if (h.x < 0.88) {
    return 0.0;
  }
  let at = (cell + 0.2 + 0.6 * h) * 9.0;
  let d = length(pixel - at);
  return exp(-d * d / 0.9) * (0.4 + 3.0 * pow(h.y, 6.0));
}

@fragment fn sky(in: FullscreenVarying) -> @location(0) vec4f {
  let pixel = in.position.xy;
  let tau = textureSampleLevel(depth_tex, linear, in.uv, 0.0).r;
  let keep = exp(-tau);
  let v = in.uv.y;
  var colour = mix(params.sky_top, params.sky_bottom, v * v);
  colour += vec3f(0.85, 0.9, 1.0) * stars(pixel) * params.stars;
  colour *= keep;

  let moon = moon_disc(pixel, params.moon_pos, params.moon_radius, params.phase, params.tilt);
  colour += params.moon_colour * params.moon_light * moon * keep;

  // Scattered moonlight, scaled by how much of the full moon is lit (a crescent lights less cloud).
  let angle = length(pixel - params.moon_pos) * params.pixel_angle;
  let radii = length(pixel - params.moon_pos) / params.moon_radius;
  let single = tau * keep;
  // Per unit of the moon's radiance: its solid angle times the phase function. Droplets of about
  // 10 micrometres diffract into a lobe some (k a)^2 / 4 pi ~ 1000 times the isotropic level at
  // its peak, a couple of degrees wide: the aureole, `aureole` scaling that peak.
  let shape = params.omega * (1000.0 * params.aureole * moon_aureole(radii) + params.glow * henyey_greenstein(cos(angle), params.forward));
  colour += params.moon_colour * params.moon_light * params.lit * single * shape;
  // Light that has scattered many times inside the cloud: grey, even, dim.
  colour += params.cloud_colour * params.lit * (1.0 - keep);
  return vec4f(colour, 1.0);
}
