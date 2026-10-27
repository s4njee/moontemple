// scatter.wgsl -- the glow of a point light in uniform fog (story 2.8), the WGSL twin of
// src/gpu/optics/haze.ts, where the derivation is.
//
//   airlight(gamma, tau) -> f32
//     In-scattered radiance along a view ray at angle `gamma` (radians) from a light of intensity
//     1 at distance 1, in fog whose optical distance to the light is `tau`, scattering
//     isotropically. Scale by intensity / distance. Sun, Ramamoorthi, Narasimhan and Nayar (2005).

const _SCATTER_PI: f32 = 3.14159265358979;

/// ∫_{a}^{π/2} e^{-u tan ξ} dξ, by 12-point Gauss–Legendre.
fn airlight_integral(u: f32, a: f32) -> f32 {
  let x = array(0.1252334085, 0.3678314990, 0.5873179543, 0.7699026742, 0.9041172564, 0.9815606342);
  let w = array(0.2491470458, 0.2334925365, 0.2031674267, 0.1600783285, 0.1069393260, 0.0471753364);
  let half = 0.5 * (0.5 * _SCATTER_PI - a);
  let mid = a + half;
  var sum = 0.0;
  for (var i = 0; i < 6; i++) {
    sum += w[i] * (exp(-u * tan(mid - half * x[i])) + exp(-u * tan(mid + half * x[i])));
  }
  return sum * half;
}

fn airlight(gamma: f32, tau: f32) -> f32 {
  let s = max(sin(gamma), 1e-4);
  return tau * exp(-tau * cos(gamma)) * airlight_integral(tau * s, 0.5 * gamma) / (2.0 * _SCATTER_PI * s);
}
