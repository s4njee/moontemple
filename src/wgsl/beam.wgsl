// beam.wgsl -- a shaded lamp's cone of light in fog (story 5.5), the WGSL twin of
// src/gpu/optics/beam.ts, where the derivation is. 2.8's closed-form glow (scatter.wgsl) with the
// limits moved: a ray meets the cone in one interval, its ends go to the angle ξ at the lamp, and the
// same Gauss–Legendre rule, here 8 points, sums the single scattering between them.
//
//   beam_edges(half, soft) -> vec2f
//       Cosines of the cone's inner (full light) and outer (no light) edge, for a half-angle `half`
//       to the middle of an edge `soft` radians wide.
//   beam_profile(cos_axis, edges) -> f32
//       The beam's relative intensity along a direction at that cosine from the axis, 0..1.
//   cone_interval(o, d, apex, axis, cos_half, t_max) -> vec2f
//       Where the ray o + t d is inside the cone (the nappe the axis points into), clipped to
//       [0, t_max]. A miss comes back with x >= y.
//   scatter_between(o, d, apex, beta, g, t0, t1) -> f32
//       In-scattered radiance from t0 to t1 along the ray (unit d) from a light of intensity 1 at
//       `apex`, in fog of extinction `beta` with Henyey–Greenstein asymmetry `g`. From 0 to infinity
//       it is airlight_forward(gamma, beta D, g) / D: the bare light's halo, here stopped where the
//       ray meets the ground.
//   beam_airlight(o, d, apex, axis, edges, beta, g, t_max) -> f32
//       The cone's in-scattered radiance per unit of the lamp's intensity on its axis.
//       THE INCLUDER DEFINES `fn beam_density(p: vec3f) -> f32`: the fog's density at p relative to
//       its mean (1 for uniform fog). It scales the scattering at each node; extinction stays uniform.

#include "scatter.wgsl"

fn beam_edges(half: f32, soft: f32) -> vec2f {
  let inner = max(half - 0.5 * soft, 0.0);
  let outer = min(half + 0.5 * soft, 0.5 * _SCATTER_PI - 1e-3);
  return vec2f(cos(inner), cos(outer));
}

fn beam_profile(cos_axis: f32, edges: vec2f) -> f32 {
  return smoothstep(edges.y, edges.x, cos_axis);
}

fn cone_interval(o: vec3f, d: vec3f, apex: vec3f, axis: vec3f, cos_half: f32, t_max: f32) -> vec2f {
  let miss = vec2f(1.0, 0.0);
  let w = o - apex;
  let da = dot(d, axis);
  let wa = dot(w, axis);
  let k2 = cos_half * cos_half;
  let a = da * da - k2 * dot(d, d);
  let b = da * wa - k2 * dot(d, w);
  let c = wa * wa - k2 * dot(w, w);
  let disc = b * b - a * c;
  if (disc < 0.0 || abs(a) < 1e-9) {
    return miss;
  }
  let q = -b - select(1.0, -1.0, b < 0.0) * sqrt(disc);
  var t0 = min(q / a, c / q);
  var t1 = max(q / a, c / q);
  if (a > 0.0) {
    // Steeper than the cone: inside before t0 on one nappe, after t1 on the other.
    if (da > 0.0) {
      t0 = t1;
      t1 = 3.0e38;
    } else {
      t1 = t0;
      t0 = -3.0e38;
    }
  } else if (wa + 0.5 * (t0 + t1) * da < 0.0) {
    return miss;
  }
  return vec2f(max(t0, 0.0), min(t1, t_max));
}

/// The 8-point Gauss–Legendre sum over the angle at the lamp between t0 and t1 (beam.ts: 8 points
/// are within 3% of a march where 12 are within 0.5%, for two thirds of the work); `shaped`
/// applies the beam's profile and the fog's density at each node. In theta = 2 xi - pi / 2 the
/// integrand is (beta / h) I p(-sin theta) e^{-beta (t + r)}, t = t_f + h tan theta, r = h sec theta.
fn _beam_sum(o: vec3f, d: vec3f, apex: vec3f, axis: vec3f, edges: vec2f, beta: f32, g: f32, t0: f32, t1: f32, shaped: bool) -> f32 {
  let x = array(0.1834346425, 0.5255324099, 0.7966664774, 0.9602898565);
  let w = array(0.3626837834, 0.3137066459, 0.2223810345, 0.1012285363);
  let v = apex - o;
  let tf = dot(d, v);
  let h = max(sqrt(max(dot(v, v) - tf * tf, 0.0)), 1e-4);
  let theta0 = atan2(t0 - tf, h);
  let theta1 = atan2(t1 - tf, h);
  let half = 0.5 * (theta1 - theta0);
  let mid = theta0 + half;
  let g2 = g * g;
  var sum = 0.0;
  for (var i = 0; i < 8; i++) {
    let theta = mid + select(-1.0, 1.0, i >= 4) * half * x[i % 4];
    let sn = sin(theta);
    let cs = max(cos(theta), 1e-6);
    let r = h / cs;
    let t = tf + r * sn;
    var light = 1.0;
    if (shaped) {
      let p = o + t * d;
      light = beam_profile(dot(p - apex, axis) / r, edges) * beam_density(p);
    }
    // Henyey–Greenstein at cos psi = -sin theta, written out to share the sine.
    let k = 1.0 + g2 + 2.0 * g * sn;
    sum += w[i % 4] * light * exp(-beta * (t + r)) / (k * sqrt(k));
  }
  return beta / h * (1.0 - g2) / (4.0 * _SCATTER_PI) * sum * half;
}

fn scatter_between(o: vec3f, d: vec3f, apex: vec3f, beta: f32, g: f32, t0: f32, t1: f32) -> f32 {
  return _beam_sum(o, d, apex, vec3f(0.0), vec2f(0.0), beta, g, t0, t1, false);
}

fn beam_airlight(o: vec3f, d: vec3f, apex: vec3f, axis: vec3f, edges: vec2f, beta: f32, g: f32, t_max: f32) -> f32 {
  let span = cone_interval(o, d, apex, axis, edges.y, t_max);
  if (span.x >= span.y) {
    return 0.0;
  }
  return _beam_sum(o, d, apex, axis, edges, beta, g, span.x, span.y, true);
}
