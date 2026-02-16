import * as THREE from 'three';

/**
 * Branch collar displacement at junction points.
 * Creates a torus-like swelling where branches meet the trunk,
 * strongest on the underside of the branch attachment.
 */

/**
 * Compute collar displacement for a vertex near a branch junction.
 *
 * @param {THREE.Vector3} vertexPos - vertex world position
 * @param {THREE.Vector3} junctionPoint - where the branch meets the parent
 * @param {THREE.Vector3} branchDirection - normalised direction the child branch leaves
 * @param {number} branchRadius - radius of the child branch at the junction
 * @param {number} collarSize - displacement as fraction of branch radius (from config)
 * @returns {number} displacement along surface normal
 */
export function branchCollarDisplacement(vertexPos, junctionPoint, branchDirection, branchRadius, collarSize) {
  const toVertex = vertexPos.clone().sub(junctionPoint);
  const distAlongBranch = toVertex.dot(branchDirection);
  const radialVec = toVertex.clone().sub(branchDirection.clone().multiplyScalar(distAlongBranch));
  const distFromAxis = radialVec.length();

  // Collar strongest close to junction, falls off along both trunk and branch
  const axialFalloff = Math.exp(-Math.abs(distAlongBranch) / (branchRadius * 2));
  const radialFalloff = Math.exp(-Math.max(0, distFromAxis - branchRadius * 0.5) / (branchRadius * 0.5));

  // Stronger below the branch than above (gravity effect on growth)
  const verticalBias = distAlongBranch < 0 ? 1.0 : 0.6;

  return branchRadius * collarSize * axialFalloff * radialFalloff * verticalBias;
}

/**
 * Compute junction info for all fork nodes in the skeleton.
 * Returns an array of junction descriptors used during mesh generation.
 *
 * @param {object} skeleton - TreeSkeleton instance
 * @returns {Array<{ point: Vector3, childDirections: Array<{ dir: Vector3, radius: number }> }>}
 */
export function computeJunctions(skeleton) {
  const nodes = skeleton.getNodes();
  const forkIndices = skeleton.getForkNodes();
  const junctions = [];

  for (const forkIdx of forkIndices) {
    const forkNode = nodes[forkIdx];
    const children = skeleton.getChildren(forkIdx);
    const childDirections = [];

    for (const childIdx of children) {
      const childNode = nodes[childIdx];
      const dir = childNode.position.clone().sub(forkNode.position).normalize();
      childDirections.push({
        dir,
        radius: childNode.thickness,
      });
    }

    junctions.push({
      point: forkNode.position.clone(),
      parentRadius: forkNode.thickness,
      childDirections,
    });
  }

  return junctions;
}
