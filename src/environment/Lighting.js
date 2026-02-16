import * as THREE from 'three';

/**
 * Lighting — HDRI environment + directional light with shadows.
 * Falls back to procedural gradient environment when no .hdr is available.
 */
export class Lighting {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.sunLight = null;
    this.ambientLight = null;
    this.backLight = null;

    this._setupLights();
    this._setupFallbackEnvironment();
  }

  _setupLights() {
    // Warm ambient fill
    this.ambientLight = new THREE.AmbientLight(0x404050, 0.4);
    this.scene.add(this.ambientLight);

    // Main directional (sun) — with shadows for god rays
    this.sunLight = new THREE.DirectionalLight(0xfff4e0, 1.8);
    this.sunLight.position.set(5, 15, 7);
    this.sunLight.castShadow = true;

    // Shadow map config
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 60;
    this.sunLight.shadow.camera.left = -20;
    this.sunLight.shadow.camera.right = 20;
    this.sunLight.shadow.camera.top = 25;
    this.sunLight.shadow.camera.bottom = -5;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;

    this.scene.add(this.sunLight);

    // Cool back/rim light
    this.backLight = new THREE.DirectionalLight(0x8899bb, 0.5);
    this.backLight.position.set(-5, 10, -5);
    this.scene.add(this.backLight);

    // Warm fill from below to simulate ground bounce
    const bounceLight = new THREE.HemisphereLight(0x667744, 0x333322, 0.3);
    this.scene.add(bounceLight);
  }

  _setupFallbackEnvironment() {
    // Procedural gradient environment map as placeholder for HDRI
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();

    const envScene = new THREE.Scene();

    // Sky gradient: warm top, cool horizon, dark ground
    const skyGeo = new THREE.SphereGeometry(50, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {},
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;
        void main() {
          float y = normalize(vWorldPos).y;
          // Sky: warm blue top → pale horizon
          vec3 skyTop = vec3(0.25, 0.35, 0.55);
          vec3 skyHorizon = vec3(0.55, 0.55, 0.50);
          vec3 ground = vec3(0.15, 0.12, 0.10);
          vec3 col;
          if (y > 0.0) {
            col = mix(skyHorizon, skyTop, smoothstep(0.0, 0.6, y));
          } else {
            col = mix(skyHorizon, ground, smoothstep(0.0, -0.3, y));
          }
          gl_FragColor = vec4(col * 1.5, 1.0);
        }
      `,
    });
    envScene.add(new THREE.Mesh(skyGeo, skyMat));

    const envMap = pmremGenerator.fromScene(envScene, 0, 0.1, 100).texture;
    this.scene.environment = envMap;
    this.scene.background = envMap;

    pmremGenerator.dispose();
    envScene.children[0].geometry.dispose();
    skyMat.dispose();
  }

  /**
   * Load an HDRI environment map (call when .hdr files are available).
   * @param {string} hdrPath - Path to .hdr file
   */
  async loadHDRI(hdrPath) {
    const { RGBELoader } = await import('three/addons/loaders/RGBELoader.js');
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();

    return new Promise((resolve, reject) => {
      new RGBELoader().load(
        hdrPath,
        (hdrTexture) => {
          const envMap = pmremGenerator.fromEquirectangular(hdrTexture).texture;
          this.scene.environment = envMap;
          this.scene.background = envMap;
          hdrTexture.dispose();
          pmremGenerator.dispose();
          resolve(envMap);
        },
        undefined,
        reject
      );
    });
  }

  /** Get the sun light (needed for god rays and shadows). */
  getSunLight() {
    return this.sunLight;
  }

  dispose() {
    if (this.scene.environment) {
      this.scene.environment.dispose();
    }
  }
}
