// A glass body traced per pixel (stories 9.4 to 9.6): glass.wgsl's split-at-every-surface tracer,
// widened for the effect. Include after spectral.wgsl, glass.wgsl and thinfilm.wgsl, and define:
//
//   fn body_backdrop(dir: vec3f) -> vec3f              the scene behind, linear RGB
//   fn body_caustic(face: u32, p: vec3f) -> vec3f      light scattered off face `face` at p (RGB);
//                                                      return 0 for none
//   fn body_plane(i: u32) -> vec4f                     the solid's planes, as in GlassSolid
//   fn body_plane_count() -> u32
//
// The solid is read through `body_plane` rather than passed as a GlassSolid: a 336-byte struct
// passed by value is copied to private memory at every call and indexed there, and on Apple GPUs
// that alone made the trace several times slower. Read straight from a uniform, it is not.
//
// Over `glass_trace` it adds a bounce count set at run time, a thin film on the faces (9.6), light
// the glass gives off along the way (its glow), the caustic light lying on the faces (9.5), and an
// environment of any colour: `body_trace` looks at the RGB backdrop through `weights`, a vec3 that
// dots with RGB to give the radiance at the wavelength being traced. Three channels at three
// indices pass the unit vectors; a spectral trace passes `body_weights(nm)`, the spectral uplift.
//
// The uplift: a colour `rgb` becomes the spectrum dot(body_weights(nm), rgb), three soft boxes
// (`body_basis`) mixed by `BODY_UPLIFT`, chosen so that summing that spectrum through
// `spectral_rgb / SPECTRAL_WHITE` gives `rgb` back (src/gpu/glass/solid.ts computes it; a test
// keeps the two equal). White uplifts to a flat 1. Saturated colours dip below 0 at the far end of
// the spectrum and are clamped there, so only they come back a little off.

const BODY_UPLIFT: mat3x3f = mat3x3f(
  vec3f(1.681578, -0.617605, -0.063973),
  vec3f(-0.794062, 2.165186, -0.371124),
  vec3f(0.079058, -1.654389, 2.575331),
);

/// Three soft-edged boxes, red, green and blue, summing to 1 at every wavelength.
fn body_basis(nm: f32) -> vec3f {
  let r = smoothstep(565.0, 595.0, nm);
  let b = 1.0 - smoothstep(475.0, 505.0, nm);
  return vec3f(r, 1.0 - r - b, b);
}

/// What an RGB colour's uplifted spectrum is at `nm`: dot(body_weights(nm), rgb).
fn body_weights(nm: f32) -> vec3f {
  return BODY_UPLIFT * body_basis(nm);
}

/// Index of the body at `nm`: glass_index's 0 crown, 1 flint, 2 diamond, or 3, air (a bubble).
fn body_index(glass: u32, nm: f32) -> f32 {
  if (glass == 3u) {
    return 1.0;
  }
  return glass_index(glass, nm);
}

/// glass.wgsl's hook, for anything that calls `glass_trace` directly.
// glass.wgsl's plane hooks, from the body's own.
fn glass_plane(i: u32) -> vec4f {
  return body_plane(i);
}

fn glass_plane_count() -> u32 {
  return body_plane_count();
}

fn glass_environment(dir: vec3f, nm: f32) -> f32 {
  return max(dot(body_weights(nm), body_backdrop(dir)), 0.0);
}

/// One wavelength's view of the material.
struct BodyRay {
  /// Dots with an RGB colour to give this wavelength's share of it.
  weights: vec3f,
  /// Wavelength, nm (for the film).
  nm: f32,
  /// Index of the body; 1 is a hollow film (a bubble).
  n: f32,
  /// Absorption per circumradius of path (Beer-Lambert).
  absorb: f32,
  /// Light given off per circumradius of path.
  emit: f32,
}

struct BodySurface {
  /// Reflections inside before what is left is dropped.
  bounces: i32,
  /// Film thickness in nm; 0 for bare glass.
  film: f32,
  film_ior: f32,
  /// 1 to add the caustic light on the faces.
  caustics: f32,
  /// The solid's own up, in the frame being traced, and how much the film thins towards the top
  /// of the solid (a soap film drains): thickness film * (1 - drain * height), height -1 to 1.
  film_up: vec3f,
  film_drain: f32,
}

/// Reflectance of a face from index n1 into n2 at p, bare or under the film.
fn body_reflectance(cos_i: f32, n1: f32, n2: f32, nm: f32, p: vec3f, surface: BodySurface) -> f32 {
  if (surface.film > 0.0) {
    let thickness = surface.film * max(0.05, 1.0 - surface.film_drain * dot(p, surface.film_up));
    return thin_film_reflectance(cos_i, n1, surface.film_ior, n2, thickness, nm);
  }
  return glass_fresnel(cos_i, n1, n2);
}

fn body_seen(weights: vec3f, rgb: vec3f) -> f32 {
  return max(dot(weights, rgb), 0.0);
}

/// `glass_interval` over `body_plane`: (t_enter, t_exit, enter plane, exit plane).
fn body_interval(o: vec3f, d: vec3f) -> vec4f {
  var t0 = -1e9;
  var t1 = 1e9;
  var i0 = 0u;
  var i1 = 0u;
  let count = body_plane_count();
  for (var i = 0u; i < count; i++) {
    let p = body_plane(i);
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

/// Radiance at one wavelength along o + t d. Misses see the backdrop.
fn body_trace(o: vec3f, d: vec3f, ray: BodyRay, surface: BodySurface) -> f32 {
  let hit = body_interval(o, d);
  if (hit.x > hit.y || hit.y < 0.0 || hit.x < 0.0) {
    return body_seen(ray.weights, body_backdrop(d));
  }
  let face_in = u32(hit.z);
  let normal_in = body_plane(face_in).xyz;
  var p = o + d * hit.x;
  let r0 = body_reflectance(-dot(d, normal_in), 1.0, ray.n, ray.nm, p, surface);
  var light = r0 * body_seen(ray.weights, body_backdrop(reflect(d, normal_in)));
  if (surface.caustics > 0.0) {
    light += body_seen(ray.weights, body_caustic(face_in, p));
  }
  var weight = 1.0 - r0;
  var dir = refract(d, normal_in, 1.0 / ray.n);
  p += dir * 1e-4;
  for (var bounce = 0; bounce <= surface.bounces; bounce++) {
    let inner = body_interval(p, dir);
    let t = max(inner.y, 0.0);
    // Glow along the way, absorbed on its way out like everything else.
    let keep = exp(-ray.absorb * t);
    light += weight * ray.emit * select(t, (1.0 - keep) / ray.absorb, ray.absorb > 1e-4);
    weight *= keep;
    p += dir * t;
    let face = u32(inner.w);
    let normal = body_plane(face).xyz;
    if (surface.caustics > 0.0) {
      light += weight * body_seen(ray.weights, body_caustic(face, p));
    }
    let r = body_reflectance(dot(dir, normal), ray.n, 1.0, ray.nm, p, surface);
    if (r < 1.0) {
      light += weight * (1.0 - r) * body_seen(ray.weights, body_backdrop(refract(dir, -normal, ray.n)));
    }
    weight *= r;
    if (weight < 1e-4) {
      break;
    }
    dir = reflect(dir, -normal);
    p += dir * 1e-4;
  }
  return light;
}
