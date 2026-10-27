#include "fullscreen.wgsl"
#include "beam.wgsl"
#include "noisetex.wgsl"
#include "moon.wgsl"
#include "params.wgsl"

// A street lamp in fog, one fullscreen pass. Each pixel is a view ray from an eye 1.6 m above a
// road; it ends on the ground, a lamp post or the far edge of the fog. Along it:
//   - the cone under each lamp: beam_airlight (beam.wgsl), the single scattering of the shaded
//     lamp's light between the two ends of the ray's chord through the cone, with the fog's density
//     at each of its 12 nodes;
//   - the halo round each lamp head: the light its glass bowl spills every way, as 2.8's glow
//     stopped where the ray stops (scatter_between);
//   - the faint sky glow every bit of fog scatters, which is what makes the fog itself visible;
//   - whatever the ray ends on, lit by the lamps and seen through the fog: the pools under the
//     cones, the posts, a wet sheen with the lamps' reflections.
// The density drifts: two layers of the baked noise tile, in world metres, sliding at different
// speeds, so the fog thins and thickens as it passes through the cones instead of moving as a sheet.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var noise_tex: texture_2d<f32>;
@group(0) @binding(2) var noise_smp: sampler;

const MAX_LAMPS: i32 = 8;
const NOTHING: f32 = 1.0e9;
/** A post's radius and the arm's, metres; the glowing bowl under the shade. */
const POST_RADIUS: f32 = 0.07;
const ARM_RADIUS: f32 = 0.04;
const HEAD_RADIUS: f32 = 0.15;
/** Wet asphalt is dark: diffuse albedo, and the reflectance of its water film head-on. */
const GROUND_ALBEDO: f32 = 0.07;
const POST_ALBEDO: f32 = 0.05;
const WATER_F0: f32 = 0.02;
/** The wet sheen's Phong exponent: the lamps' reflections smear into streaks towards the eye. */
const SHEEN_POWER: f32 = 3000.0;
/** How much of the moon's light its halo in the fog gathers, against the disc. */
const MOON_HALO: f32 = 0.02;
const DOWN: vec3f = vec3f(0.0, -1.0, 0.0);

/**
 * The fog's density at p relative to its mean. Two fetches of the baked tile on two planes, one
 * lying (x, z) and one standing (x, y), so the density varies in all three directions (one plane
 * alone turns into streaks along the axis it leaves out), drifting across the road at different
 * speeds so the patches change as well as travel.
 */
fn fog_density(p: vec3f) -> f32 {
  let lying = vec2f(p.x + 0.3 * p.y, p.z) / params.cell;
  let standing = vec2f(p.x + 0.45 * p.z, 1.6 * p.y - 0.2 * p.z) / params.cell;
  let a = noisetex_sample_lod(noise_tex, noise_smp, lying + params.drift, 1.0).r;
  let b = noisetex_sample_lod(noise_tex, noise_smp, 0.7 * standing + vec2f(3.1, 5.7) + 0.6 * params.drift, 1.0).g;
  let n = (a - 0.5) + 0.8 * (b - 0.5);
  return max(1.0 + params.patchy * 3.2 * n, 0.1);
}

fn beam_density(p: vec3f) -> f32 {
  return fog_density(p);
}

fn view_ray(uv: vec2f) -> vec3f {
  let x = (uv.x - 0.5) * params.aspect * params.view_scale;
  let y = (0.5 - uv.y) * params.view_scale;
  // Pitched up by the camera's tilt: (cos, sin) in `pitch`.
  return normalize(vec3f(x, y * params.pitch.x + params.pitch.y, params.pitch.x - y * params.pitch.y));
}

/** Where the ray first meets a vertical post at `c` (x, z) from the ground to `top`. */
fn hit_post(o: vec3f, d: vec3f, c: vec2f, top: f32) -> f32 {
  let w = o.xz - c;
  let a = dot(d.xz, d.xz);
  let b = dot(w, d.xz);
  let disc = b * b - a * (dot(w, w) - POST_RADIUS * POST_RADIUS);
  if (disc < 0.0 || a < 1e-8) {
    return NOTHING;
  }
  let t = (-b - sqrt(disc)) / a;
  let y = o.y + t * d.y;
  return select(NOTHING, t, t > 0.0 && y > 0.0 && y < top);
}

/** Where the ray first meets the horizontal arm along x at height y, depth z, from x0 to x1. */
fn hit_arm(o: vec3f, d: vec3f, y: f32, z: f32, x0: f32, x1: f32) -> f32 {
  let w = vec2f(o.y - y, o.z - z);
  let a = dot(d.yz, d.yz);
  let b = dot(w, d.yz);
  let disc = b * b - a * (dot(w, w) - ARM_RADIUS * ARM_RADIUS);
  if (disc < 0.0 || a < 1e-8) {
    return NOTHING;
  }
  let t = (-b - sqrt(disc)) / a;
  let x = o.x + t * d.x;
  return select(NOTHING, t, t > 0.0 && x > x0 && x < x1);
}

/** Light arriving at a surface point p with normal n from every lamp: the beam and the bowl's spill. */
fn irradiance(p: vec3f, n: vec3f) -> f32 {
  var e = 0.0;
  for (var i = 0; i < MAX_LAMPS; i++) {
    if (i >= i32(params.lamp_count)) {
      break;
    }
    let lamp = params.lamps[i];
    let l = lamp.xyz - p;
    let r2 = max(dot(l, l), 1e-4);
    let r = sqrt(r2);
    let facing = max(dot(n, l) / r, 0.0);
    let shade = beam_profile(dot(-l, DOWN) / r, params.edges) + params.spill;
    e += lamp.w * shade * facing * exp(-params.beta * r) / r2;
  }
  return e;
}

