import * as THREE from 'three';

/**
 * Generate a procedural oak leaf texture on a canvas.
 * PLACEHOLDER — replace with a real texture for production.
 */
export function generateOakLeafTexture(size = 512) {
  console.warn('Using procedural leaf texture — replace with real texture for production');

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const leafLength = size * 0.42;
  const leafWidth = size * 0.28;

  // Draw oak leaf shape with lobes
  ctx.fillStyle = '#3a7d32';
  ctx.beginPath();

  // Start at tip
  ctx.moveTo(cx, cy - leafLength);

  const lobes = 5;
  const pts = [];

  // Right side
  for (let i = 0; i < lobes; i++) {
    const t = (i + 0.3) / lobes;
    const y = cy - leafLength + t * leafLength * 2;
    const widthAtT = Math.sin(t * Math.PI);
    const baseW = leafWidth * widthAtT * 0.65;
    const lobeW = leafWidth * 0.35 * widthAtT;

    // Lobe peak
    pts.push({ x: cx + baseW + lobeW, y: y - leafLength * 0.04 });
    // Sinus between lobes
    pts.push({ x: cx + baseW * 0.55, y: y + leafLength * 0.06 });
  }

  // Draw right side
  for (const p of pts) {
    ctx.lineTo(p.x, p.y);
  }

  // Stem base
  ctx.lineTo(cx + 2, cy + leafLength * 0.85);
  ctx.lineTo(cx, cy + leafLength);
  ctx.lineTo(cx - 2, cy + leafLength * 0.85);

  // Left side (mirror)
  for (let i = pts.length - 1; i >= 0; i--) {
    ctx.lineTo(cx - (pts[i].x - cx), pts[i].y);
  }

  ctx.closePath();
  ctx.fill();

  // Central vein
  ctx.strokeStyle = '#2d6628';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy - leafLength * 0.85);
  ctx.lineTo(cx, cy + leafLength * 0.75);
  ctx.stroke();

  // Side veins to lobes
  ctx.lineWidth = 1.2;
  for (let i = 0; i < lobes; i++) {
    const t = (i + 0.3) / lobes;
    const y = cy - leafLength + t * leafLength * 2;
    const widthAtT = Math.sin(t * Math.PI);
    const baseW = leafWidth * widthAtT * 0.65;
    const lobeW = leafWidth * 0.25 * widthAtT;

    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.quadraticCurveTo(cx + baseW * 0.5, y - 5, cx + baseW + lobeW * 0.7, y - 3);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.quadraticCurveTo(cx - baseW * 0.5, y - 5, cx - baseW - lobeW * 0.7, y - 3);
    ctx.stroke();
  }

  // Colour variation noise
  const imageData = ctx.getImageData(0, 0, size, size);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 0) {
      const v = (Math.random() - 0.5) * 18;
      d[i] = Math.max(0, Math.min(255, d[i] + v));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + v));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + v * 0.5));
    }
  }
  ctx.putImageData(imageData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
