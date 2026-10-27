#include "fullscreen.wgsl"
#include "spectral.wgsl"
#include "glass.wgsl"
#include "prism-trace.wgsl"
#include "scatter.wgsl"
#include "noisetex.wgsl"
#include "params.wgsl"

// The prism (story 9.3), one fullscreen pass. Everything that depends on the optics was traced on
// the CPU through 9.2's tracer (scene.ts): the irradiance across the back wall, one row of
// `wall_table` (power per unit length, the band's height applied here), and the beams standing in
// the haze, as level strips of light. Per pixel this pass only looks:
//
//   1. the floor and the back wall, lit by the band (the table), by the band's own bounce light
//      (a Lambertian patch at its centroid) and a faint room fill;
//   2. the prism, traced through glass.wgsl at three wavelengths against that room, so its faces
//      show the room and the band bent and reflected;
//   3. the beams in the haze: single scattering along the view ray through each strip, in closed
//      form (the strip is a box, so the path through it is an interval), with Henyey-Greenstein;
//   4. the faint scatter where a beam crosses a face, and inside the glass along the beam.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var wall_table: texture_2d<f32>;
@group(0) @binding(2) var noise_tex: texture_2d<f32>;
@group(0) @binding(3) var noise_smp: sampler;

const PRISM_PI: f32 = 3.14159265358979;
const FAR: f32 = 1e5;

/// Where the environment lookups of `glass_trace` start: the point the view ray enters the glass.
var<private> env_origin: vec3f;

fn camera_ray(uv: vec2f) -> vec3f {
  let x = (uv.x * 2.0 - 1.0) * params.tan_fov.x;
  let y = (1.0 - uv.y * 2.0) * params.tan_fov.y;
  return normalize(params.forward + params.right * x + params.up * y);
}

/// Power per unit length across the wall at x (linear between texels; 32-bit float does not filter).
fn wall_profile(x: f32) -> vec3f {
  let size = f32(textureDimensions(wall_table).x);
  let f = (x - params.table.x) / (params.table.y - params.table.x) * size - 0.5;
  if (f < -1.0 || f > size) {
    return vec3f(0.0);
  }
  let i = floor(f);
  let a = f - i;
  let i0 = i32(clamp(i, 0.0, size - 1.0));
  let i1 = i32(clamp(i + 1.0, 0.0, size - 1.0));
  return mix(textureLoad(wall_table, vec2i(i0, 0), 0).rgb, textureLoad(wall_table, vec2i(i1, 0), 0).rgb, a);
}

/// The slit's height across y, as a share per unit height: 1 / height inside, soft edges `edge`
/// wide centred on the true ones so it still integrates to 1.
fn slit_profile(y: f32) -> f32 {
  let edge = params.beam.z;
  return clamp((params.beam.y - abs(y - params.beam.x)) / edge + 0.5, 0.0, 1.0) / (2.0 * params.beam.y);
}

/// The band's light bounced off the wall onto a point with normal `n`: the band as a small
/// Lambertian patch facing +z, radiant exitance albedo * E.
fn bounce(p: vec3f, n: vec3f) -> vec3f {
  let v = p - params.band_centre;
  let r2 = max(dot(v, v), 0.05);
  let r = sqrt(r2);
  let cos_e = max(v.z / r, 0.0);
  let cos_p = max(-dot(n, v) / r, 0.0);
  return params.band_power * params.albedo.x * cos_e * cos_p / (PRISM_PI * r2);
}

/// Radiance of the room along o + t d, ignoring the prism, and how far it is.
fn room(o: vec3f, d: vec3f) -> vec4f {
  let t_floor = select(FAR, -o.y / d.y, d.y < -1e-5);
  let t_wall = select(FAR, (params.wall_z - o.z) / d.z, d.z < -1e-5);
  if (t_wall < t_floor) {
    let p = o + d * t_wall;
    let e = wall_profile(p.x) * slit_profile(p.y) + params.ambient;
    return vec4f(params.albedo.x / PRISM_PI * e, t_wall);
  }
  if (t_floor < FAR) {
    let p = o + d * t_floor;
    let e = bounce(p, vec3f(0.0, 1.0, 0.0)) + params.ambient;
    return vec4f(params.albedo.y / PRISM_PI * e, t_floor);
  }
  return vec4f(0.0, 0.0, 0.0, FAR);
}

fn glass_environment(dir: vec3f, nm: f32) -> f32 {
  let rgb = room(env_origin, dir).rgb;
  if (nm > 575.0) {
    return rgb.r;
  }
  if (nm > 495.0) {
    return rgb.g;
  }
  return rgb.b;
}

/// The prism's faces for prism-trace.wgsl, read where they are: in the uniform buffer.
fn prism_plane(i: u32) -> vec4f {
  return params.planes[i];
}

fn prism_plane_count() -> u32 {
  return params.plane_count;
}

/// The t interval along o + t d where p0 + t dp lies in [lo, hi].
fn slab(p0: f32, dp: f32, lo: f32, hi: f32) -> vec2f {
  if (abs(dp) < 1e-7) {
    return select(vec2f(1.0, -1.0), vec2f(-FAR, FAR), p0 >= lo && p0 <= hi);
  }
  let a = (lo - p0) / dp;
  let b = (hi - p0) / dp;
  return vec2f(min(a, b), max(a, b));
}

fn span_length(s: vec2f) -> f32 {
  return max(s.y - s.x, 0.0);
}

