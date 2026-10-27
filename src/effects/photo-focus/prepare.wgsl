#include "fullscreen.wgsl"
#include "params.wgsl"

// A photograph and its depth map into what a depth-of-field method takes (story 6.10): linear HDR
// colour and depth in metres, at the canvas's size, the photo scaled to cover it.
//
// A photo is display-referred: its highlights are clipped at white, so a street lamp that held a
// hundred times the light of the wall beside it is stored as barely brighter. Blurred as it is, the
// lamp would spread into a grey smudge rather than a bright disc. So the brightest pixels are opened
// back up: above `threshold` in their largest channel, light grows steeply to `gain` times at white.
//
// The depth map is disparity, as depth estimators and portrait modes write them: white near, black
// far, linear in one over the distance between `far` and `near` metres.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var photo: texture_2d<f32>;
@group(0) @binding(2) var disparity: texture_2d<f32>;
@group(0) @binding(3) var linear: sampler;

struct Prepared {
  @location(0) colour: vec4f,
  @location(1) depth: f32,
}

fn srgb_to_linear(c: vec3f) -> vec3f {
  return select(pow((c + 0.055) / 1.055, vec3f(2.4)), c / 12.92, c <= vec3f(0.04045));
}

@fragment fn prepare(in: FullscreenVarying) -> Prepared {
  let size = vec2f(textureDimensions(photo));
  let scale = max(params.out_size.x / size.x, params.out_size.y / size.y);
  let uv = (in.position.xy - 0.5 * params.out_size) / (scale * size) + 0.5;
  var c = srgb_to_linear(textureSampleLevel(photo, linear, uv, 0.0).rgb);
  let m = max(c.r, max(c.g, c.b));
  let k = smoothstep(params.threshold, 1.0, m);
  c *= 1.0 + (params.gain - 1.0) * k * k * k * k;
  // The map is read without filtering: an edge averaged between near and far is neither.
  let map_size = vec2f(textureDimensions(disparity));
  let d = textureLoad(disparity, vec2i(clamp(uv, vec2f(0.0), vec2f(0.9999)) * map_size), 0).r;
  let z = 1.0 / mix(1.0 / params.far, 1.0 / params.near, d);
  return Prepared(vec4f(c, 1.0), z);
}

// The sample: the depth-of-field test shot, developed like a camera's JPEG. Reinhard on each
// channel and sRGB, highlights clipped; the depth written as disparity.
@group(0) @binding(0) var<uniform> develop_params: Params;
@group(0) @binding(1) var scene_colour: texture_2d<f32>;
@group(0) @binding(2) var scene_depth: texture_2d<f32>;

fn linear_to_srgb_8(c: vec3f) -> vec3f {
  return select(1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3f(0.0031308));
}

struct Developed {
  @location(0) photo: vec4f,
  @location(1) disparity: vec4f,
}

@fragment fn develop(in: FullscreenVarying) -> Developed {
  let p = vec2i(in.position.xy);
  let hdr = textureLoad(scene_colour, p, 0).rgb * 1.6;
  let sdr = clamp(hdr / (1.0 + 0.25 * hdr), vec3f(0.0), vec3f(1.0));
  let z = textureLoad(scene_depth, p, 0).r;
  let d = clamp((1.0 / z - 1.0 / develop_params.far) / (1.0 / develop_params.near - 1.0 / develop_params.far), 0.0, 1.0);
  return Developed(vec4f(linear_to_srgb_8(sdr), 1.0), vec4f(d, d, d, 1.0));
}
