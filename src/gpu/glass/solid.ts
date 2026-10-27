/*
 * Geometry and colour for the traced glass body (stories 9.4 to 9.6): the solid's corners and
 * face frames, the camera, the turn, and the spectral uplift that lets an RGB backdrop be looked
 * at one wavelength at a time. GPU-free; src/gpu/glass/body.ts uploads what these compute, and
 * the tests check the shaders against them.
 *
 * Frames follow the wireframe's (src/gpu/wire/solids.ts) so the two can be laid over each other:
 * a solid of unit circumradius about the origin in its own frame, turned by a row-major 3 x 3
 * rotation into the view frame (x right, y up, z towards the camera), and a camera on the z axis
 * `distance` circumradii away looking down -z, with `size` the circumradius in device pixels at
 * the depth of the solid's centre and `center` where the centre lands (pixels, y down).
 */
import { platonicPlanes, type Plane, type PlatonicSolid, type Vec3 } from '../optics/glass.ts';
import { spectralRgb, spectralWhite, SPECTRUM_MAX, SPECTRUM_MIN } from '../optics/spectral.ts';

/** Row-major 3 x 3: `m[row * 3 + column]`, acting on column vectors. */
export type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface GlassView {
  /** Where the solid's centre lands, device pixels (y down). */
  center: readonly [number, number];
  /** The circumradius in device pixels at the depth of the solid's centre. */
  size: number;
  /** Camera distance from the centre in circumradii, above 1; `Infinity` is orthographic. */
  distance: number;
}

const dot = (a: readonly number[], b: readonly number[]) =>
  a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: readonly number[], b: readonly number[]): Vec3 => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
];
const scale = (a: readonly number[], s: number): Vec3 => [a[0]! * s, a[1]! * s, a[2]! * s];
const add = (a: readonly number[], b: readonly number[]): Vec3 => [
  a[0]! + b[0]!,
  a[1]! + b[1]!,
  a[2]! + b[2]!,
];
const sub = (a: readonly number[], b: readonly number[]): Vec3 => [
  a[0]! - b[0]!,
  a[1]! - b[1]!,
  a[2]! - b[2]!,
];
export const normalize = (a: readonly number[]): Vec3 =>
  scale(a, 1 / Math.hypot(a[0]!, a[1]!, a[2]!));

// ---- Rotations ----------------------------------------------------------------------------------

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function applyMat3(m: Mat3, v: readonly number[]): Vec3 {
  return [
    m[0] * v[0]! + m[1] * v[1]! + m[2] * v[2]!,
    m[3] * v[0]! + m[4] * v[1]! + m[5] * v[2]!,
    m[6] * v[0]! + m[7] * v[1]! + m[8] * v[2]!,
  ];
}

export function transposeMat3(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

export function multiplyMat3(a: Mat3, b: Mat3): Mat3 {
  const out: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out.push(a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!);
    }
  }
  return out as unknown as Mat3;
}

/** Rodrigues: `angle` radians about the unit `axis`, right-handed. */
export function rotationAxisAngle(axis: readonly number[], angle: number): Mat3 {
  const [x, y, z] = normalize(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return [
    t * x * x + c,
    t * x * y - s * z,
    t * x * z + s * y,
    t * x * y + s * z,
    t * y * y + c,
    t * y * z - s * x,
    t * x * z - s * y,
    t * y * z + s * x,
    t * z * z + c,
  ];
}

/**
 * A turntable, the same as the wireframe's: `angle` of spin about the body's vertical, the axis
 * then leaned `tilt` towards the camera, after a resting orientation `body`.
 */
export function turn(angle: number, tilt = 0.35, body: Mat3 = IDENTITY): Mat3 {
  return multiplyMat3(
    rotationAxisAngle([1, 0, 0], tilt),
    multiplyMat3(rotationAxisAngle([0, 1, 0], angle), body),
  );
}

/** WGSL's mat3x3f is column-major: the 9 numbers `UniformBuffer.set` wants for a row-major Mat3. */
export const mat3Columns = (m: Mat3): number[] => [...transposeMat3(m)];

// ---- The solid -------------------------------------------------------------------------------

/** A Platonic solid of unit circumradius, or planes already given, as planes. */
export function solidPlanes(solid: PlatonicSolid | readonly Plane[]): Plane[] {
  return typeof solid === 'string' ? platonicPlanes(solid, 1) : solid.map((p) => [...p] as Plane);
}

/** The corners of a convex polytope: every point where three of its planes meet inside the rest. */
export function solidVertices(planes: readonly Plane[]): Vec3[] {
  const out: Vec3[] = [];
  const n = planes.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const [a, b, c] = [planes[i]!, planes[j]!, planes[k]!];
        const bc = cross(b, c);
        const det = dot(a, bc);
        if (Math.abs(det) < 1e-9) continue;
        const p = scale(
          add(add(scale(bc, a[3]), scale(cross(c, a), b[3])), scale(cross(a, b), c[3])),
          1 / det,
        );
        if (!planes.every((q) => dot(q, p) <= q[3] + 1e-6)) continue;
        if (out.some((v) => Math.hypot(...sub(v, p)) < 1e-5)) continue;
        out.push(p);
      }
    }
  }
  return out;
}

