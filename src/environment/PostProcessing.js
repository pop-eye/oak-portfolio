import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  SMAAEffect,
  SMAAPreset,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

/**
 * PostProcessing — Assembles the full post-processing pipeline.
 * Order: Render → N8AO → Bloom + SMAA
 * God rays added separately via enableGodrays() once shadow maps are ready.
 */
export class PostProcessing {
  constructor(renderer, scene, camera, sunLight) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = null;
    this.n8aoPass = null;
    this.godraysPass = null;
    this.bloomEffect = null;
    this._sunLight = sunLight;

    this._build();
  }

  _build() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.composer = new EffectComposer(this.renderer);

    // Pass 1: Render scene
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);
    console.log('[PostProcessing] RenderPass added');

    // Pass 2: N8AO ambient occlusion (deferred — enable after first frame)
    // N8AO is added via enableN8AO() to avoid black-screen issues on init

    // Pass 3: Bloom + SMAA combined in one EffectPass
    this.bloomEffect = new BloomEffect({
      intensity: 0.4,
      luminanceThreshold: 0.9,
      luminanceSmoothing: 0.025,
      mipmapBlur: true,
      radius: 0.8,
    });

    const smaaEffect = new SMAAEffect({
      preset: SMAAPreset.HIGH,
    });

    const finalPass = new EffectPass(this.camera, this.bloomEffect, smaaEffect);
    this.composer.addPass(finalPass);
    console.log('[PostProcessing] Bloom + SMAA added');
  }

  /**
   * Enable N8AO. Call after at least one frame has rendered.
   */
  enableN8AO() {
    if (this.n8aoPass) return;
    try {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.n8aoPass = new N8AOPostPass(this.scene, this.camera, w, h);
      this.n8aoPass.setQualityMode('Medium');
      this.n8aoPass.configuration.aoRadius = 3.0;
      this.n8aoPass.configuration.distanceFalloff = 1.0;
      this.n8aoPass.configuration.intensity = 1.5;
      this.n8aoPass.configuration.halfRes = true;
      this.n8aoPass.configuration.depthAwareUpsampling = true;
      this.n8aoPass.configuration.color = new THREE.Color(0x000000);
      this.n8aoPass.configuration.gammaCorrection = false;
      // Insert after RenderPass (index 0), before final pass
      const passes = this.composer.passes;
      passes.splice(1, 0, this.n8aoPass);
      console.log('[PostProcessing] N8AO added');
    } catch (err) {
      console.warn('[PostProcessing] N8AO failed:', err);
    }
  }

  /**
   * Enable god rays. Call after at least one frame has rendered
   * so shadow maps are initialised.
   */
  async enableGodrays() {
    if (this.godraysPass || !this._sunLight) return;
    try {
      const { GodraysPass } = await import('three-good-godrays');
      this.godraysPass = new GodraysPass(this._sunLight, this.camera, {
        density: 1 / 128,
        maxDensity: 0.5,
        edgeStrength: 2,
        edgeRadius: 2,
        distanceAttenuation: 2,
        color: new THREE.Color(0xfff4e0),
        raymarchSteps: 60,
        blur: true,
        gammaCorrection: false,
      });
      // Insert before the final pass (bloom+SMAA)
      const passes = this.composer.passes;
      const insertIdx = passes.length - 1;
      passes.splice(insertIdx, 0, this.godraysPass);
      console.log('[PostProcessing] God rays added');
    } catch (err) {
      console.warn('[PostProcessing] God rays failed:', err);
    }
  }

  disableGodrays() {
    if (this.godraysPass) {
      this.godraysPass.enabled = false;
    }
  }

  render(deltaTime) {
    this.composer.render(deltaTime);
  }

  setSize(width, height) {
    this.composer.setSize(width, height);
  }

  setLowQuality() {
    if (this.n8aoPass) {
      this.n8aoPass.setQualityMode('Performance');
      this.n8aoPass.configuration.halfRes = true;
    }
    this.disableGodrays();
    if (this.bloomEffect) {
      this.bloomEffect.intensity = 0;
    }
  }

  dispose() {
    this.composer?.dispose();
  }
}
