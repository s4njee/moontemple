/*
 * Convex solids for Epic 10's wireframes and glass (stories 10.1, 10.3 and, later, 10.4 to 10.7):
 * their vertices, edges and faces, a rotation, and a perspective projection to device pixels.
 *
 *   const solid = platonicSolid('icosahedron');           // 12 vertices, 30 edges, 20 faces
 *   const rotation = turntable(angle, { tilt: 0.35 });    // or mat3FromQuat(q), rotationAxisAngle
 *   const seen = projectSolid(solid, rotation, { center: [w / 2, h / 2], size: 0.3 * h, distance: 4 });
 *   seen.vertices[i].x, .y, .depth, .facing;  seen.faces[f].facing;  seen.edges[e].facing
 *
 * Space: a solid lives in its own frame with unit circumradius about the origin. The view frame
 * has x to the right, y up and z towards the camera, which sits on the z axis `distance`
 * circumradii from the centre and looks down -z. Pixels have y down. `size` is the circumradius
 * in device pixels at the depth of the solid's centre, so changing the perspective (`distance`)
 * does not change how big the solid reads; `distance: Infinity` is an orthographic view.
 *
 * Faces are found as the supporting planes of the vertex set (a convex hull of points that are
 * already in convex position), so `convexSolid` takes any convex vertex list, not only the five
 * Platonic solids: 10.7's extruded outline can come through here too. Each face lists its
 * vertices counter-clockwise seen from outside, with its outward unit normal; each edge knows the
 * two faces it joins, which is what decides whether it faces the camera.
 */

export type Vec3 = readonly [number, number, number];
/** A 3 x 3 matrix, row-major: `m[row * 3 + column]`. Rotations act on column vectors. */
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
/** A unit quaternion `(x, y, z, w)`. */
export type Quat = readonly [number, number, number, number];

export interface SolidFace {
  /** Vertex indices, counter-clockwise seen from outside. */
  vertices: readonly number[];
  /** Outward unit normal. */
  normal: Vec3;
  /** The mean of its vertices. */
  centroid: Vec3;
}

export interface SolidEdge {
  /** Vertex indices, `a < b`. */
  a: number;
  b: number;
  /** The two faces that meet along it. */
  faces: readonly [number, number];
}

export interface Solid {
  name: string;
  /** Unit circumradius about the origin. */
  vertices: readonly Vec3[];
  /** Outward unit normal at each vertex: the normalised mean of the faces round it. */
  vertexNormals: readonly Vec3[];
  /** The faces round each vertex. */
  vertexFaces: readonly (readonly number[])[];
  edges: readonly SolidEdge[];
  faces: readonly SolidFace[];
}

export const SOLID_NAMES = [
  'tetrahedron',
  'cube',
  'octahedron',
  'dodecahedron',
  'icosahedron',
] as const;
export type SolidName = (typeof SOLID_NAMES)[number];

// --- Vectors and rotations -------------------------------------------------------------------

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length > 0 ? [v[0] / length, v[1] / length, v[2] / length] : [0, 0, 0];
}

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function applyMat3(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/** `a * b`: applies `b` first, then `a`. */
export function multiplyMat3(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!;
    }
  }
  return out as unknown as Mat3;
}

/** A right-handed rotation of `angle` radians about `axis` (need not be unit length). */
export function rotationAxisAngle(axis: Vec3, angle: number): Mat3 {
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

/** The shortest rotation taking direction `from` onto direction `to`. */
export function rotationBetween(from: Vec3, to: Vec3): Mat3 {
  const a = normalize(from);
  const b = normalize(to);
  const c = dot(a, b);
  if (c > 1 - 1e-12) return IDENTITY;
  if (c < -1 + 1e-12) {
    // Opposite: half a turn about any axis at right angles to them.
    const side = Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]);
    return rotationAxisAngle(side, Math.PI);
  }
  return rotationAxisAngle(cross(a, b), Math.acos(c));
}

export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const [x, y, z] = normalize(axis);
  const s = Math.sin(angle / 2);
  return [x * s, y * s, z * s, Math.cos(angle / 2)];
}

/** `a * b`: rotates by `b` first, then `a`. */
export function multiplyQuat(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** The rotation matrix of a quaternion; it need not be exactly unit length. */
export function mat3FromQuat(q: Quat): Mat3 {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  const x = q[0] / n;
  const y = q[1] / n;
  const z = q[2] / n;
  const w = q[3] / n;
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y - z * w),
    2 * (x * z + y * w),
    2 * (x * y + z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z - x * w),
    2 * (x * z - y * w),
    2 * (y * z + x * w),
    1 - 2 * (x * x + y * y),
  ];
}

export interface TurntableOptions {
  /** Radians the spin axis leans towards the camera, so the top shows. Default 0.35. */
  tilt?: number;
  /** Radians the spin axis leans sideways, in the image plane. Default 0. */
  roll?: number;
  /** The solid's resting orientation, applied before the spin. Default identity. */
  body?: Mat3;
}

