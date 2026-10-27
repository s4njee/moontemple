/*
 * Dispersive refraction through a convex solid (story 9.2): Snell's law, unpolarised Fresnel, total
 * internal reflection, and a tracer for convex polytopes given as planes. The CPU twin of
 * src/wgsl/glass.wgsl, and the solids every glass effect uses.
 */

export type Vec3 = [number, number, number];
/** A half-space n.x <= d: (nx, ny, nz, d), n outward and unit. */
export type Plane = [number, number, number, number];

const dot = (a: readonly number[], b: readonly number[]) =>
  a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const scale = (a: readonly number[], s: number): Vec3 => [a[0]! * s, a[1]! * s, a[2]! * s];
const add = (a: readonly number[], b: readonly number[]): Vec3 => [
  a[0]! + b[0]!,
  a[1]! + b[1]!,
  a[2]! + b[2]!,
];
const normalize = (a: readonly number[]): Vec3 => scale(a, 1 / Math.hypot(a[0]!, a[1]!, a[2]!));

export function reflect(d: Vec3, n: Vec3): Vec3 {
  return add(d, scale(n, -2 * dot(d, n)));
}

/** WGSL's refract: `n` faces against `d`; undefined (zero) past the critical angle. */
export function refract(d: Vec3, n: Vec3, eta: number): Vec3 {
  const cos = dot(d, n);
  const k = 1 - eta * eta * (1 - cos * cos);
  if (k < 0) return [0, 0, 0];
  return add(scale(d, eta), scale(n, -(eta * cos + Math.sqrt(k))));
}

/** Unpolarised Fresnel reflectance, incidence cosine `cosI` from n1 into n2; 1 past critical. */
export function fresnel(cosI: number, n1: number, n2: number): number {
  const eta = n1 / n2;
  const sinT2 = eta * eta * Math.max(0, 1 - cosI * cosI);
  if (sinT2 >= 1) return 1;
  const cosT = Math.sqrt(1 - sinT2);
  const rs = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT);
  const rp = (n1 * cosT - n2 * cosI) / (n1 * cosT + n2 * cosI);
  return 0.5 * (rs * rs + rp * rp);
}

/** (t_enter, t_exit, enter plane, exit plane); no hit when t_enter > t_exit. */
export function interval(
  planes: readonly Plane[],
  o: Vec3,
  d: Vec3,
): [number, number, number, number] {
  let t0 = -1e9;
  let t1 = 1e9;
  let i0 = 0;
  let i1 = 0;
  planes.forEach((p, i) => {
    const denom = dot(p, d);
    const dist = p[3] - dot(p, o);
    if (Math.abs(denom) < 1e-12) {
      if (dist < 0) t0 = 2e9;
      return;
    }
    const t = dist / denom;
    if (denom < 0) {
      if (t > t0) [t0, i0] = [t, i];
    } else if (t < t1) [t1, i1] = [t, i];
  });
  return [t0, t1, i0, i1];
}

export interface TracedRay {
  /** Where the light leaves, and in which direction. */
  from: Vec3;
  dir: Vec3;
  /** The share of the incoming light it carries. */
  weight: number;
  /** Reflections inside before it left; -1 for the reflection off the front face. */
  bounces: number;
}

/**
 * Every ray that leaves the solid when one ray of index `n` enters it, splitting at each surface,
 * up to `maxBounces` reflections inside (the WGSL tracer sums the environment over exactly these).
 * Empty if the ray misses.
 */
export function traceRays(
  planes: readonly Plane[],
  o: Vec3,
  d: Vec3,
  n: number,
  maxBounces = 6,
  absorb = 0,
): TracedRay[] {
  const [t0, t1, i0] = interval(planes, o, d);
  if (t0 > t1 || t1 < 0 || t0 < 0) return [];
  const normalIn = planes[i0]!.slice(0, 3) as Vec3;
  const r0 = fresnel(-dot(d, normalIn), 1, n);
  let p = add(o, scale(d, t0));
  const rays: TracedRay[] = [{ from: p, dir: reflect(d, normalIn), weight: r0, bounces: -1 }];
  let weight = 1 - r0;
  let dir = refract(d, normalIn, 1 / n);
  p = add(p, scale(dir, 1e-6));
  for (let bounce = 0; bounce <= maxBounces; bounce++) {
    const inner = interval(planes, p, dir);
    const t = Math.max(inner[1], 0);
    weight *= Math.exp(-absorb * t);
    p = add(p, scale(dir, t));
    const normal = planes[inner[3]]!.slice(0, 3) as Vec3;
    const r = fresnel(dot(dir, normal), n, 1);
    if (r < 1) {
      rays.push({
        from: p,
        dir: refract(dir, scale(normal, -1), n),
        weight: weight * (1 - r),
        bounces: bounce,
      });
    }
    weight *= r;
    dir = reflect(dir, scale(normal, -1));
    p = add(p, scale(dir, 1e-6));
  }
  return rays;
}

