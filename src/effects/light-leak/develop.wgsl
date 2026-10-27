#include "fullscreen.wgsl"
#include "fbm.wgsl"

// The sample hero image (story 6.9): a dusk lake, made once on the GPU when the effect loads and
// written into an 8-bit sRGB texture, so it reaches the leak pass exactly as a dropped photo does.
// Rendered in linear light, then developed like a camera's JPEG: a soft shoulder, clipped at white.
//
// The frame is 1.6 wide to 1 high; `uv` is (0, 0) top left. The sun sits just over the far range,
// half behind it; the lake mirrors the sky and hills with a glitter path under the sun; pines stand
// on the near shore.

const ASPECT: f32 = 1.6;
const SUN: vec2f = vec2f(0.64, 0.525);
const WATER: f32 = 0.6;

fn sun_distance(uv: vec2f) -> f32 {
  return length((uv - SUN) * vec2f(ASPECT, 1.0));
}

fn sky(uv: vec2f) -> vec3f {
  let h = clamp(uv.y / WATER, 0.0, 1.0);
  var c = mix(vec3f(0.006, 0.01, 0.045), vec3f(0.1, 0.05, 0.13), smoothstep(0.1, 0.75, h));
  c = mix(c, vec3f(1.0, 0.36, 0.09), smoothstep(0.65, 1.0, h));
  let d = sun_distance(uv);
  c += vec3f(1.5, 0.7, 0.25) * exp(-d * 11.0) + vec3f(0.4, 0.15, 0.05) * exp(-d * 3.5);
  c += vec3f(9.0, 6.5, 3.8) * smoothstep(0.03, 0.027, d);
  // Clouds: long thin bands, dark violet overhead, lit pink and orange from below near the sun.
  let n = fbm_2d(vec2f(uv.x * ASPECT * 2.4, uv.y * 12.0) + vec2f(3.1, 0.0), 5, 2.0, 0.5);
  let band = smoothstep(0.06, 0.18, uv.y) * (1.0 - smoothstep(0.4, 0.5, uv.y));
  let cover = smoothstep(0.02, 0.32, n) * band;
  let lit = clamp(exp(-d * 2.2) * 1.3 + h * 0.4, 0.0, 1.0);
  let cloud = mix(vec3f(0.02, 0.01, 0.03), vec3f(1.1, 0.36, 0.22), lit * lit);
  return mix(c, cloud, cover * 0.85);
}

/// Everything above the water line: sky, the far range in haze, the near hills dark.
fn land(uv: vec2f) -> vec3f {
  let x = uv.x * ASPECT;
  let far_top = 0.548 - 0.075 * (0.5 + 0.9 * fbm_2d(vec2f(x * 2.6, 1.7), 5, 2.0, 0.5));
  let near_top = 0.592 - 0.05 * (0.5 + fbm_2d(vec2f(x * 4.5 + 7.0, 4.2), 4, 2.0, 0.5));
  if (uv.y > near_top) {
    return vec3f(0.012, 0.006, 0.014);
  }
  if (uv.y > far_top) {
    // Haze thins up the slope and is lit warmer towards the sun.
    let glow = exp(-abs(uv.x - SUN.x) * ASPECT * 2.5);
    return mix(vec3f(0.06, 0.025, 0.06), vec3f(0.3, 0.11, 0.07), glow * 0.8);
  }
  return sky(uv);
}

/// A pine: a stack of jagged tiers on a trunk, `x` and `base` its foot, `h` its height.
fn pine(uv: vec2f, x: f32, base: f32, h: f32) -> f32 {
  let dx = abs(uv.x - x) * ASPECT;
  let t = (uv.y - (base - h)) / h;
  if (t < 0.0 || t > 1.0) {
    return 0.0;
  }
  let tiers = fract(t * 7.0);
  let width = h * 0.2 * t * (0.55 + 0.45 * tiers);
  let trunk = select(0.0, 1.0, dx < h * 0.018);
  return max(smoothstep(width + 0.0015, width, dx), trunk);
}

@fragment fn develop(in: FullscreenVarying) -> @location(0) vec4f {
  let uv = in.uv;
  let x = uv.x * ASPECT;
  let shore = 0.84 - 0.05 * fbm_2d(vec2f(x * 3.0 + 11.0, 2.3), 4, 2.0, 0.5) + (uv.x - 0.5) * 0.06;
  var c: vec3f;
  if (uv.y < WATER) {
    c = land(uv);
  } else if (uv.y < shore) {
    // The lake: the land mirrored about the water line, broken by ripples that grow nearer.
    let depth = (uv.y - WATER) / (shore - WATER);
    let ripple = fbm_2d(vec2f(x * 3.0, (uv.y - WATER) * 140.0), 3, 2.0, 0.5);
    let mirrored = vec2f(uv.x + ripple * 0.006 * (0.3 + depth), 2.0 * WATER - uv.y);
    c = land(mirrored) * 0.5;
    // Glitter under the sun: bright ripple crests in a column that widens towards the shore.
    let column = exp(-abs(uv.x - SUN.x) * ASPECT / (0.02 + 0.07 * depth));
    let crest = smoothstep(0.15, 0.45, ripple);
    c += vec3f(3.0, 1.6, 0.6) * column * crest * (1.0 - 0.5 * depth);
  } else {
    let grass = fbm_2d(vec2f(x * 9.0, uv.y * 30.0), 3, 2.0, 0.5);
    c = vec3f(0.005, 0.003, 0.005) * (1.0 + 0.5 * grass);
  }
  let tree = max(
    max(pine(uv, 0.08, 0.87, 0.36), pine(uv, 0.155, 0.865, 0.26)),
    max(pine(uv, 0.205, 0.87, 0.18), pine(uv, 0.9, 0.835, 0.22)),
  );
  c = mix(c, vec3f(0.002, 0.001, 0.002), tree);
  // Developed like a camera's JPEG: a soft shoulder, highlights clipped; the target encodes sRGB.
  let sdr = clamp(c / (1.0 + 0.3 * c), vec3f(0.0), vec3f(1.0));
  return vec4f(sdr, 1.0);
}
