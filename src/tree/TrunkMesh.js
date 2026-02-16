import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { computeParallelTransportFrames } from './ParallelTransport.js';
import { getCrossSectionRadius } from './CrossSection.js';
import { NoiseDeformer } from './NoiseDeformer.js';
import { branchCollarDisplacement, computeJunctions } from './BranchJunction.js';
import { TREE_CONFIG } from '../config.js';
import { SimplexNoise } from '../utils/SimplexNoise.js';
import { mulberry32 } from '../utils/math.js';

/**
 * TrunkMesh — the core mesh generation pipeline.
 *
 * Takes a TreeSkeleton, sweeps non-circular cross-sections along each
 * branch segment using parallel transport frames, applies deformation
 * layers, and merges everything into a single BufferGeometry.
 */
export class TrunkMesh {
  constructor(skeleton, config = TREE_CONFIG) {
    this.skeleton = skeleton;
    this.config = config;

    const rng = mulberry32(config.seed + 777);
    this.simplex = new SimplexNoise(rng);
    this.branchRng = mulberry32(config.seed + 999);
    this.maxDepth = skeleton.getMaxDepth();

    this.deformer = new NoiseDeformer(config, config.seed + 555);

    // Feature flags — all deformation layers active
    this.enableSpineNoise = true;
    this.enableSurfaceFBM = true;
    this.enableRootFlare = true;
    this.enableBurls = true;

    this.enableCollars = true;

    this.burls = [];
    this.junctions = [];
  }

  /**
   * Build and return the merged BufferGeometry for the full tree.
   */
  build() {
    if (this.enableBurls) {
      this._generateBurls();
    }
    if (this.enableCollars) {
      this.junctions = computeJunctions(this.skeleton);
    }

    const segments = this.skeleton.getBranchSegments();
    const geometries = [];

    for (const segment of segments) {
      const geom = this._buildSegmentGeometry(segment);
      if (geom) geometries.push(geom);
    }

    // Junction welds — fill gaps at fork points
    const welds = this._generateJunctionWelds();
    for (const w of welds) geometries.push(w);

    // Dead branch stubs (Layer 5)
    const stubs = this._generateDeadStubs();
    for (const stub of stubs) geometries.push(stub);

    if (geometries.length === 0) return null;

    const merged = mergeGeometries(geometries, false);
    merged.computeVertexNormals();

    for (const g of geometries) g.dispose();

    return merged;
  }

