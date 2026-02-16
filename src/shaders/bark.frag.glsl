#include "noise.glsl"

varying vec3 vWorldPos;
varying vec3 vWorldNrm;

uniform sampler2D uBarkDiffuse;
uniform sampler2D uBarkNormal;
uniform sampler2D uBarkRoughness;
uniform sampler2D uBarkAO;
uniform float uTexScale;
uniform float uProceduralWeight;

// ── Bark height function for procedural normals ─────────────
// Defines fine bark surface: vertical fissures, domain-warped ridges
float barkHeight(vec2 p) {
  // Stretch: wider horizontally, compressed vertically
  // Creates vertical fissure pattern characteristic of English oak
  vec2 stretched = p * vec2(8.0, 2.0);

  // Domain warp for organic irregularity
  vec2 q = vec2(
    fbm2D_3(stretched),
    fbm2D_3(stretched + vec2(5.2, 1.3))
  );
  vec2 warped = stretched + 1.5 * q;

  // Primary ridges: ridged fBM creates sharp furrows
  float ridges = ridgedFBM2D(warped * vec2(1.0, 0.3), 4);

  // Secondary detail: smaller-scale cracks
  float detail = fbm2D_3(warped * 4.0) * 0.15;

  // Tertiary: very fine grain
  float grain = snoise2D(warped * 16.0) * 0.05;

  return ridges * 0.7 + detail + grain;
}

// ── Compute procedural bark normal from height via central differences ──
vec3 computeBarkNormal(vec2 pos) {
  // Coarse normals: ridge-scale
  float eps1 = 0.003;
  float hL1 = barkHeight(pos - vec2(eps1, 0.0));
  float hR1 = barkHeight(pos + vec2(eps1, 0.0));
  float hD1 = barkHeight(pos - vec2(0.0, eps1));
  float hU1 = barkHeight(pos + vec2(0.0, eps1));
  vec3 coarseNrm = vec3(hL1 - hR1, hD1 - hU1, 2.0 * eps1);

  // Fine normals: micro-crack detail
  float eps2 = 0.001;
  float hL2 = barkHeight(pos - vec2(eps2, 0.0));
  float hR2 = barkHeight(pos + vec2(eps2, 0.0));
  float hD2 = barkHeight(pos - vec2(0.0, eps2));
  float hU2 = barkHeight(pos + vec2(0.0, eps2));
  vec3 fineNrm = vec3(hL2 - hR2, hD2 - hU2, 2.0 * eps2);

  // Combine: coarse provides structure, fine adds crispness
  vec3 combined = normalize(coarseNrm) + normalize(fineNrm) * 0.4;
  return normalize(combined);
}

