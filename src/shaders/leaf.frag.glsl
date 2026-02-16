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

void main() {
  // Alpha test
  vec4 texColour = texture2D(uLeafTexture, vLeafUv);
  if (texColour.a < 0.5) discard;

  // === COLOUR VARIATION — 3 green tones ===
  vec3 deepGreen = vec3(0.12, 0.28, 0.06);
  vec3 midGreen = vec3(0.20, 0.42, 0.10);
  vec3 yellowGreen = vec3(0.35, 0.48, 0.12);

  vec3 leafColour;
  if (vColourVariation < 0.5) {
    leafColour = mix(deepGreen, midGreen, vColourVariation * 2.0);
  } else {
    leafColour = mix(midGreen, yellowGreen, (vColourVariation - 0.5) * 2.0);
  }

  // === AUTUMN TONES (optional, controlled by uSeasonMix) ===
  vec3 autumnDeep = vec3(0.55, 0.15, 0.05);
  vec3 autumnMid = vec3(0.75, 0.35, 0.08);
  vec3 autumnLight = vec3(0.85, 0.65, 0.12);

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

  // Warm yellow-green glow when backlit
  vec3 transColour = leafColour * vec3(1.3, 1.2, 0.5) * VdotH * uTranslucencyScale;
  csm_Emissive = transColour;

  // === ROUGHNESS ===
  csm_Roughness = 0.6;
}
