#include "fullscreen.wgsl"

// The glass body out of focus behind the wire (story 10.4): the body layer, already blurred, laid
// over the scene premultiplied. Its coverage spreads with the blur, so the body's edge softens into
// the sky behind it as a defocused object's does, rather than staying a hard outline.

@group(0) @binding(0) var soft_tex: texture_2d<f32>;
@group(0) @binding(1) var linear: sampler;

@fragment fn soft(in: FullscreenVarying) -> @location(0) vec4f {
  return textureSampleLevel(soft_tex, linear, in.uv, 0.0);
}
