#include "noise.glsl"

// Wind uniforms
uniform float uTime;
uniform float uWindStrength;
uniform vec2  uWindDirection;

// Varyings to fragment
varying vec3 vWorldPos;
varying vec3 vWorldNrm;

void main() {
  // Read wind encoding from vertex colours
  float stiffness = color.b;      // 0=base, 1=tips
  float branchPhase = color.g;    // per-branch random phase

  vec3 pos = csm_Position;
  vec3 nrm = csm_Normal;

  // ── Tier 2: Medium bark ridge displacement ────────────────
  // Anisotropic noise — higher freq horizontally, lower vertically
  // creates the vertical fissure pattern of English oak bark
  vec3 noiseCoord = pos * vec3(8.0, 2.0, 8.0);
  float ridgeDisp = ridgedFBM(noiseCoord, 3);
  float smoothDisp = fbm3(pos * 3.0);
  float totalDisp = ridgeDisp * 0.015 + smoothDisp * 0.008;
  pos += nrm * totalDisp;

  // ── Wind displacement ─────────────────────────────────────
  float weight = stiffness * stiffness;

  // Primary sway
  float primaryWave = sin(uTime * 0.8 + pos.y * 0.3) * uWindStrength * 1.2;
  pos.x += primaryWave * uWindDirection.x * weight;
  pos.z += primaryWave * uWindDirection.y * weight;

  // Secondary per-branch oscillation
  float sec1 = sin(uTime * 1.975 + branchPhase * 6.2831) * 0.3;
  float sec2 = sin(uTime * 0.793 + branchPhase * 12.56) * 0.2;
  float secondary = (sec1 + sec2) * uWindStrength * weight;
  pos.x += secondary * uWindDirection.x;
  pos.z += secondary * uWindDirection.y;

  // Gust variation
  float gust = sin(uTime * 0.15 + pos.x * 0.1 + pos.z * 0.1) * 0.5 + 0.5;
  pos.x += gust * uWindStrength * weight * 0.15 * uWindDirection.x;
  pos.z += gust * uWindStrength * weight * 0.15 * uWindDirection.y;

  csm_Position = pos;

  // Pass world-space data to fragment
  vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
  vWorldNrm = normalize((modelMatrix * vec4(nrm, 0.0)).xyz);
}
