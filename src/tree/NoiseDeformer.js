import { SimplexNoise } from '../utils/SimplexNoise.js';
import { mulberry32, smoothstep } from '../utils/math.js';

/**
 * Layered noise deformation for trunk/branch mesh vertices.
 * Each layer is applied in sequence during mesh generation.
 */
export class NoiseDeformer {
  constructor(config, seed) {
    this.config = config;
    const rng = mulberry32(seed);
    this.simplex = new SimplexNoise(rng);
  }

  // ── Layer 1: Spine Noise ────────────────────────────────────
  /**
   * Perturb a spline sample point before cross-section generation.
   * Thin branches wobble more than the thick trunk.
   *
   * @param {THREE.Vector3} point - mutated in place
   * @param {number} t - normalised position along branch (0→1)
   * @param {number} radius - local branch radius
   * @param {number} branchSeed - per-branch seed
   */
  applySpineNoise(point, t, radius, branchSeed) {
    const gnarliness = this.config.gnarliness;
    // Amplitude inversely proportional to sqrt(radius): thin branches wobble more
    const intensity = Math.max(1, 1 / Math.sqrt(Math.max(0.01, radius))) * gnarliness;
    const freq = 0.8;

    const px = point.x * freq;
    const py = point.y * freq;
    const pz = point.z * freq;

    const dx = this.simplex.noise3D(px, py, pz + branchSeed) * intensity * 0.15;
    const dz = this.simplex.noise3D(px + 100, py, pz + branchSeed) * intensity * 0.15;

    point.x += dx;
    point.z += dz;
  }

  // ── Layer 2: Surface fBM ────────────────────────────────────
  /**
   * Compute surface displacement along outward normal.
   * 3-octave fBM scaled by local radius for consistent texture density.
   *
   * @param {THREE.Vector3} worldPos - vertex world position
   * @param {number} radius - local branch radius
   * @returns {number} displacement amount
   */
  surfaceFBM(worldPos, radius) {
    const intensity = this.config.surfaceNoiseIntensity;
    const baseFreq = this.config.surfaceNoiseFrequency;
    const octaves = this.config.surfaceNoiseOctaves;

    let value = 0;
    let amplitude = 1;
    let frequency = baseFreq;
    let total = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.simplex.noise3D(
        worldPos.x * frequency,
        worldPos.y * frequency,
        worldPos.z * frequency
      );
      total += amplitude;
      amplitude *= 0.5;
      frequency *= 2.0;
    }

    return (value / total) * radius * intensity;
  }

  // ── Layer 3: Root Flare ─────────────────────────────────────
  /**
   * Compute root flare displacement. Only active below flareHeight.
   *
   * @param {number} theta - angle around circumference
   * @param {number} height - world-space Y of this vertex
   * @param {number} baseRadius - local taper radius
   * @returns {number} additional radius
   */
  rootFlare(theta, height, baseRadius) {
    const { flareHeight, flareAmount, lobeCount } = this.config;
    if (height > flareHeight) return 0;

    const falloff = Math.pow(Math.max(0, 1 - height / flareHeight), 2);
    const lobeSeed = 3.7; // fixed seed for lobe pattern
    const lobePattern = 0.5 + 0.5 * Math.sin(theta * lobeCount + lobeSeed);
    const noiseModulation = 0.7 + 0.3 * this.simplex.noise3D(theta * 2, height * 3, 0);

    return baseRadius * flareAmount * falloff * lobePattern * noiseModulation;
  }

  // ── Layer 4: Burls ──────────────────────────────────────────
  /**
   * Compute burl displacement for a vertex.
   *
   * @param {THREE.Vector3} vertexPos - vertex world position
   * @param {Array} burls - array of { center: Vector3, radius: number, height: number }
   * @returns {number} displacement along normal
   */
  burlDisplacement(vertexPos, burls) {
    let totalDisp = 0;
    for (const burl of burls) {
      const dist = vertexPos.distanceTo(burl.center);
      if (dist > burl.radius * 1.5) continue;
      const falloff = smoothstep(burl.radius, 0, dist);
      // Secondary wrinkle using fBM at high frequency
      const wrinkle = 1 + 0.3 * this.simplex.noise3D(
        vertexPos.x * 12,
        vertexPos.y * 12,
        vertexPos.z * 12
      );
      totalDisp += burl.height * falloff * wrinkle;
    }
    return totalDisp;
  }
}
