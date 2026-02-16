import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import gsap from 'gsap';

/**
 * CameraController — OrbitControls with animated fly-to, auto-rotate,
 * cinematic intro, and crown-collision prevention.
 */
export class CameraController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, domElement);

    this.controls.enablePan = false;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 25;
    this.controls.minPolarAngle = 0.3;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.zoomSpeed = 0.8;
    this.controls.target.set(0, 7, 0);

    // Auto-rotate off initially — enabled after intro
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 0.3;
    this._idleTimer = null;
    this._idleDelay = 8000;

    this._setupIdleDetection(domElement);

    // Start far away for intro animation
    camera.position.set(25, 2, 20);
    this.controls.update();

    this._isAnimating = false;

    // Crown collision sphere
    this._crownCenter = new THREE.Vector3(0, 12, 0);
    this._crownRadius = 5.5;
  }

  _setupIdleDetection(domElement) {
    const resetIdle = () => {
      this.controls.autoRotate = false;
      clearTimeout(this._idleTimer);
      this._idleTimer = setTimeout(() => {
        if (!this._isAnimating) {
          this.controls.autoRotate = true;
        }
      }, this._idleDelay);
    };

    domElement.addEventListener('pointerdown', resetIdle);
    domElement.addEventListener('pointermove', resetIdle);
    domElement.addEventListener('wheel', resetIdle);
  }

  /**
   * Cinematic intro: camera approaches from far away and rises to orbit.
   */
  playIntro(duration = 3.0) {
    return new Promise((resolve) => {
      this._isAnimating = true;
      this.controls.enabled = false;
      this.controls.autoRotate = false;

      this.controls.target.set(0, 5, 0);
      this.controls.update();

      const tl = gsap.timeline({
        onComplete: () => {
          this._isAnimating = false;
          this.controls.enabled = true;
          this.controls.autoRotate = true;
          resolve();
        },
      });

      tl.to(this.camera.position, {
        x: 10, y: 6, z: 14,
        duration,
        ease: 'power2.inOut',
      }, 0);

      tl.to(this.controls.target, {
        x: 0, y: 8, z: 0,
        duration,
        ease: 'power2.inOut',
        onUpdate: () => this.controls.update(),
      }, 0);
    });
  }

  flyTo(targetWorldPos, duration = 1.2) {
    return new Promise((resolve) => {
      this._isAnimating = true;
      this.controls.enabled = false;
      this.controls.autoRotate = false;

      const cameraToTarget = this.camera.position.clone().sub(targetWorldPos).normalize();
      const viewDistance = 3.5;
      const destination = targetWorldPos.clone().add(
        cameraToTarget.multiplyScalar(viewDistance)
      );
      destination.y = Math.max(destination.y, 1.5);

      const tl = gsap.timeline({
        onComplete: () => {
          this._isAnimating = false;
          resolve();
        },
      });

      tl.to(this.camera.position, {
        x: destination.x,
        y: destination.y,
        z: destination.z,
        duration,
        ease: 'power2.inOut',
      }, 0);

      tl.to(this.controls.target, {
        x: targetWorldPos.x,
        y: targetWorldPos.y,
        z: targetWorldPos.z,
        duration,
        ease: 'power2.inOut',
        onUpdate: () => this.controls.update(),
      }, 0);
    });
  }

  flyBack(duration = 1.0) {
    return new Promise((resolve) => {
      this._isAnimating = true;

      const tl = gsap.timeline({
        onComplete: () => {
          this._isAnimating = false;
          this.controls.enabled = true;
          resolve();
        },
      });

      tl.to(this.camera.position, {
        x: 10, y: 6, z: 14,
        duration,
        ease: 'power2.inOut',
      }, 0);

      tl.to(this.controls.target, {
        x: 0, y: 8, z: 0,
        duration,
        ease: 'power2.inOut',
        onUpdate: () => this.controls.update(),
      }, 0);
    });
  }

  _clampCrownCollision() {
    const dist = this.camera.position.distanceTo(this._crownCenter);
    if (dist < this._crownRadius) {
      const pushDir = this.camera.position.clone().sub(this._crownCenter).normalize();
      this.camera.position.copy(
        this._crownCenter.clone().add(pushDir.multiplyScalar(this._crownRadius))
      );
    }
  }

  update() {
    if (!this._isAnimating) {
      this.controls.update();
      this._clampCrownCollision();
    }
  }
}