  /**
   * Build geometry for a single branch segment (array of node indices).
   */
  _buildSegmentGeometry(segment) {
    if (segment.length < 2) return null;

    const nodes = this.skeleton.getNodes();
    const nodePositions = segment.map(i => nodes[i].position.clone());
    const nodeRadii = segment.map(i => nodes[i].thickness);

    const avgRadius = nodeRadii.reduce((a, b) => a + b, 0) / nodeRadii.length;
    const tier = this._getTier(avgRadius);

    const curve = new THREE.CatmullRomCurve3(nodePositions, false, 'centripetal');
    const totalLength = curve.getLength();
    const spacing = tier.axialSpacing;
    const sampleCount = Math.max(2, Math.ceil(totalLength / spacing));

    // Per-branch seed (deterministic per segment)
    const branchSeed = this.branchRng() * 1000;
    const branchPhase = this.branchRng();

    // Sample positions, apply spine noise, then compute frames
    const sampledPoints = [];
    const sampledRadii = [];
    const sampledTs = [];

    for (let i = 0; i <= sampleCount; i++) {
      const t = i / sampleCount;
      const point = curve.getPointAt(t);

      // Interpolate radius
      const nodeT = t * (segment.length - 1);
      const lo = Math.floor(nodeT);
      const hi = Math.min(lo + 1, segment.length - 1);
      const frac = nodeT - lo;
      const radius = nodeRadii[lo] * (1 - frac) + nodeRadii[hi] * frac;

      // Layer 1: Spine noise — perturb centreline BEFORE frame computation
      if (this.enableSpineNoise) {
        this.deformer.applySpineNoise(point, t, radius, branchSeed);
      }

      sampledPoints.push(point);
      sampledRadii.push(radius);
      sampledTs.push(t);
    }

    // Compute parallel transport frames on (noise-perturbed) points
    const frames = computeParallelTransportFrames(sampledPoints);

    const noise1D = (x, seedOffset = 0) => this.simplex.noise1D(x, seedOffset);

    const radialSegs = tier.radialSegments;
    const ringCount = sampledPoints.length;

    const positions = [];
    const uvs = [];
    const colors = [];

    // Determine if this segment includes the trunk base (for root flare)
    const segmentStartY = nodes[segment[0]].position.y;
    const isTrunkSegment = segmentStartY < 0.1 && avgRadius > this.config.trunkBaseRadius * 0.3;

    // Reusable vectors
    const vertexPos = new THREE.Vector3();
    const normalDir = new THREE.Vector3();

    let arcLength = 0;
    for (let i = 0; i < ringCount; i++) {
      if (i > 0) {
        arcLength += sampledPoints[i].distanceTo(sampledPoints[i - 1]);
      }

      const center = sampledPoints[i];
      const { N, B } = frames[i];
      const baseRadius = sampledRadii[i];
      const h = sampledTs[i];

      const firstNodeDepth = nodes[segment[0]].depth;
      const lastNodeDepth = nodes[segment[segment.length - 1]].depth;
      const depthAtRing = firstNodeDepth + (lastNodeDepth - firstNodeDepth) * h;
      const stiffness = depthAtRing / this.maxDepth;

      for (let j = 0; j <= radialSegs; j++) {
        const theta = (j / radialSegs) * Math.PI * 2;

        // Non-circular cross-section radius from harmonics
        let r;
        if (this.config.crossSectionHarmonics && baseRadius > 0.02) {
          r = getCrossSectionRadius(theta, h, baseRadius, branchSeed, noise1D);
        } else {
          r = baseRadius;
        }

        // Layer 3: Root flare (trunk base only)
        if (this.enableRootFlare && isTrunkSegment) {
          const worldY = center.y;
          r += this.deformer.rootFlare(theta, worldY, baseRadius);
        }

        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        // Position on ring
        vertexPos.set(
          center.x + N.x * cosT * r + B.x * sinT * r,
          center.y + N.y * cosT * r + B.y * sinT * r,
          center.z + N.z * cosT * r + B.z * sinT * r
        );

        // Outward normal direction (before displacement)
        normalDir.set(
          N.x * cosT + B.x * sinT,
          N.y * cosT + B.y * sinT,
          N.z * cosT + B.z * sinT
        ).normalize();

        // Layer 2: Surface fBM displacement along normal
        if (this.enableSurfaceFBM && baseRadius > 0.01) {
          const disp = this.deformer.surfaceFBM(vertexPos, baseRadius);
          vertexPos.x += normalDir.x * disp;
          vertexPos.y += normalDir.y * disp;
          vertexPos.z += normalDir.z * disp;
        }

        // Layer 4: Burl displacement along normal
        if (this.enableBurls && this.burls.length > 0) {
          const disp = this.deformer.burlDisplacement(vertexPos, this.burls);
          vertexPos.x += normalDir.x * disp;
          vertexPos.y += normalDir.y * disp;
          vertexPos.z += normalDir.z * disp;
        }

        // Branch collar displacement at junctions
        if (this.enableCollars) {
          let collarDisp = 0;
          for (const junc of this.junctions) {
            const distToJunc = vertexPos.distanceTo(junc.point);
            if (distToJunc > junc.parentRadius * 4) continue; // early out
            for (const child of junc.childDirections) {
              collarDisp += branchCollarDisplacement(
                vertexPos, junc.point, child.dir, child.radius, this.config.collarSize
              );
            }
          }
          if (collarDisp > 0) {
            vertexPos.x += normalDir.x * collarDisp;
            vertexPos.y += normalDir.y * collarDisp;
            vertexPos.z += normalDir.z * collarDisp;
          }
        }

        positions.push(vertexPos.x, vertexPos.y, vertexPos.z);
        uvs.push(j / radialSegs, arcLength);
        colors.push(0, branchPhase, stiffness);
      }
    }

    // Build indices
    const indices = [];
    const stride = radialSegs + 1;
    for (let i = 0; i < ringCount - 1; i++) {
      for (let j = 0; j < radialSegs; j++) {
        const a = i * stride + j;
        const b = a + stride;
        const c = a + 1;
        const d = b + 1;
        indices.push(a, b, c);
        indices.push(c, b, d);
      }
    }

    // Tip cap
    if (sampledRadii[sampledRadii.length - 1] < 0.05) {
      const tipCenter = sampledPoints[sampledPoints.length - 1];
      const tipIdx = positions.length / 3;
      positions.push(tipCenter.x, tipCenter.y, tipCenter.z);
      uvs.push(0.5, arcLength);
      colors.push(0, branchPhase, 1);

      const lastRingStart = (ringCount - 1) * stride;
      for (let j = 0; j < radialSegs; j++) {
        indices.push(lastRingStart + j, lastRingStart + j + 1, tipIdx);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geom.setIndex(indices);

    return geom;
  }

  /**
   * Generate burl positions along the trunk using Poisson-like spacing.
   */
  _generateBurls() {
    const nodes = this.skeleton.getNodes();
    const rng = mulberry32(this.config.seed + 333);
    const { burlCount, burlRadiusMin, burlRadiusMax, burlHeightMin, burlHeightMax, burlMinSpacing } = this.config;

    this.burls = [];

    // Find trunk/primary branch nodes for burl placement
    const candidates = [];
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].thickness > this.config.trunkBaseRadius * 0.15 && nodes[i].position.y > 1.0) {
        candidates.push(i);
      }
    }

