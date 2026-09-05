import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';

const waitForFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

export class ModelLoader {
  constructor(config, onProgress = () => {}) {
    this.config = config;
    this.onProgress = onProgress;
    this.loader = new OBJLoader();
  }

  async loadSourceText() {
    const response = await fetch(this.config.path);
    if (!response.ok) throw new Error(`Could not load ${this.config.path} (${response.status})`);

    const total = Number(response.headers.get('content-length')) || 0;
    if (!response.body) return response.text();

    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (total) this.onProgress(Math.min(0.54, (received / total) * 0.54), 'LOADING GEOMETRY');
    }

    const bytes = new Uint8Array(received);
    let offset = 0;
    chunks.forEach((chunk) => {
      bytes.set(chunk, offset);
      offset += chunk.length;
    });
    return new TextDecoder().decode(bytes);
  }

  async load() {
    const sourceText = await this.loadSourceText();
    this.onProgress(0.56, 'PARSING GEOMETRY');
    const sanitizedSource = sourceText.replace(/^(?:cstype|deg|curv|parm|end)\b.*(?:\r?\n|$)/gm, '');
    const sourceRoot = this.loader.parse(sanitizedSource);

    sourceRoot.rotation.fromArray(this.config.rotation ?? [0, 0, 0]);
    sourceRoot.updateMatrixWorld(true);

    const sourceBounds = new THREE.Box3().makeEmpty();
    const boundsPoint = new THREE.Vector3();
    sourceRoot.traverse((child) => {
      const positionAttribute = child.geometry?.getAttribute('position');
      if (!positionAttribute || (!child.isMesh && !child.isPoints)) return;
      const normalAttribute = child.geometry.getAttribute('normal');
      const usableCount = child.isPoints && normalAttribute
        ? Math.min(positionAttribute.count, normalAttribute.count)
        : positionAttribute.count;

      for (let index = 0; index < usableCount; index += 1) {
        boundsPoint.fromBufferAttribute(positionAttribute, index).applyMatrix4(child.matrixWorld);
        if (Number.isFinite(boundsPoint.x) && Number.isFinite(boundsPoint.y) && Number.isFinite(boundsPoint.z)) {
          sourceBounds.expandByPoint(boundsPoint);
        }
      }
    });

    if (sourceBounds.isEmpty()) {
      throw new Error(`No finite geometry bounds were found in ${this.config.path}`);
    }
    const center = sourceBounds.getCenter(new THREE.Vector3());
    const size = sourceBounds.getSize(new THREE.Vector3());
    const normalizationScale = (2.35 / Math.max(size.x, size.y, size.z)) * (this.config.scale ?? 1);
    const normalization = new THREE.Matrix4()
      .makeScale(normalizationScale, normalizationScale, normalizationScale)
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));

    const interactionRoot = new THREE.Group();
    interactionRoot.name = 'interaction-surface';
    const samplers = [];
    let totalArea = 0;

    sourceRoot.traverse((child) => {
      if (!child.geometry?.getAttribute('position')) return;
      if (!child.isMesh && !child.isPoints) return;

      const geometry = child.geometry.clone();
      if (child.isPoints && geometry.getAttribute('normal')) {
        // Rhino OBJ exports containing rational curves can be classified as Points
        // by OBJLoader even though their buffers begin with valid triangle faces.
        const positionAttribute = geometry.getAttribute('position');
        const normalAttribute = geometry.getAttribute('normal');
        const triangleVertexCount = Math.floor(Math.min(positionAttribute.count, normalAttribute.count) / 3) * 3;
        geometry.setAttribute(
          'position',
          new THREE.BufferAttribute(positionAttribute.array.slice(0, triangleVertexCount * positionAttribute.itemSize), 3),
        );
        geometry.setAttribute(
          'normal',
          new THREE.BufferAttribute(normalAttribute.array.slice(0, triangleVertexCount * normalAttribute.itemSize), 3),
        );
      }
      geometry.applyMatrix4(normalization.clone().multiply(child.matrixWorld));
      geometry.deleteAttribute('color');
      geometry.deleteAttribute('uv');
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      const debugMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        opacity: 0.14,
        transparent: true,
        depthWrite: false,
        colorWrite: false,
        side: THREE.DoubleSide,
      });
      const surfaceMesh = new THREE.Mesh(geometry, debugMaterial);
      interactionRoot.add(surfaceMesh);

      const sampler = new MeshSurfaceSampler(surfaceMesh).build();
      const area = sampler.distribution.at(-1) ?? 0;
      if (area > 0) {
        totalArea += area;
        samplers.push({ sampler, cumulativeArea: totalArea });
      }
    });

    if (samplers.length === 0 || totalArea === 0) {
      throw new Error(`No sampleable triangle surfaces were found in ${this.config.path}`);
    }

    const bounds = new THREE.Box3().setFromObject(interactionRoot);
    const normalizedSize = bounds.getSize(new THREE.Vector3());
    this.onProgress(0.62, 'PREPARING SURFACE');

    return { interactionRoot, samplers, totalArea, bounds, size: normalizedSize };
  }

  async sampleSurface(model, textureSize) {
    const particleCount = textureSize * textureSize;
    const restData = new Float32Array(particleCount * 4);
    const normalData = new Float32Array(particleCount * 4);
    const position = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const batchSize = 8192;

    for (let index = 0; index < particleCount; index += 1) {
      const selection = Math.random() * model.totalArea;
      const entry = model.samplers.find(({ cumulativeArea }) => selection <= cumulativeArea)
        ?? model.samplers.at(-1);

      entry.sampler.sample(position, normal);
      const offset = index * 4;
      restData[offset] = position.x;
      restData[offset + 1] = position.y;
      restData[offset + 2] = position.z;
      restData[offset + 3] = Math.random();
      normalData[offset] = normal.x;
      normalData[offset + 1] = normal.y;
      normalData[offset + 2] = normal.z;
      normalData[offset + 3] = Math.random();

      if (index > 0 && index % batchSize === 0) {
        const progress = 0.62 + (index / particleCount) * 0.34;
        this.onProgress(progress, `SAMPLING ${Math.round(index / 1000)}K / ${Math.round(particleCount / 1000)}K`);
        await waitForFrame();
      }
    }

    const createTexture = (data) => {
      const texture = new THREE.DataTexture(data, textureSize, textureSize, THREE.RGBAFormat, THREE.FloatType);
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      return texture;
    };

    this.onProgress(0.98, 'UPLOADING PARTICLES');
    return {
      restTexture: createTexture(restData),
      normalTexture: createTexture(normalData),
      particleCount,
      textureSize,
    };
  }

  setDebugVisible(interactionRoot, visible) {
    interactionRoot.traverse((child) => {
      if (!child.isMesh) return;
      child.material.colorWrite = visible;
      child.material.needsUpdate = true;
    });
  }
}
