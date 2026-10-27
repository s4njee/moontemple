#include "fullscreen.wgsl"
#include "hash.wgsl"
#include "moon.wgsl"
#include "spectral.wgsl"
#include "glass.wgsl"
#include "thinfilm.wgsl"
#include "glass-body.wgsl"
#include "body-params.wgsl"

// The glass body (stories 9.4 to 9.6), one fullscreen pass. Each pixel's view ray is traced
// through the turned solid (planes already in the view frame) against a night backdrop: a sky
// darkening upwards, a bright horizon line straight across the middle of the view, a few lights on
// the horizon, stars, and the moon, which is also the key light the caustics come from.
//
// Inside the solid the ray is split at every face (glass-body.wgsl), one wavelength at a time:
// `samples` hero samples of four wavelengths each (`mode` 0), or three rays at 650, 550 and 450 nm
// for red, green and blue (`mode` 1, the cheap version). The result is blended into a history
// (`blend` of the new frame), so the noise of a few wavelengths a frame averages out over a few
// frames while the solid turns slowly, and converges when it stops. Alpha is the solid's coverage.
//
// Caustics: `caustics` > 0 reads the traced atlas (caustics.wgsl) wherever the ray meets a face;
// `standin` > 0 adds the screen-space stand-in, a glow at each corner weighted by how its faces
// face the light, inside the solid's outline.

@group(0) @binding(0) var<uniform> params: BodyParams;
@group(0) @binding(1) var<uniform> solid: GlassSolid;

fn body_plane(i: u32) -> vec4f {
  return solid.planes[i];
}

fn body_plane_count() -> u32 {
  return solid.count;
}
@group(0) @binding(2) var history: texture_2d<f32>;
@group(0) @binding(3) var<storage, read> caustic: array<vec4f>;
@group(0) @binding(4) var<storage, read> faces: array<vec4f>;
@group(0) @binding(5) var layer: texture_2d<f32>;
@group(0) @binding(6) var layer_sampler: sampler;

const BODY_PI: f32 = 3.14159265358979;

struct BodyOut {
  @location(0) colour: vec4f,
  @location(1) history: vec4f,
}

// ---- The backdrop -------------------------------------------------------------------------------

fn sky_stars(azimuth: f32, elevation: f32) -> f32 {
  // Cells of about 4 milliradians in azimuth and elevation; one in seventy holds a star.
  let g = vec2f(azimuth, elevation) * 240.0;
  let cell = floor(g);
  let h = ihash_2to2(vec2i(cell) + vec2i(91, 17));
  if (h.x < 0.985) {
    return 0.0;
  }
  let at = cell + 0.25 + 0.5 * ihash_2to2(vec2i(cell) + vec2i(5, 3));
  let d = (g - at) / 240.0 * params.px_per_rad;
  return exp(-dot(d, d) / 0.6) * (0.15 + 2.0 * pow(h.y, 8.0));
}

/// Lights along the horizon: (azimuth, elevation, angular radius) in radians, and brightness.
fn horizon_lights(azimuth: f32, elevation: f32) -> vec3f {
  let lights = array<vec4f, 7>(
    vec4f(-0.21, 0.004, 0.0035, 1.0),
    vec4f(-0.07, 0.003, 0.003, 0.6),
    vec4f(0.04, 0.005, 0.004, 1.4),
    vec4f(0.11, 0.003, 0.0025, 0.5),
    vec4f(0.26, 0.004, 0.0035, 0.9),
    vec4f(-0.42, 0.003, 0.003, 0.5),
    vec4f(0.55, 0.004, 0.003, 0.7),
  );
  var sum = vec3f(0.0);
  for (var i = 0; i < 7; i++) {
    let l = lights[i];
    let d = vec2f(azimuth - l.x, elevation - l.y) / l.z;
    let warm = select(vec3f(1.0, 0.62, 0.32), vec3f(0.55, 0.8, 1.0), i % 3 == 1);
    sum += warm * l.w * exp(-dot(d, d));
  }
  return sum * params.lights * 6.0;
}