    for (let attempt = 0; attempt < burlCount * 10 && this.burls.length < burlCount; attempt++) {
      const idx = candidates[(rng() * candidates.length) | 0];
      if (!idx && idx !== 0) continue;
      const pos = nodes[idx].position.clone();

      // Offset slightly from centreline
      const angle = rng() * Math.PI * 2;
      const r = nodes[idx].thickness * 0.8;
      pos.x += Math.cos(angle) * r;
      pos.z += Math.sin(angle) * r;

      // Check minimum spacing
      let tooClose = false;
      for (const existing of this.burls) {
        if (pos.distanceTo(existing.center) < burlMinSpacing) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      this.burls.push({
        center: pos,
        radius: burlRadiusMin + rng() * (burlRadiusMax - burlRadiusMin),
        height: burlHeightMin + rng() * (burlHeightMax - burlHeightMin),
      });
    }
  }

  /**
   * Generate small sphere-like welds at fork nodes to fill gaps
   * between parent and child branch segments.
   * Only welds thin-to-medium junctions — thick junctions already
   * overlap naturally and don't need filling.
   */
  _generateJunctionWelds() {
    const nodes = this.skeleton.getNodes();
    const forkIndices = this.skeleton.getForkNodes();
    const geometries = [];

    for (const forkIdx of forkIndices) {
      const node = nodes[forkIdx];
      const radius = node.thickness;

      // Skip junctions that are too thin to see or too thick
      // (thick junctions overlap naturally and welds cause messy geometry)
      if (radius < 0.04 || radius > 0.18) continue;

      const weldRadius = radius * 1.1;
      const segs = 3;
      const positions = [];
      const uvs = [];
      const colors = [];
      const indices = [];

      const stiffness = node.depth / this.maxDepth;

      for (let lat = 0; lat <= segs; lat++) {
        const theta = (lat / segs) * Math.PI;
        const sinT = Math.sin(theta);
        const cosT = Math.cos(theta);

        for (let lon = 0; lon <= segs * 2; lon++) {
          const phi = (lon / (segs * 2)) * Math.PI * 2;
          const x = node.position.x + sinT * Math.cos(phi) * weldRadius;
          const y = node.position.y + cosT * weldRadius;
          const z = node.position.z + sinT * Math.sin(phi) * weldRadius;
          positions.push(x, y, z);
          uvs.push(lon / (segs * 2), lat / segs);
          colors.push(0, 0, stiffness);
        }
      }

      const stride = segs * 2 + 1;
      for (let lat = 0; lat < segs; lat++) {
        for (let lon = 0; lon < segs * 2; lon++) {
          const a = lat * stride + lon;
          const b = a + stride;
          indices.push(a, b, a + 1);
          indices.push(a + 1, b, b + 1);
        }
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geom.setIndex(indices);
      geometries.push(geom);
    }

    return geometries;
  }

  /**
   * Generate dead branch stub geometries — short tapered cylinders
   * at random fork nodes or thick branch locations.
   */
  _generateDeadStubs() {
    const { deadStubCount, deadStubLength } = this.config;
    const nodes = this.skeleton.getNodes();
    const rng = mulberry32(this.config.seed + 444);
    const geometries = [];

    // Pick candidate nodes on thick branches
    const candidates = [];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.thickness > this.config.trunkBaseRadius * 0.12 && n.position.y > 2.0) {
        candidates.push(i);
      }
    }

