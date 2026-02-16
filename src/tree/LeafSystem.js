import * as THREE from 'three';
import CustomShaderMaterial from 'three-custom-shader-material/vanilla';
import { mulberry32 } from '../utils/math.js';
import { generateOakLeafTexture } from '../utils/LeafTextureGenerator.js';
import leafVertShader from '../shaders/leaf.vert.glsl';
import leafFragShader from '../shaders/leaf.frag.glsl';

/**
 * LeafSystem — instanced leaf rendering with spatial chunking.
 *
 * Places 25K–40K leaf instances at branch tips, splits them into
 * spatial chunks for frustum culling, and renders with CSM shaders
 * for wind animation, colour variation, and translucency.
 */
export class LeafSystem {
  constructor(skeleton, config, options = {}) {
    this.skeleton = skeleton;
    this.config = config;
    this.rng = mulberry32(config.seed + 1234);

    this.depthThreshold = options.depthThreshold || 0.4;
    this.maxClusterSize = options.maxClusterSize || 8;
    this.clusterRadius = options.clusterRadius || 0.55;
    this.leafSize = options.leafSize || 0.35;
    this.chunkDivisions = options.chunkDivisions || [3, 2, 3]; // 18 chunks

    this.chunkMeshes = [];
    this.material = null;
    this.leafTexture = null;
  }

  /**
   * Build the full leaf system and return an array of chunk meshes.
   */
  build() {
    // Generate leaf texture
    this.leafTexture = generateOakLeafTexture(512);

    // Create material
    this.material = this._createMaterial();

    // Place leaves
    const leaves = this._placeLeaves();
    console.log(`[LeafSystem] ${leaves.length} leaf instances`);

    // Chunk and create meshes
    this.chunkMeshes = this._createChunkedMeshes(leaves);
    console.log(`[LeafSystem] ${this.chunkMeshes.length} chunks`);

    return this.chunkMeshes;
  }

