#include "fullscreen.wgsl"
#include "fbm.wgsl"
#include "hash.wgsl"
#include "profile.wgsl"
#include "params.wgsl"

// The moonbow (story 5.7), one fullscreen pass over a very wide lens: a waterfall across a gorge,
// its spray rising, and the moon low behind the camera. The drops' phase function is traced on the
// CPU (src/gpu/optics/rainbow.ts) into row 0 of `table`, RGB per steradian against angle from the
// antilunar point: the point straight opposite the moon, below the horizon ahead.
//
// Through spray of optical depth tau a ray keeps e^-tau of what is behind it and gains what the
// spray scatters towards the eye. The drops are a millimetre across, so half of what they take out
// of the beam is diffraction, straight on and away from us; the other half is the phase function.
// Light scattered many times in thick spray adds a dim, even white mist.
//
// The eye does not see a moonbow's colours: it is too dim for the cones. `colour` mixes the bow
// towards its own luminance; 1 is what a long exposure records.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var table: texture_2d<f32>;

const BOW_PI: f32 = 3.14159265358979;
const BOW_DEG: f32 = 0.0174532925;

/// The view ray for `uv` in the world: x right, y up, z ahead, away from the moon.
fn world_ray(uv: vec2f) -> vec3f {
  let r = normalize(vec3f((uv.x - 0.5) * params.aspect * params.view_scale, (0.5 - uv.y) * params.view_scale, 1.0));
  let c = cos(params.pitch);
  let s = sin(params.pitch);
  return vec3f(r.x, r.y * c + r.z * s, -r.y * s + r.z * c);
}

/// The far rim of the gorge, the top of the falls, against the sky.
fn rim(azimuth: f32) -> f32 {
  return (2.5 + 1.8 * fbm_2d(vec2f(azimuth * 4.0, 3.1), 4, 2.0, 0.5)) * BOW_DEG;
}

/// How much falling water there is at an azimuth: a long curtain broken into a few cascades.
fn curtain(azimuth: f32) -> f32 {
  let across = smoothstep(-0.75, -0.55, azimuth) * (1.0 - smoothstep(0.5, 0.7, azimuth));
  let breaks = smoothstep(-0.1, 0.25, fbm_2d(vec2f(azimuth * 9.0, 0.7), 3, 2.0, 0.5));
  return across * breaks;
}

/// Spray: thick in the gorge, thinning as it rises, billowing upwards and drifting.
fn spray(elevation: f32, azimuth: f32) -> f32 {
  let height = (elevation / BOW_DEG + 30.0) / params.spray_height;
  let p = vec2f(azimuth * 3.0 + params.sway, elevation * 3.0 - params.rise);
  let billow = 0.55 + 0.9 * (0.5 + 0.5 * fbm_2d(p + 0.7 * vec2f(fbm_2d(p * 0.6 + vec2f(1.3, 8.1), 3, 2.0, 0.5), 0.0), 5, 2.0, 0.5));
  // Most of it over the plunge pool, in front of the falls.
  let across = 0.35 + 0.65 * exp(-azimuth * azimuth / 0.5);
  return params.spray * exp(-height) * billow * across;
}

fn stars(pixel: vec2f) -> f32 {
  let cell = floor(pixel / 8.0);
  let h = ihash_2to2(vec2i(cell) + vec2i(57, 3));
  if (h.x < 0.93) {
    return 0.0;
  }
  let at = (cell + 0.2 + 0.6 * h) * 8.0;
  let d = length(pixel - at);
  return exp(-d * d / 0.8) * (0.4 + 3.0 * pow(h.y, 6.0));
}

@fragment fn scene(in: FullscreenVarying) -> @location(0) vec4f {
  let pixel = in.position.xy;
  let ray = world_ray(in.uv);
  let elevation = asin(clamp(ray.y, -1.0, 1.0));
  let azimuth = atan2(ray.x, ray.z);
  let moon = params.moon_colour * params.moon_light * params.lit * params.omega;
  // Moonlight falling on a surface facing the moon, as radiance per unit albedo: E / pi.
  let lambert = moon * cos(params.elevation) / BOW_PI;

  var background: vec3f;
  if (elevation > rim(azimuth)) {
    let up = clamp(elevation / 1.2, 0.0, 1.0);
    background = mix(params.sky_horizon, params.sky_zenith, sqrt(up));
    background += vec3f(0.85, 0.9, 1.0) * stars(pixel) * params.stars;
  } else {
    // Wet dark rock, and white water falling down it, streaked as it goes.
    let rock = lambert * 0.025 * (0.7 + 0.3 * fbm_2d(vec2f(azimuth * 20.0, elevation * 20.0), 3, 2.0, 0.5));
    let streaks = 0.6 + 0.4 * fbm_2d(vec2f(azimuth * 70.0, elevation * 9.0 + params.flow), 3, 2.0, 0.5);
    let water = lambert * 0.6 * params.falls * streaks;
    background = mix(rock, water, curtain(azimuth));
  }

  let tau = spray(elevation, azimuth);
  let keep = exp(-tau);
  let anti = vec3f(0.0, -sin(params.elevation), cos(params.elevation));
  let angle = acos(clamp(dot(ray, anti), -1.0, 1.0));
  var bow = profile_at(table, 0, angle, params.range);
  let grey = dot(bow, vec3f(0.2126, 0.7152, 0.0722));
  bow = mix(vec3f(grey), bow, params.colour);
  let scattered = moon * (0.5 * bow) + lambert * params.mist;
  return vec4f(background * keep + (1.0 - keep) * scattered, 1.0);
}
