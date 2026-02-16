import gsap from 'gsap';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/**
 * HoverEffects — scale bounce, emissive glow, cursor change, floating label.
 */
export class HoverEffects {
  constructor() {
    this.activeLabel = null;
  }

  onHoverEnter(fruitMesh) {
    const item = fruitMesh.userData.portfolioItem;

    // Scale bounce
    gsap.killTweensOf(fruitMesh.scale);
    gsap.to(fruitMesh.scale, {
      x: 1.2, y: 1.2, z: 1.2,
      duration: 0.4,
      ease: 'back.out(1.7)',
    });

    // Emissive glow
    gsap.killTweensOf(fruitMesh.material);
    gsap.to(fruitMesh.material, {
      emissiveIntensity: 0.35,
      duration: 0.3,
      ease: 'power2.out',
    });

    // Cursor
    document.body.style.cursor = 'pointer';

    // Floating label
    this._showLabel(fruitMesh, item.title);
  }

  onHoverExit(fruitMesh) {
    gsap.killTweensOf(fruitMesh.scale);
    gsap.to(fruitMesh.scale, {
      x: 1, y: 1, z: 1,
      duration: 0.3,
      ease: 'power2.out',
    });

    gsap.killTweensOf(fruitMesh.material);
    gsap.to(fruitMesh.material, {
      emissiveIntensity: 0.0,
      duration: 0.3,
      ease: 'power2.out',
    });

    document.body.style.cursor = 'default';
    this._hideLabel();
  }

  _showLabel(fruitMesh, text) {
    this._hideLabel();

    const div = document.createElement('div');
    div.className = 'fruit-label';
    div.textContent = text;
    div.style.cssText = `
      color: white;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 600;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(8px);
      padding: 6px 14px;
      border-radius: 20px;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s ease;
    `;

    this.activeLabel = new CSS2DObject(div);
    this.activeLabel.position.set(0, 0.35, 0);
    fruitMesh.add(this.activeLabel);

    requestAnimationFrame(() => { div.style.opacity = '1'; });
  }

  _hideLabel() {
    if (this.activeLabel) {
      this.activeLabel.parent?.remove(this.activeLabel);
      this.activeLabel.element.remove();
      this.activeLabel = null;
    }
  }
}