  /**
   * Place leaves at branch tips and return an array of leaf data.
   */
  _placeLeaves() {
    const nodes = this.skeleton.getNodes();
    const maxDepth = this.skeleton.getMaxDepth();
    const minDepth = maxDepth * this.depthThreshold;
    const rng = this.rng;
    const leaves = [];

    // Find qualifying nodes — outer canopy only
    const candidates = [];
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].depth >= minDepth) {
        candidates.push(i);
      }
    }

    // Trunk centre for outward-facing bias
    const trunkCentre = new THREE.Vector3(0, this.config.crownCenterY, 0);

    for (const nodeIdx of candidates) {
      const node = nodes[nodeIdx];
      // Cluster size: 3–maxClusterSize, thicker nodes get more
      const thicknessFactor = Math.min(1, node.thickness / 0.1);
      const clusterSize = 4 + Math.floor(rng() * (this.maxClusterSize - 4) * (0.5 + 0.5 * thicknessFactor));
      const clusterR = this.clusterRadius * (0.7 + 0.6 * thicknessFactor);

      for (let j = 0; j < clusterSize; j++) {
        // Random offset within sphere
        const theta = rng() * Math.PI * 2;
        const phi = Math.acos(2 * rng() - 1);
        const r = clusterR * Math.cbrt(rng()); // cube root for uniform volume
        const ox = r * Math.sin(phi) * Math.cos(theta);
        const oy = r * Math.sin(phi) * Math.sin(theta);
        const oz = r * Math.cos(phi);

        const pos = new THREE.Vector3(
          node.position.x + ox,
          node.position.y + oy,
          node.position.z + oz
        );

        // Rotation: face roughly outward from trunk centre + random variation
        const outward = pos.clone().sub(trunkCentre).normalize();
        const yRot = Math.atan2(outward.x, outward.z) + (rng() - 0.5) * 1.0;
        const xTilt = (rng() - 0.5) * 0.6;
        const zTilt = (rng() - 0.5) * 0.6;
        const rot = new THREE.Euler(xTilt, yRot, zTilt);

        const scale = 0.8 + rng() * 0.4;
        const windPhase = rng() * Math.PI * 2;
        const colourVar = rng();
        const stiffness = node.depth / maxDepth;

        leaves.push({ pos, rot, scale, windPhase, colourVar, stiffness });
      }
    }

    return leaves;
  }

  /**
   * Split leaves into spatial chunks and create InstancedMeshes.
   */
  _createChunkedMeshes(leaves) {
    if (leaves.length === 0) return [];

    // Compute bounds
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const leaf of leaves) {
      min.min(leaf.pos);
      max.max(leaf.pos);
    }
    // Pad slightly
    min.subScalar(0.5);
    max.addScalar(0.5);

    const [dx, dy, dz] = this.chunkDivisions;
    const size = max.clone().sub(min);
    const chunkSize = new THREE.Vector3(size.x / dx, size.y / dy, size.z / dz);

    // Assign leaves to chunks
    const chunks = new Map();
    for (let i = 0; i < leaves.length; i++) {
      const leaf = leaves[i];
      const cx = Math.min(dx - 1, Math.floor((leaf.pos.x - min.x) / chunkSize.x));
      const cy = Math.min(dy - 1, Math.floor((leaf.pos.y - min.y) / chunkSize.y));
      const cz = Math.min(dz - 1, Math.floor((leaf.pos.z - min.z) / chunkSize.z));
      const key = `${cx}_${cy}_${cz}`;
      if (!chunks.has(key)) chunks.set(key, []);
      chunks.get(key).push(i);
    }

    // Create geometry (shared)
    const geometry = new THREE.PlaneGeometry(this.leafSize, this.leafSize, 1, 1);

    // Create one InstancedMesh per chunk
    const meshes = [];
    const dummy = new THREE.Object3D();

    for (const [, indices] of chunks) {
      const count = indices.length;
      const mesh = new THREE.InstancedMesh(geometry, this.material, count);
      mesh.frustumCulled = true;

      const windPhases = new Float32Array(count);
      const colourVars = new Float32Array(count);
      const stiffnesses = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        const leaf = leaves[indices[i]];
        dummy.position.copy(leaf.pos);
        dummy.rotation.copy(leaf.rot);
        dummy.scale.setScalar(leaf.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        windPhases[i] = leaf.windPhase;
        colourVars[i] = leaf.colourVar;
        stiffnesses[i] = leaf.stiffness;
      }

      mesh.instanceMatrix.needsUpdate = true;

      // Per-instance attributes
      mesh.geometry = geometry.clone(); // each chunk needs its own geometry for attributes
      mesh.geometry.setAttribute('aWindPhase',
        new THREE.InstancedBufferAttribute(windPhases, 1));
      mesh.geometry.setAttribute('aColourVariation',
        new THREE.InstancedBufferAttribute(colourVars, 1));
      mesh.geometry.setAttribute('aBranchStiffness',
        new THREE.InstancedBufferAttribute(stiffnesses, 1));

      meshes.push(mesh);
    }

    return meshes;
  }

  /**
   * Create the CSM leaf material.
   */
  _createMaterial() {
    return new CustomShaderMaterial({
      baseMaterial: THREE.MeshStandardMaterial,
      vertexShader: leafVertShader,
      fragmentShader: leafFragShader,
      uniforms: {
        uLeafTexture: { value: this.leafTexture },
        uTime: { value: 0 },
        uWindDirection: { value: new THREE.Vector2(1.0, 0.3).normalize() },
        uWindStrength: { value: 0.3 },
        uLightDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
        uTranslucencyPower: { value: 3.0 },
        uTranslucencyScale: { value: 0.6 },
        uSeasonMix: { value: 0.0 },
      },
      side: THREE.DoubleSide,
      alphaTest: 0.5,
    });
  }

  /**
   * Update time uniform — call each frame.
   */
  update(time) {
    if (this.material) {
      this.material.uniforms.uTime.value = time;
    }
  }

  /**
   * Dispose all resources.
   */
  dispose() {
    for (const mesh of this.chunkMeshes) {
      mesh.geometry.dispose();
    }
    if (this.material) this.material.dispose();
    if (this.leafTexture) this.leafTexture.dispose();
  }
}
