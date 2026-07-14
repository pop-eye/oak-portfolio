import * as THREE from 'three';
import { mulberry32 } from '../utils/math.js';
import { SimplexNoise } from '../utils/SimplexNoise.js';
import { TREE_CONFIG } from '../config.js';

/**
 * Space colonization algorithm for generating an organic tree skeleton.
 * Reference: Runions, Lane, Prusinkiewicz (2007)
 */
export class SpaceColonization {
  constructor(config = TREE_CONFIG) {
    this.config = config;
    this.rng = mulberry32(config.seed);
    this.nodes = [];       // { position, parentIndex, depth, thickness, childCount }
    this.attractors = [];  // THREE.Vector3[]
  }

  /**
   * Run the full algorithm and return the node graph.
   */
  async generate() {
    this._generateAttractors();
    this._seedTrunk();
    await this._grow();
    this._pruneBursts();
    this._computeThickness();
    return this.nodes;
  }

  /**
   * Scatter attractor points within an oblate ellipsoid crown envelope.
   * Uses rejection sampling.
   */
  _generateAttractors() {
    const { crownRadiusX, crownRadiusY, crownRadiusZ, crownCenterY, attractorCount } = this.config;
    const rng = this.rng;
    this.attractors = [];

    // Use a separate seed for the boundary noise so it does not consume the
    // shared rng sequence (which drives growth) — tree shape stays deterministic.
    const boundaryNoise = new SimplexNoise(mulberry32(this.config.seed + 9999));

    // Sample a box slightly larger than the ellipsoid to reach the noisiest
    // outward lobes (max possible boundary ≈ 1.0 + 0.42 + 0.14 + 0.06 = 1.62).
    const margin = 1.70;

    while (this.attractors.length < attractorCount) {
      const x = (rng() * 2 - 1) * crownRadiusX * margin;
      const y = (rng() * 2 - 1) * crownRadiusY * margin + crownCenterY;
      const z = (rng() * 2 - 1) * crownRadiusZ * margin;

      const nx = x / crownRadiusX;
      const ny = (y - crownCenterY) / crownRadiusY;
      const nz = z / crownRadiusZ;
      const r2 = nx * nx + ny * ny + nz * nz;
      const r = Math.sqrt(r2);

      // Unit-sphere direction — safe at any non-zero radius.
      const invR = r > 0.01 ? 1 / r : 0;
      const ux = nx * invR;
      const uy = ny * invR;
      const uz = nz * invR;

      // Three noise octaves on the unit-sphere direction:
      //  • Very low frequency  → 2-3 large lobes with dramatically different reach
      //  • Medium frequency    → smaller surface bumps, breaks uniform silhouette
      //  • Fine frequency      → high-frequency wrinkles for twig-scale variation
      const bigLumps   = boundaryNoise.noise3D(ux * 0.9, uy * 0.9, uz * 0.9) * 0.42;
      const medDetail  = boundaryNoise.noise3D(ux * 2.8, uy * 2.8, uz * 2.8) * 0.14;
      const fineDetail = boundaryNoise.noise3D(ux * 6.0, uy * 6.0, uz * 6.0) * 0.06;
      const noisyBoundary = 1.0 + bigLumps + medDetail + fineDetail;

      if (r > noisyBoundary) continue;

      // Soft density falloff in the outer 35% of each lobe so branch tips
      // thin out gradually instead of stopping at a hard boundary.
      const normalizedR = r / noisyBoundary;
      const taperStart = 0.65;
      if (normalizedR > taperStart) {
        const outerFraction = (normalizedR - taperStart) / (1.0 - taperStart);
        if (rng() < 0.92 * outerFraction) continue;
      }

      this.attractors.push(new THREE.Vector3(x, y, z));
    }
  }

  /**
   * Pre-seed trunk column from ground to crown base.
   */
  _seedTrunk() {
    const { trunkHeight, segmentLength } = this.config;
    const trunkSegments = Math.ceil(trunkHeight / segmentLength);

    for (let i = 0; i <= trunkSegments; i++) {
      const t = i / trunkSegments;
      this.nodes.push({
        position: new THREE.Vector3(0, t * trunkHeight, 0),
        parentIndex: i === 0 ? -1 : i - 1,
        depth: i,
        thickness: 0,
        childCount: 0,
      });
    }

    // Update child counts for trunk chain
    for (let i = 0; i < trunkSegments; i++) {
      this.nodes[i].childCount = 1;
    }
  }

