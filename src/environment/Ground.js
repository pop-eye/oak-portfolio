import * as THREE from 'three';
import { SimplexNoise } from '../utils/SimplexNoise.js';
import { mulberry32 } from '../utils/math.js';

/**
 * Ground — Procedurally deformed rock base the tree sits on, plus a
 * shadow-receiving earth plane extending into the distance.
 */
export class Ground {
  constructor(scene) {
    this.scene = scene;
    this.meshes = [];
    this._build();
  }

  _build() {
    this._buildRock();
    this._buildOrbitingRocks();
  }

  // ── Rock ────────────────────────────────────────────────────
  _buildRock() {
    const noise = new SimplexNoise(mulberry32(9871));

    const rockR   = 4.2;
    const yScale  = 0.44; // flatten factor — creates wide, squat boulder shape
    const radSegs = 80;

    // Sphere base: no flat caps, naturally rounded all the way round.
    // Compressing y by yScale gives the wide-outcrop silhouette.
    const geometry = new THREE.SphereGeometry(rockR, radSegs, 40);

    const pos = geometry.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i) * yScale; // flatten BEFORE noise so the sample
      let z = pos.getZ(i);          // positions already reflect the shape.

      // Three octaves of noise for organic surface detail.
      const n1 = noise.noise3D(x * 0.18, y * 0.28, z * 0.18) * 2.0;
      const n2 = noise.noise3D(x * 0.55, y * 0.80, z * 0.55) * 0.75;
      const n3 = noise.noise3D(x * 1.40, y * 2.00, z * 1.40) * 0.22;
      const d = n1 + n2 + n3;

      // Displace outward along the sphere’s own normal — deforms bottom,
      // sides, and top equally so there are no visually flat regions.
      const len = Math.sqrt(x * x + y * y + z * z);
      if (len > 0.001) {
        x += (x / len) * d * 0.52;
        y += (y / len) * d * 0.28; // muted vertically keeps the seating flat
        z += (z / len) * d * 0.52;
      }

