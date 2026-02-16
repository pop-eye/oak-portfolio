import * as THREE from 'three';
import { mulberry32 } from '../utils/math.js';
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
  generate() {
    this._generateAttractors();
    this._seedTrunk();
    this._grow();
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

    while (this.attractors.length < attractorCount) {
      const x = (rng() * 2 - 1) * crownRadiusX;
      const y = (rng() * 2 - 1) * crownRadiusY + crownCenterY;
      const z = (rng() * 2 - 1) * crownRadiusZ;

      // Test if inside ellipsoid
      const nx = x / crownRadiusX;
      const ny = (y - crownCenterY) / crownRadiusY;
      const nz = z / crownRadiusZ;
      if (nx * nx + ny * ny + nz * nz <= 1.0) {
        this.attractors.push(new THREE.Vector3(x, y, z));
      }
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
  _grow() {
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
    }
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
