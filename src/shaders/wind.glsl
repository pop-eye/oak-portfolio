// ── Wind Functions ───────────────────────────────────────────
// Shared between bark and leaf shaders.
// Uses vertex color channels:
//   R = 0 for wood (reserved for leaf edge flex)
//   G = per-branch phase offset
//   B = stiffness (0=base/rigid, 1=tip/flexible)

uniform float uTime;
uniform float uWindStrength;  // 0–1, overall wind intensity
uniform vec2  uWindDirection; // normalised XZ direction

vec3 applyWind(vec3 position, float stiffness, float branchPhase) {
  // Primary sway — large-scale trunk/branch movement
  float primaryFreq = 0.8;
  float primaryAmp = uWindStrength * 1.2;
  float primaryWave = sin(uTime * primaryFreq + position.y * 0.3) * primaryAmp;

  // Weight by stiffness — base doesn't move, tips move most
  float weight = stiffness * stiffness; // quadratic falloff

  vec3 offset = vec3(0.0);
  offset.x += primaryWave * uWindDirection.x * weight;
  offset.z += primaryWave * uWindDirection.y * weight;

  // Secondary oscillation — per-branch variation
  float secFreq = 2.3;
  float secAmp = uWindStrength * 0.3;
  float secWave = sin(uTime * secFreq + branchPhase * 6.2831) * secAmp;
  offset.x += secWave * uWindDirection.x * weight * 0.5;
  offset.z += secWave * uWindDirection.y * weight * 0.5;

  // Gust variation from noise (low frequency)
  float gustPhase = uTime * 0.15 + position.x * 0.1 + position.z * 0.1;
  float gust = sin(gustPhase) * 0.5 + 0.5; // 0–1
  offset *= 0.7 + 0.3 * gust;

  return position + offset;
}
