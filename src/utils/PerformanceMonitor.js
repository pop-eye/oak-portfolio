/**
 * PerformanceMonitor — Watches FPS and auto-degrades quality if needed.
 */
export class PerformanceMonitor {
  constructor(config) {
    this.config = config;
    this._frameTimes = [];
    this._sampleWindow = 60;
    this._degradeThreshold = 45;
    this._upgradeThreshold = 58;
    this._lastCheck = 0;
    this._checkInterval = 2000;
    this._qualityLevel = 3; // 0=minimum, 1=low, 2=medium, 3=high
    this._startTime = performance.now();
  }

  recordFrame(deltaMs) {
    this._frameTimes.push(deltaMs);
    if (this._frameTimes.length > this._sampleWindow) {
      this._frameTimes.shift();
    }
  }

  getAverageFPS() {
    if (this._frameTimes.length < 10) return 60;
    const avgMs = this._frameTimes.reduce((a, b) => a + b, 0) / this._frameTimes.length;
    return 1000 / avgMs;
  }

  update() {
    const now = performance.now();

    // Don't check during first 5 seconds (scene stabilising + intro)
    if (now - this._startTime < 5000) return false;
    if (now - this._lastCheck < this._checkInterval) return false;
    this._lastCheck = now;

    const fps = this.getAverageFPS();
    let changed = false;

    if (fps < this._degradeThreshold && this._qualityLevel > 0) {
      this._qualityLevel--;
      this._applyQuality();
      changed = true;
      console.log(`[Perf] Degrading to quality ${this._qualityLevel} (FPS: ${fps.toFixed(1)})`);
    } else if (fps > this._upgradeThreshold && this._qualityLevel < 3) {
      this._qualityLevel++;
      this._applyQuality();
      changed = true;
      console.log(`[Perf] Upgrading to quality ${this._qualityLevel} (FPS: ${fps.toFixed(1)})`);
    }

    return changed;
  }

  _applyQuality() {
    const { postProcessing, leafChunks, sunLight, renderer } = this.config;

    switch (this._qualityLevel) {
      case 0: // Minimum
        if (postProcessing) {
          if (postProcessing.n8aoPass) postProcessing.n8aoPass.enabled = false;
          postProcessing.disableGodrays();
          if (postProcessing.bloomEffect) postProcessing.bloomEffect.intensity = 0;
        }
        if (sunLight) {
          sunLight.shadow.mapSize.set(512, 512);
          if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
          renderer.shadowMap.needsUpdate = true;
        }
        if (leafChunks) {
          leafChunks.forEach((chunk, i) => { chunk.visible = i % 2 === 0; });
        }
        break;

      case 1: // Low
        if (postProcessing) {
          if (postProcessing.n8aoPass) {
            postProcessing.n8aoPass.enabled = true;
            postProcessing.n8aoPass.setQualityMode('Performance');
          }
          postProcessing.disableGodrays();
          if (postProcessing.bloomEffect) postProcessing.bloomEffect.intensity = 0;
        }
        if (sunLight) {
          sunLight.shadow.mapSize.set(1024, 1024);
          if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
          renderer.shadowMap.needsUpdate = true;
        }
        if (leafChunks) {
          leafChunks.forEach((chunk) => { chunk.visible = true; });
        }
        break;

      case 2: // Medium
        if (postProcessing) {
          if (postProcessing.n8aoPass) {
            postProcessing.n8aoPass.enabled = true;
            postProcessing.n8aoPass.setQualityMode('Medium');
          }
          postProcessing.disableGodrays();
          if (postProcessing.bloomEffect) postProcessing.bloomEffect.intensity = 0.2;
        }
        if (sunLight) {
          sunLight.shadow.mapSize.set(2048, 2048);
          if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
          renderer.shadowMap.needsUpdate = true;
        }
        if (leafChunks) {
          leafChunks.forEach((chunk) => { chunk.visible = true; });
        }
        break;

      case 3: // High (full)
        if (postProcessing) {
          if (postProcessing.n8aoPass) {
            postProcessing.n8aoPass.enabled = true;
            postProcessing.n8aoPass.setQualityMode('Medium');
          }
          // Godrays re-enable would need a call, keep it as-is
          if (postProcessing.bloomEffect) postProcessing.bloomEffect.intensity = 0.4;
        }
        if (sunLight) {
          sunLight.shadow.mapSize.set(2048, 2048);
          if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
          renderer.shadowMap.needsUpdate = true;
        }
        if (leafChunks) {
          leafChunks.forEach((chunk) => { chunk.visible = true; });
        }
        break;
    }
  }
}
