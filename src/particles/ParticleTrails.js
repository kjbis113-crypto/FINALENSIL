import * as THREE from 'three';
import fullscreenVertexShader from '../shaders/fullscreen.vert.glsl?raw';
import copyFragmentShader from '../shaders/copy.frag.glsl?raw';
import trailsVertexShader from '../shaders/trails.vert.glsl?raw';
import trailsFragmentShader from '../shaders/trails.frag.glsl?raw';

const HISTORY_LENGTH = 8;

export class ParticleTrails {
  constructor(renderer, simulation, surfaceData, trailParticleCount, parameters) {
    this.renderer = renderer;
    this.simulation = simulation;
    this.parameters = parameters;
    this.size = surfaceData.textureSize;
    this.particleCount = surfaceData.particleCount;
    this.trailParticleCount = Math.min(trailParticleCount, this.particleCount);
    this.writeIndex = 0;

    this.copyScene = new THREE.Scene();
    this.copyCamera = new THREE.Camera();
    this.copyMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { uSource: { value: simulation.positionTexture } },
      vertexShader: fullscreenVertexShader,
      fragmentShader: copyFragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.copyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copyMaterial);
    this.copyScene.add(this.copyQuad);

    this.historyTargets = Array.from({ length: HISTORY_LENGTH }, () => new THREE.WebGLRenderTarget(this.size, this.size, {
      type: simulation.renderTargetType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    }));

    this.historyTargets.forEach(() => this.capture(simulation.positionTexture));
    this.material = this.createMaterial();
    this.geometry = this.createGeometry();
    this.lines = new THREE.LineSegments(this.geometry, this.material);
    this.lines.frustumCulled = false;
    this.updateUniforms();
  }

  createGeometry() {
    const verticesPerTrail = (HISTORY_LENGTH - 1) * 2;
    const vertexCount = this.trailParticleCount * verticesPerTrail;
    const positions = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const historyIndices = new Float32Array(vertexCount);
    const tails = new Float32Array(vertexCount);
    let cursor = 0;

    for (let trail = 0; trail < this.trailParticleCount; trail += 1) {
      const particleIndex = Math.floor((trail * 2654435761) % this.particleCount);
      const u = ((particleIndex % this.size) + 0.5) / this.size;
      const v = (Math.floor(particleIndex / this.size) + 0.5) / this.size;
      const individualLength = 4 + (trail % 5);

      for (let segment = 0; segment < HISTORY_LENGTH - 1; segment += 1) {
        const visible = segment < individualLength - 1 ? 1 : 0;
        const headAlpha = visible * (1 - segment / individualLength);
        const tailAlpha = visible * (1 - (segment + 1) / individualLength);

        uvs[cursor * 2] = u;
        uvs[cursor * 2 + 1] = v;
        historyIndices[cursor] = segment;
        tails[cursor] = Math.max(0, headAlpha);
        cursor += 1;

        uvs[cursor * 2] = u;
        uvs[cursor * 2 + 1] = v;
        historyIndices[cursor] = segment + 1;
        tails[cursor] = Math.max(0, tailAlpha);
        cursor += 1;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aParticleUv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute('aHistoryIndex', new THREE.BufferAttribute(historyIndices, 1));
    geometry.setAttribute('aTail', new THREE.BufferAttribute(tails, 1));
    return geometry;
  }

  createMaterial() {
    const uniforms = {
      uOpacity: { value: this.parameters.trailOpacity },
      uTrailLength: { value: this.parameters.trailLength },
    };
    for (let index = 0; index < HISTORY_LENGTH; index += 1) {
      uniforms[`uHistory${index}`] = { value: null };
    }

    return new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms,
      vertexShader: trailsVertexShader,
      fragmentShader: trailsFragmentShader,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }

  capture(source = this.simulation.positionTexture) {
    const target = this.historyTargets[this.writeIndex];
    const previousTarget = this.renderer.getRenderTarget();
    this.copyMaterial.uniforms.uSource.value = source;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.copyScene, this.copyCamera);
    this.renderer.setRenderTarget(previousTarget);
    this.writeIndex = (this.writeIndex + 1) % HISTORY_LENGTH;
  }

  updateUniforms() {
    for (let historyIndex = 0; historyIndex < HISTORY_LENGTH; historyIndex += 1) {
      const ringIndex = (this.writeIndex - 1 - historyIndex + HISTORY_LENGTH) % HISTORY_LENGTH;
      this.material.uniforms[`uHistory${historyIndex}`].value = this.historyTargets[ringIndex].texture;
    }
    this.material.uniforms.uOpacity.value = this.parameters.trailOpacity;
    this.material.uniforms.uTrailLength.value = this.parameters.trailLength;
  }

  update(frame) {
    if (frame % 2 === 0) this.capture();
    this.updateUniforms();
    this.lines.visible = !this.parameters.disableTrails;
  }
}