void main() {
  vec3 wNorm = normalize(vWorldNrm);
  vec3 wPos = vWorldPos;
  float sc = uTexScale;

  // ── Triplanar blend weights ───────────────────────────────
  vec3 blend = pow(abs(wNorm), vec3(4.0));
  blend /= (blend.x + blend.y + blend.z + 0.0001);

  // ── Triplanar diffuse sampling ────────────────────────────
  vec3 dX = texture2D(uBarkDiffuse, wPos.yz * sc).rgb;
  vec3 dY = texture2D(uBarkDiffuse, wPos.xz * sc).rgb;
  vec3 dZ = texture2D(uBarkDiffuse, wPos.xy * sc).rgb;
  vec3 diffuse = dX * blend.x + dY * blend.y + dZ * blend.z;

  // Detail overlay at 4x scale to break tiling
  vec3 dtX = texture2D(uBarkDiffuse, wPos.yz * sc * 4.0).rgb;
  vec3 dtY = texture2D(uBarkDiffuse, wPos.xz * sc * 4.0).rgb;
  vec3 dtZ = texture2D(uBarkDiffuse, wPos.xy * sc * 4.0).rgb;
  vec3 detail = dtX * blend.x + dtY * blend.y + dtZ * blend.z;
  diffuse = mix(diffuse, detail, 0.2);

  // ── Triplanar roughness sampling ──────────────────────────
  float rX = texture2D(uBarkRoughness, wPos.yz * sc).r;
  float rY = texture2D(uBarkRoughness, wPos.xz * sc).r;
  float rZ = texture2D(uBarkRoughness, wPos.xy * sc).r;
  float texRoughness = rX * blend.x + rY * blend.y + rZ * blend.z;

  // ── Triplanar AO sampling ─────────────────────────────────
  float aoX = texture2D(uBarkAO, wPos.yz * sc).r;
  float aoY = texture2D(uBarkAO, wPos.xz * sc).r;
  float aoZ = texture2D(uBarkAO, wPos.xy * sc).r;
  float texAO = aoX * blend.x + aoY * blend.y + aoZ * blend.z;

  // ── Triplanar normal map sampling (Golus method) ──────────
  // X-axis projection: tangent space is (Z, Y)
  vec3 tnX = texture2D(uBarkNormal, wPos.yz * sc).xyz * 2.0 - 1.0;
  vec3 nmX = vec3(0.0, tnX.y, -tnX.x);

  // Y-axis projection: tangent space is (X, Z)
  vec3 tnY = texture2D(uBarkNormal, wPos.xz * sc).xyz * 2.0 - 1.0;
  vec3 nmY = vec3(tnY.x, 0.0, tnY.y);

  // Z-axis projection: tangent space is (X, Y)
  vec3 tnZ = texture2D(uBarkNormal, wPos.xy * sc).xyz * 2.0 - 1.0;
  vec3 nmZ = vec3(tnZ.x, tnZ.y, 0.0);

  // Whiteout blend texture normals
  vec3 texNormal = normalize(nmX * blend.x + nmY * blend.y + nmZ * blend.z + wNorm);

  // ── Tier 3: Procedural bark normals ───────────────────────
  // Compute from each triplanar projection plane, then blend
  vec3 procNX = computeBarkNormal(wPos.yz * sc);
  vec3 procNY = computeBarkNormal(wPos.xz * sc);
  vec3 procNZ = computeBarkNormal(wPos.xy * sc);

  // Swizzle each to world space (same axes as texture normals)
  vec3 wpX = vec3(0.0, procNX.y, -procNX.x);
  vec3 wpY = vec3(procNY.x, 0.0, procNY.y);
  vec3 wpZ = vec3(procNZ.x, procNZ.y, 0.0);

  vec3 procNormal = normalize(wpX * blend.x + wpY * blend.y + wpZ * blend.z);

  // Blend texture + procedural normals
  vec3 finalNormal = normalize(texNormal + procNormal * uProceduralWeight);

  // ── Bark height for colour/roughness modulation ───────────
  // Sample height from dominant triplanar axis
  float hX = barkHeight(wPos.yz * sc);
  float hY = barkHeight(wPos.xz * sc);
  float hZ = barkHeight(wPos.xy * sc);
  float height = hX * blend.x + hY * blend.y + hZ * blend.z;

  // ── Height-driven colour variation ────────────────────────
  // Furrows: darker, cooler
  vec3 furrowTint = vec3(0.12, 0.10, 0.08);
  // Ridges: lighter, warmer
  vec3 ridgeTint = vec3(0.45, 0.35, 0.25);
  vec3 heightTint = mix(furrowTint, ridgeTint, smoothstep(0.2, 0.8, height));

  // Modulate texture diffuse with height tint
  vec3 finalDiffuse = diffuse * heightTint * 2.0;

  // ── Height-driven roughness ───────────────────────────────
  // Furrows rougher (0.95), ridges slightly smoother (0.8)
  float finalRoughness = mix(0.95, 0.8, smoothstep(0.2, 0.8, height));
  finalRoughness = mix(finalRoughness, texRoughness, 0.3);

  // ── Height-driven AO ─────────────────────────────────────
  float proceduralAO = smoothstep(0.0, 0.5, height);
  float finalAO = texAO * proceduralAO;

  // ── CSM Outputs ───────────────────────────────────────────
  csm_DiffuseColor = vec4(finalDiffuse, 1.0);
  csm_Roughness = finalRoughness;
  csm_FragNormal = finalNormal;
}