/**
 * A solid turning about one fixed axis: `angle` radians of spin about the body's vertical, then
 * the axis leaned `tilt` towards the camera and `roll` sideways. Because the axis is fixed, every
 * vertex goes round one circle per turn, so anything that depends on its direction (the flares of
 * 10.3) rises and falls once per turn: the turn rate bounds how fast it can change.
 */
export function turntable(angle: number, options: TurntableOptions = {}): Mat3 {
  const spin = rotationAxisAngle([0, 1, 0], angle);
  const lean = multiplyMat3(
    rotationAxisAngle([0, 0, 1], options.roll ?? 0),
    rotationAxisAngle([1, 0, 0], options.tilt ?? 0.35),
  );
  return multiplyMat3(lean, multiplyMat3(spin, options.body ?? IDENTITY));
}

// --- Building solids -------------------------------------------------------------------------

const PHI = (1 + Math.sqrt(5)) / 2;

function platonicVertices(name: SolidName): Vec3[] {
  const signs = [1, -1];
  const out: Vec3[] = [];
  switch (name) {
    case 'tetrahedron':
      out.push([1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]);
      break;
    case 'cube':
      for (const x of signs) for (const y of signs) for (const z of signs) out.push([x, y, z]);
      break;
    case 'octahedron':
      for (const s of signs) out.push([s, 0, 0], [0, s, 0], [0, 0, s]);
      break;
    case 'icosahedron':
      for (const a of signs) {
        for (const b of signs) out.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]);
      }
      break;
    case 'dodecahedron':
      for (const x of signs) for (const y of signs) for (const z of signs) out.push([x, y, z]);
      for (const a of signs) {
        for (const b of signs) {
          out.push([0, a / PHI, b * PHI], [a / PHI, b * PHI, 0], [b * PHI, 0, a / PHI]);
        }
      }
      break;
  }
  return out.map(normalize);
}

/**
 * A convex solid from points in convex position (every point a vertex of their hull), scaled to
 * unit circumradius about their centroid. Faces are the hull's supporting planes; points that
 * share a plane make one polygonal face.
 */
export function convexSolid(name: string, points: readonly Vec3[]): Solid {
  const n = points.length;
  if (n < 4) throw new Error(`${name}: a solid needs at least four vertices`);
  const centre = points.reduce<Vec3>(
    (sum, p) => [sum[0] + p[0] / n, sum[1] + p[1] / n, sum[2] + p[2] / n],
    [0, 0, 0],
  );
  const radius = Math.max(...points.map((p) => Math.hypot(...sub(p, centre))));
  const vertices = points.map((p) => {
    const d = sub(p, centre);
    return [d[0] / radius, d[1] / radius, d[2] / radius] as Vec3;
  });
  const eps = 1e-6;

  // Supporting planes: every triple whose plane has all the points on one side.
  const faces: SolidFace[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const pi = vertices[i]!;
        let normal = cross(sub(vertices[j]!, pi), sub(vertices[k]!, pi));
        if (Math.hypot(...normal) < 1e-9) continue;
        normal = normalize(normal);
        const offset = dot(normal, pi);
        let above = 0;
        let below = 0;
        const on: number[] = [];
        for (let m = 0; m < n; m++) {
          const d = dot(normal, vertices[m]!) - offset;
          if (d > eps) above++;
          else if (d < -eps) below++;
          else on.push(m);
        }
        if (above > 0 && below > 0) continue;
        if (above > 0) normal = [-normal[0], -normal[1], -normal[2]];
        const key = on.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        const centroid = on.reduce<Vec3>(
          (sum, m) => [
            sum[0] + vertices[m]![0] / on.length,
            sum[1] + vertices[m]![1] / on.length,
            sum[2] + vertices[m]![2] / on.length,
          ],
          [0, 0, 0],
        );
        // Counter-clockwise about the outward normal.
        const u = normalize(sub(vertices[on[0]!]!, centroid));
        const v = cross(normal, u);
        const angle = (m: number) => {
          const d = sub(vertices[m]!, centroid);
          return Math.atan2(dot(d, v), dot(d, u));
        };
        const ordered = [...on].sort((a, b) => angle(a) - angle(b));
        faces.push({ vertices: ordered, normal, centroid });
      }
    }
  }

  // Edges: each side of each face, shared by exactly two faces.
  const byKey = new Map<string, { a: number; b: number; faces: number[] }>();
  faces.forEach((face, f) => {
    const vs = face.vertices;
    vs.forEach((from, i) => {
      const to = vs[(i + 1) % vs.length]!;
      const a = Math.min(from, to);
      const b = Math.max(from, to);
      const key = `${a},${b}`;
      const edge = byKey.get(key) ?? { a, b, faces: [] };
      edge.faces.push(f);
      byKey.set(key, edge);
    });
  });
  const edges: SolidEdge[] = [...byKey.values()]
    .map((edge) => {
      if (edge.faces.length !== 2) throw new Error(`${name}: edge ${edge.a}-${edge.b} is open`);
      return { a: edge.a, b: edge.b, faces: [edge.faces[0]!, edge.faces[1]!] as const };
    })
    .sort((x, y) => x.a - y.a || x.b - y.b);

  const vertexFaces = vertices.map((_, m) =>
    faces.flatMap((face, f) => (face.vertices.includes(m) ? [f] : [])),
  );
  const vertexNormals = vertexFaces.map((round) =>
    normalize(
      round.reduce<Vec3>(
        (sum, f) => [
          sum[0] + faces[f]!.normal[0],
          sum[1] + faces[f]!.normal[1],
          sum[2] + faces[f]!.normal[2],
        ],
        [0, 0, 0],
      ),
    ),
  );
  return { name, vertices, vertexNormals, vertexFaces, edges, faces };
}