fn night_backdrop(dir: vec3f) -> vec3f {
  let y = dir.y;
  // The horizon line, hot enough to bloom, and a narrow glow either side of it.
  let line = exp(-(y / 0.003) * (y / 0.003));
  let glow = exp(-abs(y) / 0.03);
  var c = params.horizon * (vec3f(2.4, 2.8, 3.0) * line + vec3f(0.02, 0.06, 0.13) * glow);
  // Stars and the lights need the angles; most rays need neither.
  let lit = params.lights > 0.0 && abs(y) < 0.03;
  let starry = params.stars > 0.0 && y > 0.0;
  var azimuth = 0.0;
  if (lit || starry) {
    azimuth = atan2(dir.x, -dir.z);
  }
  if (y >= 0.0) {
    let sky = mix(vec3f(0.012, 0.024, 0.05), vec3f(0.002, 0.004, 0.012), pow(clamp(y, 0.0, 1.0), 0.4));
    c += sky;
    if (starry) {
      c += vec3f(0.8, 0.88, 1.0) * params.stars * sky_stars(azimuth, asin(min(y, 1.0)));
    }
  } else {
    // Dark water below, faintly giving back the glow above.
    c += vec3f(0.001, 0.002, 0.004) + params.horizon * vec3f(0.006, 0.016, 0.03) * exp(y / 0.08);
  }
  if (lit) {
    // Elevation is y itself this close to the horizon.
    c += horizon_lights(azimuth, y);
  }
  // The moon, a disc on the tangent plane at its direction, in pixels so its edge is one pixel,
  // and a faint aureole round it.
  let k = params.key_dir;
  let along = dot(dir, k);
  if (along > cos(params.moon_radius * 40.0)) {
    if (along > cos(params.moon_radius * 4.0)) {
      let right = normalize(cross(vec3f(0.0, 1.0, 0.0), k));
      let up = cross(k, right);
      let q = vec2f(dot(dir, right), -dot(dir, up)) / max(along, 1e-3) * params.px_per_rad;
      let r = params.moon_radius * params.px_per_rad;
      c += params.key_rgb * params.moon * moon_disc(q, vec2f(0.0), r, 0.5, -0.3);
    }
    let angle = acos(clamp(along, -1.0, 1.0)) / params.moon_radius;
    c += params.key_rgb * params.moon * 0.004 * moon_aureole(angle) * smoothstep(1.0, 1.5, angle);
  }
  return c;
}

fn body_backdrop(dir: vec3f) -> vec3f {
  switch params.backdrop {
    case 1u: {
      return vec3f(1.0);
    }
    case 2u: {
      return (0.2 + max(dir.y, 0.0)) * vec3f(1.0, 0.6, 0.3) + 2.0 * exp(-(dir.y / 0.1) * (dir.y / 0.1)) * vec3f(0.3, 0.6, 1.0);
    }
    default: {
      return night_backdrop(dir);
    }
  }
}

// ---- Caustics -----------------------------------------------------------------------------------

fn caustic_texel(face: u32, x: i32, y: i32) -> vec3f {
  let t = i32(params.tile);
  if (x < 0 || y < 0 || x >= t || y >= t) {
    return vec3f(0.0);
  }
  return caustic[(face * params.tile + u32(y)) * params.tile + u32(x)].rgb;
}

/// The traced caustic at `p` (view frame) on face `face`: the atlas lives in the solid's frame.
fn body_caustic(face: u32, p: vec3f) -> vec3f {
  let local = transpose(params.rotation) * p;
  let centre = faces[face * 3u];
  let q = local - centre.xyz;
  let uv = vec2f(dot(q, faces[face * 3u + 1u].xyz), dot(q, faces[face * 3u + 2u].xyz)) / centre.w;
  let texel = (uv * 0.5 + 0.5) * f32(params.tile) - 0.5;
  let base = floor(texel);
  let f = texel - base;
  let x = i32(base.x);
  let y = i32(base.y);
  let e = mix(
    mix(caustic_texel(face, x, y), caustic_texel(face, x + 1, y), f.x),
    mix(caustic_texel(face, x, y + 1), caustic_texel(face, x + 1, y + 1), f.x),
    f.y,
  );
  // A face that scatters a share `caustics` of the light on it evenly: radiance E / pi.
  return e * params.caustics / BODY_PI;
}

