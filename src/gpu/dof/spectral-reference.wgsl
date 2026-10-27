#include "scene.wgsl"
#include "spectral.wgsl"

// The depth-of-field reference traced spectrally (story 9.7): story 3.1's distributed ray tracing
// through the thin lens, with each ray carrying four hero wavelengths (Wilkie et al. 2014, story
// 9.1) and each wavelength focused at its own distance. The shots are scene.wgsl's, included
// whole, plus three built for fringes: bright white points at many depths on black (`scene` 3), the
// same with two bright bars, one behind focus and one in front (`scene` 4), and the bars alone
// (`scene` 5).
//
// Longitudinal chromatic aberration: the sensor stays where it is and the lens's power changes
// with the wavelength by a share delta, so a wavelength is in focus at 1/S' = 1/S + delta / f.
// `view.power` holds delta / f (times the aberration's amount) at 64 wavelengths from 400 to
// 700 nm (src/gpu/optics/lca.ts, `powerTable`). A ray from a point on the lens towards that
// wavelength's plane of focus through the pixel: the pinhole ray scaled to S'. The lens and the
// pixel's jitter are shared by the four wavelengths of a ray, so they differ only in focus.
//
// The scenes' colours are RGB. Each channel's light is spread over the wavelengths that channel
// responds to (`spectral_rgb`, white-balanced): a white surface is an equal-energy spectrum, and
// a coloured one keeps its colour when nothing disperses it.

/// The fringe shots' black backdrop, metres away.
const FRINGE_FAR: f32 = 100.0;

fn fringe_trace(o: vec3f, d: vec3f) -> Hit {
  var best = Hit(vec3f(0.0), FRINGE_FAR);
  // Metres per pixel at 1 m.
  let pixel = view.view_scale / view.out_size.y;
  let size = view.out_size;
  if (view.scene >= 4u) {
    // A tall bar behind focus, and a long thin one in front: fractions of the frame, white.
    let far_bar = vec4f(0.78, 0.08, 0.86, 0.46);
    let near_bar = vec4f(0.06, 0.84, 0.5, 0.9);
    let bars = array<vec4f, 2>(far_bar, near_bar);
    let depths = array<f32, 2>(view.bar_depth.x, view.bar_depth.y);
    for (var i = 0; i < 2; i++) {
      let z = depths[i];
      if (z >= best.depth) {
        continue;
      }
      let p = (o + d * ((z - o.z) / d.z)).xy / (pixel * z) + 0.5 * size;
      let b = bars[i] * vec4f(size, size);
      if (p.x > b.x && p.x < b.z && p.y > b.y && p.y < b.w) {
        best = Hit(vec3f(view.bar_level), z);
      }
    }
  }
  let count = select(u32(view.point_count), 0u, view.scene == 5u);
  for (var i = 0u; i < count; i++) {
    let point = view.points[i];
    let z = point.z;
    if (z >= best.depth) {
      continue;
    }
    let p = (o + d * ((z - o.z) / d.z)).xy;
    let centre = (point.xy - 0.5 * size) * pixel * z;
    let r = view.point_radius * pixel * z;
    let q = p - centre;
    if (dot(q, q) < r * r) {
      best = Hit(vec3f(point.w), z);
    }
  }
  return best;
}

fn shot_trace(o: vec3f, d: vec3f) -> Hit {
  if (view.scene >= 3u) {
    return fringe_trace(o, d);
  }
  return scene_trace(o, d);
}

@fragment fn spectral_pinhole(in: FullscreenVarying) -> Sharp {
  var sum = vec3f(0.0);
  for (var j = 0; j < 4; j++) {
    for (var i = 0; i < 4; i++) {
      let px = floor(in.position.xy) + (vec2f(f32(i), f32(j)) + 0.5) / 4.0;
      sum += shot_trace(vec3f(view.pan, 0.0, 0.0), pinhole_ray(px)).colour;
    }
  }
  let centre = shot_trace(vec3f(view.pan, 0.0, 0.0), pinhole_ray(in.position.xy));
  return Sharp(vec4f(sum / 16.0, 1.0), centre.depth);
}

/// delta / f at `nm`, from the 64-entry table.
fn power_at(nm: f32) -> f32 {
  var table = view.power;
  let f = clamp((nm - SPECTRUM_MIN) / (SPECTRUM_MAX - SPECTRUM_MIN), 0.0, 1.0) * 63.0;
  let i = min(u32(floor(f)), 62u);
  let j = i + 1u;
  return mix(table[i / 4u][i % 4u], table[j / 4u][j % 4u], f - f32(i));
}

@fragment fn spectral_reference(in: ReferenceVarying) -> @location(0) vec4f {
  let pixel = vec2i(in.position.xy);
  let rotation = ihash_2to2(pixel + vec2i(91, 37) + vec2i(i32(view.seed) * 7919, i32(view.seed) * 104729));
  let hue = ihash_2to1(pixel + vec2i(13, 59) + vec2i(i32(view.seed) * 3571, 0));
  var a = Aperture(
    view.blades, view.rotation, view.curvature, 1.0, 0.0, 0.0, 1.0, 0.0, vec2f(0.0),
    0.0, 1.0, 0.0, array<vec4f, 16>());
  var sum = vec3f(0.0);
  var weights = 0.0;
  let count = u32(view.samples);
  for (var i = 0u; i < count; i++) {
    let n = f32(in.batch * count + i);
    let u = fract(rotation + vec2f(0.7548776662, 0.5698402910) * n);
    let jitter = fract(vec2f(0.38196601, 0.61803399) * n + rotation.yx);
    // The ray's four wavelengths, a quarter of the range apart, from a third sequence.
    let nm = hero_wavelengths(fract(hue + 0.7236067977 * n));
    let theta = 2.0 * APERTURE_PI * u.x;
    let reach = aperture_radius(theta, a);
    let lens = vec2f(cos(theta), sin(theta)) * sqrt(u.y) * reach * view.lens_radius;
    let origin = vec3f(lens.x + view.pan, lens.y, 0.0);
    let ray = pinhole_ray(floor(in.position.xy) + jitter);
    var light = vec3f(0.0);
    for (var k = 0; k < 4; k++) {
      let focus = 1.0 / max(1.0 / view.focus + power_at(nm[k]), 1e-4);
      let towards = ray * focus + vec3f(view.pan, 0.0, 0.0);
      let hit = shot_trace(origin, normalize(towards - origin));
      light += spectral_rgb(nm[k]) * hit.colour;
    }
    let w = reach * reach;
    sum += light / (4.0 * SPECTRAL_WHITE) * w;
    weights += w;
  }
  let batch = sum / max(weights, 1e-6);
  let k = f32(in.batch);
  let before = textureLoad(previous, pixel, 0).rgb;
  return vec4f((before * k + batch) / (k + 1.0), 1.0);
}
