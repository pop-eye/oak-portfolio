import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import CustomShaderMaterial from 'three-custom-shader-material/vanilla';
import gsap from 'gsap';
import { TreeSkeleton } from './tree/TreeSkeleton.js';
import { TrunkMesh } from './tree/TrunkMesh.js';
import { LeafSystem } from './tree/LeafSystem.js';
import { FruitSystem } from './tree/FruitSystem.js';
import { TREE_CONFIG } from './config.js';
import { portfolioItems } from './data/portfolio.js';
import { createPlaceholderBarkTextures } from './utils/TextureLoader.js';
import { CameraController } from './interaction/CameraController.js';
import { FruitRaycaster } from './interaction/Raycaster.js';
import { HoverEffects } from './interaction/HoverEffects.js';
import { PortfolioOverlay } from './interaction/PortfolioOverlay.js';
import { FruitHighlighter } from './interaction/FruitHighlighter.js';
import { Lighting } from './environment/Lighting.js';
import { Ground } from './environment/Ground.js';
import { PostProcessing } from './environment/PostProcessing.js';
import { LoadingManager } from './utils/LoadingManager.js';
import { PerformanceMonitor } from './utils/PerformanceMonitor.js';
import barkVertShader from './shaders/bark.vert.glsl';
import barkFragShader from './shaders/bark.frag.glsl';

// ── Error Boundaries ─────────────────────────────────────────
window.addEventListener('error', (e) => {
  console.error('Unhandled error:', e.error);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
});

// ── WebGL Check ──────────────────────────────────────────────
function checkWebGLSupport() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) {
    const screen = document.getElementById('loading-screen');
    if (screen) {
      screen.innerHTML = `
        <div class="loading-content" style="max-width:400px;">
          <p style="color:#ccc;font-family:system-ui;line-height:1.6;">
            This portfolio requires WebGL, which isn't available in your browser.
            Please try a modern browser like Chrome, Firefox, or Safari.
          </p>
          <nav style="margin-top:20px;">
            <p style="color:#999;font-size:14px;">Projects:</p>
            <ul id="fallback-list" style="color:#6B8F5B;list-style:none;padding:0;"></ul>
          </nav>
        </div>`;
      const list = document.getElementById('fallback-list');
      for (const item of portfolioItems) {
        const li = document.createElement('li');
        li.style.margin = '8px 0';
        const a = document.createElement('a');
        a.href = item.externalUrl || '#';
        a.textContent = item.title;
        a.style.color = '#6B8F5B';
        if (item.externalUrl) { a.target = '_blank'; a.rel = 'noopener'; }
        li.appendChild(a);
        list.appendChild(li);
      }
    }
    return false;
  }
  return true;
}

if (!checkWebGLSupport()) {
  throw new Error('WebGL not available');
}

// ── Device Capabilities ──────────────────────────────────────
function getDeviceCapabilities() {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
  const isLowEnd = isMobile && (
    navigator.hardwareConcurrency <= 4
    || window.innerWidth < 768
  );
  const pixelRatio = Math.min(window.devicePixelRatio, isMobile ? 1.0 : 2);
  return { isMobile, isLowEnd, pixelRatio };
}

const device = getDeviceCapabilities();

// ── Loading Manager ──────────────────────────────────────────
const loader = new LoadingManager();
loader.registerSteps([
  { name: 'Growing tree', weight: 3 },
  { name: 'Shaping bark', weight: 2 },
  { name: 'Adding leaves', weight: 2 },
  { name: 'Loading environment', weight: 2 },
  { name: 'Preparing scene', weight: 1 },
]);

// ── Accessibility: populate hidden project list ──────────────
function populateAccessibleList() {
  const list = document.querySelector('#portfolio-list ul');
  if (!list) return;
  for (const item of portfolioItems) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = item.externalUrl || '#';
    link.textContent = `${item.title}: ${item.description}`;
    if (item.externalUrl) { link.target = '_blank'; link.rel = 'noopener'; }
    li.appendChild(link);
    list.appendChild(li);
  }
}
populateAccessibleList();

// ── Renderer ────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(device.pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = device.isMobile ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// ── CSS2D Renderer (for floating labels) ─────────────────────
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
document.body.appendChild(labelRenderer.domElement);

// ── Scene ───────────────────────────────────────────────────
const scene = new THREE.Scene();

// ── Camera & Controls ───────────────────────────────────────
const camera = new THREE.PerspectiveCamera(
  50, window.innerWidth / window.innerHeight, 0.1, 200
);
const cameraController = new CameraController(camera, renderer.domElement);