const cache = new Map<SolidName, Solid>();

/** One of the five Platonic solids, unit circumradius. Cached: treat it as read-only. */
export function platonicSolid(name: SolidName): Solid {
  let solid = cache.get(name);
  if (!solid) {
    solid = convexSolid(name, platonicVertices(name));
    cache.set(name, solid);
  }
  return solid;
}

/** A solid by name, falling back to the icosahedron (Epic 10's reference) for an unknown one. */
export function solidNamed(name: string): Solid {
  return platonicSolid(
    (SOLID_NAMES as readonly string[]).includes(name) ? (name as SolidName) : 'icosahedron',
  );
}

// --- Projection ------------------------------------------------------------------------------

export interface WireView {
  /** Where the solid's centre lands, device pixels. */
  center: readonly [number, number];
  /** The circumradius in device pixels, at the depth of the solid's centre. */
  size: number;
  /**
   * Camera distance from the solid's centre, in circumradii. 3 to 5 reads as a solid turning; a
   * large value flattens it, and `Infinity` is orthographic. Must be above 1.
   */
  distance: number;
}

export interface ProjectedVertex {
  /** Position in the view frame (x right, y up, z towards the camera), circumradii. */
  position: Vec3;
  /** Outward normal in the view frame. */
  normal: Vec3;
  /** Device pixels, y down. */
  x: number;
  y: number;
  /** Distance in front of the camera along its axis, circumradii; `Infinity` when orthographic. */
  depth: number;
  /** Cosine between the normal and the direction to the camera: above 0 faces it. */
  facing: number;
  /**
   * The largest `facing` of the faces round it: above 0 the corner is on the near side or the
   * outline and can be seen; below 0 the solid hides it.
   */
  faceFacing: number;
}

export interface ProjectedFace {
  normal: Vec3;
  centroid: Vec3;
  /** Cosine between the outward normal and the direction to the camera: above 0 faces it. */
  facing: number;
}

export interface ProjectedEdge {
  a: number;
  b: number;
  /**
   * The larger `facing` of its two faces. Above 0, at least one face is towards the camera and
   * the edge is in front (on the outline when the other face is away); below 0 it is hidden
   * behind the solid. For a convex solid that is exact: no edge is ever half hidden.
   */
  facing: number;
}

export interface ProjectedSolid {
  solid: Solid;
  view: WireView;
  rotation: Mat3;
  vertices: ProjectedVertex[];
  faces: ProjectedFace[];
  edges: ProjectedEdge[];
}

/** Direction from `p` (view frame) to the camera. */
function toCamera(p: Vec3, distance: number): Vec3 {
  return Number.isFinite(distance) ? normalize([-p[0], -p[1], distance - p[2]]) : [0, 0, 1];
}

/** Device pixels and depth of a point in the view frame. */
export function projectPoint(p: Vec3, view: WireView): { x: number; y: number; depth: number } {
  const { center, size, distance } = view;
  if (!Number.isFinite(distance)) {
    return { x: center[0] + size * p[0], y: center[1] - size * p[1], depth: Infinity };
  }
  // At least a little in front of the camera, so a solid pushed through it does not explode.
  const depth = Math.max(distance - p[2], 1e-3);
  const scale = (size * distance) / depth;
  return { x: center[0] + scale * p[0], y: center[1] - scale * p[1], depth };
}

/** The solid turned by `rotation` and seen through `view`: everything a frame needs to draw it. */
export function projectSolid(solid: Solid, rotation: Mat3, view: WireView): ProjectedSolid {
  const faces = solid.faces.map((face): ProjectedFace => {
    const normal = applyMat3(rotation, face.normal);
    const centroid = applyMat3(rotation, face.centroid);
    return { normal, centroid, facing: dot(normal, toCamera(centroid, view.distance)) };
  });
  const vertices = solid.vertices.map((v, i): ProjectedVertex => {
    const position = applyMat3(rotation, v);
    const normal = applyMat3(rotation, solid.vertexNormals[i]!);
    const { x, y, depth } = projectPoint(position, view);
    return {
      position,
      normal,
      x,
      y,
      depth,
      facing: dot(normal, toCamera(position, view.distance)),
      faceFacing: Math.max(...solid.vertexFaces[i]!.map((f) => faces[f]!.facing)),
    };
  });
  const edges = solid.edges.map((edge): ProjectedEdge => ({
    a: edge.a,
    b: edge.b,
    facing: Math.max(faces[edge.faces[0]]!.facing, faces[edge.faces[1]]!.facing),
  }));
  return { solid, view, rotation, vertices, faces, edges };
}
