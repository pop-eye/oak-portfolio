import * as THREE from 'three';

/**
 * Generate procedural placeholder bark textures (DataTexture).
 * These are used when real PBR textures haven't been downloaded yet.
 */
export function createPlaceholderBarkTextures() {
  const size = 512;
  const textures = {};

  // ── Diffuse: brown with noise ───────────────────────────
  {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        // Simple hash noise
        const n = fract(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);
        const n2 = fract(Math.sin(x * 0.05 + y * 0.02) * 1000.0);
        // Vertical streak pattern
        const streak = Math.sin(x * 0.15 + n * 2.0) * 0.5 + 0.5;
        const base = 0.25 + streak * 0.15 + n * 0.08;

        data[i] = Math.floor((base * 0.65 + 0.05) * 255); // R — brown
        data[i + 1] = Math.floor((base * 0.40 + 0.03) * 255); // G
        data[i + 2] = Math.floor((base * 0.22 + 0.02) * 255); // B
        data[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, size, size);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    textures.diffuse = tex;
  }

  // ── Normal: vertical fissure pattern ────────────────────
  {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const n = fract(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);
        // Vertical ridges
        const ridge = Math.sin(x * 0.3 + n * 1.5) * 0.5 + 0.5;
        const fineDetail = fract(Math.sin(x * 5.1 + y * 3.7) * 12345.6) * 0.15;

        data[i] = Math.floor((0.5 + (ridge - 0.5) * 0.3 + fineDetail * 0.2) * 255);
        data[i + 1] = Math.floor((0.5 + fineDetail * 0.1) * 255);
        data[i + 2] = 255; // Z up
        data[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, size, size);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    textures.normal = tex;
  }

  // ── Roughness: mostly high ──────────────────────────────
  {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const n = fract(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);
        const v = Math.floor((0.8 + n * 0.15) * 255);
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, size, size);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    textures.roughness = tex;
  }

  // ── AO: subtle darkening in crevices ────────────────────
  {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const n = fract(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);
        const ridge = Math.sin(x * 0.3 + n * 1.5) * 0.5 + 0.5;
        const v = Math.floor((0.7 + ridge * 0.25 + n * 0.05) * 255);
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, size, size);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    textures.ao = tex;
  }

  return textures;
}

function fract(x) { return x - Math.floor(x); }
