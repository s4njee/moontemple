#include "fullscreen.wgsl"
#include "moon.wgsl"
#include "params.wgsl"

// The dark sea and sky behind the glints. The moon's disc and its glitter are points (index.ts and
// glints.ts); this pass draws everything else the moon lights: the sky's gradient, the moon's
// aureole (moon.wgsl), and the sea mirroring both through the swell, with water's Fresnel
// reflectance over a near-black body. The moon disc is left out of the reflected sky because the
// glints carry it, so its reflection is counted once (Water Temple's sun-glint does the same).
//
// The same pinhole as the points: a horizontal optical axis through `centre`, so the horizon is the
// row centre.y. World y is up, the lens is `eye` metres above mean sea level.
//
// Depth of field, cheaply: nothing here is sharp enough to need a real blur except the swell's
// small waves, so each swell fades out where it is shorter than the circle of confusion at its
// distance (the same fade waterplane.wgsl uses for the pixel footprint), and the horizon is
// softened over the blur radius at infinity.

@group(0) @binding(0) var<uniform> params: Params;

const SEA_GRAVITY: f32 = 9.81;
const SEA_PROFILE_MEAN: f32 = 0.4658;
const SEA_IOR: f32 = 1.34;

// One of Water Temple's swells (waterplane.wgsl, `_waterplane_swell_wave`); swell.ts is its twin.
// Returns (height, d/dx, d/dz).
fn sea_wave(p: vec2f, time: f32, angle: f32, wavelength: f32, steep: f32, phase0: f32, footprint: f32) -> vec3f {
  let fade = smoothstep(2.5, 8.0, wavelength / max(footprint, 1e-6));
  if (fade <= 0.0) {
    return vec3f(0.0);
  }
  let k = 6.28318530718 / wavelength;
  let dir = vec2f(sin(angle), -cos(angle));
  let phase = k * dot(dir, p) - sqrt(SEA_GRAVITY * k) * time + phase0;
  let amp = 0.03 * wavelength * steep * params.waves * fade;
  let e = exp(sin(phase) - 1.0);
  let slope = amp * k * e * cos(phase);
  return vec3f(amp * (e - SEA_PROFILE_MEAN), slope * dir.x, slope * dir.y);
}

fn sea_swell(p: vec2f, time: f32, footprint: f32) -> vec3f {
  return sea_wave(p, time, 0.00, 25.0, 1.00, 0.0, footprint) +
    sea_wave(p, time, 0.50, 14.0, 0.90, 1.7, footprint) +
    sea_wave(p, time, -0.65, 8.3, 0.80, 3.1, footprint) +
    sea_wave(p, time, 1.05, 4.6, 0.70, 4.4, footprint) +
    sea_wave(p, time, -1.30, 2.5, 0.55, 0.9, footprint);
}

fn sea_fresnel(c: f32) -> f32 {
  let cos_i = clamp(c, 1e-4, 1.0);
  let sin2 = (1.0 - cos_i * cos_i) / (SEA_IOR * SEA_IOR);
  let cos_t = sqrt(max(0.0, 1.0 - sin2));
  let rs = (cos_i - SEA_IOR * cos_t) / (cos_i + SEA_IOR * cos_t);
  let rp = (SEA_IOR * cos_i - cos_t) / (SEA_IOR * cos_i + cos_t);
  return 0.5 * (rs * rs + rp * rp);
}

// The night sky in direction `dir` (unit, y up), without the moon's disc: a gradient brighter
// towards the horizon, and the aureole. `blur` is the circle of confusion as an angle: the
// aureole's 1 / angle^2 peak is flattened inside it, keeping the same light outside, which is
// roughly what a disc blur does to it. Without this the wave crests that mirror the aureole stay
// sharp lines inside a river of soft discs.
fn sky(dir: vec3f, blur: f32) -> vec3f {
  let up = clamp(dir.y, 0.0, 1.0);
  let base = mix(params.sky_horizon, params.sky_top, pow(up, 0.5));
  let r = max(params.moon_radius, blur);
  let angle = acos(clamp(dot(dir, params.moon_dir), -1.0, 1.0)) / r;
  let keep = params.moon_radius / r;
  return base + params.moon_colour * params.aureole * keep * keep * moon_aureole(angle);
}

// The sea seen along `dir` (pointing below the horizon).
fn sea(dir: vec3f) -> vec3f {
  let d = vec3f(dir.x, min(dir.y, -2e-5), dir.z);
  let t = params.eye / -d.y;
  let p = d * t;
  // Size of a pixel, or of the circle of confusion if larger, on the sea at this distance, along
  // the view (the long way of the foreshortened footprint).
  let blur = abs(params.blur_inf * (1.0 - params.focus / max(p.z, 1e-3)));
  let footprint = t * max(1.0, blur) / (params.focal_px * abs(d.y));
  let wave = sea_swell(p.xz, params.time, footprint);
  let n = normalize(vec3f(-wave.y, 1.0, -wave.z));
  let v = -d;
  var r = reflect(d, n);
  r.y = abs(r.y);
  let f = sea_fresnel(dot(n, v));
  return mix(params.body, sky(r, blur / params.focal_px), f);
}

@fragment fn sea_fs(in: FullscreenVarying) -> @location(0) vec4f {
  let px = in.position.xy;
  let local = (px - params.centre) / params.focal_px;
  let dir = normalize(vec3f(local.x, -local.y, 1.0));
  // The horizon softened over the blur at infinity: sea below, sky above.
  let soft = max(0.75, abs(params.blur_inf));
  let below = smoothstep(-soft, soft, px.y - params.centre.y);
  var colour = sky(dir, abs(params.blur_inf) / params.focal_px);
  if (below > 0.0) {
    colour = mix(colour, sea(dir), below);
  }
  return vec4f(colour * params.gain, 1.0);
}