      pos.setXYZ(i, x, y, z);
    }

    pos.needsUpdate = true;
    geometry.computeVertexNormals();

    const colorTex = this._createStoneTexture(512);

    const material = new THREE.MeshStandardMaterial({
      map:       colorTex,
      roughness: 0.90,
      metalness: 0.02,
      color:     new THREE.Color(0x6e6e60),
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow   = true;
    // Centre the sphere so its flattened top sits at y ≈ 0.
    mesh.position.y = -(rockR * yScale);
    this.scene.add(mesh);
    this.meshes.push(mesh);
  }

  // ── Earth ground plane ──────────────────────────────────────
  _buildGroundPlane() {
    const size     = 80;
    const geometry = new THREE.PlaneGeometry(size, size);
    geometry.rotateX(-Math.PI / 2);

    const texture = this._createGroundTexture(512);
    const material = new THREE.MeshStandardMaterial({
      map:       texture,
      roughness: 0.95,
      metalness: 0.0,
      color:     new THREE.Color(0x4a5a3a),
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    // Sits just below the rock bottom so the rock protrudes above it.
    mesh.position.y = -3.4;
    this.scene.add(mesh);
    this.meshes.push(mesh);
  }
  // ── Orbiting rocks ─────────────────────────────────────────────
  _buildOrbitingRocks() {
    this.orbitingRocks = [];

    // Each entry: rock half-radii, orbit distance, height, angular speed,
    // starting phase, and a slow self-rotation speed.
    const defs = [
      { r: 0.55, h: 0.44, orbitR:  7.2, orbitH:  0.9, speed: 0.100, phase: 0.0 },
      { r: 0.85, h: 0.65, orbitR:  9.5, orbitH: -0.4, speed: 0.070, phase: 1.9 },
      { r: 0.38, h: 0.30, orbitR:  8.0, orbitH:  2.2, speed: 0.140, phase: 3.4 },
      { r: 0.68, h: 0.52, orbitR: 11.2, orbitH:  0.3, speed: 0.058, phase: 5.0 },
      { r: 0.42, h: 0.34, orbitR:  7.7, orbitH: -1.1, speed: 0.115, phase: 2.6 },
      { r: 0.92, h: 0.70, orbitR: 13.0, orbitH:  1.3, speed: 0.052, phase: 4.2 },
    ];

    for (let idx = 0; idx < defs.length; idx++) {
      const def   = defs[idx];
      const noise = new SimplexNoise(mulberry32(777 + idx * 137));
      const rng   = mulberry32(888 + idx * 53);

      // Deformed sphere — no flat caps, natural stone shape all round.
      const geom = new THREE.SphereGeometry(def.r, 24, 14);
      const pos = geom.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i);
        let y = pos.getY(i) * 0.56; // flatten into squat boulder
        let z = pos.getZ(i);
        const n1 = noise.noise3D(x * 0.55, y * 0.9, z * 0.55) * def.r * 0.55;
        const n2 = noise.noise3D(x * 1.7,  y * 2.4, z * 1.7)  * def.r * 0.18;
        const d  = n1 + n2;
        const len = Math.sqrt(x * x + y * y + z * z);
        if (len > 0.001) {
          x += (x / len) * d * 0.55;
          y += (y / len) * d * 0.28;
          z += (z / len) * d * 0.55;
        }
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
      geom.computeVertexNormals();

      const tex = this._createStoneTexture(128);
      const mat = new THREE.MeshStandardMaterial({
        map: tex, roughness: 0.90, metalness: 0.02,
        color: new THREE.Color(0x6a6a5c),
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow   = true;
      mesh.receiveShadow = true;
      // Random initial tilt so they don’t all sit flat
      mesh.rotation.set(
        (rng() - 0.5) * 0.9,
        rng() * Math.PI * 2,
        (rng() - 0.5) * 0.9,
      );
      mesh.userData.orbit = {
        ...def,
        rotSpeed: (rng() - 0.5) * 0.025,
        bobAmp:   0.12 + rng() * 0.10,
        bobFreq:  0.30 + rng() * 0.20,
      };
      this.scene.add(mesh);
      this.orbitingRocks.push(mesh);
      this.meshes.push(mesh);
    }
  }

  // ── Animation ────────────────────────────────────────────────
  update(elapsed) {
    if (!this.orbitingRocks) return;
    for (const rock of this.orbitingRocks) {
      const { orbitR, orbitH, speed, phase, rotSpeed, bobAmp, bobFreq } = rock.userData.orbit;
      const angle = elapsed * speed + phase;
      rock.position.set(
        Math.cos(angle) * orbitR,
        orbitH + Math.sin(elapsed * bobFreq + phase) * bobAmp,
        Math.sin(angle) * orbitR,
      );
      rock.rotation.y += rotSpeed;
    }
  }
  // ── Procedural textures ─────────────────────────────────────

  _createStoneTexture(res) {
    const canvas = document.createElement('canvas');
    canvas.width  = res;
    canvas.height = res;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#8f8f82';
    ctx.fillRect(0, 0, res, res);

    const imageData = ctx.getImageData(0, 0, res, res);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() - 0.5) * 40;
      const w = (Math.random() - 0.5) * 18;
      d[i]     = Math.max(0, Math.min(255, d[i]     + v + w));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + v + w * 0.85));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + v * 0.85 + w * 0.6));
    }
    ctx.putImageData(imageData, 0, 0);

    // Faint crack lines
    ctx.strokeStyle = 'rgba(40, 36, 30, 0.45)';
    for (let c = 0; c < 14; c++) {
      ctx.lineWidth = 0.6 + Math.random() * 1.8;
      ctx.beginPath();
      ctx.moveTo(Math.random() * res, Math.random() * res);
      ctx.bezierCurveTo(
        Math.random() * res, Math.random() * res,
        Math.random() * res, Math.random() * res,
        Math.random() * res, Math.random() * res,
      );
      ctx.stroke();
    }

    // Lighter mineral streaks
    ctx.strokeStyle = 'rgba(200, 195, 180, 0.15)';
    for (let c = 0; c < 6; c++) {
      ctx.lineWidth = 1.5 + Math.random() * 3;
      ctx.beginPath();
      ctx.moveTo(Math.random() * res, Math.random() * res);
      ctx.quadraticCurveTo(
        Math.random() * res, Math.random() * res,
        Math.random() * res, Math.random() * res,
      );
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 2);
    return tex;
  }

  _createGroundTexture(res) {
    const canvas = document.createElement('canvas');
    canvas.width  = res;
    canvas.height = res;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#3a4a2a';
    ctx.fillRect(0, 0, res, res);

    const imageData = ctx.getImageData(0, 0, res, res);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() - 0.5) * 30;
      d[i]     = Math.max(0, Math.min(255, d[i]     + v));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + v));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + v * 0.5));
    }
    ctx.putImageData(imageData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
    return tex;
  }

  // ── Cleanup ─────────────────────────────────────────────────
  dispose() {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        m.map?.dispose();
        m.dispose();
      }
    }
    this.meshes = [];
  }
}
