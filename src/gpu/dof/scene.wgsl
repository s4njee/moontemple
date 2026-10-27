#include "fullscreen.wgsl"
#include "hash.wgsl"
#include "aperture.wgsl"
#include "dof-view.wgsl"

// The depth-of-field test shot (Epic 3), built from analytic shapes so that it can be traced through
// a real lens. Two passes share it:
//
//   pinhole    the sharp image and its depth, as a renderer would hand a post chain: every ray
//              through the centre of the lens, 4 x 4 per pixel.
//   reference  the same shot through the whole aperture: `samples` rays per pixel per frame, each
//              from its own point on the lens towards the plane of focus, averaged over frames.
//              Distributed ray tracing (Cook, Porter and Carpenter): it sees behind a blurred
//              foreground, which no post-process can.
//
// Units are metres; the camera is at the origin looking along +z, x to the right and y down. A
// pixel's pinhole ray is (x, y, 1) with x, y its offset from the centre in view heights times
// `view_scale`. The lens radius is chosen so a point at depth z blurs to exactly
// `blur_at_infinity * (1 - focus / z)` pixels, the model in src/gpu/optics/lens.ts.
//
// The shot (`scene` 0): a sharp subject card at 2.5 m, a dark post and rail at 0.9 m in front of it,
// a neon sign at 6 m, a lit block at 12 m, a string of bulbs at 18 m, a city of windows and point
// lights at 60 m, and a road from under the camera to the city. `scene` 1 is one bright point at
// `point_depth`, for checking the reference against the lens model.

@group(0) @binding(0) var<uniform> view: DofView;

struct Hit {
  colour: vec3f,
  depth: f32,
}

const SCENE_FAR: f32 = 60.0;
const SCENE_EYE: f32 = 1.6;

struct Card {
  centre: vec3f,
  half: vec2f,
  kind: u32,
}

fn disc_mask(p: vec2f, r: f32) -> f32 {
  return select(0.0, 1.0, dot(p, p) < r * r);
}

/// What a card shows at `p` (metres from its centre): colour, and whether it is there at all.
fn card_look(kind: u32, p: vec2f) -> vec4f {
  switch kind {
    case 0u: {
      // The subject: a fine checker with a row of small bright LEDs along its top.
      let cell = floor(p / 0.02);
      let check = (i32(cell.x) + i32(cell.y)) & 1;
      var c = select(vec3f(0.03), vec3f(0.55, 0.52, 0.48), check == 1);
      let led = vec2f(p.x - 0.04 * round(p.x / 0.04), p.y + 0.17);
      c += vec3f(30.0, 26.0, 20.0) * disc_mask(led, 0.004) * select(0.0, 1.0, abs(p.x) < 0.13);
      return vec4f(c, 1.0);
    }
    case 1u: {
      // The foreground post and rail: dark metal with one highlight down its edge.
      let edge = smoothstep(0.004, 0.0, abs(abs(p.x) - 0.018)) + smoothstep(0.003, 0.0, abs(p.y + 0.008));
      return vec4f(vec3f(0.012) + vec3f(0.25) * edge, 1.0);
    }
    case 2u: {
      // A neon sign: two tubes of colour on a black panel.
      let tube_a = smoothstep(0.02, 0.0, abs(p.y + 0.07)) * select(0.0, 1.0, abs(p.x) < 0.3);
      let tube_b = smoothstep(0.02, 0.0, abs(p.y - 0.06)) * select(0.0, 1.0, abs(p.x + 0.05) < 0.22);
      return vec4f(vec3f(0.004) + vec3f(6.0, 0.6, 3.0) * tube_a + vec3f(0.5, 4.0, 6.0) * tube_b, 1.0);
    }
    case 3u: {
      // A block of lit windows.
      let cell = floor(p / vec2f(0.18, 0.24));
      let local = p - (cell + 0.5) * vec2f(0.18, 0.24);
      let window = select(0.0, 1.0, abs(local.x) < 0.06 && abs(local.y) < 0.08);
      let lit = select(0.0, 1.0, ihash_2to1(vec2i(cell)) > 0.45);
      return vec4f(vec3f(0.006) + vec3f(1.6, 1.0, 0.45) * window * lit, 1.0);
    }
    default: {
      // A string of bulbs, nothing between them.
      let bulb = vec2f(p.x - 0.4 * round(p.x / 0.4), p.y);
      let on = disc_mask(bulb, 0.045);
      return vec4f(vec3f(30.0, 18.0, 7.0), on);
    }
  }
}

/// The city at the far plane: buildings against the sky, lit windows, and street lights.
fn city(p: vec2f) -> vec3f {
  let column = floor(p.x / 4.0);
  let top = -1.0 - 10.0 * ihash_2to1(vec2i(i32(column), 7));
  if (p.y < top) {
    return vec3f(0.002, 0.003, 0.008);
  }
  let cell = floor(p / vec2f(0.9, 1.1));
  let local = p - (cell + 0.5) * vec2f(0.9, 1.1);
  let window = select(0.0, 1.0, abs(local.x) < 0.25 && abs(local.y) < 0.3) *
    select(0.0, 1.0, ihash_2to1(vec2i(cell) + vec2i(31, 17)) > 0.7);
  var c = vec3f(0.006) + vec3f(1.2, 0.9, 0.5) * window;
  // Points of light: a lamp in some 1.5 m cells, far brighter than anything around it.
  let lamp_cell = floor(p / 1.5);
  let h = ihash_2to2(vec2i(lamp_cell) + vec2i(5, 3));
  if (h.x > 0.75) {
    let centre = (lamp_cell + 0.25 + 0.5 * h) * 1.5;
    c += vec3f(60.0, 45.0, 30.0) * disc_mask(p - centre, 0.07);
  }
  return c;
}

