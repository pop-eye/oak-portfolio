// Per-instance attributes
attribute float aWindPhase;
attribute float aColourVariation;
attribute float aBranchStiffness;

// Varyings to fragment
varying float vColourVariation;
varying vec2 vLeafUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

uniform float uTime;
uniform vec2  uWindDirection;
uniform float uWindStrength;

void main() {
  vColourVariation = aColourVariation;
  vLeafUv = uv;

  vec3 pos = csm_Position;
  float stiffness = aBranchStiffness;
  float phase = aWindPhase;
  vec3 windDir = normalize(vec3(uWindDirection.x, 0.0, uWindDirection.y));

  // === TIER 1: Primary sway (whole tree bends) ===
  float primarySway = sin(uTime * 0.5) * uWindStrength * stiffness;
  pos += windDir * primarySway;

  // === TIER 2: Secondary branch oscillation ===
  float sec1 = sin(uTime * 1.975 + phase) * 0.3;
  float sec2 = sin(uTime * 0.793 + phase * 2.0) * 0.2;
  float sec3 = sin(uTime * 0.375 + phase * 0.5) * 0.1;
  float secondary = (sec1 + sec2 + sec3) * uWindStrength * stiffness;
  pos.x += secondary * windDir.x;
  pos.z += secondary * windDir.z;
  // Slight vertical bob
  pos.y += sin(uTime * 1.2 + phase * 3.0) * uWindStrength * stiffness * 0.05;

  // === TIER 3: Tertiary leaf flutter ===
  // Edges move more than centre
  vec2 centreOffset = uv - 0.5;
  float edgeDist = length(centreOffset);

  float flutter = sin(uTime * 8.0 + phase * 12.56) * 0.02 * edgeDist;
  float flutter2 = cos(uTime * 11.3 + phase * 7.85) * 0.015 * edgeDist;
  pos += csm_Normal * (flutter + flutter2) * uWindStrength;

  // === GUST variation ===
  vec3 worldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
  float gust = sin(worldPos.x * 0.08 + worldPos.z * 0.06 + uTime * 0.2);
  gust = gust * gust * sign(gust) * 0.3;
  pos += windDir * gust * uWindStrength * stiffness;

  csm_Position = pos;

  // Pass to fragment
  vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
  vWorldNormal = normalize((modelMatrix * vec4(csm_Normal, 0.0)).xyz);
  vViewDir = normalize(cameraPosition - vWorldPosition);
}
