#include "fullscreen.wgsl"
#include "color.wgsl"
#include "hash.wgsl"
#include "sdf.wgsl"
#include "view-params.wgsl"

// The demo's two views (story 6.8): what a page would hand the transition, drawn here so the
// gallery needs no downloads. Two sections of an imagined night-market site: `a` a hero with a
// headline, a moon, strings of fairy lights and the lamps of the stalls; `b` a gallery of three
// cards, each a photograph of a lit city. Both are written as an 8-bit, sRGB, display-referred
// image, the way a screenshot or photo the page hands over arrives: every lamp clipped at white.
// The transition then opens the highlights back up exactly as it would for a real image.
//
// Coordinates: `q` is in view heights from the centre, y down; one pixel is `px` of them.

@group(0) @binding(0) var<uniform> view: ViewParams;

struct Views {
  @location(0) a: vec4f,
  @location(1) b: vec4f,
}

fn cover(d: f32, px: f32) -> f32 {
  return sd_coverage(d, px);
}

/// A greeked line of text: words as rounded bars from `left`, centred on `y`, `h` tall.
fn words(q: vec2f, left: f32, y: f32, len: f32, h: f32, seed: f32, px: f32) -> f32 {
  let x = q.x - left;
  if (x < -h || x > len + h || abs(q.y - y) > h) {
    return 0.0;
  }
  let pitch = 3.6 * h;
  let cell = floor(x / pitch);
  let word = pitch * (0.5 + 0.38 * hash_2to1(vec2f(cell, seed)));
  let local = vec2f(x - cell * pitch - 0.5 * word, q.y - y);
  let d = max(sd_rounded_box_2d(local, vec2f(0.5 * word, 0.5 * h), 0.2 * h), max(x - len, -x));
  return cover(d, px);
}

/// A small light as a camera records it: a core clipped to white, its colour at the rim, and a
/// faint glow. `colour` has its largest channel at 1, so the core is a clipped highlight.
fn lamp(base: vec3f, q: vec2f, at: vec2f, r: f32, colour: vec3f, px: f32) -> vec3f {
  let d = length(q - at);
  let glow = colour * 0.12 * exp(-d * d / (12.0 * r * r));
  let core = mix(colour, vec3f(1.0), smoothstep(r, 0.2 * r, d) * 0.7);
  return mix(base + glow, core, cover(d - r, px));
}

fn warm(index: f32) -> vec3f {
  let h = hash_2to1(vec2f(index, 11.0));
  if (h < 0.4) {
    return vec3f(1.0, 0.62, 0.24);
  }
  if (h < 0.75) {
    return vec3f(1.0, 0.82, 0.45);
  }
  return vec3f(1.0, 0.46, 0.42);
}

/// The left edge of the content column, in view heights.
fn column_left(aspect: f32) -> f32 {
  return -min(0.5 * aspect, 0.92) + 0.12;
}

/// A string of fairy lights sagging between the view's edges: `top` where it hangs from, `sag`.
fn fairy_string(base: vec3f, q: vec2f, aspect: f32, top: f32, sag: f32, count: f32, seed: f32, px: f32) -> vec3f {
  let half_span = 0.5 * aspect + 0.02;
  let s = (q.x + half_span) / (2.0 * half_span);
  let wire = top + sag * (1.0 - (2.0 * s - 1.0) * (2.0 * s - 1.0));
  var c = mix(base, vec3f(0.015, 0.012, 0.012), cover(abs(q.y - wire) - 0.0007, px));
  let i = round(s * count);
  let si = i / count;
  let at = vec2f(-half_span + si * 2.0 * half_span, top + sag * (1.0 - (2.0 * si - 1.0) * (2.0 * si - 1.0)) + 0.01);
  return lamp(c, q, at, 0.0055, warm(i + seed), px);
}

