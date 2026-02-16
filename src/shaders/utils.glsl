// ── Shared Shader Utilities ──────────────────────────────────

float remap(float value, float inMin, float inMax, float outMin, float outMax) {
  return outMin + (value - inMin) / (inMax - inMin) * (outMax - outMin);
}

float saturate(float x) { return clamp(x, 0.0, 1.0); }
vec3 saturate3(vec3 x) { return clamp(x, 0.0, 1.0); }
