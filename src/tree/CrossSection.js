/**
 * Non-circular cross-section generation using stacked Fourier harmonics.
 * Real English oaks have lobed, faceted trunk profiles from uneven cambial growth.
 * The harmonics' phase and amplitude drift with height for organic variation.
 */

/**
 * Compute radius at angle theta for a given height h along the trunk.
 *
 * @param {number} theta     - Angle around circumference (0 to 2π)
 * @param {number} h         - Normalised height along this branch (0=base, 1=tip)
 * @param {number} baseRadius - The base taper radius at this height
 * @param {number} seed      - Per-branch random seed
 * @param {function} noise1D - Seeded 1D noise function: (x, seedOffset) → [-1,1]
 * @returns {number} Modified radius
 */
export function getCrossSectionRadius(theta, h, baseRadius, seed, noise1D) {
  let r = baseRadius;

  // Harmonics: n=3 (triangular), n=4 (square-ish), n=5 (pentagonal), n=6
  // Amplitude decreases with frequency. Phase drifts along height.
  const harmonics = [
    { n: 3, amp: 0.08, phaseSpeed: 0.5 },
    { n: 4, amp: 0.05, phaseSpeed: 0.3 },
    { n: 5, amp: 0.03, phaseSpeed: 0.7 },
    { n: 6, amp: 0.02, phaseSpeed: 0.4 },
  ];

  // Cross-section irregularity diminishes toward branch tips
  const intensityFalloff = Math.max(0, 1.0 - h * 0.7);

  for (const harm of harmonics) {
    const phase = noise1D(h * harm.phaseSpeed + harm.n * 17.0 + seed, seed) * Math.PI * 2;
    const amp = harm.amp * (0.5 + 0.5 * noise1D(h * 0.8 + harm.n * 23.0 + seed, seed + 100));
    r += baseRadius * amp * intensityFalloff * Math.cos(harm.n * theta + phase);
  }

  return r;
}