/// View a: the hero.
fn hero(q: vec2f, aspect: f32, px: f32) -> vec3f {
  var c = mix(vec3f(0.005, 0.005, 0.026), vec3f(0.03, 0.013, 0.05), q.y + 0.5);

  // Stars above the stalls, a few bright enough to clip.
  let star_cell = floor(q / 0.045);
  let h = hash_2to3(star_cell + 3.1);
  if (h.z > 0.78 && q.y < 0.2) {
    let at = (star_cell + 0.2 + 0.6 * h.xy) * 0.045;
    let level = pow((h.z - 0.78) / 0.22, 2.5);
    c += vec3f(0.85, 0.9, 1.0) * level * cover(length(q - at) - 0.0016, px);
  }

  // The moon, below the clip point so it stays a moon and the lamps are the highlights.
  let moon_at = vec2f(min(0.3 * aspect, 0.6), -0.1);
  let md = length(q - moon_at);
  c += vec3f(0.05, 0.045, 0.08) * exp(-md * md / 0.03);
  let mare = 0.86 - 0.1 * cover(length(q - moon_at - vec2f(-0.02, -0.015)) - 0.028, px)
    - 0.07 * cover(length(q - moon_at - vec2f(0.025, 0.02)) - 0.02, px);
  c = mix(c, vec3f(0.92, 0.9, 0.84) * mare, cover(md - 0.075, px));

  c = fairy_string(c, q, aspect, -0.47, 0.1, 30.0, 0.0, px);
  c = fairy_string(c, q, aspect, -0.5, 0.2, 38.0, 50.0, px);

  // Headline, body and a call to action.
  let left = column_left(aspect);
  c = mix(c, vec3f(0.82, 0.8, 0.88), words(q, left, -0.12, 0.66, 0.055, 1.0, px));
  c = mix(c, vec3f(0.82, 0.8, 0.88), words(q, left, -0.045, 0.44, 0.055, 2.0, px));
  var lengths = array<f32, 3>(0.56, 0.6, 0.36);
  for (var line = 0; line < 3; line++) {
    let len = lengths[line];
    c = mix(c, vec3f(0.26, 0.25, 0.32), words(q, left, 0.03 + 0.032 * f32(line), len, 0.014, 3.0 + f32(line), px));
  }
  let button = q - vec2f(left + 0.12, 0.17);
  c = mix(c, vec3f(0.86, 0.36, 0.07), cover(sd_rounded_box_2d(button, vec2f(0.12, 0.033), 0.033), px));
  c = mix(c, vec3f(0.06, 0.02, 0.0), words(q, left + 0.045, 0.17, 0.15, 0.016, 9.0, px));

  // The stalls: a row of roofs along the bottom, a lamp under each eave.
  let pitch = 0.16;
  let stall = floor(q.x / pitch);
  let local = q.x - (stall + 0.5) * pitch;
  let roof = 0.33 + 0.04 * hash_2to1(vec2f(stall, 4.0)) + 0.35 * abs(local);
  if (q.y > roof) {
    c = vec3f(0.012, 0.008, 0.014) + vec3f(0.06, 0.03, 0.01) * smoothstep(roof + 0.12, roof, q.y);
  }
  for (var k = -1; k <= 1; k++) {
    let s = stall + f32(k);
    let x0 = (s + 0.5) * pitch;
    let r0 = 0.33 + 0.04 * hash_2to1(vec2f(s, 4.0));
    for (var j = -1; j <= 1; j++) {
      let at = vec2f(x0 + f32(j) * 0.045, r0 + 0.35 * abs(f32(j) * 0.045) + 0.022);
      c = lamp(c, q, at, 0.0065, warm(s * 3.0 + f32(j) + 20.0), px);
    }
  }
  return c;
}

