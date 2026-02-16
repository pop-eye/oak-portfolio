import * as THREE from 'three';

/**
 * Compute rotation-minimizing (Bishop) frames along a polyline.
 * These frames avoid the twisting artefacts of Frenet-Serret frames
 * at inflection points and straight segments.
 *
 * @param {THREE.Vector3[]} points - Ordered polyline sample points (≥ 2)
 * @returns {{ T: THREE.Vector3, N: THREE.Vector3, B: THREE.Vector3 }[]} Frame per point
 */
export function computeParallelTransportFrames(points) {
  if (points.length < 2) {
    throw new Error('Need at least 2 points for parallel transport frames');
  }

  const frames = [];

  // First tangent
  let T = points[1].clone().sub(points[0]).normalize();

  // Initial normal: cross tangent with the axis most perpendicular to it
  const absT = new THREE.Vector3(Math.abs(T.x), Math.abs(T.y), Math.abs(T.z));
  let seed;
  if (absT.x <= absT.y && absT.x <= absT.z) seed = new THREE.Vector3(1, 0, 0);
  else if (absT.y <= absT.z) seed = new THREE.Vector3(0, 1, 0);
  else seed = new THREE.Vector3(0, 0, 1);

  let N = new THREE.Vector3().crossVectors(seed, T).normalize();
  let B = new THREE.Vector3().crossVectors(T, N);
  frames.push({ T: T.clone(), N: N.clone(), B: B.clone() });

  for (let i = 1; i < points.length - 1; i++) {
    const nextT = points[i + 1].clone().sub(points[i]).normalize();
    const axis = new THREE.Vector3().crossVectors(T, nextT);
    const len = axis.length();
    if (len > 1e-6) {
      axis.divideScalar(len);
      const angle = Math.acos(Math.max(-1, Math.min(1, T.dot(nextT))));
      const quat = new THREE.Quaternion().setFromAxisAngle(axis, angle);
      N.applyQuaternion(quat);
    }
    B = new THREE.Vector3().crossVectors(nextT, N).normalize();
    N = new THREE.Vector3().crossVectors(B, nextT).normalize();
    T = nextT;
    frames.push({ T: T.clone(), N: N.clone(), B: B.clone() });
  }

  // Duplicate last frame for the final point
  const last = frames[frames.length - 1];
  frames.push({ T: last.T.clone(), N: last.N.clone(), B: last.B.clone() });

  return frames;
}
