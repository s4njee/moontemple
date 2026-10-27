// The moon as a light source (Epic 5), shared by every effect that shows it. TypeScript twin:
// src/gpu/optics/moon.ts, which checks it.
//
// A disc of angular radius 0.26 degrees, lit by the sun from the direction its phase puts it in.
// The lunar surface scatters by Lommel-Seeliger, mu0 / (mu0 + mu), not Lambert: a full moon is
// nearly flat to its limb, which is why it looks like a coin rather than a ball. The maria are a
// few fixed soft patches of lower albedo, roughly where the near side's are, so the face is the
// one people know. `phase`: 0 new, 0.5 full, 1 new again; waxing (0 to 0.5) is lit on the right.
// `tilt` turns the face and the terminator together, radians.

const MOON_PI: f32 = 3.14159265358979;

/// Albedo of the near side at `q` (disc radii, x right, y down), 0.62 in the maria to 1.
fn moon_albedo(q: vec2f) -> f32 {
  var a = 1.0;
  // Imbrium, Serenitatis, Tranquillitatis, Crisium, Procellarum, Nubium: centre, radius, depth.
  let maria = array<vec4f, 6>(
    vec4f(-0.28, -0.38, 0.28, 0.32),
    vec4f(0.18, -0.36, 0.17, 0.3),
    vec4f(0.34, -0.08, 0.2, 0.28),
    vec4f(0.68, -0.22, 0.11, 0.3),
    vec4f(-0.56, 0.02, 0.32, 0.26),
    vec4f(-0.14, 0.38, 0.18, 0.22),
  );
  for (var i = 0; i < 6; i++) {
    let m = maria[i];
    let d = length(q - m.xy) / m.z;
    a -= m.w * (1.0 - smoothstep(0.55, 1.15, d));
  }
  return max(a, 0.62);
}

/// The moon's relative radiance at pixel `p`: 0 off the disc, about 1 at the centre of a full moon.
/// `centre` and `radius` in pixels; the edge is anti-aliased over one pixel.
fn moon_disc(p: vec2f, centre: vec2f, radius: f32, phase: f32, tilt: f32) -> f32 {
  let c = cos(tilt);
  let s = sin(tilt);
  let d = (p - centre) / radius;
  let q = vec2f(c * d.x + s * d.y, -s * d.x + c * d.y);
  let r2 = dot(q, q);
  let edge = clamp((1.0 - sqrt(r2)) * radius + 0.5, 0.0, 1.0);
  if (edge <= 0.0) {
    return 0.0;
  }
  // The surface normal facing us, and the sun's direction: behind us at full, beside at quarter.
  let n = vec3f(q.x, q.y, sqrt(max(1.0 - r2, 0.0)));
  let a = 2.0 * MOON_PI * phase;
  let sun = vec3f(sin(a), 0.0, -cos(a));
  let mu0 = max(dot(n, sun), 0.0);
  let mu = max(n.z, 1e-3);
  // Lommel-Seeliger, scaled so the centre of a full moon is 1 (mu0 = mu = 1 gives 1/2).
  let lit = 2.0 * mu0 / (mu0 + mu);
  // Earthshine: the dark part is never quite black.
  return edge * moon_albedo(q) * max(lit, 0.0008);
}

/// The aureole of thin cloud or haze round a bright light: forward scattering by droplets falls off
/// steeply with angle, about as 1 / angle^2 outside the disc. `angle` in disc radii from the centre,
/// so the aureole of a moon of any size has the same shape; 1 at the limb.
fn moon_aureole(angle: f32) -> f32 {
  let x = max(angle, 1.0);
  return 1.0 / (x * x);
}
