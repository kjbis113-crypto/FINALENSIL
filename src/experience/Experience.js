import * as THREE from 'three';
import GUI from 'lil-gui';
import { MODEL_CONFIGS, QUALITY_LEVELS, DEFAULT_PARAMETERS, selectQuality } from '../config.js';
import { Camera } from './Camera.js';
import { Renderer } from './Renderer.js';
import { ModelLoader } from '../loaders/ModelLoader.js';
import { ParticleSimulation } from '../particles/ParticleSimulation.js';
import { ParticleRenderer } from '../particles/ParticleRenderer.js';
import { ParticleTrails } from '../particles/ParticleTrails.js';
import { PointerField } from '../interaction/PointerField.js';

export class Experience {
  constructor(container) {
    this.container = container;
    this.params = new URLSearchParams(window.location.search);
    this.objectId = THREE.MathUtils.clamp(Number.parseInt(this.params.get('id') ?? '1', 10) || 1, 1, 4);
    this.modelConfig = MODEL_CONFIGS[this.objectId];
    this.qualityName = selectQuality();
    this.quality = QUALITY_LEVELS[this.qualityName];
    this.parameters = { ...DEFAULT_PARAMETERS, pointSize: DEFAULT_PARAMETERS.pointSize * this.modelConfig.pointSize };
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.artRoot = new THREE.Group();
    this.scene.add(this.artRoot);
    this.camera = new Camera(this.parameters);
    this.renderer = new Renderer(container, this.scene, this.camera.instance, this.quality, this.parameters);
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.frame = 0;
    this.ready = false;
    this.baseRotation = this.modelConfig.initialRotation ?? [0, 0, 0];
    this.loadingState = document.querySelector('.loading-state');
    this.loadingLabel = document.querySelector('.loading-label');
    this.loadingProgress = document.querySelector('.loading-progress');
    this.performanceFrames = 0;
    this.performanceTime = 0;
    this.reducedRenderCount = false;

    const label = `NO. ${this.objectId}`;
    document.title = `${label} — ENSIL`;
    document.querySelector('.object-number').textContent = label;
    this.loadingLabel.textContent = `LOADING ${label}`;
    this.container.dataset.quality = this.qualityName;

    window.addEventListener('resize', this.resize);
    requestAnimationFrame(this.animate);
    this.initialize().catch((error) => this.showError(error));
  }

  setProgress(progress, label) {
    this.loadingProgress.style.width = `${Math.round(progress * 100)}%`;
    this.loadingLabel.textContent = label;
  }

  async initialize() {
    this.modelLoader = new ModelLoader(this.modelConfig, (progress, label) => this.setProgress(progress, label));
    this.model = await this.modelLoader.load();
    this.camera.frame(this.model.bounds);

    const surfaceData = await this.modelLoader.sampleSurface(this.model, this.quality.textureSize);
    this.surfaceData = surfaceData;
    this.parameters.particleCount = surfaceData.particleCount;
    this.simulation = new ParticleSimulation(this.renderer.instance, surfaceData, this.parameters);
    this.particleRenderer = new ParticleRenderer(
      surfaceData,
      this.simulation,
      this.parameters,
      Math.min(window.devicePixelRatio, this.quality.pixelRatio),
    );
    this.trails = new ParticleTrails(
      this.renderer.instance,
      this.simulation,
      surfaceData,
      this.quality.trailParticles,
      this.parameters,
    );

    this.artRoot.add(this.model.interactionRoot, this.particleRenderer.root, this.trails.lines);
    this.artRoot.rotation.fromArray(this.baseRotation);
    this.pointer = new PointerField(
      this.renderer.instance.domElement,
      this.camera.instance,
      this.model.interactionRoot,
      this.artRoot,
    );

    if (this.params.get('debug') === 'true' && this.params.get('demo') === 'true') {
      this.pointer.position.set(0.28, 0.02, 0);
      this.pointer.targetPosition.copy(this.pointer.position);
      this.pointer.velocity.set(1.6, 0.32, 0.38);
      this.pointer.targetVelocity.copy(this.pointer.velocity);
      this.pointer.active = 1;
      this.pointer.targetActive = 1;
      this.pointer.down = 1;
      window.setTimeout(() => {
        this.pointer.down = 0;
        this.pointer.targetActive = 0;
      }, 1600);
    }

    if (this.params.get('debug') === 'true') this.createDebugGui();

    this.ready = true;
    this.container.dataset.ready = 'true';
    this.container.dataset.renderMode = 'gpu-point-cloud';
    this.container.dataset.particleCount = String(surfaceData.particleCount);
    this.setProgress(1, 'READY');
    this.loadingState.classList.add('is-complete');
  }

