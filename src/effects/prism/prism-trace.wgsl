// The prism's glass, traced: glass.wgsl's `glass_interval` and `glass_trace` (story 9.2) line for
// line, but reading the solid's planes through `prism_plane(i)` and `prism_plane_count()`, which
// the includer defines (prism.wgsl reads them straight from its uniform buffer), instead of from a
// `GlassSolid` passed by value. Include glass.wgsl first, and define `glass_environment`.
//
// Why a copy: `GlassSolid` is 20 planes, and every call that takes it by value copies them into
// private memory, which the inner loop then indexes dynamically. On an M1 Max at 1080p, three
// `glass_trace` calls over the prism's pixels cost about 3.3 ms; these cost a few tenths of a
// millisecond (tests/prism.test.ts checks the two give the same light).

// glass.wgsl now reads planes through hooks too: give it the prism's.
fn glass_plane(i: u32) -> vec4f {
  return prism_plane(i);
}

fn glass_plane_count() -> u32 {
  return prism_plane_count();
}

fn prism_interval(o: vec3f, d: vec3f) -> vec4f {
  var t0 = -1e9;
  var t1 = 1e9;
  var i0 = 0u;
  var i1 = 0u;
  for (var i = 0u; i < prism_plane_count(); i++) {
    let p = prism_plane(i);
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

/// Radiance at one wavelength along o + t d through the prism of index `n` (no absorption).
fn prism_trace(o: vec3f, d: vec3f, nm: f32, n: f32) -> f32 {
  let hit = prism_interval(o, d);
  if (hit.x > hit.y || hit.y < 0.0 || hit.x < 0.0) {
    return glass_environment(d, nm);
  }
  let normal_in = prism_plane(u32(hit.z)).xyz;
  let cos_i = -dot(d, normal_in);
  let r0 = glass_fresnel(cos_i, 1.0, n);
  var light = r0 * glass_environment(reflect(d, normal_in), nm);
  var weight = 1.0 - r0;
  var p = o + d * hit.x;
  var dir = refract(d, normal_in, 1.0 / n);
  p += dir * 1e-4;
  for (var bounce = 0; bounce <= GLASS_MAX_BOUNCES; bounce++) {
    let inner = prism_interval(p, dir);
    p += dir * max(inner.y, 0.0);
    let normal = prism_plane(u32(inner.w)).xyz;
    let r = glass_fresnel(dot(dir, normal), n, 1.0);
    if (r < 1.0) {
      light += weight * (1.0 - r) * glass_environment(refract(dir, -normal, n), nm);
    }
    weight *= r;
    dir = reflect(dir, -normal);
    p += dir * 1e-4;
  }
  return light;
}
