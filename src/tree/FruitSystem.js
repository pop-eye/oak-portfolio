import * as THREE from 'three';
import gsap from 'gsap';
import { mulberry32 } from '../utils/math.js';

/**
 * FruitSystem — places portfolio fruit on branch tips.
 * Each fruit is an individual Mesh for simple raycasting and hover effects.
 */
export class FruitSystem {
  constructor(skeleton, config, portfolioItems) {
    this.skeleton = skeleton;
    this.config = config;
    this.items = portfolioItems;
    this.rng = mulberry32(config.seed + 5678);

    this.fruitGroup = new THREE.Group();
    this.fruitMeshes = []; // array of fruit Mesh objects
  }

  build() {
    const positions = this._selectPositions();
    const count = Math.min(positions.length, this.items.length);

    const stemMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d2b1f,
      roughness: 0.9,
    });

    for (let i = 0; i < count; i++) {
      const item = this.items[i];
      const pos = positions[i];

      // Fruit pivot (for pendulum swing)
      const pivot = new THREE.Object3D();
      pivot.position.copy(pos.branch);
      this.fruitGroup.add(pivot);

      // Fruit sphere — hangs below branch tip
      const fruitGeo = new THREE.SphereGeometry(0.18, 16, 12);
      const colour = new THREE.Color(item.colour);
      const fruitMat = new THREE.MeshPhysicalMaterial({
        color: colour,
        roughness: 0.35,
        metalness: 0.0,
        clearcoat: 0.3,
        emissive: colour,
        emissiveIntensity: 0.0,
      });

      const fruitMesh = new THREE.Mesh(fruitGeo, fruitMat);
      fruitMesh.position.set(0, -pos.hangLength, 0);
      fruitMesh.userData.portfolioItem = item;
      fruitMesh.userData.pivot = pivot;
      pivot.add(fruitMesh);

      // Stem cylinder connecting branch to fruit
      const stemLength = pos.hangLength;
      const stemGeo = new THREE.CylinderGeometry(0.008, 0.012, stemLength, 4);
      const stem = new THREE.Mesh(stemGeo, stemMaterial);
      stem.position.set(0, -stemLength / 2, 0);
      pivot.add(stem);

      // Gentle pendulum swing
      const phase = this.rng() * Math.PI * 2;
      const speed = 1.8 + this.rng() * 1.0;
      pivot.userData.swingPhase = phase;
      pivot.userData.swingSpeed = speed;

      this.fruitMeshes.push(fruitMesh);
    }

    console.log(`[FruitSystem] ${count} fruit placed`);
    return this.fruitGroup;
  }

  /**
   * Select well-spaced terminal node positions for fruit.
   */
  _selectPositions() {
    const nodes = this.skeleton.getNodes();
    const terminals = this.skeleton.getTerminalNodes();
    const rng = this.rng;
    const minSpacing = 2.0;
    const minHeight = 3.0;

    // Filter candidates
    const candidates = [];
    for (const idx of terminals) {
      const pos = nodes[idx].position;
      if (pos.y < minHeight) continue;
      candidates.push({
        branch: pos.clone(),
        hangLength: 0.12 + rng() * 0.1,
        index: idx,
      });
    }

    // Shuffle
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    // Greedily select with minimum spacing
    const selected = [];
    for (const c of candidates) {
      if (selected.length >= this.items.length) break;
      let tooClose = false;
      for (const s of selected) {
        if (c.branch.distanceTo(s.branch) < minSpacing) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) selected.push(c);
    }

    return selected;
  }

  /**
   * Update pendulum swing — call each frame.
   */
  update(time) {
    for (const mesh of this.fruitMeshes) {
      const pivot = mesh.userData.pivot;
      const { swingPhase, swingSpeed } = pivot.userData;
      pivot.rotation.x = Math.sin(time * swingSpeed + swingPhase) * 0.04;
      pivot.rotation.z = Math.cos(time * swingSpeed * 0.7 + swingPhase) * 0.03;
    }
  }

  dispose() {
    this.fruitGroup.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}
