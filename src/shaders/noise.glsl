// ── 2D Simplex Noise (Ashima Arts / Ian McEwan) ─────────────
vec3 mod289_3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289_4(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289_2(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute3(vec3 x) { return mod289_3(((x * 34.0) + 1.0) * x); }
vec4 permute4(vec4 x) { return mod289_4(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise2D(vec2 v) {
  const vec4 C = vec4(0.211324865405187,   // (3.0-sqrt(3.0))/6.0
                      0.366025403784439,   // 0.5*(sqrt(3.0)-1.0)
                     -0.577350269189626,   // -1.0 + 2.0 * C.x
                      0.024390243902439);  // 1.0 / 41.0
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289_2(i);
  vec3 p = permute3(permute3(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// ── 3D Simplex Noise ────────────────────────────────────────
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289_3(i);
  vec4 p = permute4(permute4(permute4(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// ── fBM ─────────────────────────────────────────────────────
float fbm(vec3 p, int octaves, float persistence, float lacunarity) {
  float value = 0.0, amplitude = 1.0, frequency = 1.0, total = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    value += amplitude * snoise(p * frequency);
    total += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return value / total;
}

float fbm3(vec3 p) { return fbm(p, 3, 0.5, 2.0); }
float fbm4(vec3 p) { return fbm(p, 4, 0.5, 2.0); }

float fbm2D(vec2 p, int octaves, float persistence, float lacunarity) {
  float value = 0.0, amplitude = 1.0, frequency = 1.0, total = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    value += amplitude * snoise2D(p * frequency);
    total += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return value / total;
}

float fbm2D_3(vec2 p) { return fbm2D(p, 3, 0.5, 2.0); }
float fbm2D_4(vec2 p) { return fbm2D(p, 4, 0.5, 2.0); }

// ── Ridged fBM ──────────────────────────────────────────────
float ridgedFBM(vec3 p, int octaves) {
  float value = 0.0, amplitude = 1.0, frequency = 1.0, total = 0.0, prev = 1.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    float n = 1.0 - abs(snoise(p * frequency));
    n = n * n * prev;
    value += amplitude * n;
    total += amplitude;
    prev = n;
    amplitude *= 0.5;
    frequency *= 2.2;
  }
  return value / total;
}

float ridgedFBM2D(vec2 p, int octaves) {
  float value = 0.0, amplitude = 1.0, frequency = 1.0, total = 0.0, prev = 1.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    float n = 1.0 - abs(snoise2D(p * frequency));
    n = n * n * prev;
    value += amplitude * n;
    total += amplitude;
    prev = n;
    amplitude *= 0.5;
    frequency *= 2.2;
  }
  return value / total;
}

// ── Worley / Cellular Noise ─────────────────────────────────
vec2 worley(vec3 p) {
  vec3 pi = floor(p);
  vec3 pf = fract(p);
  float d1 = 1e10, d2 = 1e10;

  for (int x = -1; x <= 1; x++)
  for (int y = -1; y <= 1; y++)
  for (int z = -1; z <= 1; z++) {
    vec3 offset = vec3(float(x), float(y), float(z));
    vec3 cell = pi + offset;
    vec3 rnd = fract(sin(vec3(
      dot(cell, vec3(127.1, 311.7, 74.7)),
      dot(cell, vec3(269.5, 183.3, 246.1)),
      dot(cell, vec3(113.5, 271.9, 124.6))
    )) * 43758.5453);
    vec3 diff = offset + rnd - pf;
    float dist = dot(diff, diff);
    if (dist < d1) { d2 = d1; d1 = dist; }
    else if (dist < d2) { d2 = dist; }
  }
  return vec2(sqrt(d1), sqrt(d2));
}

// ── Domain Warping ──────────────────────────────────────────
float domainWarp(vec3 p, float warpStrength) {
  vec3 q = vec3(
    fbm3(p),
    fbm3(p + vec3(5.2, 1.3, 2.8)),
    fbm3(p + vec3(1.7, 9.2, 4.1))
  );
  vec3 r = vec3(
    fbm3(p + warpStrength * q + vec3(1.7, 9.2, 0.0)),
    fbm3(p + warpStrength * q + vec3(8.3, 2.8, 0.0)),
    fbm3(p + warpStrength * q + vec3(3.1, 6.5, 0.0))
  );
  return fbm3(p + warpStrength * r);
}
