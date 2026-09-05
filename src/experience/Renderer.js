import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export class Renderer {
  constructor(container, scene, camera, quality, parameters) {
    this.container = container;
    this.parameters = parameters;
    this.quality = quality;
    this.instance = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });

    const gl = this.instance.getContext();
    if (!(gl instanceof WebGL2RenderingContext)) {
      throw new Error('This interaction requires WebGL2.');
    }

    this.instance.setClearColor(0x000000, 1);
    this.instance.outputColorSpace = THREE.SRGBColorSpace;
    this.instance.toneMapping = THREE.ACESFilmicToneMapping;
    this.instance.toneMappingExposure = parameters.exposure;
    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
    this.instance.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.instance.domElement);

    this.composer = new EffectComposer(this.instance);
    this.renderPass = new RenderPass(scene, camera);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      parameters.bloomStrength,
      parameters.bloomRadius,
      0.82,
    );
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.setSize();
  }

  setSize() {
    const pixelRatio = Math.min(window.devicePixelRatio, this.quality.pixelRatio);
    this.instance.setPixelRatio(pixelRatio);
    this.instance.setSize(window.innerWidth, window.innerHeight);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    this.instance.toneMappingExposure = this.parameters.exposure;
    this.bloomPass.strength = this.parameters.disableBloom || !this.quality.bloom
      ? 0
      : this.parameters.bloomStrength;
    this.bloomPass.radius = this.parameters.bloomRadius;
    this.composer.render();
  }
}
