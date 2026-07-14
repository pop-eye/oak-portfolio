varying float vColourVariation;
varying vec2 vLeafUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

uniform sampler2D uLeafTexture;
uniform vec3 uLightDirection;
uniform float uTranslucencyPower;
uniform float uTranslucencyScale;
uniform float uSeasonMix;
uniform float uMonochrome; // 0=colour  1=dark-mono  -1=light-mono

void main() {
  // Alpha test
  vec4 texColour = texture2D(uLeafTexture, vLeafUv);
  if (texColour.a < 0.5) discard;

  // === COLOUR VARIATION — 3 tones, mode-aware ===
  vec3 deepGreen, midGreen, yellowGreen;
  if (uMonochrome > 0.5) {
    deepGreen   = vec3(0.72, 0.74, 0.76);
    midGreen    = vec3(0.84, 0.86, 0.88);
    yellowGreen = vec3(0.93, 0.95, 0.96);
  } else if (uMonochrome < -0.5) {
    deepGreen   = vec3(0.10, 0.10, 0.10);
    midGreen    = vec3(0.20, 0.20, 0.20);
    yellowGreen = vec3(0.30, 0.30, 0.30);
  } else {
    deepGreen   = vec3(0.12, 0.28, 0.06);
    midGreen    = vec3(0.20, 0.42, 0.10);
    yellowGreen = vec3(0.35, 0.48, 0.12);
  }

  vec3 leafColour;
  if (vColourVariation < 0.5) {
    leafColour = mix(deepGreen, midGreen, vColourVariation * 2.0);
  } else {
    leafColour = mix(midGreen, yellowGreen, (vColourVariation - 0.5) * 2.0);
  }

  // === AUTUMN TONES (optional, controlled by uSeasonMix) ===
  vec3 autumnDeep, autumnMid, autumnLight;
  if (uMonochrome > 0.5) {
    autumnDeep  = vec3(0.68, 0.70, 0.72);
    autumnMid   = vec3(0.80, 0.82, 0.84);
    autumnLight = vec3(0.90, 0.92, 0.94);
  } else if (uMonochrome < -0.5) {
    autumnDeep  = vec3(0.08, 0.08, 0.08);
    autumnMid   = vec3(0.16, 0.16, 0.16);
    autumnLight = vec3(0.24, 0.24, 0.24);
  } else {
    autumnDeep  = vec3(0.55, 0.15, 0.05);
    autumnMid   = vec3(0.75, 0.35, 0.08);
    autumnLight = vec3(0.85, 0.65, 0.12);
  }

  vec3 autumnColour;
  if (vColourVariation < 0.5) {
    autumnColour = mix(autumnDeep, autumnMid, vColourVariation * 2.0);
  } else {
    autumnColour = mix(autumnMid, autumnLight, (vColourVariation - 0.5) * 2.0);
  }
  leafColour = mix(leafColour, autumnColour, uSeasonMix);

  // Modulate by texture luminance for within-leaf variation
  float texLum = dot(texColour.rgb, vec3(0.299, 0.587, 0.114));
  leafColour *= 0.7 + texLum * 0.6;

  csm_DiffuseColor = vec4(leafColour, 1.0);

  // === TRANSLUCENCY / SSS ===
  vec3 L = normalize(uLightDirection);
  vec3 V = normalize(vViewDir);
  vec3 N = normalize(vWorldNormal);

  // Distorted half-vector (Barré-Brisebois / Bouchard approximation)
  vec3 H = normalize(L + N * 0.3);
  float VdotH = pow(clamp(dot(V, -H), 0.0, 1.0), uTranslucencyPower);

  // Backlit glow colour varies by mode
  vec3 transBase = uMonochrome > 0.5  ? vec3(1.3, 1.3, 1.35)
                 : uMonochrome < -0.5 ? vec3(0.7, 0.7, 0.70)
                 : vec3(1.3, 1.2, 0.5);
  vec3 transColour = leafColour * transBase * VdotH * uTranslucencyScale;
  csm_Emissive = transColour;

  // === ROUGHNESS ===
  csm_Roughness = 0.6;
}