fn scene_trace(o: vec3f, d: vec3f) -> Hit {
  var best = Hit(vec3f(0.0), 1e9);
  if (view.scene == 1u) {
    // One point of light, in the dark.
    let t = (view.point_depth - o.z) / d.z;
    let p = o + d * t;
    let r = 0.0006 * view.point_depth;
    best.depth = view.point_depth;
    best.colour = vec3f(1.0) * disc_mask(p.xy, r) / (APERTURE_PI * r * r);
    return best;
  }
  // The city.
  if (d.z > 0.0) {
    let t = (SCENE_FAR - o.z) / d.z;
    best = Hit(city((o + d * t).xy), SCENE_FAR);
  }
  // The road, from under the camera to the city.
  if (d.y > 1e-5) {
    let t = (SCENE_EYE - o.y) / d.y;
    let p = o + d * t;
    if (p.z > 0.3 && p.z < best.depth) {
      let dash = select(0.0, 1.0, abs(p.x) < 0.07 && fract(p.z / 3.0) < 0.5);
      let edge = select(0.0, 1.0, abs(abs(p.x) - 3.2) < 0.08);
      best = Hit(vec3f(0.008) + vec3f(0.12, 0.11, 0.09) * max(dash, edge), p.z);
    }
  }
  var cards = array<Card, 7>(
    Card(vec3f(0.05, -0.02, 2.5), vec2f(0.16, 0.2), 0u),
    Card(vec3f(-0.17, 0.0, 0.9), vec2f(0.02, 1.0), 1u),
    Card(vec3f(0.0, 0.12, 0.9), vec2f(1.0, 0.012), 1u),
    Card(vec3f(0.55, -0.32, 6.0), vec2f(0.34, 0.16), 2u),
    Card(vec3f(-1.1, -0.65, 12.0), vec2f(0.65, 0.42), 3u),
    Card(vec3f(0.4, -1.15, 18.0), vec2f(3.0, 0.06), 4u),
    Card(vec3f(-0.62, 0.4, 4.0), vec2f(0.2, 0.06), 2u),
  );
  for (var i = 0u; i < 7u; i++) {
    let card = cards[i];
    let t = (card.centre.z - o.z) / d.z;
    if (t <= 0.0 || card.centre.z >= best.depth) {
      continue;
    }
    let p = (o + d * t).xy - card.centre.xy;
    if (abs(p.x) > card.half.x || abs(p.y) > card.half.y) {
      continue;
    }
    let look = card_look(card.kind, p);
    if (look.a > 0.5) {
      best = Hit(look.rgb, card.centre.z);
    }
  }
  return best;
}

/// The pinhole ray through pixel position `px` (device pixels, may be fractional).
fn pinhole_ray(px: vec2f) -> vec3f {
  let s = (px - 0.5 * view.out_size) / view.out_size.y * view.view_scale;
  return vec3f(s, 1.0);
}

struct Sharp {
  @location(0) colour: vec4f,
  @location(1) depth: f32,
}

@fragment fn pinhole(in: FullscreenVarying) -> Sharp {
  var sum = vec3f(0.0);
  for (var j = 0; j < 4; j++) {
    for (var i = 0; i < 4; i++) {
      let px = floor(in.position.xy) + (vec2f(f32(i), f32(j)) + 0.5) / 4.0;
      sum += scene_trace(vec3f(0.0), pinhole_ray(px)).colour;
    }
  }
  let centre = scene_trace(vec3f(0.0), pinhole_ray(in.position.xy));
  return Sharp(vec4f(sum / 16.0, 1.0), centre.depth);
}

@group(0) @binding(1) var previous: texture_2d<f32>;

@fragment fn reference(in: FullscreenVarying) -> @location(0) vec4f {
  let pixel = vec2i(in.position.xy);
  // A different rotation of the low-discrepancy sequence for every pixel, so the noise of a
  // frame is spread out rather than repeated.
  let rotation = ihash_2to2(pixel + vec2i(91, 37));
  var a = Aperture(view.blades, view.rotation, view.curvature, 1.0, 0.0, 0.0, 1.0, 0.0, vec2f(0.0));
  var sum = vec3f(0.0);
  var weights = 0.0;
  let count = u32(view.samples);
  for (var i = 0u; i < count; i++) {
    let n = f32(u32(view.batch) * count + i);
    // R2 sequence (Roberts): two irrational steps, well spread in the square.
    let u = fract(rotation + vec2f(0.7548776662, 0.5698402910) * n);
    let jitter = fract(vec2f(0.38196601, 0.61803399) * n + rotation.yx);
    // A point on the aperture: an angle, and a radius uniform over the shape's slice at that
    // angle. Angles where the shape reaches further cover more area, so each is weighted by the
    // square of the shape's reach there; the weights are normalised below.
    let theta = 2.0 * APERTURE_PI * u.x;
    let reach = aperture_radius(theta, a);
    let lens = vec2f(cos(theta), sin(theta)) * sqrt(u.y) * reach * view.lens_radius;
    let towards = pinhole_ray(floor(in.position.xy) + jitter) * view.focus;
    let origin = vec3f(lens, 0.0);
    let hit = scene_trace(origin, normalize(towards - origin));
    let w = reach * reach;
    sum += hit.colour * w;
    weights += w;
  }
  let batch = sum / max(weights, 1e-6);
  let k = view.batch;
  let before = textureLoad(previous, pixel, 0).rgb;
  return vec4f((before * k + batch) / (k + 1.0), 1.0);
}
