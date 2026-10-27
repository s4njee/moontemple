#include "fullscreen.wgsl"
#include "fbm.wgsl"
#include "hash.wgsl"
#include "moon.wgsl"
#include "scatter.wgsl"
#include "profile.wgsl"
#include "params.wgsl"

// The lunar corona (story 5.2), one fullscreen pass. The rings are not drawn here: they are the
// droplets' diffraction pattern, summed over the spectrum and the spread of droplet sizes on the
// CPU (src/gpu/optics/corona.ts) into a table of RGB per steradian against angle from the moon,
// row 0 of `table`. This pass works out each pixel's angle from the moon through a pinhole lens,
// looks the pattern up, and scales it by how much cloud there is.
//
// A thin cloud of optical depth tau scatters tau e^-tau of the moonlight towards the eye once: half
// of that is diffraction, the corona, and half refraction and reflection, a broad forward lobe.
// The cloud's droplets are not all one size from place to place: where they are a factor s larger,
// the whole pattern shrinks by s and brightens by s^2, which is what makes a real corona's rings
// wobble and break up where the cloud changes.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var table: texture_2d<f32>;

fn view_ray(uv: vec2f) -> vec3f {
  return normalize(vec3f((uv.x - 0.5) * params.aspect * params.view_scale, (uv.y - 0.5) * params.view_scale, 1.0));
}

/// The cloud's optical depth, and its droplets' size relative to the mean, at a pixel.
fn cloud(pixel: vec2f) -> vec2f {
  let p = pixel / params.cloud_scale;
  let warp = vec2f(fbm_2d(p * 0.4 + params.drift * 0.7 + vec2f(3.1, 8.7), 3, 2.0, 0.5),
                   fbm_2d(p * 0.4 + params.drift * 0.7 + vec2f(9.4, 1.6), 3, 2.0, 0.5));
  let n = fbm_2d(p + params.drift + 0.9 * warp, 5, 2.0, 0.5);
  // Thin everywhere, thicker in billows: a sheet of altostratus or altocumulus.
  let tau = params.tau * max(0.0, 1.0 + params.patchy * 1.6 * n);
  // The droplet size varies over a longer scale than the cloud's texture.
  let s = 1.0 + params.size_var * 1.4 * fbm_2d(p * 0.25 + params.drift * 0.5 + vec2f(5.5, 2.2), 3, 2.0, 0.5);
  return vec2f(tau, s);
}

/// A faint, fixed star field, dimmed by the cloud; never twinkling.
fn stars(pixel: vec2f) -> f32 {
  let cell = floor(pixel / 9.0);
  let h = ihash_2to2(vec2i(cell) + vec2i(41, 17));
  if (h.x < 0.9) {
    return 0.0;
  }
  let at = (cell + 0.2 + 0.6 * h) * 9.0;
  let d = length(pixel - at);
  return exp(-d * d / 0.9) * (0.4 + 3.0 * pow(h.y, 6.0));
}

@fragment fn sky(in: FullscreenVarying) -> @location(0) vec4f {
  let pixel = in.position.xy;
  let c = cloud(pixel);
  let tau = c.x;
  let keep = exp(-tau);
  var colour = mix(params.sky_top, params.sky_bottom, in.uv.y * in.uv.y);
  colour += vec3f(0.85, 0.9, 1.0) * stars(pixel) * params.stars;
  colour *= keep;

  let moon = moon_disc(pixel, params.moon_pos, params.moon_radius, params.phase, params.tilt);
  colour += params.moon_colour * params.moon_light * moon * keep;

  let angle = acos(clamp(dot(view_ray(in.uv), view_ray(params.moon_pos / params.out_size)), -1.0, 1.0));
  // The pattern of droplets s times the mean size: s^2 as bright, s times smaller.
  let s = c.y;
  let corona = s * s * profile_at(table, 0, angle * s, params.range);
  let broad = vec3f(params.glow * henyey_greenstein(cos(angle), 0.85));
  let single = tau * keep;
  colour += params.moon_colour * params.moon_light * params.lit * params.omega * single * 0.5 * (corona + broad);
  // Light scattered many times inside the thicker cloud: a dim, even grey.
  colour += params.cloud_colour * params.lit * (1.0 - keep);
  return vec4f(colour, 1.0);
}
