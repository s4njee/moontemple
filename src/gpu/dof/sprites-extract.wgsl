#include "sprites-params.wgsl"

// Sprite bokeh, the compute half (story 3.5; after Sousa, CryENGINE 3 Graphics Gems, SIGGRAPH
// 2013). Two entry points:
//
//   extract   one invocation per 2 x 2 block of the sharp image (a half-resolution pixel). Each
//             pixel brighter than `threshold` in luminance and blurred by more than `min_coc`
//             gives up its light above the threshold, (L - threshold) / L of its colour, so the
//             split is continuous in brightness. The block's share becomes one point record,
//             appended through an atomic counter: placed at the light's centroid, with its
//             light-weighted signed circle of confusion and its light summed over the block's
//             pixels (each one device pixel in area, so light is colour times area). Whatever is
//             left is written to `remainder` for the gather. A block that finds the buffer full
//             keeps all its light in the remainder, so nothing is lost past the cap: it is only
//             blurred as a disc instead of drawn as the aperture. The remainder's alpha carries
//             each pixel's unsigned circle of confusion, so the gather fetches once per tap.
//   finalise  one invocation: the indirect draw's arguments, six vertices per sprite and as many
//             sprites as were appended, up to the cap.

@group(0) @binding(0) var<uniform> params: SpriteParams;
@group(0) @binding(1) var colour_tex: texture_2d<f32>;
@group(0) @binding(2) var depth_tex: texture_2d<f32>;
@group(0) @binding(3) var remainder: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var<storage, read_write> points: array<SpritePoint>;
@group(0) @binding(5) var<storage, read_write> counter: atomic<u32>;
@group(0) @binding(6) var<storage, read_write> args: array<u32, 4>;

struct SpritePoint {
  /// (x, y, signed radius, unused), device pixels: the layout of src/gpu/points.ts.
  at: vec4f,
  /// (r, g, b, unused): the sprite's whole light.
  light: vec4f,
}

fn sprite_luminance(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}

@compute @workgroup_size(8, 8)
fn extract(@builtin(global_invocation_id) id: vec3u) {
  let size = vec2i(params.out_size);
  let block = vec2i(id.xy) * 2;
  if (block.x >= size.x || block.y >= size.y) {
    return;
  }
  var colours: array<vec3f, 4>;
  var cocs: array<f32, 4>;
  var shares: array<f32, 4>;
  var light = vec3f(0.0);
  var weight = 0.0;
  var centroid = vec2f(0.0);
  var coc_sum = 0.0;
  for (var k = 0; k < 4; k++) {
    let p = block + vec2i(k & 1, k >> 1);
    colours[k] = vec3f(0.0);
    cocs[k] = 0.0;
    shares[k] = 0.0;
    if (p.x >= size.x || p.y >= size.y) {
      continue;
    }
    let c = textureLoad(colour_tex, p, 0).rgb;
    let z = textureLoad(depth_tex, p, 0).r;
    let coc = clamp(params.blur * (1.0 - params.focus / max(z, 1e-4)), -params.max_radius, params.max_radius);
    let l = sprite_luminance(c);
    colours[k] = c;
    cocs[k] = abs(coc);
    if (abs(coc) > params.min_coc && l > params.threshold) {
      let share = (l - params.threshold) / l;
      shares[k] = share;
      let w = l * share;
      light += c * share;
      weight += w;
      centroid += w * (vec2f(p) + 0.5);
      coc_sum += w * coc;
    }
  }
  var appended = false;
  if (weight > 0.0) {
    let index = atomicAdd(&counter, 1u);
    if (index < params.capacity) {
      points[index] = SpritePoint(vec4f(centroid / weight, coc_sum / weight, 0.0), vec4f(light, 0.0));
      appended = true;
    }
  }
  for (var k = 0; k < 4; k++) {
    let p = block + vec2i(k & 1, k >> 1);
    if (p.x >= size.x || p.y >= size.y) {
      continue;
    }
    let kept = select(1.0, 1.0 - shares[k], appended);
    textureStore(remainder, p, vec4f(colours[k] * kept, cocs[k]));
  }
}

@compute @workgroup_size(1)
fn finalise() {
  args[0] = 6u;
  args[1] = min(atomicLoad(&counter), params.capacity);
  args[2] = 0u;
  args[3] = 0u;
}