/** The indices of the faces each vertex lies on. */
export function vertexFaces(planes: readonly Plane[], vertices: readonly Vec3[]): number[][] {
  return vertices.map((v) =>
    planes.flatMap((p, f) => (Math.abs(dot(p, v) - p[3]) < 1e-5 ? [f] : [])),
  );
}

/**
 * A 2-D frame on each face for the caustic atlas: the face's centre, two unit axes in its plane,
 * and the radius of its corners about the centre. A face's tile spans [-radius, radius] on both
 * axes, so the whole face lies inside it.
 */
export interface FaceFrame {
  centre: Vec3;
  tangent: Vec3;
  bitangent: Vec3;
  radius: number;
}

export function faceFrames(planes: readonly Plane[], vertices: readonly Vec3[]): FaceFrame[] {
  return planes.map((p) => {
    const corners = vertices.filter((v) => Math.abs(dot(p, v) - p[3]) < 1e-5);
    const centre = scale(
      corners.reduce<Vec3>((s, v) => add(s, v), [0, 0, 0]),
      1 / corners.length,
    );
    const radius = Math.max(...corners.map((v) => Math.hypot(...sub(v, centre))));
    const tangent = normalize(sub(corners[0]!, centre));
    const bitangent = cross(p, tangent);
    return { centre, tangent, bitangent, radius };
  });
}

/** Three vec4f a face (centre and radius, tangent, bitangent) for the shaders' `faces` buffer. */
export function packFaceFrames(frames: readonly FaceFrame[]): Float32Array {
  const data = new Float32Array(Math.max(frames.length, 1) * 12);
  frames.forEach((f, i) => {
    data.set([...f.centre, f.radius, ...f.tangent, 0, ...f.bitangent, 0], i * 12);
  });
  return data;
}

// ---- The camera ------------------------------------------------------------------------------

/** The view ray through device pixel (`px`, `py`): origin and unit direction in the view frame. */
export function viewRay(view: GlassView, px: number, py: number): { o: Vec3; d: Vec3 } {
  const qx = (px - view.center[0]) / view.size;
  const qy = (view.center[1] - py) / view.size;
  if (!Number.isFinite(view.distance)) return { o: [qx, qy, 10], d: [0, 0, -1] };
  return { o: [0, 0, view.distance], d: normalize([qx, qy, -view.distance]) };
}

/** Device pixels of a point in the view frame (the twin of `viewRay`). */
export function projectView(view: GlassView, p: readonly number[]): [number, number] {
  if (!Number.isFinite(view.distance)) {
    return [view.center[0] + view.size * p[0]!, view.center[1] - view.size * p[1]!];
  }
  const s = (view.size * view.distance) / Math.max(view.distance - p[2]!, 1e-3);
  return [view.center[0] + s * p[0]!, view.center[1] - s * p[1]!];
}

// ---- Spectral uplift -------------------------------------------------------------------------

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Three soft-edged boxes over the visible range (blue below about 490 nm, green to about 580,
 * red above) that sum to 1 at every wavelength. Twin of `body_basis` in src/wgsl/glass-body.wgsl.
 */
