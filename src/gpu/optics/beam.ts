/*
 * A shaded lamp's beam in fog (story 5.5): the light a cone of light scatters towards the eye, the
 * visible cone under a street lamp. The WGSL twin is src/wgsl/beam.wgsl; the glow of a bare point
 * light, which this generalises, is 2.8's src/gpu/optics/haze.ts.
 *
 * A lamp at A shines intensity I(u) along each direction u, and I is zero outside a cone round the
 * axis. Along a view ray o + t d through fog of extinction β with phase p, single scattering gives
 *
 *   L = ∫ β I(u) p(cos ψ) e^{-β r} e^{-β t} / r² dt,   r = |o + t d − A|, u = (o + t d − A) / r
 *
 * over the part of the ray inside the cone and in front of whatever the ray hits. 2.8's substitution
 * applies unchanged. With D the distance to the lamp, γ the ray's angle from it, h = D sin γ the
 * closest approach and t_f = D cos γ where it happens, put t = t_f + h tan θ (θ is the angle at the
 * lamp, from the closest approach) and ξ = π/4 + θ/2. Then r = h sec θ, t + r = t_f + h tan ξ, the
 * light turns through cos ψ = −sin θ = cos 2ξ, and
 *
 *   L = (2β / h) ∫_{ξ₀}^{ξ₁} I(u) p(cos 2ξ) e^{−β (t + r)} dξ
 *
 * The bare light (2.8) is the case ξ₀ = γ/2, ξ₁ = π/2 with I = 1. A cone only moves the limits:
 * a ray meets a cone of half-angle under 90° in one interval (the inside of one nappe is convex),
 * which is a quadratic, and its ends go through atan to ξ₀ and ξ₁. A hard-edged cone of even light
 * is then the same smooth one-dimensional integral as the bare light, between other limits, and the
 * same Gauss–Legendre rule evaluates it (8 points in the shader; see GAUSS_LEGENDRE).
 *
 * A real shade has a soft edge, so I(u) falls to zero over `soft` radians of angle from the axis.
 * The profile is evaluated at each node. It stays smooth in ξ: θ is the angle at the lamp, so the
 * direction u turns by exactly dθ = 2 dξ, and the angle to the axis by no more; an edge `soft` wide
 * covers at least soft / 2 of ξ, and the whole chord through a cone of half-angle c at most c. With
 * the edge a quarter of the angle the quadrature still sees it with several nodes.
 *
 * Drifting density multiplies the scattering at each node by ρ(x) / ρ₀ (`density`). The extinction
 * is left uniform: with ±50% density the attenuation is still dominated by its mean over tens of
 * metres, and keeping it uniform keeps t + r closed form. The march below makes the same
 * assumption, so the tests check the quadrature, not the approximation.
 */

import { henyeyGreenstein } from './haze.ts';

export type Vec3 = readonly [number, number, number];

/** A cone of light: the apex, the unit axis it shines along, and the edge as cosines of angles. */
export interface Beam {
  apex: Vec3;
  axis: Vec3;
  /** Half-angle of the cone to the middle of its edge, radians (below π/2). */
  half: number;
  /** Width of the soft edge, radians: the light goes from full to none over this angle. */
  soft: number;
}

/**
 * Gauss–Legendre nodes and weights on [-1, 1] (positive half; symmetric). 12 points are haze.ts's
 * rule; the shader uses 8, a third less work: against a march (tests/lamp-in-fog.test.ts) 12 points
 * stay within 0.5% and 8 within 3%, the worst at the widest cone, a smooth error with no pattern.
 */
const GAUSS_LEGENDRE: Record<BeamNodes, readonly [readonly number[], readonly number[]]> = {
  8: [
    [0.1834346425, 0.5255324099, 0.7966664774, 0.9602898565],
    [0.3626837834, 0.3137066459, 0.2223810345, 0.1012285363],
  ],
  12: [
    [0.1252334085, 0.367831499, 0.5873179543, 0.7699026742, 0.9041172564, 0.9815606342],
    [0.2491470458, 0.2334925365, 0.2031674267, 0.1600783285, 0.106939326, 0.0471753364],
  ],
};

/** How many Gauss–Legendre points the sum takes: 8 is what beam.wgsl uses. */
export type BeamNodes = 8 | 12;

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const along = (o: Vec3, d: Vec3, t: number): Vec3 => [
  o[0] + t * d[0],
  o[1] + t * d[1],
  o[2] + t * d[2],
];

function smoothstep(lo: number, hi: number, x: number): number {
  const s = Math.min(Math.max((x - lo) / (hi - lo), 0), 1);
  return s * s * (3 - 2 * s);
}

/** Cosines of the inner (full light) and outer (no light) edge of the cone. */
export function beamEdges(beam: Pick<Beam, 'half' | 'soft'>): [inner: number, outer: number] {
  const inner = Math.max(beam.half - beam.soft / 2, 0);
  const outer = Math.min(beam.half + beam.soft / 2, Math.PI / 2 - 1e-3);
  return [Math.cos(inner), Math.cos(outer)];
}

/** The beam's relative intensity along a direction whose cosine to the axis is `cos`, 0..1. */
export function beamProfile(cos: number, inner: number, outer: number): number {
  return smoothstep(outer, inner, cos);
}

/**
 * Where a ray o + t d is inside the cone of apex `apex`, unit `axis` and cosine of half-angle
 * `cosHalf` (the nappe the axis points into), clipped to [0, tMax]; undefined if nowhere.
 * Solves ((w + t d)·a)² = k² |w + t d|² with w = o − apex.
 */
