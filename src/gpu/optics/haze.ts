/*
 * Light in haze (story 2.8): the glow a point light makes in uniform fog, in closed form, and the
 * ray march it is checked against. The WGSL twin is src/wgsl/scatter.wgsl.
 *
 * A light of intensity I at distance d from the eye, in fog of extinction β with isotropic
 * scattering. Along a view ray at angle γ from the light, a point x along the ray is r(x) from the
 * light; it scatters β I e^{-βr} / r² / 4π towards the eye, which loses e^{-βx} on the way:
 *
 *   L(γ) = ∫₀^∞ β I e^{-β r(x)} / (4π r(x)²) e^{-β x} dx
 *
 * Putting x = d cos γ + h tan θ with h = d sin γ, then ξ = π/4 + θ/2, turns this into
 *
 *   L(γ) = β I e^{-T cos γ} / (2π d sin γ) · ∫_{γ/2}^{π/2} e^{-T sin γ tan ξ} dξ,   T = β d
 *
 * which is Sun, Ramamoorthi, Narasimhan and Nayar's (2005) airlight: everything but the integral is
 * closed form, and the integral is smooth, so a short Gauss–Legendre sum evaluates it. Light units:
 * I = 1 and d = 1, so `tau` (T, the optical distance to the light) is the only free parameter
 * besides the angle; scale the result by intensity / distance.
 */

/** 12-point Gauss–Legendre nodes and weights on [-1, 1] (positive half; symmetric). */
const GL_X = [0.1252334085, 0.367831499, 0.5873179543, 0.7699026742, 0.9041172564, 0.9815606342];
const GL_W = [0.2491470458, 0.2334925365, 0.2031674267, 0.1600783285, 0.106939326, 0.0471753364];

/** ∫_{a}^{π/2} e^{-u tan ξ} dξ, by 12-point Gauss–Legendre. */
export function airlightIntegral(u: number, a: number): number {
  const half = 0.5 * (Math.PI / 2 - a);
  const mid = a + half;
  let sum = 0;
  for (let i = 0; i < GL_X.length; i++) {
    for (const sign of [-1, 1]) {
      const xi = mid + sign * half * GL_X[i]!;
      sum += GL_W[i]! * Math.exp(-u * Math.tan(xi));
    }
  }
  return sum * half;
}

/** In-scattered radiance at angle `gamma` (radians) from a light of intensity 1 at distance 1. */
export function airlight(gamma: number, tau: number): number {
  const s = Math.max(Math.sin(gamma), 1e-4);
  return (
    (tau * Math.exp(-tau * Math.cos(gamma)) * airlightIntegral(tau * s, gamma / 2)) /
    (2 * Math.PI * s)
  );
}

/** The same radiance by marching the defining integral: the reference for the closed form. */
export function airlightMarch(gamma: number, tau: number, steps = 200_000, reach = 60): number {
  const beta = tau; // d = 1
  const dx = reach / steps;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const x = (i + 0.5) * dx;
    const r2 = 1 + x * x - 2 * x * Math.cos(gamma);
    const r = Math.sqrt(r2);
    sum += (beta * Math.exp(-beta * r) * Math.exp(-beta * x)) / (4 * Math.PI * r2);
  }
  return sum * dx;
}
