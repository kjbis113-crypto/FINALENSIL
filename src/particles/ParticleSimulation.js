import * as THREE from 'three';
import fullscreenVertexShader from '../shaders/fullscreen.vert.glsl?raw';
import initializeFragmentShader from '../shaders/initialize.frag.glsl?raw';
import simulationFragmentShader from '../shaders/simulation.frag.glsl?raw';

export class ParticleSimulation {
  constructor(renderer, surfaceData, parameters) {
    this.renderer = renderer;
    this.parameters = parameters;
    this.size = surfaceData.textureSize;
    this.restTexture = surfaceData.restTexture;
    this.normalTexture = surfaceData.normalTexture;
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.scene.add(this.quad);

    const gl = renderer.getContext();
    const supportsFloatTargets = Boolean(gl.getExtension('EXT_color_buffer_float'));
    this.renderTargetType = supportsFloatTargets ? THREE.FloatType : THREE.HalfFloatType;
    this.targets = [this.createStateTarget(), this.createStateTarget()];
    this.readIndex = 0;

    this.initializeMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { uRest: { value: this.restTexture } },
      vertexShader: fullscreenVertexShader,
      fragmentShader: initializeFragmentShader,
      depthTest: false,
      depthWrite: false,
    });

    this.simulationMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        uPositionState: { value: null },
        uVelocityState: { value: null },
        uRest: { value: this.restTexture },
        uNormal: { value: this.normalTexture },
        uTime: { value: 0 },
        uDelta: { value: 0 },
        uPointerPosition: { value: new THREE.Vector3(99, 99, 99) },
        uPointerVelocity: { value: new THREE.Vector3() },
        uPointerActive: { value: 0 },
        uPointerDown: { value: 0 },
        uPointerHold: { value: 0 },
        uInteractionRadius: { value: parameters.interactionRadius },
        uInteractionStrength: { value: parameters.interactionStrength },
        uCurlStrength: { value: parameters.curlStrength },
        uCurlScale: { value: parameters.curlScale },
        uCurlSpeed: { value: parameters.curlSpeed },
        uReturnStrength: { value: parameters.returnStrength },
        uTangentStrength: { value: parameters.tangentStrength },
        uVelocityInfluence: { value: parameters.velocityInfluence },
        uDamping: { value: parameters.damping },
      },
      vertexShader: fullscreenVertexShader,
      fragmentShader: simulationFragmentShader,
      depthTest: false,
      depthWrite: false,
    });

    this.reset();
  }

  createStateTarget() {
    const target = new THREE.WebGLRenderTarget(this.size, this.size, {
      count: 2,
      type: this.renderTargetType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    target.textures[0].name = 'particle-position-state';
    target.textures[1].name = 'particle-velocity-state';
    return target;
  }

  renderTo(target, material) {
    const previousTarget = this.renderer.getRenderTarget();
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(previousTarget);
  }

  reset() {
    this.renderTo(this.targets[0], this.initializeMaterial);
    this.renderTo(this.targets[1], this.initializeMaterial);
    this.readIndex = 0;
  }

  update(time, delta, pointer) {
    if (this.parameters.freezeSimulation) return;

    const read = this.targets[this.readIndex];
    const write = this.targets[1 - this.readIndex];
    const uniforms = this.simulationMaterial.uniforms;
    uniforms.uPositionState.value = read.textures[0];
    uniforms.uVelocityState.value = read.textures[1];
    uniforms.uTime.value = time;
    uniforms.uDelta.value = delta;
    uniforms.uPointerPosition.value.copy(pointer.position);
    uniforms.uPointerVelocity.value.copy(pointer.velocity);
    uniforms.uPointerActive.value = pointer.active;
    uniforms.uPointerDown.value = pointer.down;
    uniforms.uPointerHold.value = pointer.hold;
    uniforms.uInteractionRadius.value = this.parameters.interactionRadius;
    uniforms.uInteractionStrength.value = this.parameters.interactionStrength;
    uniforms.uCurlStrength.value = this.parameters.curlStrength;
    uniforms.uCurlScale.value = this.parameters.curlScale;
    uniforms.uCurlSpeed.value = this.parameters.curlSpeed;
    uniforms.uReturnStrength.value = this.parameters.returnStrength;
    uniforms.uTangentStrength.value = this.parameters.tangentStrength;
    uniforms.uVelocityInfluence.value = this.parameters.velocityInfluence;
    uniforms.uDamping.value = this.parameters.damping;

    this.renderTo(write, this.simulationMaterial);
    this.readIndex = 1 - this.readIndex;
  }

  get positionTexture() {
    return this.targets[this.readIndex].textures[0];
  }

  get velocityTexture() {
    return this.targets[this.readIndex].textures[1];
  }

  dispose() {
    this.targets.forEach((target) => target.dispose());
    this.quad.geometry.dispose();
    this.initializeMaterial.dispose();
    this.simulationMaterial.dispose();
  }
}