  /**
   * Main growth loop.
   */
  async _grow() {
    const { influenceRadius, killDistance, segmentLength, maxIterations } = this.config;
    const rng = this.rng;

    for (let iter = 0; iter < maxIterations; iter++) {
      if (this.attractors.length === 0) break;

      // For each attractor find nearest node within influence radius
      const nodeInfluences = new Map(); // nodeIndex → [attractor directions]

      for (let ai = this.attractors.length - 1; ai >= 0; ai--) {
        const attr = this.attractors[ai];
        let closestIdx = -1;
        let closestDist = Infinity;

        for (let ni = 0; ni < this.nodes.length; ni++) {
          const dist = attr.distanceTo(this.nodes[ni].position);
          if (dist < closestDist) {
            closestDist = dist;
            closestIdx = ni;
          }
        }

        // Kill attractor if too close
        if (closestDist < killDistance) {
          this.attractors.splice(ai, 1);
          continue;
        }

        // Record influence if within range
        if (closestDist < influenceRadius) {
          if (!nodeInfluences.has(closestIdx)) {
            nodeInfluences.set(closestIdx, []);
          }
          const dir = attr.clone().sub(this.nodes[closestIdx].position).normalize();
          nodeInfluences.get(closestIdx).push(dir);
        }
      }

      if (nodeInfluences.size === 0) continue;

      // Grow new nodes
      for (const [nodeIdx, directions] of nodeInfluences) {
        // Average direction toward attractors
        const avgDir = new THREE.Vector3();
        for (const d of directions) avgDir.add(d);
        avgDir.normalize();

        // Gravitropism: lerp the growth direction toward its horizontal
        // projection, reducing the steepness of upward-growing branches.
        // Branches with no horizontal component are left to the random
        // perturbation below to seed lateral variation naturally.
        const grav = this.config.gravitropism || 0;
        if (grav > 0) {
          const hLen = Math.sqrt(avgDir.x * avgDir.x + avgDir.z * avgDir.z);
          if (hLen > 0.05) {
            const hx = avgDir.x / hLen;
            const hz = avgDir.z / hLen;
            avgDir.x = avgDir.x * (1 - grav) + hx * grav;
            avgDir.y = avgDir.y * (1 - grav);
            avgDir.z = avgDir.z * (1 - grav) + hz * grav;
            avgDir.normalize();
          }
        }

        // Add small random perturbation (±0.1 radians)
        avgDir.x += (rng() - 0.5) * 0.2;
        avgDir.y += (rng() - 0.5) * 0.2;
        avgDir.z += (rng() - 0.5) * 0.2;
        avgDir.normalize();

        const newPos = this.nodes[nodeIdx].position.clone().add(
          avgDir.multiplyScalar(segmentLength)
        );

        const newNode = {
          position: newPos,
          parentIndex: nodeIdx,
          depth: this.nodes[nodeIdx].depth + 1,
          thickness: 0,
          childCount: 0,
        };

        this.nodes[nodeIdx].childCount++;
        this.nodes.push(newNode);
      }

      // Yield to the browser every 20 iterations so the loading animation
      // keeps rendering — critical on mobile where each batch can take >10 ms.
      if (iter % 20 === 0) await new Promise(r => setTimeout(r, 0));
    }
  }

