/**
 * Seeded PRNG — mulberry32.
 * Returns a function that produces deterministic floats in [0, 1).
 * @param {number} seed
 * @returns {function(): number}
 */
export function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Linear interpolation between a and b.
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Hermite smoothstep — clamped, maps [edge0, edge1] → [0, 1].
 */
export function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Clamp value between min and max.
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Remap value from [inMin, inMax] to [outMin, outMax].
 */
export function remap(value, inMin, inMax, outMin, outMax) {
  const t = (value - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}