if (device.isMobile) {
  cameraController.controls.rotateSpeed = 0.5;
  cameraController.controls.zoomSpeed = 0.6;
  cameraController.controls.dampingFactor = 0.08;
}

// ── Environment Lighting ─────────────────────────────────────
const lighting = new Lighting(scene, renderer);
const sunLight = lighting.getSunLight();

if (device.isMobile) {
  sunLight.shadow.mapSize.set(1024, 1024);
}
if (device.isLowEnd) {
  renderer.shadowMap.enabled = false;
}

// ── Ground Plane ─────────────────────────────────────────────
const ground = new Ground(scene);

// ── Dev FPS Monitor ─────────────────────────────────────────
let stats = null;
if (import.meta.env.DEV) {
  import('three/addons/libs/stats.module.js').then((mod) => {
    stats = new mod.default();
    stats.dom.style.position = 'fixed';
    stats.dom.style.top = '0';
    stats.dom.style.left = '0';
    stats.dom.style.zIndex = '200';
    document.body.appendChild(stats.dom);
  });
}

// ── Bark Textures & Material ────────────────────────────────
const barkTextures = createPlaceholderBarkTextures();
const barkUniforms = {
  uTime: { value: 0 },
  uWindStrength: { value: 0.3 },
  uWindDirection: { value: new THREE.Vector2(1.0, 0.3).normalize() },
  uBarkDiffuse: { value: barkTextures.diffuse },
  uBarkNormal: { value: barkTextures.normal },
  uBarkRoughness: { value: barkTextures.roughness },
  uBarkAO: { value: barkTextures.ao },
  uTexScale: { value: 0.25 },
  uProceduralWeight: { value: 0.6 },
  uMonochrome:        { value: 0.0 },
  uMobileMode:        { value: device.isMobile ? 1.0 : 0.0 },
};

const barkMaterial = new CustomShaderMaterial({
  baseMaterial: THREE.MeshStandardMaterial,
  vertexShader: barkVertShader,
  fragmentShader: barkFragShader,
  uniforms: barkUniforms,
  color: new THREE.Color(0xffffff),
  roughness: 0.85,
  metalness: 0.0,
  side: THREE.DoubleSide,
  vertexColors: true,
});

// ── Mobile performance overrides ────────────────────────────────────────────
// Reduce colonisation complexity on mobile so generation stays under ~1 s
// and the render loop remains responsive.
const treeConfig = device.isMobile ? {
  ...TREE_CONFIG,
  attractorCount: device.isLowEnd ? 1500 : 2500,
  maxIterations:  device.isLowEnd ? 120  : 150,
} : TREE_CONFIG;

// Leaf density options: greatly reduced on mobile to stay within GPU
// memory and fill-rate limits.
const leafOptions = device.isMobile ? {
  // Bark shader is heavily simplified on mobile, freeing GPU budget for more leaves.
  maxClusterSize: device.isLowEnd ? 8 : 16,
  depthThreshold: 0.28,
  minSpacing:     device.isLowEnd ? 0.4 : 0.28,
} : {};

// ── Generate Tree ───────────────────────────────────────────
const t0 = performance.now();

console.time('skeleton');
const skeleton = new TreeSkeleton(treeConfig);
await skeleton.generate();
console.timeEnd('skeleton');
loader.completeStep('Growing tree');

console.time('mesh');
const trunkMeshBuilder = new TrunkMesh(skeleton, treeConfig);
const trunkGeometry = trunkMeshBuilder.build();
console.timeEnd('mesh');

if (trunkGeometry) {
  const trunkMeshObj = new THREE.Mesh(trunkGeometry, barkMaterial);
  trunkMeshObj.castShadow = true;
  trunkMeshObj.receiveShadow = true;
  scene.add(trunkMeshObj);
  const triCount = trunkGeometry.index ? trunkGeometry.index.count / 3 : 0;
  console.log(`[TrunkMesh] triangles: ${triCount}, vertices: ${trunkGeometry.attributes.position.count}`);
}
loader.completeStep('Shaping bark');

// ── Leaf System ────────────────────────────────────────────
console.time('leaves');
const leafSystem = new LeafSystem(skeleton, treeConfig, leafOptions);
const leafChunks = leafSystem.build();
leafSystem.material.uniforms.uMobileMode.value = device.isMobile ? 1.0 : 0.0;
for (const chunk of leafChunks) {
  chunk.castShadow = true;
  chunk.receiveShadow = true;
  scene.add(chunk);
}
console.timeEnd('leaves');

const lightDir = sunLight.position.clone().normalize();
leafSystem.material.uniforms.uLightDirection.value.copy(lightDir);
loader.completeStep('Adding leaves');

