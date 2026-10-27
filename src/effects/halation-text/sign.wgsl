#include "fullscreen.wgsl"

// The lit sign: the headline's coverage (mask) as emitted light, linear HDR, into the scene the
// halation and the tail then work on. `light` is the sign's colour times its brightness (1.0 is
// paper white) times the hum, so a backlit letter is flat and very bright, as a lightbox is; the
// film look comes after, from moving and spreading that light, not from painting a halo here.

@group(0) @binding(0) var mask: texture_2d<f32>;
@group(0) @binding(1) var<uniform> light: vec4f;

@fragment fn fs(in: FullscreenVarying) -> @location(0) vec4f {
  let size = vec2i(textureDimensions(mask));
  let texel = clamp(vec2i(in.position.xy), vec2i(0), size - vec2i(1));
  let ink = textureLoad(mask, texel, 0).a;
  return vec4f(light.rgb * ink, 0.0);
}
