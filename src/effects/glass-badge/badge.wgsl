#include "fullscreen.wgsl"
#include "color.wgsl"
#include "glass.wgsl"
#include "params.wgsl"

// A glass badge over the page's image (story 10.7). The page hands the effect its background image
// (the stable way, 6.1); the badge is a bevelled slab of glass in front of it, traced with the
// shared tracer (glass.wgsl) at three wavelengths with three indices, so lines behind it bend at
// the bevels and split into colour there. Units are pixels: the badge's centre is the origin of
// its frame, the camera `focal` px in front of the page, the image `depth` px behind it.
//
// An unbent ray must land on its own pixel of the image, so the environment is looked up by
// direction from the camera: a ray (x, y, -focal) meets the image where its pixel is. A bent ray
// leaves the glass from a point near the badge rather than from the camera; that parallax, a few
// pixels for a badge this thin, is ignored.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<uniform> solid: GlassSolid;
@group(0) @binding(2) var image_tex: texture_2d<f32>;
@group(0) @binding(3) var image_sampler: sampler;

fn glass_plane(i: u32) -> vec4f {
  return solid.planes[i];
}

fn glass_plane_count() -> u32 {
  return solid.count;
}

/// The image at a canvas pixel, scaled to cover the canvas, linear.
fn image_at(pixel: vec2f) -> vec3f {
  let size = vec2f(textureDimensions(image_tex));
  let scale = max(params.out_size.x / size.x, params.out_size.y / size.y);
  let uv = (pixel - 0.5 * params.out_size) / (scale * size) + 0.5;
  return textureSampleLevel(image_tex, image_sampler, uv, 0.0).rgb;
}

fn to_view(v: vec3f) -> vec3f {
  return vec3f(dot(params.rot0.xyz, v), dot(params.rot1.xyz, v), dot(params.rot2.xyz, v));
}

fn to_badge(v: vec3f) -> vec3f {
  return params.rot0.xyz * v.x + params.rot1.xyz * v.y + params.rot2.xyz * v.z;
}

fn glass_environment(dir_badge: vec3f, nm: f32) -> f32 {
  let dir = to_view(dir_badge);
  var c: vec3f;
  if (dir.z > -1e-3) {
    // Towards the viewer: the room, a soft light from above that the faces reflect.
    let up = clamp(0.5 - 0.5 * dir.y, 0.0, 1.0);
    c = vec3f(params.room * (0.15 + up * up));
  } else {
    c = image_at(params.centre + dir.xy * params.focal / -dir.z);
  }
  if (nm > 600.0) {
    return c.r;
  }
  if (nm > 500.0) {
    return c.g;
  }
  return c.b;
}

@fragment fn badge(in: FullscreenVarying) -> @location(0) vec4f {
  let pixel = in.position.xy;
  let rel = pixel - params.centre;
  let o = to_badge(vec3f(0.0, 0.0, params.focal));
  let d = to_badge(normalize(vec3f(rel, -params.focal)));
  let hit = glass_interval(o, d);
  var colour = image_at(pixel);
  if (hit.x <= hit.y && hit.x > 0.0) {
    let r = glass_trace(o, d, 650.0, params.index.x, params.absorb.x);
    let g = glass_trace(o, d, 550.0, params.index.y, params.absorb.y);
    let b = glass_trace(o, d, 450.0, params.index.z, params.absorb.z);
    colour = vec3f(r, g, b);
  }
  return vec4f(linear_to_srgb(clamp(colour * params.exposure, vec3f(0.0), vec3f(1.0))), 1.0);
}

// The sample page behind the badge, drawn once: a dusk gradient, a grid of fine lines, a few soft
// discs and bars of placeholder text, so refraction has straight lines to bend. sRGB-encoded.
@fragment fn page(in: FullscreenVarying) -> @location(0) vec4f {
  let p = in.uv;
  var c = mix(vec3f(0.95, 0.55, 0.42), vec3f(0.16, 0.2, 0.48), p.y);
  c = mix(c, vec3f(0.98, 0.82, 0.6), 0.5 * exp(-pow(length(p - vec2f(0.72, 0.38)) / 0.16, 2.0)));
  let grid = fract(p * vec2f(28.0, 17.5));
  let line = max(step(grid.x, 0.04), step(grid.y, 0.06));
  c = mix(c, vec3f(1.0), 0.35 * line);
  for (var i = 0; i < 5; i++) {
    let at = vec2f(0.12 + 0.2 * f32(i), 0.78 + 0.05 * sin(f32(i) * 2.1));
    let r = length((p - at) * vec2f(1.6, 1.0));
    c = mix(c, vec3f(0.1, 0.9 - 0.1 * f32(i), 0.6 + 0.08 * f32(i)), smoothstep(0.06, 0.05, r));
  }
  for (var i = 0; i < 4; i++) {
    let y = 0.14 + 0.05 * f32(i);
    let bar = step(abs(p.y - y), 0.012) * step(0.08, p.x) * step(p.x, 0.62 - 0.08 * f32(i));
    c = mix(c, vec3f(0.08, 0.06, 0.12), 0.85 * bar);
  }
  return vec4f(c, 1.0);
}