// ── Fruit System ───────────────────────────────────────────
console.time('fruit');
const fruitSystem = new FruitSystem(skeleton, treeConfig, portfolioItems);
const fruitGroup = fruitSystem.build();
scene.add(fruitGroup);
fruitGroup.traverse((child) => {
  if (child.isMesh) child.castShadow = true;
});
console.timeEnd('fruit');

// ── Post-Processing Pipeline ──────────────────────────────
let postProcessing = null;
try {
  postProcessing = new PostProcessing(renderer, scene, camera, sunLight);
  console.log('[PostProcessing] Pipeline ready');
} catch (err) {
  console.warn('[PostProcessing] Failed, falling back to direct rendering:', err);
}

if (device.isMobile && postProcessing) {
  if (postProcessing.bloomEffect) postProcessing.bloomEffect.intensity = 0;
  // N8AO ambient occlusion is too expensive for mobile GPUs.
  if (postProcessing.n8aoPass) postProcessing.n8aoPass.enabled = false;
}
// Bypass the post-processing composer entirely on mobile — avoids all
// full-screen pass overhead since bloom and N8AO are disabled anyway.
if (device.isMobile) postProcessing = null;
if (device.isLowEnd && postProcessing) {
  postProcessing.setLowQuality();
}

loader.completeStep('Loading environment');

// ── Interaction ────────────────────────────────────────────
const hoverEffects = new HoverEffects();
const portfolioOverlay = new PortfolioOverlay();
const fruitRaycaster = new FruitRaycaster(camera, fruitSystem.fruitMeshes);

fruitRaycaster.onHoverEnter = (mesh) => hoverEffects.onHoverEnter(mesh);
fruitRaycaster.onHoverExit = (mesh) => hoverEffects.onHoverExit(mesh);

// Cycles through fruits automatically, drawing a digital reticle on each.
const fruitHighlighter = new FruitHighlighter(scene, fruitSystem.fruitMeshes, camera);
// Label clicks use the same zoom-and-open flow as direct fruit clicks.
fruitHighlighter.onLabelClick = (mesh) => fruitRaycaster.onClick?.(mesh);

fruitRaycaster.onClick = async (fruitMesh) => {
  const item = fruitMesh.userData.portfolioItem;
  fruitRaycaster.disable();
  fruitHighlighter.disable();
  hoverEffects.onHoverExit(fruitMesh);
  document.getElementById('fruit-nav').style.display = 'none';

  const fruitWorldPos = new THREE.Vector3();
  fruitMesh.getWorldPosition(fruitWorldPos);
  await cameraController.flyTo(fruitWorldPos, 1.2);

  gsap.to(renderer, {
    toneMappingExposure: 0.6,
    duration: 0.5,
    ease: 'power2.out',
  });

  portfolioOverlay.open(item);

  portfolioOverlay.onClose = async () => {
    gsap.to(renderer, {
      toneMappingExposure: 1.2,
      duration: 0.5,
      ease: 'power2.out',
    });
    await cameraController.flyBack(1.0);
    fruitRaycaster.enable();
    fruitHighlighter.enable();
    document.getElementById('fruit-nav').style.display = 'flex';
    document.getElementById('fruit-nav-counter').textContent =
      `${fruitHighlighter.currentIdx + 1} / ${fruitSystem.fruitMeshes.length}`;
  };
};

// ── Finalize Loading Screen ────────────────────────────────
loader.completeStep('Preparing scene');
await loader.hide();

// ── Fruit Navigation Arrows ───────────────────────────────────────
const _navEl      = document.getElementById('fruit-nav');
const _navCounter = document.getElementById('fruit-nav-counter');
const _navN       = fruitSystem.fruitMeshes.length;

const _updateNavCounter = () => {
  _navCounter.textContent = `${fruitHighlighter.currentIdx + 1} / ${_navN}`;
};
_updateNavCounter();
_navEl.style.display = 'flex';

const _navigate = (delta) => {
  const idx = ((fruitHighlighter.currentIdx + delta) + _navN) % _navN;
  // Jump the highlighter to the target fruit then open it
  fruitHighlighter.currentIdx = idx;
  fruitHighlighter._selectFruit(idx);
  fruitHighlighter.timer = 0;
  fruitRaycaster.onClick?.(fruitSystem.fruitMeshes[idx]);
};

document.getElementById('fruit-nav-left') .addEventListener('click', () => _navigate(-1));
document.getElementById('fruit-nav-right').addEventListener('click', () => _navigate(+1));

// ── Colour mode toggle ───────────────────────────────────────────
const _cmBtn = document.getElementById('colour-mode-btn');
_cmBtn.style.display = 'flex';