export function upliftBasis(nm: number): Vec3 {
  const r = smoothstep(565, 595, nm);
  const b = 1 - smoothstep(475, 505, nm);
  return [r, 1 - r - b, b];
}

function invert3(m: readonly number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m as [number, ...number[]] as number[];
  const A = e! * i! - f! * h!;
  const B = -(d! * i! - f! * g!);
  const C = d! * h! - e! * g!;
  const det = a! * A + b! * B + c! * C;
  return [
    A / det,
    -(b! * i! - c! * h!) / det,
    (b! * f! - c! * e!) / det,
    B / det,
    (a! * i! - c! * g!) / det,
    -(a! * f! - c! * d!) / det,
    C / det,
    -(a! * h! - b! * g!) / det,
    (a! * e! - b! * d!) / det,
  ];
}

/**
 * The matrix that makes the uplift exact: a colour `rgb` becomes the spectrum
 * `upliftBasis(nm) . (Minv rgb)`, and `M` is what `spectral_rgb / SPECTRAL_WHITE` makes of each
 * basis box, so integrating that spectrum gives `rgb` back. Returned row-major as Minv; the
 * shader's `BODY_UPLIFT` is its transpose (the weights `Minv^T basis(nm)` that dot with `rgb`).
 * Flat white maps to a flat spectrum of 1, because the boxes sum to 1 and so does every row of M
 * once divided by the white point.
 */
export function upliftInverse(steps = 6000): number[] {
  const white = spectralWhite(steps);
  const m = new Array<number>(9).fill(0);
  for (let s = 0; s < steps; s++) {
    const nm = SPECTRUM_MIN + ((s + 0.5) * (SPECTRUM_MAX - SPECTRUM_MIN)) / steps;
    const rgb = spectralRgb(nm);
    const basis = upliftBasis(nm);
    for (let c = 0; c < 3; c++) {
      for (let k = 0; k < 3; k++) m[c * 3 + k]! += (rgb[c]! / white[c]!) * (basis[k]! / steps);
    }
  }
  return invert3(m);
}

/** The radiance at `nm` of the spectrum an RGB colour is uplifted to (before any clamp). */
export function upliftWeights(nm: number, inverse = upliftInverse()): Vec3 {
  const b = upliftBasis(nm);
  // weights_k = sum_j Minv[j][k] b_j.
  return [0, 1, 2].map((k) => dot([inverse[k]!, inverse[3 + k]!, inverse[6 + k]!], b)) as Vec3;
}

// ---- Light-traced caustics (CPU twin) -----------------------------------------------------------

export interface CausticTraceOptions {
  /** Index of the glass. */
  n: number;
  /** Propagation direction of the light in the solid's frame (from the light towards the solid). */
  light: Vec3;
  /** Rays shot over a disc covering the solid. */
  rays?: number;
  /** Texels along each side of a face's tile. */
  tile?: number;
  bounces?: number;
  /** Only light that has reflected inside at least this many times is recorded. Default 1. */
  minBounce?: number;
  absorb?: number;
  /** Uniform numbers in [0, 1), for repeatable tests. */
  random?: () => number;
}

/**
 * Light from a distant source traced into the solid: where it lands on the inside of the faces
 * after reflecting inside, as irradiance relative to the beam's own (1 = as bright as the light
 * falling on the solid) in a tile of `tile` x `tile` texels per face. The twin of the compute pass
 * in src/gpu/glass/caustics.wgsl (nearest-texel deposit here, bilinear there).
 */
