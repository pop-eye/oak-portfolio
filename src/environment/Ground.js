import * as THREE from 'three';

/**
 * Ground — Shadow-receiving ground plane with procedural earth/grass texture.
 */
export class Ground {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this._build();
  }

  _build() {
    const size = 50;
    const geometry = new THREE.PlaneGeometry(size, size);
    geometry.rotateX(-Math.PI / 2);

    // Procedural ground texture
    const texture = this._createGroundTexture(512);

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.95,
      metalness: 0.0,
      color: new THREE.Color(0x4a5a3a),
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.position.y = -0.02; // Slightly below origin to avoid z-fighting
    this.scene.add(this.mesh);
  }

  _createGroundTexture(res) {
    const canvas = document.createElement('canvas');
    canvas.width = res;
    canvas.height = res;
    const ctx = canvas.getContext('2d');

    // Base earth colour
    ctx.fillStyle = '#3a4a2a';
    ctx.fillRect(0, 0, res, res);

    // Noise-like variation
    const imageData = ctx.getImageData(0, 0, res, res);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const variation = (Math.random() - 0.5) * 30;
      data[i] = Math.max(0, Math.min(255, data[i] + variation));         // R
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + variation)); // G
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + variation * 0.5)); // B
    }

    ctx.putImageData(imageData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    return texture;
  }

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.map?.dispose();
      this.mesh.material.dispose();
    }
  }
}