const _origBg = scene.background; // neon gradient env map
const _cmModes = [
  { icon: '◉', mono:  0.0, bgThree: _origBg,                       bgCss: '#060210', rockHex: 0x6e6e60 },
  { icon: '◑', mono:  1.0, bgThree: new THREE.Color(0x000000),      bgCss: '#000000', rockHex: 0xd0d0d0 },
  { icon: '◐', mono: -1.0, bgThree: new THREE.Color(0xeeeeee),      bgCss: '#e8e8e8', rockHex: 0x404040 },
];
let _cmIdx = 0;

const _applyCm = (idx) => {
  const m = _cmModes[idx];
  barkUniforms.uMonochrome.value = m.mono;
  leafSystem.material.uniforms.uMonochrome.value = m.mono;
  scene.background = m.bgThree;
  document.body.style.background = m.bgCss;
  const col = new THREE.Color(m.rockHex);
  for (const mesh of ground.meshes) {
    if (mesh.material?.color) mesh.material.color.copy(col);
  }
  _cmBtn.textContent = m.icon;
  _cmBtn.title       = _cmModes[(idx + 1) % 3].icon === '◉' ? 'Colour mode'
                     : _cmModes[(idx + 1) % 3].icon === '◑' ? 'Dark mono'
                     : 'Light mono';
};
_applyCm(0);

_cmBtn.addEventListener('click', () => {
  _cmIdx = (_cmIdx + 1) % 3;
  _applyCm(_cmIdx);
});

const totalTime = performance.now() - t0;
console.log(`[Total generation] ${totalTime.toFixed(0)}ms`);

// ── Performance Monitor ─────────────────────────────────────
const perfMonitor = new PerformanceMonitor({
  postProcessing,
  leafChunks,
  sunLight,
  renderer,
  initialQuality: device.isMobile ? 1 : 3,
});

// ── Keyboard Shortcuts ──────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if ((e.key === 'r' || e.key === 'R') && !portfolioOverlay.isOpen) {
    cameraController.flyBack(1.0);
  }
  if (!import.meta.env.DEV) return;
  if (e.key === 'w') barkMaterial.wireframe = !barkMaterial.wireframe;
  if (e.key === 'i') {
    console.log('Draw calls:', renderer.info.render.calls);
    console.log('Triangles:', renderer.info.render.triangles);
    console.log('Textures:', renderer.info.memory.textures);
    console.log('Geometries:', renderer.info.memory.geometries);
  }
  if (e.key === 'f' && stats) {
    stats.dom.style.display = stats.dom.style.display === 'none' ? 'block' : 'none';
  }
});

// ── Resize Handler ──────────────────────────────────────────
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  if (postProcessing) postProcessing.setSize(w, h);
}
window.addEventListener('resize', onResize);

// ── Animation Loop ──────────────────────────────────────────
const clock = new THREE.Clock();
let frameCount = 0;
let godraysScheduled = false;

function animate() {
  if (stats) stats.begin();

  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();
  barkUniforms.uTime.value = elapsed;
  leafSystem.update(elapsed);
  fruitSystem.update(elapsed);
  ground.update(elapsed);
  fruitHighlighter.update(elapsed, delta);

  cameraController.update();

  if (postProcessing) {
    postProcessing.render(delta);
  } else {
    renderer.render(scene, camera);
  }
  labelRenderer.render(scene, camera);

  perfMonitor.recordFrame(delta * 1000);
  perfMonitor.update();

  frameCount++;
  if (frameCount === 1) {
    console.log(`[Renderer] draw calls: ${renderer.info.render.calls}, triangles: ${renderer.info.render.triangles}`);
  }

  if (frameCount === 3 && postProcessing && !godraysScheduled) {
    godraysScheduled = true;
    postProcessing.enableN8AO();
    if (!device.isMobile) {
      postProcessing.enableGodrays();
    }
  }

  if (stats) stats.end();
}

// ── Start Sequence ──────────────────────────────────────────
// One pre-render to initialise shadow maps
renderer.render(scene, camera);
renderer.shadowMap.needsUpdate = true;

async function startSequence() {
  await loader.hide();
  renderer.setAnimationLoop(animate);
  fruitRaycaster.enable();
  await cameraController.playIntro(3.0);

  // URL hash navigation
  const hash = window.location.hash.slice(1);
  if (hash) {
    const fruitMesh = fruitSystem.fruitMeshes.find(
      (m) => m.userData.portfolioItem?.id === hash
    );
    if (fruitMesh) {
      setTimeout(() => fruitRaycaster.onClick?.(fruitMesh), 500);
    }
  }
}

startSequence();