/// Light scattered towards the eye from every beam the view ray passes through, out to `t_max`.
fn haze(o: vec3f, d: vec3f, t_max: f32, glass: vec2f) -> vec3f {
  // Every beam is level and BEAM_HEIGHT tall: the ray's interval in that slab is shared.
  let level = slab(o.y, d.y, params.beam.x - params.beam.y, params.beam.x + params.beam.y);
  let t0 = max(level.x, 0.0);
  let t1 = min(level.y, t_max);
  if (t1 <= t0) {
    return vec3f(0.0);
  }
  // The haze drifts: its density where the ray crosses the beams' height.
  let mid = o + d * (0.5 * (t0 + t1));
  let n = noisetex_sample_lod(noise_tex, noise_smp, mid.xz / params.haze_cell + params.drift, 1.0);
  let density = max(1.0 + params.patchy * (n.r * 2.0 - 1.0 + 0.5 * (n.g * 2.0 - 1.0)), 0.0);

  var light = vec3f(0.0);
  let count = u32(params.beam_count);
  for (var i = 0u; i < count; i++) {
    let line = params.beams[i * 3u];
    let span = params.beams[i * 3u + 1u];
    let rgb = params.beams[i * 3u + 2u].rgb;
    let u = line.zw;
    let side = vec2f(-u.y, u.x);
    let rel = o.xz - line.xy;
    let along = slab(dot(rel, u), dot(d.xz, u), span.x, span.y);
    let wide = slab(dot(rel, side), dot(d.xz, side), -span.z, span.z);
    let s = vec2f(max(max(t0, along.x), wide.x), min(min(t1, along.y), wide.y));
    let total = span_length(s);
    if (total <= 0.0) {
      continue;
    }
    let in_glass = span_length(vec2f(max(s.x, glass.x), min(s.y, glass.y)));
    let tm = 0.5 * (s.x + s.y);
    let cos_angle = -dot(vec3f(u.x, 0.0, u.y), d);
    let phase = henyey_greenstein(cos_angle, params.g);
    if (span.w > 0.5) {
      // The light inside the glass: the glass's own faint scatter, seen only through the glass.
      light += rgb * params.glass_scatter * phase * in_glass;
    } else {
      // Outside: haze, the beam dimming along its way from the prism (or brighter back towards
      // the slit), and the view dimming on its way back.
      let a = dot(rel + d.xz * tm, u);
      let fade = exp(-params.beta * (clamp(a, -params.slit_distance, 40.0) + tm));
      light += rgb * params.beta * density * phase * (total - in_glass) * fade;
    }
  }
  return light;
}

/// The prism lit from inside: light the glass scatters out of the beam reaches every part of it,
/// and leaks out most where the polish breaks, at the edges (bevels, chips). `p` is where the view
/// ray meets the glass, `path` how far it runs inside, `face` the plane it came in through.
fn glass_glow(p: vec3f, path: f32, face: u32, t: f32) -> vec3f {
  var nearest = FAR;
  for (var i = 0u; i < params.plane_count; i++) {
    if (i != face) {
      nearest = min(nearest, params.planes[i].w - dot(params.planes[i].xyz, p));
    }
  }
  let px = t * params.pixel_angle;
  let edge = 1.0 - smoothstep(0.6 * px, 1.8 * px, nearest);
  let lit = params.beams[2].rgb * exp(-abs(p.y - params.beam.x) / 0.6);
  return lit * (params.edge_glow * edge + params.body_glow * path);
}

/// Where a beam lights a face of the prism the eye sees: a little of it scattered back by the
/// polished surface, as a Lambertian spot.
fn face_glow(p: vec3f) -> vec3f {
  var light = vec3f(0.0);
  let height = smoothstep(params.beam.y + 0.01, params.beam.y - 0.01, abs(p.y - params.beam.x));
  if (height <= 0.0) {
    return light;
  }
  let count = u32(params.beam_count);
  for (var i = 0u; i < count; i++) {
    let line = params.beams[i * 3u];
    let span = params.beams[i * 3u + 1u];
    if (span.w > 0.5) {
      continue;
    }
    let rel = p.xz - line.xy;
    let a = dot(rel, line.zw);
    let c = dot(rel, vec2f(-line.w, line.z));
    let inside = step(abs(c), span.z) * step(span.x, a) * step(a, span.y);
    light += params.beams[i * 3u + 2u].rgb * inside;
  }
  return light * height * params.surface_scatter / PRISM_PI;
}

@fragment fn scene(in: FullscreenVarying) -> @location(0) vec4f {
  let o = params.eye;
  let d = camera_ray(in.uv);
  let behind = room(o, d);
  var t_max = behind.w;
  var colour = behind.rgb * exp(-params.beta * behind.w);

  // Most of the frame misses the prism's bounding sphere: only the rest looks for the glass.
  var glass = vec2f(FAR, FAR);
  let oc = o - params.bound.xyz;
  let b = dot(oc, d);
  let near = b * b - dot(oc, oc) + params.bound.w * params.bound.w;
  if (near > 0.0 && sqrt(near) - b > 0.0) {
  let hit = prism_interval(o, d);
  if (hit.x <= hit.y && hit.x > 0.0 && hit.x < t_max) {
    glass = hit.xy;
    let p = o + d * hit.x;
    env_origin = p;
    let id = params.glass_id;
    let through = vec3f(
      prism_trace(o, d, 610.0, glass_index(id, 610.0)),
      prism_trace(o, d, 545.0, glass_index(id, 545.0)),
      prism_trace(o, d, 465.0, glass_index(id, 465.0)),
    );
    let inside = glass_glow(p, hit.y - hit.x, u32(hit.z), hit.x);
    colour = (through + face_glow(p) + inside) * exp(-params.beta * hit.x);
  }
  }
  colour += haze(o, d, t_max, glass);
  return vec4f(colour, 1.0);
}
