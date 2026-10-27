// Dispersive refraction through a convex solid (story 9.2). TypeScript twin: src/gpu/optics/glass.ts.
//
// The solid is a convex polytope: up to GLASS_MAX_PLANES half-spaces n.x <= d, n outward and
// unit. A ray meets it in one interval, entering at the last plane it crosses inwards and leaving
// at the first it crosses outwards. At each surface Snell's law bends it, unpolarised Fresnel
// splits it into a reflected and a transmitted part (R + T = 1), and past the critical angle all of
// it reflects (total internal reflection). Inside, Beer-Lambert absorption by wavelength tints it.
//
// `glass_trace` follows one wavelength through the solid deterministically, splitting at every
// surface: the reflection off the front, and at each inside surface the light that escapes, each
// sent to `glass_environment(dir, nm)` (the caller's backdrop), up to GLASS_MAX_BOUNCES reflections
// inside. What is left after the last bounce is dropped.
//
// The includer defines three functions:
//
//   fn glass_plane(i: u32) -> vec4f          plane i of the solid, as in GlassSolid
//   fn glass_plane_count() -> u32
//   fn glass_environment(dir: vec3f, nm: f32) -> f32
//
// The planes are read through `glass_plane` rather than passed as a GlassSolid: a 336-byte struct
// passed by value is copied into private memory on every call, and indexing the copy in the loops
// made a per-pixel trace about three times slower (prism and glass-solid both measured it). Read
// them straight from a uniform: `fn glass_plane(i: u32) -> vec4f { return solid.planes[i]; }`.

const GLASS_MAX_PLANES: u32 = 20u;
const GLASS_MAX_BOUNCES: i32 = 6;

struct GlassSolid {
  planes: array<vec4f, 20>,
  count: u32,
}

/// Unpolarised Fresnel reflectance for incidence cosine `cos_i` from index n1 into n2; 1 past the
/// critical angle.
fn glass_fresnel(cos_i: f32, n1: f32, n2: f32) -> f32 {
  let eta = n1 / n2;
  let sin_t2 = eta * eta * max(0.0, 1.0 - cos_i * cos_i);
  if (sin_t2 >= 1.0) {
    return 1.0;
  }
  let cos_t = sqrt(1.0 - sin_t2);
  let rs = (n1 * cos_i - n2 * cos_t) / (n1 * cos_i + n2 * cos_t);
  let rp = (n1 * cos_t - n2 * cos_i) / (n1 * cos_t + n2 * cos_i);
  return 0.5 * (rs * rs + rp * rp);
}

/// Where the ray o + t d meets the solid: (t_enter, t_exit, enter plane, exit plane). No hit when
/// t_enter > t_exit or t_exit < 0.
fn glass_interval(o: vec3f, d: vec3f) -> vec4f {
  var t0 = -1e9;
  var t1 = 1e9;
  var i0 = 0u;
  var i1 = 0u;
  let count = glass_plane_count();
  for (var i = 0u; i < count; i++) {
    let p = glass_plane(i);
    let denom = dot(p.xyz, d);
    let dist = p.w - dot(p.xyz, o);
    if (abs(denom) < 1e-8) {
      if (dist < 0.0) {
        return vec4f(1.0, -1.0, 0.0, 0.0);
      }
      continue;
    }
    let t = dist / denom;
    if (denom < 0.0) {
      if (t > t0) {
        t0 = t;
        i0 = i;
      }
    } else if (t < t1) {
      t1 = t;
      i1 = i;
    }
  }
  return vec4f(t0, t1, f32(i0), f32(i1));
}

/// Radiance at one wavelength along the ray o + t d through the solid of index `n`, with absorption
/// `absorb` per unit length inside. Misses return the environment along d.
fn glass_trace(o: vec3f, d: vec3f, nm: f32, n: f32, absorb: f32) -> f32 {
  let hit = glass_interval(o, d);
  if (hit.x > hit.y || hit.y < 0.0 || hit.x < 0.0) {
    return glass_environment(d, nm);
  }
  let normal_in = glass_plane(u32(hit.z)).xyz;
  let cos_i = -dot(d, normal_in);
  let r0 = glass_fresnel(cos_i, 1.0, n);
  var light = r0 * glass_environment(reflect(d, normal_in), nm);
  var weight = 1.0 - r0;
  var p = o + d * hit.x;
  var dir = refract(d, normal_in, 1.0 / n);
  p += dir * 1e-4;
  for (var bounce = 0; bounce <= GLASS_MAX_BOUNCES; bounce++) {
    let inner = glass_interval(p, dir);
    let t = max(inner.y, 0.0);
    weight *= exp(-absorb * t);
    p += dir * t;
    let normal = glass_plane(u32(inner.w)).xyz;
    let cos_o = dot(dir, normal);
    let r = glass_fresnel(cos_o, n, 1.0);
    if (r < 1.0) {
      light += weight * (1.0 - r) * glass_environment(refract(dir, -normal, n), nm);
    }
    weight *= r;
    dir = reflect(dir, -normal);
    // Step off the face so the next interval starts inside.
    p += dir * 1e-4;
  }
  return light;
}
