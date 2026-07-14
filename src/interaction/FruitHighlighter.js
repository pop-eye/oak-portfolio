import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import gsap from 'gsap';

/**
 * FruitHighlighter — automatically cycles through portfolio fruits and
 * draws a digital corner-bracket reticle around each one.
 *
 * The reticle billboards toward the camera and slowly rotates around
 * its own Z axis to give a "scanning computer" feel.  The colour and
 * label update to match each project.
 */
export class FruitHighlighter {
  constructor(scene, fruitMeshes, camera) {
    this.scene        = scene;
    this.fruitMeshes  = fruitMeshes;
    this.camera       = camera;
    this.currentIdx   = 0;
    this.timer        = 0;
    this.cycleDur     = 4.2;
    this.active       = true;
    /** Set to (fruitMesh) => void to handle label clicks externally. */
    this.onLabelClick = null;

    this._wPos = new THREE.Vector3();

    this._buildReticle();
    this._buildLabel();
    if (fruitMeshes.length) this._selectFruit(0, true);
  }

  // ── Geometry ────────────────────────────────────────────────

  _buildReticle() {
    // Draw corner brackets onto a canvas so the lines can be thick and glowing.
    // Sprite auto-billboards, and SpriteMaterial.rotation animates the Z spin.
    const size = 256;
    const m    = 22;  // margin from edge
    const arm  = 60;  // corner arm pixel length

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    const draw = (lw, blur) => {
      ctx.lineWidth   = lw;
      ctx.lineCap     = 'square';
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur  = blur;
      ctx.beginPath();
      // top-left
      ctx.moveTo(m + arm, m); ctx.lineTo(m, m); ctx.lineTo(m, m + arm);
      // top-right
      ctx.moveTo(size - m - arm, m); ctx.lineTo(size - m, m); ctx.lineTo(size - m, m + arm);
      // bottom-left
      ctx.moveTo(m + arm, size - m); ctx.lineTo(m, size - m); ctx.lineTo(m, size - m - arm);
      // bottom-right
      ctx.moveTo(size - m - arm, size - m); ctx.lineTo(size - m, size - m); ctx.lineTo(size - m, size - m - arm);
      ctx.stroke();
    };

    draw(7, 10); // glow pass
    draw(4, 0);  // solid core pass

    this._reticleTex = new THREE.CanvasTexture(canvas);
    this._spriteMat  = new THREE.SpriteMaterial({
      map:             this._reticleTex,
      transparent:     true,
      opacity:         0,
      depthTest:       false,
      color:           0xffffff,
      sizeAttenuation: true,
    });

    this.reticle = new THREE.Sprite(this._spriteMat);
    this.reticle.scale.setScalar(0.88);
    this.reticle.renderOrder = 999;
    this.scene.add(this.reticle);
  }

  _buildLabel() {
    this._labelDiv = document.createElement('div');
    this._labelDiv.style.cssText = [
      'font-family:"Courier New",monospace',
      'font-size:10px',
      'letter-spacing:0.2em',
      'color:#ffffff',
      'background:rgba(0,0,0,0.6)',
      'padding:4px 10px',
      'border:1px solid rgba(255,255,255,0.35)',
      'white-space:nowrap',
      'text-transform:uppercase',
      'opacity:0',
      'transition:opacity 0.35s ease, background 0.15s ease',
      // Clickable
      'cursor:pointer',
      'pointer-events:auto',
      'user-select:none',
    ].join(';');

    this._labelDiv.addEventListener('mouseenter', () => {
      this._labelDiv.style.background = 'rgba(0,0,0,0.85)';
    });
    this._labelDiv.addEventListener('mouseleave', () => {
      this._labelDiv.style.background = 'rgba(0,0,0,0.6)';
    });
    this._labelDiv.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onLabelClick) this.onLabelClick(this.fruitMeshes[this.currentIdx]);
    });
    // Touch devices
    this._labelDiv.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (this.onLabelClick) this.onLabelClick(this.fruitMeshes[this.currentIdx]);
    }, { passive: false });

    this._labelObj = new CSS2DObject(this._labelDiv);
    this.scene.add(this._labelObj);
  }

  // ── State ────────────────────────────────────────────────────

  _selectFruit(idx, immediate = false) {
    this.currentIdx = ((idx % this.fruitMeshes.length) + this.fruitMeshes.length) % this.fruitMeshes.length;
    const mesh = this.fruitMeshes[this.currentIdx];
    const item = mesh.userData.portfolioItem;

    const col = new THREE.Color(item?.colour ?? '#7dffb3');
    this._spriteMat.color.set(col);
    const r = Math.round(col.r * 255);
    const g = Math.round(col.g * 255);
    const b = Math.round(col.b * 255);
    this._labelDiv.style.color       = `#${col.getHexString()}`;
    this._labelDiv.style.borderColor = `rgba(${r},${g},${b},0.5)`;
    this._labelDiv.textContent        = item?.title ?? '';

    if (immediate) {
      this._spriteMat.opacity = 0.9;
      this._labelDiv.style.opacity = '1';
      this.reticle.scale.setScalar(0.88);
    } else {
      gsap.killTweensOf(this._spriteMat);
      gsap.killTweensOf(this.reticle.scale);
      this._labelDiv.style.opacity = '0';
      this.reticle.scale.setScalar(1.6);
      this._spriteMat.opacity = 0;
      gsap.to(this.reticle.scale, { x: 0.88, y: 0.88, z: 0.88, duration: 0.55, ease: 'expo.out' });
      gsap.to(this._spriteMat,    { opacity: 0.9, duration: 0.45 });
      setTimeout(() => {
        if (this.active) this._labelDiv.style.opacity = '1';
      }, 240);
    }
  }

  // ── Per-frame update ─────────────────────────────────────────

  update(elapsed, delta) {
    if (!this.active || !this.fruitMeshes.length) return;

    const mesh = this.fruitMeshes[this.currentIdx];
    mesh.getWorldPosition(this._wPos);

    // Sprite auto-billboards; rotate material for the scanning-reticle effect.
    this.reticle.position.copy(this._wPos);
    this._spriteMat.rotation = elapsed * 0.20;

    this._labelObj.position.set(this._wPos.x, this._wPos.y + 0.55, this._wPos.z);

    // Opacity flicker for digital feel
    this._spriteMat.opacity = 0.65 + Math.sin(elapsed * 2.6) * 0.22;

    // Auto-cycle
    this.timer += delta;
    if (this.timer >= this.cycleDur) {
      this.timer = 0;
      this._selectFruit(this.currentIdx + 1);
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────

  disable() {
    this.active = false;
    this._labelDiv.style.opacity = '0';
    gsap.to(this._spriteMat, { opacity: 0, duration: 0.25 });
  }

  enable() {
    this.active = true;
    this.timer  = 0;
    this._selectFruit(this.currentIdx, true);
  }

  dispose() {
    this.scene.remove(this.reticle);
    this.scene.remove(this._labelObj);
    this._reticleTex.dispose();
    this._spriteMat.dispose();
  }
}
