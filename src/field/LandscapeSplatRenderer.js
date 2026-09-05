import * as THREE from 'three';
import landscapeVertexShader from '../shaders/landscape-splats.vert.glsl?raw';
import landscapeFragmentShader from '../shaders/landscape-splats.frag.glsl?raw';

export const LANDSCAPE_SPLAT_LAYER = 2;

export const FIELD_VISUAL_CONFIG = {
  landscapeSplatCount: {
    low: 100000,
    medium: 220000,
    high: 360000,
    ultra: 500000,
  },
  secondaryParticlePercent: {
    low: 0,
    medium: 0.02,
    high: 0.035,
    ultra: 0.05,
  },
  splatSize: 1.62,
  splatOpacity: 0.94,
  splatGaussianSharpness: 3.8,
  splatSurfaceThickness: 0.34,
  secondaryParticleOffset: 0.64,
  landscapeSaturation: 0.82,
  landscapeBrightness: 0.9,
  revealDurationMs: 480,
};

const QUALITY_ORDER = ['low', 'medium', 'high', 'ultra'];
const ASSET_ROOT = '/models/ghost-forest';

function chooseLandscapeQuality(renderer, mobile, reducedMotion) {
  if (mobile || reducedMotion) return 'low';

  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  const gl = renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = String(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : '').toLowerCase();
  const legacyGpu = /(intel.*(hd graphics|iris(?!.*xe))|radeon pro (4|5)[0-9]{2}|geforce gt[x]? [67][0-9]{2})/.test(gpu);
  const modernGpu = /(apple m[2-9]|radeon rx|geforce rtx|iris xe)/.test(gpu);

  if (legacyGpu || cores <= 4 || memory <= 4) return 'low';
  if (cores <= 6 || memory <= 8) return 'medium';
  if (modernGpu && cores >= 10 && memory >= 16) return 'ultra';
  return 'high';
}

function loadTexture(renderer) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      `${ASSET_ROOT}/ghost-forest.png`,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
}

/**
 * The attached Ghost Forest OBJ is sampled once by the build script with an
 * area-weighted triangle distribution. Runtime receives compact attributes and
 * issues a single instanced draw; no landscape positions are updated on the CPU.
 */
export class LandscapeSplatRenderer {
  constructor({ renderer, mobile, reducedMotion }) {
    this.renderer = renderer;
    this.config = FIELD_VISUAL_CONFIG;
    this.quality = chooseLandscapeQuality(renderer, mobile, reducedMotion);
    this.root = new THREE.Group();
    this.root.name = 'GHOST_FOREST_POINT_FIELD';
    this.root.userData.isLandscapeSplat = true;
    this.slowFrameSeconds = 0;
    this.performanceWindow = 0;
    this.performanceFrames = 0;
    this.secondaryEnabled = true;
  }