export function coneInterval(
  o: Vec3,
  d: Vec3,
  apex: Vec3,
  axis: Vec3,
  cosHalf: number,
  tMax: number,
): [number, number] | undefined {
  const w = sub(o, apex);
  const da = dot(d, axis);
  const wa = dot(w, axis);
  const k2 = cosHalf * cosHalf;
  const a = da * da - k2 * dot(d, d);
  const b = da * wa - k2 * dot(d, w);
  const c = wa * wa - k2 * dot(w, w);
  const disc = b * b - a * c;
  if (disc < 0 || Math.abs(a) < 1e-9) return undefined;
  const root = Math.sqrt(disc);
  const q = -b - Math.sign(b || 1) * root;
  let t0 = Math.min(q / a, c / q);
  let t1 = Math.max(q / a, c / q);
  if (a > 0) {
    // Steeper than the cone: inside before t0 on one nappe, after t1 on the other.
    if (da > 0) {
      t0 = t1;
      t1 = Infinity;
    } else {
      t1 = t0;
      t0 = -Infinity;
    }
  } else if (wa + 0.5 * (t0 + t1) * da < 0) {
    // Between the roots, but on the nappe behind the lamp.
    return undefined;
  }
  t0 = Math.max(t0, 0);
  t1 = Math.min(t1, tMax);
  return t1 > t0 ? [t0, t1] : undefined;
}

/**
 * The single-scattering integral of a light of intensity `intensity(u)` per steradian at `apex`,
 * along the ray o + t d (unit d) from t0 to t1, in fog of extinction `beta` with Henyey–Greenstein
 * asymmetry `g`: Gauss–Legendre over ξ (8 points, as the shader, or 12), as the header derives. `density(x)` scales the
 * scattering at each point (1 is uniform fog).
 */
export function scatterBetween(
  o: Vec3,
  d: Vec3,
  apex: Vec3,
  beta: number,
  g: number,
  t0: number,
  t1: number,
  intensity: (u: Vec3) => number = () => 1,
  density: (x: Vec3) => number = () => 1,
  nodes: BeamNodes = 8,
): number {
  const [GL_X, GL_W] = GAUSS_LEGENDRE[nodes];
  const v = sub(apex, o);
  const tf = dot(d, v);
  const h = Math.max(Math.sqrt(Math.max(dot(v, v) - tf * tf, 0)), 1e-4);
  const xi0 = Math.PI / 4 + Math.atan2(t0 - tf, h) / 2;
  const xi1 = Math.PI / 4 + (Number.isFinite(t1) ? Math.atan2(t1 - tf, h) : Math.PI / 2) / 2;
  const half = 0.5 * (xi1 - xi0);
  const mid = xi0 + half;
  let sum = 0;
  for (let i = 0; i < GL_X.length; i++) {
    for (const sign of [-1, 1]) {
      const xi = mid + sign * half * GL_X[i]!;
      const theta = 2 * xi - Math.PI / 2;
      const t = tf + h * Math.tan(theta);
      const r = h / Math.cos(theta);
      const x = along(o, d, t);
      const u = sub(x, apex);
      const light = intensity([u[0] / r, u[1] / r, u[2] / r]);
      sum +=
        GL_W[i]! *
        light *
        density(x) *
        henyeyGreenstein(Math.cos(2 * xi), g) *
        Math.exp(-beta * (t + r));
    }
  }
  return ((2 * beta) / h) * sum * half;
}

/**
 * The beam's in-scattered radiance along a view ray, per unit of the lamp's intensity on its axis:
 * the cone's interval on the ray (to `tMax`, where the ray meets the ground or anything else), its
 * soft-edged profile, and `scatterBetween` over it.
 */
export function beamAirlight(
  o: Vec3,
  d: Vec3,
  beam: Beam,
  beta: number,
  g: number,
  tMax: number,
  density?: (x: Vec3) => number,
  nodes: BeamNodes = 8,
): number {
  const [inner, outer] = beamEdges(beam);
  const span = coneInterval(o, d, beam.apex, beam.axis, outer, tMax);
  if (!span) return 0;
  return scatterBetween(
    o,
    d,
    beam.apex,
    beta,
    g,
    span[0],
    span[1],
    (u) => beamProfile(dot(u, beam.axis), inner, outer),
    density,
    nodes,
  );
}

/** The same radiance by marching the defining integral along the ray: the reference. */
export function beamAirlightMarch(
  o: Vec3,
  d: Vec3,
  beam: Beam,
  beta: number,
  g: number,
  tMax: number,
  density: (x: Vec3) => number = () => 1,
  steps = 200_000,
): number {
  const [inner, outer] = beamEdges(beam);
  const reach = Math.min(tMax, 400);
  const dt = reach / steps;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) * dt;
    const x = along(o, d, t);
    const u = sub(x, beam.apex);
    const r = Math.hypot(u[0], u[1], u[2]);
    const cosAxis = dot(u, beam.axis) / r;
    if (cosAxis <= outer) continue;
    // Light leaves along u and turns towards the eye, along -d.
    const cos = -dot(u, d) / r;
    sum +=
      (beta *
        beamProfile(cosAxis, inner, outer) *
        density(x) *
        henyeyGreenstein(cos, g) *
        Math.exp(-beta * (t + r))) /
      (r * r);
  }
  return sum * dt;
}
