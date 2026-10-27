#include "hash.wgsl"
#include "spectral.wgsl"
#include "glass.wgsl"
#include "thinfilm.wgsl"
#include "glass-body.wgsl"
#include "caustic-params.wgsl"

// Light-traced caustics (story 9.5). Light from a distant key light is shot at the solid in its
// own frame, refracted in, and followed through its reflections inside; wherever it lands on the
// inside of a face after at least `min_bounce` reflections, it is added into that face's tile of
// an atlas (bilinear, in fixed point with atomics). `resolve` turns the counts into irradiance
// relative to the beam's own and blends them into a running average, which the body's pixels read.
// The CPU twin is `traceCaustics` in solid.ts.

@group(0) @binding(0) var<uniform> params: CausticParams;
@group(0) @binding(1) var<uniform> solid: GlassSolid;

fn body_plane(i: u32) -> vec4f {
  return solid.planes[i];
}

fn body_plane_count() -> u32 {
  return solid.count;
}
@group(0) @binding(2) var<storage, read> faces: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> accum: array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> smoothed: array<vec4f>;

const CAUSTIC_FIXED: f32 = 4096.0;

// No backdrop or caustic is looked at here, only the faces' reflectance.
fn body_backdrop(dir: vec3f) -> vec3f {
  return vec3f(0.0);
}

fn body_caustic(face: u32, p: vec3f) -> vec3f {
  return vec3f(0.0);
}

fn deposit_texel(face: u32, x: i32, y: i32, rgb: vec3f) {
  let t = i32(params.tile);
  if (x < 0 || y < 0 || x >= t || y >= t) {
    return;
  }
  let index = ((face * params.tile + u32(y)) * params.tile + u32(x)) * 3u;
  let fixed = vec3u(rgb * CAUSTIC_FIXED + 0.5);
  if (fixed.r > 0u) {
    atomicAdd(&accum[index], fixed.r);
  }
  if (fixed.g > 0u) {
    atomicAdd(&accum[index + 1u], fixed.g);
  }
  if (fixed.b > 0u) {
    atomicAdd(&accum[index + 2u], fixed.b);
  }
}

fn deposit(face: u32, p: vec3f, rgb: vec3f) {
  let centre = faces[face * 3u];
  let q = p - centre.xyz;
  let uv = vec2f(dot(q, faces[face * 3u + 1u].xyz), dot(q, faces[face * 3u + 2u].xyz)) / centre.w;
  let texel = (uv * 0.5 + 0.5) * f32(params.tile) - 0.5;
  let base = floor(texel);
  let f = texel - base;
  let x = i32(base.x);
  let y = i32(base.y);
  deposit_texel(face, x, y, rgb * (1.0 - f.x) * (1.0 - f.y));
  deposit_texel(face, x + 1, y, rgb * f.x * (1.0 - f.y));
  deposit_texel(face, x, y + 1, rgb * (1.0 - f.x) * f.y);
  deposit_texel(face, x + 1, y + 1, rgb * f.x * f.y);
}

@compute @workgroup_size(64) fn splat(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= params.rays) {
    return;
  }
  let h = to_unorm_4d(pcg_4d(vec4u(i, params.frame, 0x9e37u, 0x51edu)));
  let radius = params.beam * sqrt(h.x);
  let angle = 6.2831853 * h.y;
  let light = params.light;
  let o = -4.0 * light + params.u * (radius * cos(angle)) + params.w * (radius * sin(angle));

  // One wavelength a ray: drawn evenly over the spectrum and coloured so that their mean is
  // white, or one of three in turn.
  var nm: f32;
  var colour: vec3f;
  var absorb: f32;
  if (params.mode == 0u) {
    nm = SPECTRUM_MIN + (SPECTRUM_MAX - SPECTRUM_MIN) * h.z;
    colour = spectral_rgb(nm) / SPECTRAL_WHITE;
    absorb = max(dot(body_weights(nm), params.absorb), 0.0);
  } else {
    let c = i % 3u;
    nm = array<f32, 3>(650.0, 550.0, 450.0)[c];
    colour = 3.0 * vec3f(f32(c == 0u), f32(c == 1u), f32(c == 2u));
    absorb = params.absorb[c];
  }
  colour *= params.light_rgb;
  let n = body_index(params.glass, nm);
  let surface = BodySurface(i32(params.bounces), params.film, params.film_ior, 0.0, vec3f(0.0, 1.0, 0.0), params.film_drain);

  let hit = body_interval(o, light);
  if (hit.x > hit.y || hit.x < 0.0) {
    return;
  }
  let normal_in = body_plane(u32(hit.z)).xyz;
  let entry = o + light * hit.x;
  var weight = 1.0 - body_reflectance(-dot(light, normal_in), 1.0, n, nm, entry, surface);
  var dir = refract(light, normal_in, 1.0 / n);
  var p = entry + dir * 1e-4;
  for (var bounce = 0u; bounce <= params.bounces; bounce++) {
    let inner = body_interval(p, dir);
    let t = max(inner.y, 0.0);
    weight *= exp(-absorb * t);
    p += dir * t;
    let face = u32(inner.w);
    let normal = body_plane(face).xyz;
    if (bounce >= params.min_bounce) {
      deposit(face, p, colour * weight);
    }
    weight *= body_reflectance(dot(dir, normal), n, 1.0, nm, p, surface);
    if (weight < 1e-4) {
      break;
    }
    dir = reflect(dir, -normal);
    p += dir * 1e-4;
  }
}

@compute @workgroup_size(64) fn resolve(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= params.faces * params.tile * params.tile) {
    return;
  }
  let counts = vec3f(
    f32(atomicLoad(&accum[i * 3u])),
    f32(atomicLoad(&accum[i * 3u + 1u])),
    f32(atomicLoad(&accum[i * 3u + 2u])),
  );
  let irradiance = counts / CAUSTIC_FIXED * params.flux;
  smoothed[i] = vec4f(mix(smoothed[i].rgb, irradiance, params.blend), 1.0);
}
