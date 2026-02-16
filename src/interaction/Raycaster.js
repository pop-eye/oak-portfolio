import * as THREE from 'three';

/**
 * FruitRaycaster — handles hover and click detection on fruit meshes.
 * Throttled pointermove for performance.
 */
export class FruitRaycaster {
  constructor(camera, fruitMeshes) {
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.fruitMeshes = fruitMeshes;

    this.hoveredFruit = null;
    this.onHoverEnter = null;
    this.onHoverExit = null;
    this.onClick = null;

    this._onPointerMove = this._onPointerMove.bind(this);
    this._onClick = this._onClick.bind(this);

    this._lastMoveTime = 0;
    this._moveThrottle = 33; // ~30fps
  }

  enable() {
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('click', this._onClick);
  }

  disable() {
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('click', this._onClick);
    if (this.hoveredFruit) {
      this.onHoverExit?.(this.hoveredFruit);
      this.hoveredFruit = null;
    }
    document.body.style.cursor = 'default';
  }

  _updatePointer(event) {
    this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  _raycast() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(this.fruitMeshes, false);
    return intersects.length > 0 ? intersects[0] : null;
  }

  _onPointerMove(event) {
    const now = performance.now();
    if (now - this._lastMoveTime < this._moveThrottle) return;
    this._lastMoveTime = now;

    this._updatePointer(event);
    const hit = this._raycast();
    const hitMesh = hit ? hit.object : null;

    if (hitMesh !== this.hoveredFruit) {
      if (this.hoveredFruit) {
        this.onHoverExit?.(this.hoveredFruit);
      }
      this.hoveredFruit = hitMesh;
      if (hitMesh) {
        this.onHoverEnter?.(hitMesh);
      }
    }
  }

  _onClick(event) {
    this._updatePointer(event);
    const hit = this._raycast();
    if (hit) {
      this.onClick?.(hit.object, hit);
    }
  }
}
