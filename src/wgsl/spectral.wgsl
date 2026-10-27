// Spectral light (story 9.1): wavelengths to linear sRGB, and hero-wavelength sampling. TypeScript
// twin: src/gpu/optics/spectral.ts, which the tests check this against.
//
// `spectral_rgb` is Alan Zucconi's six-bump fit to the colours of the spectrum (Light Temple's
// `spectral_rgb`): non-negative everywhere, so no wavelength leaves sRGB once the tonemap clips.
// Divided by `SPECTRAL_WHITE`, its mean over 400 to 700 nm, a flat spectrum sums to white.
//
// Hero-wavelength sampling (Wilkie et al. 2014): `hero_wavelengths(u)` gives one wavelength from a
// uniform u and three more a quarter of the range apart, wrapped round, so one traced path carries
// four colours that always span the spectrum. `hero_to_rgb(nm, radiance)` is that sample in RGB.

const SPECTRUM_MIN: f32 = 400.0;
const SPECTRUM_MAX: f32 = 700.0;
const SPECTRAL_WHITE: vec3f = vec3f(0.383108, 0.371232, 0.224655);

fn spectral_bump(x: f32, y: f32) -> f32 {
  return clamp(1.0 - x * x - y, 0.0, 1.0);
}

/// Linear RGB of a wavelength in nm (400 to 700), roughly equal energy, not yet white-balanced.
fn spectral_rgb(nm: f32) -> vec3f {
  let x = clamp((nm - 400.0) / 300.0, 0.0, 1.0);
  return vec3f(
    spectral_bump(3.54585104 * (x - 0.69549072), 0.02312639) + spectral_bump(3.9030714 * (x - 0.11748627), 0.8489713),
    spectral_bump(2.93225262 * (x - 0.49228336), 0.15225084) + spectral_bump(3.21182957 * (x - 0.86755042), 0.88445281),
    spectral_bump(2.41593945 * (x - 0.2769988), 0.52607955) + spectral_bump(3.96587128 * (x - 0.6607786), 0.73949448),
  );
}

fn hero_wavelengths(u: f32) -> vec4f {
  let span = SPECTRUM_MAX - SPECTRUM_MIN;
  return SPECTRUM_MIN + fract(vec4f(u) + vec4f(0.0, 0.25, 0.5, 0.75)) * span;
}

fn hero_to_rgb(nm: vec4f, radiance: vec4f) -> vec3f {
  let sum = spectral_rgb(nm.x) * radiance.x + spectral_rgb(nm.y) * radiance.y +
    spectral_rgb(nm.z) * radiance.z + spectral_rgb(nm.w) * radiance.w;
  return sum / (4.0 * SPECTRAL_WHITE);
}

/// Sellmeier, lambda in micrometres.
fn sellmeier3(nm: f32, b: vec3f, c: vec3f) -> f32 {
  let l2 = (nm / 1000.0) * (nm / 1000.0);
  return sqrt(1.0 + dot(b * l2 / (vec3f(l2) - c), vec3f(1.0)));
}

/// Refractive index by glass: 0 crown (N-BK7), 1 flint (F2), 2 diamond.
fn glass_index(glass: u32, nm: f32) -> f32 {
  switch glass {
    case 1u: {
      return sellmeier3(nm, vec3f(1.34533359, 0.209073176, 0.937357162), vec3f(0.00997743871, 0.0470450767, 111.886764));
    }
    case 2u: {
      return sellmeier3(nm, vec3f(4.3356, 0.3306, 0.0), vec3f(0.011236, 0.030625, 1.0));
    }
    default: {
      return sellmeier3(nm, vec3f(1.03961212, 0.231792344, 1.01046945), vec3f(0.00600069867, 0.0200179144, 103.560653));
    }
  }
}