fn standin_glow(pixel: vec2f) -> vec3f {
  var g = 0.0;
  let s = params.standin_radius;
  for (var i = 0u; i < params.vertex_count; i++) {
    let v = params.vertices[i];
    let d = (pixel - v.xy) / s;
    let r2 = dot(d, d);
    // A tight core in a softer skirt, so it reads as a spot of light rather than a haze.
    g += v.z * (exp(-4.0 * r2) + 0.3 * exp(-0.5 * r2));
  }
  return params.standin_rgb * params.standin * g;
}

// ---- The pixel ------------------------------------------------------------------------------------

fn view_ray_origin(q: vec2f) -> vec3f {
  if (params.distance > 1e5) {
    return vec3f(q, 10.0);
  }
  return vec3f(0.0, 0.0, params.distance);
}

fn view_ray_dir(q: vec2f) -> vec3f {
  if (params.distance > 1e5) {
    return vec3f(0.0, 0.0, -1.0);
  }
  return normalize(vec3f(q, -params.distance));
}

/// The backdrop alone, at the pixel's centre, for the pixels the solid cannot reach.
@fragment fn backdrop(in: FullscreenVarying) -> @location(0) vec4f {
  let q = vec2f(in.position.x - params.center.x, params.center.y - in.position.y) / params.size;
  return vec4f(body_backdrop(view_ray_dir(q)), 0.0);
}

/// The body over the target: premultiplied, scaled up from the layer when it was traced smaller.
@fragment fn composite(in: FullscreenVarying) -> @location(0) vec4f {
  return textureSampleLevel(layer, layer_sampler, in.uv, 0.0);
}

/// The body alone into the layer (premultiplied, coverage in alpha) and the history. The layer
/// may be smaller than the target: rays are cast from the target's pixels all the same.
@fragment fn body(in: FullscreenVarying) -> BodyOut {
  let pixel = in.position.xy;
  let ip = vec2u(pixel);
  let surface = BodySurface(i32(params.bounces), params.film, params.film_ior, select(0.0, 1.0, params.caustics > 0.0), params.rotation[1], params.film_drain);
  let seed = to_unorm_3d(pcg_3d(vec3u(ip, 0x2545u)));
  var sum = vec3f(0.0);
  var cover = 0.0;
  for (var s = 0u; s < params.samples; s++) {
    // An R2 sequence over frames and samples, offset per pixel: even, never repeating.
    let k = f32(params.frame * params.samples + s);
    let r = fract(seed + k * vec3f(0.7548777, 0.5698403, 0.6180340));
    let jitter = select(vec2f(0.5), r.xy, params.jitter > 0.0);
    let at = (floor(pixel) + jitter) / params.layer_scale;
    let q = vec2f(at.x - params.center.x, params.center.y - at.y) / params.size;
    let o = view_ray_origin(q);
    let d = view_ray_dir(q);
    let hit = body_interval(o, d);
    if (hit.x > hit.y || hit.y < 0.0 || hit.x < 0.0) {
      // The backdrop pass has this pixel; the layer holds only the solid's share.
      continue;
    }
    cover += 1.0;
    if (params.mode == 0u) {
      let nm = hero_wavelengths(r.z);
      var radiance = vec4f(0.0);
      for (var i = 0; i < 4; i++) {
        let w = body_weights(nm[i]);
        let ray = BodyRay(w, nm[i], body_index(params.glass, nm[i]), max(dot(w, params.absorb), 0.0), max(dot(w, params.emission), 0.0));
        radiance[i] = body_trace(o, d, ray, surface);
      }
      sum += hero_to_rgb(nm, radiance);
    } else {
      let nm = vec3f(650.0, 550.0, 450.0);
      for (var c = 0; c < 3; c++) {
        var w = vec3f(0.0);
        w[c] = 1.0;
        let ray = BodyRay(w, nm[c], body_index(params.glass, nm[c]), params.absorb[c], params.emission[c]);
        sum[c] += body_trace(o, d, ray, surface);
      }
    }
  }
  let n = f32(params.samples);
  var current = vec4f(sum / n, cover / n);
  if (params.standin > 0.0) {
    current += vec4f(standin_glow(pixel / params.layer_scale) * current.a, 0.0);
  }
  let previous = textureLoad(history, vec2i(ip), 0);
  let blended = mix(previous, current, params.blend);
  return BodyOut(blended, blended);
}
