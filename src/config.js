export const TREE_CONFIG = {
  // Space colonization
  crownRadiusX: 9,
  crownRadiusY: 5,
  crownRadiusZ: 9,
  crownCenterY: 10,
  attractorCount: 6000,
  influenceRadius: 1.8,
  killDistance: 0.6,
  segmentLength: 0.4,
  maxIterations: 280,
  trunkHeight: 5,

  // Gravitropism — reduces the steepness of upward growth so branches
  // spread laterally rather than all pointing toward the sky.
  gravitropism: 0.35,

  // Thickness (Leonardo's pipe model)
  pipeExponent: 2.3,
  trunkBaseRadius: 0.7,

  // Cross-section
  crossSectionHarmonics: true,

  // Gnarliness
  gnarliness: 0.6,
  surfaceNoiseIntensity: 0.08,
  surfaceNoiseFrequency: 1.5,
  surfaceNoiseOctaves: 3,

  // Root flare
  flareHeight: 1.8,
  flareAmount: 0.8,
  lobeCount: 5,

  // Burls
  burlCount: 5,
  burlRadiusMin: 0.15,
  burlRadiusMax: 0.35,
  burlHeightMin: 0.04,
  burlHeightMax: 0.1,
  burlMinSpacing: 1.5,

  // Dead stubs
  deadStubCount: 3,
  deadStubLength: 0.3,

  // Branch junctions
  collarSize: 0.15,
  weldSpread: 1.2,

  // Mesh resolution
  trunkRadialSegments: 12,
  primaryRadialSegments: 8,
  secondaryRadialSegments: 5,
  tertiaryRadialSegments: 4,
  trunkAxialSpacing: 0.2,
  branchAxialSpacing: 0.45,

  // Seed
  seed: 42,
};