/**
 * The wet road's sheen: each lamp's bowl mirrored in the water film and smeared by the road's
 * roughness into a Phong lobe, normalised so the lobe carries the bowl's light rather than adding
 * any: radiance x (bowl's solid angle) / (lobe's solid angle, 2 pi / (n + 2)).
 */
fn sheen(p: vec3f, d: vec3f) -> f32 {
  let mirror = reflect(d, vec3f(0.0, 1.0, 0.0));
  let fresnel = WATER_F0 + (1.0 - WATER_F0) * pow(1.0 - max(-d.y, 0.0), 5.0);
  var s = 0.0;
  for (var i = 0; i < MAX_LAMPS; i++) {
    if (i >= i32(params.lamp_count)) {
      break;
    }
    let lamp = params.lamps[i];
    let l = lamp.xyz - p;
    let r2 = dot(l, l);
    let lobe = pow(max(dot(mirror, l * inverseSqrt(r2)), 0.0), SHEEN_POWER);
    let spread = HEAD_RADIUS * HEAD_RADIUS / r2 * 0.5 * (SHEEN_POWER + 2.0);
    s += lamp.w * params.head * lobe * spread * exp(-params.beta * sqrt(r2));
  }
  return params.wet * fresnel * s;
}

@fragment fn fog(in: FullscreenVarying) -> @location(0) vec4f {
  let o = params.eye;
  let d = view_ray(in.uv);
  let count = i32(params.lamp_count);

  // Where the ray ends: the ground, a post, an arm, or the far edge of the fog.
  var t_end = params.far;
  var normal = vec3f(0.0);
  var surface = 0; // 0 sky, 1 ground, 2 post or arm
  if (d.y < 0.0) {
    let t = -o.y / d.y;
    if (t < t_end) {
      t_end = t;
      normal = vec3f(0.0, 1.0, 0.0);
      surface = 1;
    }
  }
  for (var i = 0; i < MAX_LAMPS; i++) {
    if (i >= count) {
      break;
    }
    let lamp = params.lamps[i].xyz;
    let post = vec2f(lamp.x + params.arm, lamp.z);
    let top = lamp.y + 0.25;
    let tp = hit_post(o, d, post, top);
    if (tp < t_end) {
      t_end = tp;
      let p = o + tp * d;
      normal = normalize(vec3f(p.x - post.x, 0.0, p.z - post.y));
      surface = 2;
    }
    let ta = hit_arm(o, d, top - 0.05, lamp.z, lamp.x - 0.25, post.x);
    if (ta < t_end) {
      t_end = ta;
      let p = o + ta * d;
      normal = normalize(vec3f(0.0, p.y - (top - 0.05), p.z - lamp.z));
      surface = 2;
    }
  }

  let through = exp(-params.beta * t_end);
  // The faint sky glow every bit of fog scatters back, patchy where the fog is: its density at the
  // median depth the glow comes from.
  let deep = 0.5 * min(t_end, 1.4 / params.beta);
  let glow_density = fog_density(o + deep * d);
  var colour = params.ambient * (1.0 - through) * mix(1.0, glow_density, 0.6);

  let pixel = params.pixel;
  for (var i = 0; i < MAX_LAMPS; i++) {
    if (i >= count) {
      break;
    }
    let lamp = params.lamps[i];
    // The cone under the shade.
    var light = lamp.w * beam_airlight(o, d, lamp.xyz, DOWN, params.edges, params.beta, params.g, t_end);
    // The bowl's halo: 2.8's glow, stopped where the ray stops, in the fog's density where the ray
    // passes closest to the lamp.
    let tf = dot(d, lamp.xyz - o);
    let near = o + clamp(tf, 0.0, t_end) * d;
    light += lamp.w * params.spill * fog_density(near) *
      scatter_between(o, d, lamp.xyz, params.beta, params.g, 0.0, t_end);
    // The bowl itself, seen from below through the fog: a small bright disc, antialiased.
    if (tf > 0.0 && tf < t_end) {
      let h = length(o + tf * d - lamp.xyz);
      let cover = clamp((HEAD_RADIUS - h) / (pixel * tf) + 0.5, 0.0, 1.0);
      light += cover * lamp.w * params.head * exp(-params.beta * tf);
    }
    colour += params.lamp_colour * light;
  }

  if (surface == 0) {
    // Past the fog: the night sky and, in thin fog, the moon with its own halo (2.8's glow, the
    // fog's whole depth for the distance; it carries its own extinction).
    colour += params.ambient * 0.5 * through;
    if (params.moon > 0.0) {
      let disc = moon_disc(in.position.xy, params.moon_px, params.moon_radius, 0.5, 0.35);
      let gamma = acos(clamp(dot(d, params.moon_dir), -1.0, 1.0));
      let halo = airlight_forward(gamma, params.beta * params.far, params.g);
      colour += params.moon * (vec3f(0.9, 0.95, 1.0) * disc * through + vec3f(0.55, 0.65, 0.85) * MOON_HALO * halo);
    }
  } else {
    let p = o + t_end * d;
    let albedo = select(POST_ALBEDO, GROUND_ALBEDO, surface == 1);
    var seen = params.lamp_colour * (albedo / 3.14159265) * irradiance(p, normal) + params.ambient * albedo;
    if (surface == 1) {
      seen += params.lamp_colour * sheen(p, d);
    }
    colour += seen * through;
  }
  return vec4f(colour, 1.0);
}
