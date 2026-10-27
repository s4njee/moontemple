#include "fullscreen.wgsl"
#include "fbm.wgsl"
#include "hash.wgsl"
#include "moon.wgsl"
#include "scatter.wgsl"
#include "profile.wgsl"
#include "params.wgsl"

// The 22-degree halo and moon dogs (story 5.3), one fullscreen pass over a wide lens. The optics
// are traced on the CPU (src/gpu/optics/halo.ts) into two rows of `table`:
//
//   row 0   the halo of tumbling columns: RGB per steradian against angle from the moon
//   row 1   one moon dog of level plates: RGB per radian of azimuth against azimuth from the moon,
//           all of it at the moon's elevation
//
// Each pixel is a view ray turned into the sky's frame (elevation and azimuth, the moon straight
// ahead), so the ring stays round and the dogs stay level whatever the lens. A thin veil of
// cirrostratus of optical depth tau sends tau e^-tau of the moonlight to the eye once; half of what
// the crystals take out of the beam they refract and reflect, and the tables are shares of that.
// Below the horizon is a field of snow lit by the moon, and a far tree line.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var table: texture_2d<f32>;

const HALO_PI: f32 = 3.14159265358979;

/// The view ray for `uv` in the sky's frame: x right, y up, z towards the moon's azimuth.
fn sky_ray(uv: vec2f) -> vec3f {
  let r = normalize(vec3f((uv.x - 0.5) * params.aspect * params.view_scale, (0.5 - uv.y) * params.view_scale, 1.0));
  let c = cos(params.pitch);
  let s = sin(params.pitch);
  return vec3f(r.x, r.y * c + r.z * s, -r.y * s + r.z * c);
}

/// The cirrostratus veil's optical depth: thin, faintly fibrous, drifting along the azimuth.
fn veil(elevation: f32, azimuth: f32) -> f32 {
  let p = vec2f(azimuth * 2.2 + params.drift, elevation * 9.0);
  let n = fbm_2d(vec2f(p.x * 0.6, p.y * 1.4) + 0.6 * vec2f(fbm_2d(p * 0.5 + vec2f(4.1, 2.7), 3, 2.0, 0.5), 0.0), 5, 2.0, 0.5);
  return params.tau * max(0.0, 1.0 + params.fibres * 1.6 * n);
}

/// The horizon's elevation at an azimuth: a far tree line, a little uneven.
fn tree_line(azimuth: f32) -> f32 {
  let ridge = 0.004 + 0.006 * (0.5 + 0.5 * fbm_2d(vec2f(azimuth * 3.0, 1.3), 3, 2.0, 0.5));
  let trees = 0.006 * pow(0.5 + 0.5 * fbm_2d(vec2f(azimuth * 160.0, 7.7), 2, 2.0, 0.5), 2.0);
  return ridge + trees;
}

fn stars(pixel: vec2f) -> f32 {
  let cell = floor(pixel / 7.0);
  let h = ihash_2to2(vec2i(cell) + vec2i(23, 5));
  if (h.x < 0.9) {
    return 0.0;
  }
  let at = (cell + 0.2 + 0.6 * h) * 7.0;
  let d = length(pixel - at);
  return exp(-d * d / 0.8) * (0.4 + 3.0 * pow(h.y, 6.0));
}

@fragment fn sky(in: FullscreenVarying) -> @location(0) vec4f {
  let pixel = in.position.xy;
  let ray = sky_ray(in.uv);
  let elevation = asin(clamp(ray.y, -1.0, 1.0));
  let azimuth = atan2(ray.x, ray.z);
  let moon_light = params.moon_colour * params.moon_light * params.lit;

  if (elevation < tree_line(azimuth)) {
    if (elevation > 0.0) {
      // The trees: nearly black against the sky.
      return vec4f(moon_light * params.omega * 0.004, 1.0);
    }
    // Snow, a Lambertian field lit from the moon's elevation: albedo 0.9 / pi of its irradiance,
    // with a little unevenness in the drifts.
    let drift = 0.85 + 0.15 * fbm_2d(vec2f(azimuth * 6.0, 1.0 / max(-ray.y, 0.02)), 3, 2.0, 0.5);
    let snow = moon_light * params.omega * sin(params.elevation) * 0.9 / HALO_PI * drift;
    return vec4f(snow + params.sky_horizon * 0.2, 1.0);
  }

  let tau = veil(elevation, azimuth);
  let keep = exp(-tau);
  let up = clamp(elevation / 1.2, 0.0, 1.0);
  var colour = mix(params.sky_horizon, params.sky_zenith, sqrt(up));
  colour += vec3f(0.85, 0.9, 1.0) * stars(pixel) * params.stars;
  colour *= keep;

  let moon_dir = vec3f(0.0, sin(params.elevation), cos(params.elevation));
  colour += params.moon_colour * params.moon_light * keep * moon_disc(pixel, params.moon_pos, params.moon_radius, params.phase, params.tilt);

  let angle = acos(clamp(dot(ray, moon_dir), -1.0, 1.0));
  let halo = params.columns * profile_at(table, 0, angle, params.range);
  // One dog each side, spread in elevation by the plates' wobble and the moon's disc; per
  // steradian, the azimuth's light divided by cos(elevation).
  let off = (elevation - params.elevation) / params.dog_spread;
  let dog = params.plates * profile_at(table, 1, abs(azimuth), params.range) * exp(-0.5 * off * off) / (sqrt(2.0 * HALO_PI) * params.dog_spread * max(cos(elevation), 0.05));
  // Near the moon: diffraction round the crystals (the aureole) and a broad forward lobe.
  let radii = length(pixel - params.moon_pos) / params.moon_radius;
  let near = 1000.0 * params.aureole * moon_aureole(radii) + params.glow * henyey_greenstein(cos(angle), 0.75);
  colour += moon_light * params.omega * tau * keep * (0.5 * (halo + dog) + near);
  return vec4f(colour, 1.0);
}