const PHI = (1 + Math.sqrt(5)) / 2;

/** Face normals of the Platonic solids, and their inradius for a circumradius of 1. */
const PLATONIC: Record<string, { normals: Vec3[]; inradius: number }> = {
  tetrahedron: {
    normals: [
      [1, 1, 1],
      [1, -1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
    ],
    inradius: 1 / 3,
  },
  cube: {
    normals: [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ],
    inradius: 1 / Math.sqrt(3),
  },
  octahedron: {
    normals: [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z] as Vec3))),
    inradius: 1 / Math.sqrt(3),
  },
  // Normals of the dodecahedron's faces point at an icosahedron's vertices, and the other way round.
  dodecahedron: {
    normals: [-1, 1].flatMap((a) =>
      [-1, 1].flatMap((b) => [
        [0, a, b * PHI] as Vec3,
        [a, b * PHI, 0] as Vec3,
        [b * PHI, 0, a] as Vec3,
      ]),
    ),
    inradius: 0.794654,
  },
  icosahedron: {
    normals: [
      ...[-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z] as Vec3))),
      ...[-1, 1].flatMap((a) =>
        [-1, 1].flatMap((b) => [
          [0, a / PHI, b * PHI] as Vec3,
          [a / PHI, b * PHI, 0] as Vec3,
          [b * PHI, 0, a / PHI] as Vec3,
        ]),
      ),
    ],
    inradius: 0.794654,
  },
};

export type PlatonicSolid = 'tetrahedron' | 'cube' | 'octahedron' | 'dodecahedron' | 'icosahedron';

/** The faces of a Platonic solid of circumradius `radius` about the origin, as planes. */
export function platonicPlanes(solid: PlatonicSolid, radius = 1): Plane[] {
  const { normals, inradius } = PLATONIC[solid]!;
  return normals.map((n) => [...normalize(n), inradius * radius] as Plane);
}

/**
 * A triangular prism with its edges along z: a cross-section with `apexDeg` at the top (+y), sides
 * `side` long, and length `depth`, centred on the origin.
 */
export function prismPlanes(apexDeg = 60, side = 1, depth = 2): Plane[] {
  const half = (apexDeg * Math.PI) / 360;
  const height = side * Math.cos(half);
  // Apex at y = +2h/3 for an equilateral section; in general put the centroid at the origin.
  const apexY = (2 * height) / 3;
  const baseY = apexY - height;
  const left: Vec3 = [-Math.cos(half), Math.sin(half), 0];
  const right: Vec3 = [Math.cos(half), Math.sin(half), 0];
  return [
    [...left, dot(left, [0, apexY, 0])] as Plane,
    [...right, dot(right, [0, apexY, 0])] as Plane,
    [0, -1, 0, -baseY],
    [0, 0, 1, depth / 2],
    [0, 0, -1, depth / 2],
  ];
}

/** A rotation applied to every plane's normal (row-major 3 x 3). */
export function rotatePlanes(planes: readonly Plane[], m: readonly number[]): Plane[] {
  return planes.map(([x, y, z, d]) => [
    m[0]! * x + m[1]! * y + m[2]! * z,
    m[3]! * x + m[4]! * y + m[5]! * z,
    m[6]! * x + m[7]! * y + m[8]! * z,
    d,
  ]);
}

/** Packs planes for the WGSL `GlassSolid` (20 vec4f, then the count). */
export function packSolid(planes: readonly Plane[]): Float32Array {
  if (planes.length > 20) throw new Error('glass: at most 20 planes');
  const data = new Float32Array(20 * 4 + 4);
  planes.forEach((p, i) => data.set(p, i * 4));
  new Uint32Array(data.buffer)[80] = planes.length;
  return data;
}