    if (candidates.length === 0) return geometries;

    // Pick random subset with spacing
    const chosen = [];
    for (let attempt = 0; attempt < deadStubCount * 20 && chosen.length < deadStubCount; attempt++) {
      const idx = candidates[(rng() * candidates.length) | 0];
      const pos = nodes[idx].position;
      let tooClose = false;
      for (const c of chosen) {
        if (pos.distanceTo(nodes[c].position) < 2.0) { tooClose = true; break; }
      }
      if (!tooClose) chosen.push(idx);
    }

    for (const nodeIdx of chosen) {
      const node = nodes[nodeIdx];
      const stubRadius = node.thickness * 0.35;
      const stubLength = deadStubLength + rng() * 0.3;

      // Random outward direction (roughly horizontal)
      const angle = rng() * Math.PI * 2;
      const upTilt = (rng() - 0.3) * 0.5; // slight upward bias
      const dir = new THREE.Vector3(
        Math.cos(angle),
        upTilt,
        Math.sin(angle)
      ).normalize();

      const segs = 3; // axial segments
      const radSegs = 6;
      const positions = [];
      const uvs = [];
      const colors = [];
      const indices = [];

      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        // Taper to a rough broken end
        const r = stubRadius * (1 - t * 0.6 + rng() * 0.15 * t);
        const center = node.position.clone().add(dir.clone().multiplyScalar(t * stubLength));

        // Simple frame: dir is forward, compute N/B
        const up = new THREE.Vector3(0, 1, 0);
        const N = new THREE.Vector3().crossVectors(up, dir).normalize();
        if (N.length() < 0.01) N.set(1, 0, 0);
        const B = new THREE.Vector3().crossVectors(dir, N).normalize();

        for (let j = 0; j <= radSegs; j++) {
          const theta = (j / radSegs) * Math.PI * 2;
          positions.push(
            center.x + N.x * Math.cos(theta) * r + B.x * Math.sin(theta) * r,
            center.y + N.y * Math.cos(theta) * r + B.y * Math.sin(theta) * r,
            center.z + N.z * Math.cos(theta) * r + B.z * Math.sin(theta) * r
          );
          uvs.push(j / radSegs, t);
          colors.push(0, rng(), t); // wind encoding
        }
      }

      // Indices
      const stride = radSegs + 1;
      for (let i = 0; i < segs; i++) {
        for (let j = 0; j < radSegs; j++) {
          const a = i * stride + j;
          const b = a + stride;
          indices.push(a, b, a + 1);
          indices.push(a + 1, b, b + 1);
        }
      }

      // Tip cap
      const tipCenter = node.position.clone().add(dir.clone().multiplyScalar(stubLength));
      const tipIdx = positions.length / 3;
      positions.push(tipCenter.x, tipCenter.y, tipCenter.z);
      uvs.push(0.5, 1);
      colors.push(0, 0, 1);
      const lastRing = segs * stride;
      for (let j = 0; j < radSegs; j++) {
        indices.push(lastRing + j, lastRing + j + 1, tipIdx);
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geom.setIndex(indices);
      geometries.push(geom);
    }

    return geometries;
  }

  _getTier(radius) {
    const c = this.config;
    if (radius > c.trunkBaseRadius * 0.5) {
      return { radialSegments: c.trunkRadialSegments, axialSpacing: c.trunkAxialSpacing };
    } else if (radius > c.trunkBaseRadius * 0.2) {
      return { radialSegments: c.primaryRadialSegments, axialSpacing: c.branchAxialSpacing };
    } else if (radius > c.trunkBaseRadius * 0.08) {
      return { radialSegments: c.secondaryRadialSegments, axialSpacing: c.branchAxialSpacing };
    } else {
      return { radialSegments: c.tertiaryRadialSegments, axialSpacing: c.branchAxialSpacing * 1.2 };
    }
  }
}