/// The photograph in one card: a city at night, `p` from the image's top left, `size` its extent.
fn city(p: vec2f, size: vec2f, card: f32, px: f32) -> vec3f {
  var tints = array<vec3f, 3>(vec3f(0.3, 0.85, 1.0), vec3f(1.0, 0.32, 0.78), vec3f(1.0, 0.7, 0.3));
  let tint = tints[u32(card)];
  var c = mix(vec3f(0.008, 0.01, 0.035), tint * 0.08, smoothstep(0.0, size.y, p.y));
  let width = 0.034;
  let column = floor(p.x / width);
  let top = size.y * (0.2 + 0.5 * hash_2to1(vec2f(column, card + 7.0)));
  if (p.y > top) {
    c = vec3f(0.006, 0.006, 0.01);
    let cell = floor((p - vec2f(0.0, top)) / 0.0105);
    let w = hash_2to2(cell + vec2f(column * 13.0, card * 31.0));
    let lw = p - vec2f(0.0, top) - (cell + 0.5) * 0.0105;
    if (w.x > 0.6) {
      let level = mix(0.18, 1.0, pow(w.y, 3.0));
      c = mix(c, vec3f(1.0, 0.78, 0.48) * level, cover(sd_box_2d(lw, vec2f(0.0028, 0.0034)), px));
    }
  }
  // Street lamps along the bottom of the picture, in the card's colour.
  let lamp_pitch = 0.055;
  let li = floor(p.x / lamp_pitch);
  let at = vec2f((li + 0.5) * lamp_pitch, size.y - 0.035 - 0.012 * hash_2to1(vec2f(li, card)));
  c = lamp(c, p, at, 0.006, tint, px);
  return c;
}

/// View b: a gallery section of three cards.
fn gallery(q: vec2f, aspect: f32, px: f32) -> vec3f {
  var c = mix(vec3f(0.003, 0.014, 0.018), vec3f(0.008, 0.03, 0.034), q.y + 0.5);
  let left = column_left(aspect);
  c = mix(c, vec3f(0.78, 0.9, 0.88), words(q, left, -0.37, 0.4, 0.045, 7.0, px));
  c = mix(c, vec3f(0.22, 0.28, 0.3), words(q, left, -0.31, 0.62, 0.014, 8.0, px));

  let pitch = -2.0 * left / 3.0;
  let card = clamp(floor((q.x - left) / pitch), 0.0, 2.0);
  let centre = vec2f(left + (card + 0.5) * pitch, 0.06);
  let half_size = vec2f(0.44 * pitch, 0.27);
  let local = q - centre;
  let box = sd_rounded_box_2d(local, half_size, 0.02);
  c = mix(c, vec3f(0.05, 0.07, 0.075), cover(abs(box) - 0.0012, px));
  c = mix(c, vec3f(0.012, 0.02, 0.024), cover(box + 0.0012, px));
  let image_min = centre - half_size + vec2f(0.016);
  let image_size = vec2f(2.0 * half_size.x - 0.032, 0.36);
  let p = q - image_min;
  let in_image = sd_box_2d(p - 0.5 * image_size, 0.5 * image_size);
  if (in_image < px) {
    c = mix(c, city(p, image_size, card, px), cover(in_image, px));
  }
  let caption = image_min.y + image_size.y + 0.04;
  c = mix(c, vec3f(0.7, 0.82, 0.8), words(q, image_min.x, caption, 0.6 * image_size.x, 0.022, 20.0 + card, px));
  c = mix(c, vec3f(0.2, 0.26, 0.28), words(q, image_min.x, caption + 0.045, 0.85 * image_size.x, 0.012, 30.0 + card, px));
  return c;
}

@fragment fn views(in: FullscreenVarying) -> Views {
  let size = view.out_size;
  let px = 1.0 / size.y;
  let q = (in.position.xy - 0.5 * size) * px;
  let aspect = size.x / size.y;
  let a = linear_to_srgb(clamp(hero(q, aspect, px), vec3f(0.0), vec3f(1.0)));
  let b = linear_to_srgb(clamp(gallery(q, aspect, px), vec3f(0.0), vec3f(1.0)));
  return Views(vec4f(a, 1.0), vec4f(b, 1.0));
}