export function traceCaustics(
  planes: readonly Plane[],
  frames: readonly FaceFrame[],
  options: CausticTraceOptions,
): Float32Array {
  const {
    n,
    rays = 50000,
    tile = 32,
    bounces = 6,
    minBounce = 1,
    absorb = 0,
    random = Math.random,
  } = options;
  const light = normalize(options.light);
  const grid = new Float32Array(planes.length * tile * tile);
  const beam = 1.02;
  const u = normalize(cross(light, Math.abs(light[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const w = cross(light, u);
  const texel = (2 * frames[0]!.radius) / tile;
  const flux = (Math.PI * beam * beam) / rays / (texel * texel);
  const fresnel = (cosI: number, n1: number, n2: number) => {
    const eta = n1 / n2;
    const sinT2 = eta * eta * Math.max(0, 1 - cosI * cosI);
    if (sinT2 >= 1) return 1;
    const cosT = Math.sqrt(1 - sinT2);
    const rs = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT);
    const rp = (n1 * cosT - n2 * cosI) / (n1 * cosT + n2 * cosI);
    return 0.5 * (rs * rs + rp * rp);
  };
  const interval = (o: Vec3, d: Vec3) => {
    let t0 = -1e9;
    let t1 = 1e9;
    let i0 = 0;
    let i1 = 0;
    planes.forEach((p, i) => {
      const denom = dot(p, d);
      const dist = p[3] - dot(p, o);
      if (Math.abs(denom) < 1e-12) return;
      const t = dist / denom;
      if (denom < 0) {
        if (t > t0) [t0, i0] = [t, i];
      } else if (t < t1) [t1, i1] = [t, i];
    });
    return [t0, t1, i0, i1] as const;
  };
  const refract = (d: Vec3, nn: Vec3, eta: number): Vec3 => {
    const c = dot(d, nn);
    const k = 1 - eta * eta * (1 - c * c);
    return k < 0 ? [0, 0, 0] : sub(scale(d, eta), scale(nn, eta * c + Math.sqrt(k)));
  };
  const reflect = (d: Vec3, nn: Vec3): Vec3 => sub(d, scale(nn, 2 * dot(d, nn)));
  for (let r = 0; r < rays; r++) {
    const radius = beam * Math.sqrt(random());
    const angle = 2 * Math.PI * random();
    const o = add(
      scale(light, -4),
      add(scale(u, radius * Math.cos(angle)), scale(w, radius * Math.sin(angle))),
    );
    const [t0, t1, i0] = interval(o, light);
    if (t0 > t1 || t0 < 0) continue;
    const normalIn = planes[i0]!.slice(0, 3) as Vec3;
    let weight = 1 - fresnel(-dot(light, normalIn), 1, n);
    let dir = refract(light, normalIn, 1 / n);
    let p = add(add(o, scale(light, t0)), scale(dir, 1e-6));
    for (let bounce = 0; bounce <= bounces; bounce++) {
      const inner = interval(p, dir);
      const t = Math.max(inner[1], 0);
      weight *= Math.exp(-absorb * t);
      p = add(p, scale(dir, t));
      const face = inner[3];
      const normal = planes[face]!.slice(0, 3) as Vec3;
      if (bounce >= minBounce) {
        const f = frames[face]!;
        const q = sub(p, f.centre);
        const x = Math.floor((dot(q, f.tangent) / f.radius) * 0.5 * tile + 0.5 * tile);
        const y = Math.floor((dot(q, f.bitangent) / f.radius) * 0.5 * tile + 0.5 * tile);
        if (x >= 0 && x < tile && y >= 0 && y < tile) {
          grid[(face * tile + y) * tile + x]! += weight * flux;
        }
      }
      weight *= fresnel(dot(dir, normal), n, 1);
      dir = reflect(dir, scale(normal, -1));
      p = add(p, scale(dir, 1e-6));
      if (weight < 1e-5) break;
    }
  }
  return grid;
}

/** The point of the solid's frame at the centre of texel (`x`, `y`) of face `face`'s tile. */
export function texelPoint(frame: FaceFrame, tile: number, x: number, y: number): Vec3 {
  const a = (((x + 0.5) / tile) * 2 - 1) * frame.radius;
  const b = (((y + 0.5) / tile) * 2 - 1) * frame.radius;
  return add(frame.centre, add(scale(frame.tangent, a), scale(frame.bitangent, b)));
}

/** Whether a point of a face's plane lies on the face (inside every other plane). */
export function onSolid(planes: readonly Plane[], p: readonly number[]): boolean {
  return planes.every((q) => dot(q, p) <= q[3] + 1e-6);
}

export type { Plane, PlatonicSolid, Vec3 };
