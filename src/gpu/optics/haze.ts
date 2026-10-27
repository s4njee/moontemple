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

/**
 * Henyey–Greenstein phase: the share of light scattered through an angle with cosine `cos`, per
 * steradian; `g` > 0 scatters forwards. Isotropic at g = 0 (1 / 4 pi).
 */
export function henyeyGreenstein(cos: number, g: number): number {
  return (1 - g * g) / (4 * Math.PI * Math.pow(1 + g * g - 2 * g * cos, 1.5));
}

/**
 * The glow with forward scattering (story 2.8). In the closed form's substitution the light at the
 * point along the ray parameterised by xi turns through an angle whose cosine is cos(2 xi), so the
 * phase moves inside the same one-dimensional integral:
 *
 *   L = 2 T e^{-T cos g} / sin g * Integral_{g/2}^{pi/2} p(cos 2 xi) e^{-T sin g tan xi} d xi
 *
 * The interval can be cut into `pieces`, each with the 12-point Gauss–Legendre rule, but one is
 * enough: against a 200 000-step march it is within 0.08% for g up to 0.8, optical depths 0.3 to 3
 * and angles 0.03 to 2.4 radians, the same as the isotropic sum. Isotropic (g = 0), it is `airlight`.
 */
export function airlightForward(gamma: number, tau: number, g: number, pieces = 1): number {
  const s = Math.max(Math.sin(gamma), 1e-4);
  const u = tau * s;
  const a = gamma / 2;
  const step = (Math.PI / 2 - a) / pieces;
  let sum = 0;
  for (let p = 0; p < pieces; p++) {
    const half = step / 2;
    const mid = a + step * p + half;
    for (let i = 0; i < GL_X.length; i++) {
      for (const sign of [-1, 1]) {
        const xi = mid + sign * half * GL_X[i]!;
        sum +=
          GL_W[i]! * half * henyeyGreenstein(Math.cos(2 * xi), g) * Math.exp(-u * Math.tan(xi));
      }
    }
  }
  return ((2 * tau * Math.exp(-tau * Math.cos(gamma))) / s) * sum;
}

/** The forward-scattering glow by marching its defining integral: the reference. */
export function airlightForwardMarch(
  gamma: number,
  tau: number,
  g: number,
  steps = 400_000,
  reach = 60,
): number {
  const beta = tau;
  const dx = reach / steps;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const x = (i + 0.5) * dx;
    // The point x along the view ray (0, 0, 1); the light at distance 1 at angle gamma.
    const lx = Math.sin(gamma);
    const lz = Math.cos(gamma);
    const ux = 0 - lx;
    const uz = x - lz;
    const r = Math.hypot(ux, uz);
    // Light leaves the light along u and turns towards the eye, along -z.
    const cos = -uz / r;
    sum += (beta * Math.exp(-beta * r) * Math.exp(-beta * x) * henyeyGreenstein(cos, g)) / (r * r);
  }
  return sum * dx;
}
