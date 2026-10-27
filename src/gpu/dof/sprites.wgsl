#include "fullscreen.wgsl"
#include "aperture.wgsl"
#include "sprites-params.wgsl"

// Sprite bokeh, the drawing half (story 3.5). See sprites-extract.wgsl for how the highlights are
// taken out of the image.
//
//   gather   what is left after the highlights go: a disc gather over the pixel's own circle of
//            confusion, a golden-angle spiral of taps. As in hexagon.wgsl, a tap counts only where
//            its own circle reaches back to the pixel, so a sharp subject does not smear over a
//            blurred background. It is soft and round whatever the aperture, which is fine for
//            dim light: the shape only shows on highlights.
//   sprite   one instanced quad per appended highlight, drawn additively with an indirect draw:
//            the aperture's shape at the highlight's signed circle of confusion, adding exactly
//            its light through aperture.wgsl's aperture_light, as src/gpu/points does.

@group(0) @binding(0) var<uniform> params: SpriteParams;
@group(0) @binding(1) var remainder: texture_2d<f32>;
@group(0) @binding(2) var linear: sampler;

const GATHER_TAPS: i32 = 48;
const GOLDEN_ANGLE: f32 = 2.39996323;

@fragment fn gather(in: FullscreenVarying) -> @location(0) vec4f {
  let at = in.position.xy;
  // The remainder's alpha is the pixel's circle of confusion, unsigned (sprites-extract.wgsl).
  let centre = textureLoad(remainder, vec2i(at), 0);
  let radius = centre.a;
  if (radius < 0.5) {
    return vec4f(centre.rgb, 1.0);
  }
  var sum = vec3f(0.0);
  var weight = 0.0;
  for (var k = 0; k < GATHER_TAPS; k++) {
    // Even area per tap: radius grows with the square root of the tap's number.
    let t = sqrt((f32(k) + 0.5) / f32(GATHER_TAPS)) * radius;
    let angle = f32(k) * GOLDEN_ANGLE;
    let q = at + t * vec2f(cos(angle), sin(angle));
    let tap = textureSampleLevel(remainder, linear, q / params.out_size, 0.0);
    // Only light whose own blur reaches this far may arrive here.
    let w = clamp(tap.a - t + 1.0, 0.0, 1.0);
    sum += tap.rgb * w;
    weight += w;
  }
  if (weight < 1e-3) {
    return vec4f(centre.rgb, 1.0);
  }
  return vec4f(sum / weight, 1.0);
}

struct SpritePoint {
  at: vec4f,
  light: vec4f,
}

@group(1) @binding(0) var<storage, read> sprites: array<SpritePoint>;

struct SpriteVarying {
  @builtin(position) position: vec4f,
  /// Offset from the sprite's centre, device pixels.
  @location(0) offset: vec2f,
  @location(1) @interpolate(flat) radius: f32,
  @location(2) @interpolate(flat) light: vec3f,
  @location(3) @interpolate(flat) field: vec2f,
}

@vertex fn sprite_vs(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> SpriteVarying {
  let sprite = sprites[instance];
  let corners = array(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  // Room for the edge ramp and the pixel the smallest sprite spreads over.
  let half = max(abs(sprite.at.z), APERTURE_MIN_RADIUS) + 1.5;
  let offset = corners[vertex] * half;
  let pixel = sprite.at.xy + offset;
  let centre = 0.5 * params.out_size;
  var out: SpriteVarying;
  out.position = vec4f(pixel / params.out_size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  out.offset = offset;
  out.radius = sprite.at.z;
  out.light = sprite.light.rgb;
  out.field = (sprite.at.xy - centre) / length(centre);
  return out;
}

@fragment fn sprite_fs(in: SpriteVarying) -> @location(0) vec4f {
  let a = Aperture(
    params.blades, params.rotation, params.curvature, params.unit_area,
    params.rim, params.rings, params.ring_count, params.vignette, in.field,
    params.obstruction, params.profile_mean, params.use_table, params.table);
  let share = aperture_light(in.offset, in.radius, a);
  if (share <= 0.0) {
    discard;
  }
  return vec4f(in.light * share, 0.0);
}