  createDebugGui() {
    this.gui = new GUI({ title: `ENSIL ${this.qualityName.toUpperCase()}` });
    const info = { particleCount: this.surfaceData.particleCount, quality: this.qualityName };
    this.gui.add(info, 'particleCount').disable().listen();
    this.gui.add(info, 'quality', Object.keys(QUALITY_LEVELS)).onChange((quality) => {
      const url = new URL(window.location.href);
      url.searchParams.set('quality', quality);
      window.location.assign(url);
    });
    this.gui.add(this.parameters, 'pointSize', 0.35, 2.5, 0.01);

    const interaction = this.gui.addFolder('Interaction');
    interaction.add(this.parameters, 'interactionRadius', 0.12, 1.1, 0.01);
    interaction.add(this.parameters, 'interactionStrength', 0.2, 8, 0.05);
    interaction.add(this.parameters, 'velocityInfluence', 0, 5, 0.05);
    interaction.add(this.parameters, 'tangentStrength', 0, 6, 0.05);

    const field = this.gui.addFolder('Vector field');
    field.add(this.parameters, 'curlStrength', 0, 4, 0.01);
    field.add(this.parameters, 'curlScale', 0.2, 3, 0.01);
    field.add(this.parameters, 'curlSpeed', 0, 0.3, 0.001);
    field.add(this.parameters, 'returnStrength', 0.1, 6, 0.05);
    field.add(this.parameters, 'damping', 0.1, 5, 0.05);

    const trails = this.gui.addFolder('Trails');
    trails.add(this.parameters, 'trailLength', 4, 8, 1);
    trails.add(this.parameters, 'trailOpacity', 0, 0.65, 0.01);
    trails.add(this.parameters, 'disableTrails');

    const image = this.gui.addFolder('Image');
    image.add(this.parameters, 'bloomStrength', 0, 0.8, 0.01);
    image.add(this.parameters, 'bloomRadius', 0, 0.5, 0.01);
    image.add(this.parameters, 'exposure', 0.3, 2, 0.01);
    image.add(this.parameters, 'cameraDistance', 2.8, 7, 0.01);
    image.add(this.parameters, 'disableBloom');

    const diagnostics = this.gui.addFolder('Diagnostics');
    diagnostics.add(this.parameters, 'freezeSimulation');
    diagnostics.add(this.parameters, 'showOriginalMesh').onChange((visible) => {
      this.modelLoader.setDebugVisible(this.model.interactionRoot, visible);
    });
    diagnostics.add(this.parameters, 'showInteractionSphere');
    diagnostics.add({ resetSimulation: () => this.simulation.reset() }, 'resetSimulation');
  }

  monitorPerformance(delta) {
    this.performanceFrames += 1;
    this.performanceTime += delta;
    if (this.performanceTime < 5 || this.reducedRenderCount) return;

    const fps = this.performanceFrames / this.performanceTime;
    this.container.dataset.measuredFps = fps.toFixed(1);
    if (fps < 43 && this.surfaceData.particleCount > 65536) {
      const adaptiveCount = Math.max(65536, Math.floor(this.surfaceData.particleCount * 0.62));
      this.particleRenderer.geometry.setDrawRange(0, adaptiveCount);
      this.parameters.disableTrails = true;
      this.parameters.disableBloom = true;
      this.container.dataset.adaptiveParticleCount = String(adaptiveCount);
      this.reducedRenderCount = true;
    }
    this.performanceFrames = 0;
    this.performanceTime = 0;
  }

  animate = (timestamp) => {
    requestAnimationFrame(this.animate);
    this.timer.update(timestamp);
    const delta = Math.min(this.timer.getDelta(), 0.033);
    const elapsed = this.timer.getElapsed();

    if (this.ready) {
      this.pointer.update(delta, this.parameters.showInteractionSphere);
      this.container.dataset.pointerActive = this.pointer.active.toFixed(3);
      this.container.dataset.pointerSpeed = this.pointer.velocity.length().toFixed(3);
      this.container.dataset.disintegrating = this.pointer.active > 0.08 ? 'true' : 'false';
      this.simulation.update(elapsed, delta, this.pointer);
      this.particleRenderer.update(elapsed, Math.min(window.devicePixelRatio, this.quality.pixelRatio));
      this.trails.update(this.frame);

      const subtleYaw = Math.sin(elapsed * 0.105) * THREE.MathUtils.degToRad(1.35);
      const subtlePitch = Math.cos(elapsed * 0.081) * THREE.MathUtils.degToRad(0.72);
      const pointerYaw = this.pointer.down ? 0 : (this.pointer.ndc.x || 0) * THREE.MathUtils.degToRad(0.8);
      const pointerPitch = this.pointer.down ? 0 : (this.pointer.ndc.y || 0) * THREE.MathUtils.degToRad(0.45);
      this.artRoot.rotation.y = this.baseRotation[1] + this.pointer.rotation.y + subtleYaw + pointerYaw;
      this.artRoot.rotation.x = this.baseRotation[0] + this.pointer.rotation.x + subtlePitch + pointerPitch;
      this.container.dataset.rotationX = this.pointer.rotation.x.toFixed(3);
      this.container.dataset.rotationY = this.pointer.rotation.y.toFixed(3);

      this.camera.update();
      this.monitorPerformance(delta);
      this.frame += 1;
    }

    this.renderer.render();
  };

  resize = () => {
    this.camera.resize();
    this.renderer.setSize();
  };

  showError(error) {
    console.error(error);
    this.loadingState.classList.add('is-complete');
    const message = document.createElement('p');
    message.className = 'error-message';
    message.textContent = 'THE 3D STUDY COULD NOT BE INITIALIZED. RETURN TO THE GALLERY AND TRY AGAIN.';
    document.body.appendChild(message);
    this.container.dataset.error = error.message;
  }
}
