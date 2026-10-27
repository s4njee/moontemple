#include "fullscreen.wgsl"
#include "fbm.wgsl"
#include "leak-params.wgsl"

// The image and its leaks, in linear light (story 6.9). The leaks are drawn small (`field`), then
// one full-screen pass (`compose`) writes the HDR scene:
//
// - The image, scaled to cover the frame, read from an sRGB texture (so the hardware decodes it)
//   and run backwards through the tail's ACES curve, so with no leak it comes out of the tail as
//   it went in. Display white has no inverse; `ceiling` is the brightest value inverted.
// - The leaks: light added on top, never a tint. Each is a soft elliptical glow centred on or just
//   past an edge, in its own warm colour with a hotter core, its outline torn by one shared domain
//   warp that drifts slowly. Added light lifts the shadows most and is lost in the highlights, as
//   on film; the tail's tonemap rolls it off.
// - The veil: the broad glow round the sweeping flare as it crosses, another added ellipse.
//
// Positions are in height units from the frame centre: x in [-aspect / 2, aspect / 2], y down in
// [-0.5, 0.5].

@group(0) @binding(0) var<uniform> params: LeakParams;
@group(0) @binding(1) var photo: texture_2d<f32>;
@group(0) @binding(2) var photo_sampler: sampler;
@group(0) @binding(3) var leak_field: texture_2d<f32>;

/// Narkowicz's ACES fit solved for its input: the positive root of a quadratic.
fn inverse_aces(display: vec3f) -> vec3f {
  let y = clamp(display, vec3f(0.0), vec3f(params.ceiling));
  let a = 2.43 * y - 2.51;
  let b = 0.59 * y - 0.03;
  let c = 0.14 * y;
  return (-b - sqrt(b * b - 4.0 * a * c)) / (2.0 * a);
}

/// The leaks' light, drawn at a quarter of the canvas's size: it has no detail finer than a few
/// dozen pixels, and the domain warp is most of the effect's arithmetic.
@fragment fn field(in: FullscreenVarying) -> @location(0) vec4f {
  let p = (in.uv - 0.5) * vec2f(params.out_size.x / params.out_size.y, 1.0);
  // One warp for every leak: two three-octave fields, evolving slowly in z.
  let z = params.time;
  let warp = vec2f(
    fbm_3d(vec3f(p * 1.4, z), 3, 2.0, 0.5),
    fbm_3d(vec3f(p * 1.4 + vec2f(5.2, 1.3), z + 3.1), 3, 2.0, 0.5),
  );
  let q = p + warp * 0.3;
  // Light passing film edge-on lands in uneven bands: the warp also modulates the glow a little.
  let bands = clamp(0.85 + 0.7 * warp.x, 0.35, 1.5);

  var leak = vec3f(0.0);
  for (var i = 0u; i < 4u; i++) {
    let shape = params.leaks[3u * i];
    let colour = params.leaks[3u * i + 1u];
    let hot = params.leaks[3u * i + 2u];
    let angle = colour.w;
    let d = q - shape.xy;
    let r = vec2f(cos(angle) * d.x + sin(angle) * d.y, -sin(angle) * d.x + cos(angle) * d.y);
    let e = r / shape.zw;
    let r2 = dot(e, e);
    leak += colour.rgb * exp(-2.4 * r2) * bands + hot.rgb * exp(-7.0 * r2);
  }
  return vec4f(leak, 1.0);
}

@fragment fn compose(in: FullscreenVarying) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(photo));
  let scale = max(params.out_size.x / size.x, params.out_size.y / size.y);
  let uv = (in.position.xy - 0.5 * params.out_size) / (scale * size) + 0.5;
  var c = inverse_aces(textureSample(photo, photo_sampler, uv).rgb) * params.image_gain;
  c += textureSample(leak_field, photo_sampler, in.uv).rgb;
  let p = (in.position.xy - 0.5 * params.out_size) / params.out_size.y;
  let v = (p - params.veil_at.xy) / params.veil_at.zw;
  c += params.veil_colour.rgb * exp(-dot(v, v));
  return vec4f(c, 1.0);
}