  async load() {
    const [metadataResponse, dataResponse, texture] = await Promise.all([
      fetch(`${ASSET_ROOT}/ghost-forest.splat.json`),
      fetch(`${ASSET_ROOT}/ghost-forest.splat`),
      loadTexture(this.renderer),
    ]);
    if (!metadataResponse.ok || !dataResponse.ok) {
      texture.dispose();
      throw new Error('The Ghost Forest landscape data could not be loaded.');
    }

    this.metadata = await metadataResponse.json();
    const buffer = await dataResponse.arrayBuffer();
    const count = this.metadata.sampleCount;
    const positionBytes = count * 3 * Int16Array.BYTES_PER_ELEMENT;
    const normalBytes = count * 3 * Int8Array.BYTES_PER_ELEMENT;
    const uvBytes = count * 2 * Uint16Array.BYTES_PER_ELEMENT;
    const dataBytes = count * 4 * Uint8Array.BYTES_PER_ELEMENT;
    const positions = new Int16Array(buffer, 0, count * 3);
    const normals = new Int8Array(buffer, positionBytes, count * 3);
    const uvs = new Uint16Array(buffer, positionBytes + normalBytes, count * 2);
    const variations = new Uint8Array(buffer, positionBytes + normalBytes + uvBytes, count * 4);
    const heightOffset = positionBytes + normalBytes + uvBytes + dataBytes;
    const heightCount = this.metadata.heightGrid.size ** 2;
    const heights = new Int16Array(buffer, heightOffset, heightCount);

    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -1, -1, 0,
      1, -1, 0,
      1, 1, 0,
      -1, 1, 0,
    ], 3));
    geometry.setAttribute('aPosition', new THREE.InstancedBufferAttribute(positions, 3, true));
    geometry.setAttribute('aNormal', new THREE.InstancedBufferAttribute(normals, 3, true));
    geometry.setAttribute('aUv', new THREE.InstancedBufferAttribute(uvs, 2, true));
    geometry.setAttribute('aData', new THREE.InstancedBufferAttribute(variations, 4, true));
    geometry.instanceCount = Math.min(this.config.landscapeSplatCount[this.quality], count);

    const drawingBuffer = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.texture = texture;
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        uTime: { value: 0 },
        uLandscapeMap: { value: texture },
        uSplatSize: { value: this.config.splatSize },
        uOpacity: { value: this.config.splatOpacity },
        uGaussianSharpness: { value: this.config.splatGaussianSharpness },
        uSurfaceThickness: { value: this.config.splatSurfaceThickness },
        uSecondaryPercent: { value: this.config.secondaryParticlePercent[this.quality] },
        uSecondaryOffset: { value: this.config.secondaryParticleOffset },
        uSaturation: { value: this.config.landscapeSaturation },
        uBrightness: { value: this.config.landscapeBrightness },
        uViewport: { value: drawingBuffer.clone() },
        uReveal: { value: 0 },
      },
      vertexShader: landscapeVertexShader,
      fragmentShader: landscapeFragmentShader,
      transparent: true,
      depthTest: true,
      depthWrite: true,
      blending: THREE.NormalBlending,
      toneMapped: true,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'FIELD_GAUSSIAN_SPLATS';
    this.mesh.layers.set(LANDSCAPE_SPLAT_LAYER);
    this.mesh.userData.isLandscapeSplat = true;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -2;
    this.root.add(this.mesh);

    this.groundProxy = this.buildGroundProxy(heights);
    this.root.add(this.groundProxy);
    this.loadedAt = performance.now();

    this.renderer.domElement.dataset.landscapeRenderer = 'GAUSSIAN_SPLATS';
    this.renderer.domElement.dataset.landscapeSource = 'GHOST_FOREST_OBJ';
    this.renderer.domElement.dataset.landscapeQuality = this.quality.toUpperCase();
    this.renderer.domElement.dataset.landscapeSplatCount = String(geometry.instanceCount);
    return this;
  }

  buildGroundProxy(heights) {
    const gridSize = this.metadata.heightGrid.size;
    const minimum = this.metadata.normalizedBounds.minimum;
    const maximum = this.metadata.normalizedBounds.maximum;
    const positions = new Float32Array(gridSize * gridSize * 3);
    const indices = new Uint32Array((gridSize - 1) * (gridSize - 1) * 6);
    let indexCursor = 0;

    for (let z = 0; z < gridSize; z += 1) {
      for (let x = 0; x < gridSize; x += 1) {
        const cell = z * gridSize + x;
        const offset = cell * 3;
        positions[offset] = THREE.MathUtils.lerp(minimum[0], maximum[0], x / (gridSize - 1));
        positions[offset + 1] = heights[cell] / 32767;
        positions[offset + 2] = THREE.MathUtils.lerp(minimum[2], maximum[2], z / (gridSize - 1));
        if (x === gridSize - 1 || z === gridSize - 1) continue;
        const next = cell + 1;
        const below = cell + gridSize;
        indices[indexCursor++] = cell;
        indices[indexCursor++] = below;
        indices[indexCursor++] = next;
        indices[indexCursor++] = next;
        indices[indexCursor++] = below;
        indices[indexCursor++] = below + 1;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    material.colorWrite = false;
    material.depthWrite = false;
    const proxy = new THREE.Mesh(geometry, material);
    proxy.name = 'GHOST_FOREST_GROUND_PROXY';
    proxy.visible = false;
    proxy.userData.isLandscapeGround = true;
    proxy.userData.isCommonField = true;
    proxy.userData.creatureClearance = 0.52;
    return proxy;
  }

  setSize() {
    if (!this.material) return;
    this.renderer.getDrawingBufferSize(this.material.uniforms.uViewport.value);
  }

  update(time, dt) {
    if (!this.material) return;
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uReveal.value = Math.min(
      1,
      (performance.now() - this.loadedAt) / this.config.revealDurationMs,
    );

    this.performanceWindow += dt;
    this.performanceFrames += 1;
    if (this.performanceWindow < 3 || performance.now() - this.loadedAt < 6000) return;

    const fps = this.performanceFrames / this.performanceWindow;
    this.slowFrameSeconds = fps < 44 ? this.slowFrameSeconds + this.performanceWindow : 0;
    this.performanceWindow = 0;
    this.performanceFrames = 0;
    if (this.slowFrameSeconds < 3) return;

    if (this.secondaryEnabled && this.material.uniforms.uSecondaryPercent.value > 0) {
      this.secondaryEnabled = false;
      this.material.uniforms.uSecondaryPercent.value = 0;
    } else {
      const qualityIndex = QUALITY_ORDER.indexOf(this.quality);
      if (qualityIndex > 0) {
        this.quality = QUALITY_ORDER[qualityIndex - 1];
        this.mesh.geometry.instanceCount = this.config.landscapeSplatCount[this.quality];
        this.renderer.domElement.dataset.landscapeQuality = this.quality.toUpperCase();
        this.renderer.domElement.dataset.landscapeSplatCount = String(this.mesh.geometry.instanceCount);
      }
    }
    this.slowFrameSeconds = 0;
  }

  dispose() {
    this.mesh?.geometry.dispose();
    this.material?.dispose();
    this.texture?.dispose();
    this.groundProxy?.geometry.dispose();
    this.groundProxy?.material.dispose();
    this.root.removeFromParent();
  }
}