  /**
   * Prune "burst" clusters — fork nodes in the outer canopy where many
   * short terminal branches radiate out due to simultaneous attractor
   * capture at the crown boundary.  For any fork with 3+ children that
   * are all very short (≤ BURST_THRESHOLD nodes deep), only the two
   * longest children are kept; the rest are removed before thickness
   * is computed so Leonardo's model is unaffected.
   */
  _pruneBursts() {
    const n = this.nodes.length;

    // Build children list.
    const children = new Array(n);
    for (let i = 0; i < n; i++) children[i] = [];
    for (let i = 0; i < n; i++) {
      if (this.nodes[i].parentIndex >= 0)
        children[this.nodes[i].parentIndex].push(i);
    }

    // BFS pre-order so we can process parents before children.
    const order = [];
    const visited = new Uint8Array(n);
    const stack = [0];
    while (stack.length) {
      const idx = stack.pop();
      if (visited[idx]) continue;
      visited[idx] = 1;
      order.push(idx);
      for (const c of children[idx]) stack.push(c);
    }

    // Compute max path-length to any terminal descendant (bottom-up).
    const maxTipDist = new Uint16Array(n);
    for (let i = order.length - 1; i >= 0; i--) {
      const idx = order[i];
      let mx = 0;
      for (const c of children[idx]) {
        if (maxTipDist[c] + 1 > mx) mx = maxTipDist[c] + 1;
      }
      maxTipDist[idx] = mx;
    }

    // Mark burst subtrees.  A "burst" fork has ≥3 children that are all
    // short (maxTipDist < BURST_THRESHOLD).  Keep the 2 longest; prune
    // the rest entirely (including their descendants).
    const BURST_THRESHOLD = 5;
    const pruned = new Uint8Array(n);

    for (const parentIdx of order) {
      const live = children[parentIdx].filter(c => !pruned[c]);
      if (live.length < 3) continue;

      const shortOnes = live.filter(c => maxTipDist[c] < BURST_THRESHOLD);
      if (shortOnes.length < 3) continue; // not a burst

      // Sort all live children longest-first; prune from index 2 onward.
      live.sort((a, b) => maxTipDist[b] - maxTipDist[a]);
      for (let j = 2; j < live.length; j++) {
        if (maxTipDist[live[j]] < BURST_THRESHOLD) {
          const sub = [live[j]];
          while (sub.length) {
            const s = sub.pop();
            pruned[s] = 1;
            for (const c of children[s]) sub.push(c);
          }
        }
      }
    }

    const pruneCount = pruned.reduce((s, v) => s + v, 0);
    if (pruneCount === 0) return;

    // Rebuild node array with updated parent indices.
    const mapping = new Int32Array(n).fill(-1);
    let ni = 0;
    const newNodes = [];
    for (let i = 0; i < n; i++) {
      if (!pruned[i]) { mapping[i] = ni++; newNodes.push(this.nodes[i]); }
    }
    for (const node of newNodes) {
      if (node.parentIndex >= 0) node.parentIndex = mapping[node.parentIndex];
    }
    this.nodes = newNodes;
    console.log(`[SpaceColonization] Pruned ${pruneCount} burst nodes`);
  }

  /**
   * Leonardo's pipe model — traverse leaves to root accumulating thickness.
   */
  _computeThickness() {
    const n = this.config.pipeExponent;
    const nodes = this.nodes;

    // Find leaf nodes (childCount === 0)
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].childCount === 0) {
        nodes[i].thickness = 1;
      }
    }

    // Build children map for bottom-up traversal
    const children = new Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) children[i] = [];
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].parentIndex >= 0) {
        children[nodes[i].parentIndex].push(i);
      }
    }

    // Bottom-up: post-order traversal
    const visited = new Uint8Array(nodes.length);
    const stack = [0];
    const order = [];

    while (stack.length > 0) {
      const idx = stack.pop();
      if (visited[idx]) continue;
      visited[idx] = 1;
      order.push(idx);
      for (const child of children[idx]) {
        stack.push(child);
      }
    }

    // Process in reverse order (leaves first)
    for (let i = order.length - 1; i >= 0; i--) {
      const idx = order[i];
      if (children[idx].length > 0) {
        let sum = 0;
        for (const child of children[idx]) {
          sum += Math.pow(nodes[child].thickness, n);
        }
        nodes[idx].thickness = Math.pow(sum, 1 / n);
      }
    }

    // Scale so trunk base radius matches config
    const rootThickness = nodes[0].thickness;
    if (rootThickness > 0) {
      const scale = this.config.trunkBaseRadius / rootThickness;
      for (const node of nodes) {
        node.thickness *= scale;
      }
    }
  }

  /**
   * Debug: returns LineSegments connecting all nodes to parents.
   */
  getDebugLines() {
    const positions = [];
    const colors = [];
    const maxDepth = Math.max(...this.nodes.map(n => n.depth));

    for (const node of this.nodes) {
      if (node.parentIndex < 0) continue;
      const parent = this.nodes[node.parentIndex];

      const t = node.depth / maxDepth;
      // Dark brown → light green
      const r = 0.3 * (1 - t) + 0.4 * t;
      const g = 0.15 * (1 - t) + 0.7 * t;
      const b = 0.05 * (1 - t) + 0.2 * t;

      positions.push(parent.position.x, parent.position.y, parent.position.z);
      positions.push(node.position.x, node.position.y, node.position.z);
      colors.push(r, g, b, r, g, b);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const mat = new THREE.LineBasicMaterial({ vertexColors: true });
    return new THREE.LineSegments(geom, mat);
  }

  /**
   * Debug: returns red dots for remaining attractors.
   */
  getAttractorPoints() {
    const positions = [];
    for (const a of this.attractors) {
      positions.push(a.x, a.y, a.z);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xff0000, size: 0.05 });
    return new THREE.Points(geom, mat);
  }
}
