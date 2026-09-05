import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const CREATURE_HALO_LAYER = 1;

export const CREATURE_HALO_CONFIG = {
  innerRadius: 11,
  innerStrength: 0.13,
  outerRadius: 31,
  outerStrength: 0.045,
  color: new THREE.Color(0xc6cec5),
};

const blurShader = {
  uniforms: {
    tSource: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uDirection: { value: new THREE.Vector2(1, 0) },
    uRadius: { value: 1 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tSource;
    uniform vec2 uResolution;
    uniform vec2 uDirection;
    uniform float uRadius;
    varying vec2 vUv;

    void main() {
      vec2 stepUv = uDirection * uRadius / uResolution;
      vec4 color = texture2D(tSource, vUv) * 0.227027;
      color += texture2D(tSource, vUv + stepUv * 1.0) * 0.1945946;
      color += texture2D(tSource, vUv - stepUv * 1.0) * 0.1945946;
      color += texture2D(tSource, vUv + stepUv * 2.0) * 0.1216216;
      color += texture2D(tSource, vUv - stepUv * 2.0) * 0.1216216;
      color += texture2D(tSource, vUv + stepUv * 3.0) * 0.054054;
      color += texture2D(tSource, vUv - stepUv * 3.0) * 0.054054;
      color += texture2D(tSource, vUv + stepUv * 4.0) * 0.016216;
      color += texture2D(tSource, vUv - stepUv * 4.0) * 0.016216;
      gl_FragColor = color;
    }
  `,
};

const compositeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tMask: { value: null },
    tInnerHalo: { value: null },
    tOuterHalo: { value: null },
    uInnerStrength: { value: 0.13 },
    uOuterStrength: { value: 0.05 },
    uHaloColor: { value: new THREE.Color(0xc6cec5) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tMask;
    uniform sampler2D tInnerHalo;
    uniform sampler2D tOuterHalo;
    uniform float uInnerStrength;
    uniform float uOuterStrength;
    uniform vec3 uHaloColor;
    varying vec2 vUv;

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      float mask = texture2D(tMask, vUv).a;
      float inner = texture2D(tInnerHalo, vUv).a;
      float outer = texture2D(tOuterHalo, vUv).a;
      float outsideInner = max(inner - mask * 0.94, 0.0);
      float outsideOuter = max(outer - mask * 0.72, 0.0);
      float halo = outsideInner * uInnerStrength + outsideOuter * uOuterStrength;
      gl_FragColor = vec4(base.rgb + uHaloColor * halo, base.a);
    }
  `,
};

export class CreatureHalo {
  constructor(renderer, scene, camera, parameters, quality, occluderLayer = null) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.parameters = parameters;
    this.occluderLayer = occluderLayer;
    this.scale = quality.pixelRatio <= 1
      ? 0.24
      : quality.pixelRatio <= 1.25
        ? 0.3
        : 0.36;
    this.clearColor = new THREE.Color();
    this.horizontal = new THREE.Vector2(1, 0);
    this.vertical = new THREE.Vector2(0, 1);
    this.blurMaterial = new THREE.ShaderMaterial({
      ...blurShader,
      uniforms: THREE.UniformsUtils.clone(blurShader.uniforms),
      depthTest: false,
      depthWrite: false,
    });
    this.fullscreenQuad = new FullScreenQuad(this.blurMaterial);
    this.maskTarget = this.createTarget(true);
    this.blurTarget = this.createTarget(false);
    this.innerTarget = this.createTarget(false);
    this.outerTarget = this.createTarget(false);
    this.compositePass = new ShaderPass(compositeShader);
    this.compositePass.enabled = false;
    this.compositePass.material.uniforms.tMask.value = this.maskTarget.texture;
    this.compositePass.material.uniforms.tInnerHalo.value = this.innerTarget.texture;
    this.compositePass.material.uniforms.tOuterHalo.value = this.outerTarget.texture;
    this.compositePass.material.uniforms.uHaloColor.value.copy(parameters.creatureHaloColor);
  }

  createTarget(depthBuffer) {
    const target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    target.texture.colorSpace = THREE.NoColorSpace;
    return target;
  }

  setEnabled(enabled) {
    this.compositePass.enabled = enabled;
  }

  setSize(width, height) {
    const targetWidth = Math.max(1, Math.round(width * this.scale));
    const targetHeight = Math.max(1, Math.round(height * this.scale));
    for (const target of [this.maskTarget, this.blurTarget, this.innerTarget, this.outerTarget]) {
      target.setSize(targetWidth, targetHeight);
    }
    this.blurMaterial.uniforms.uResolution.value.set(targetWidth, targetHeight);
  }

  renderBlur(source, output, direction, radius) {
    const uniforms = this.blurMaterial.uniforms;
    uniforms.tSource.value = source.texture;
    uniforms.uDirection.value.copy(direction);
    uniforms.uRadius.value = Math.max(0.1, radius * this.scale * 0.25);
    this.renderer.setRenderTarget(output);
    this.renderer.clear();
    this.fullscreenQuad.render(this.renderer);
  }

  renderMask() {
    if (!this.compositePass.enabled) return;
    const previousTarget = this.renderer.getRenderTarget();
    const previousLayerMask = this.camera.layers.mask;
    const previousBackground = this.scene.background;
    const previousClearAlpha = this.renderer.getClearAlpha();
    const previousAutoClear = this.renderer.autoClear;
    this.renderer.getClearColor(this.clearColor);

    this.scene.background = null;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setRenderTarget(this.maskTarget);
    this.renderer.autoClear = false;
    this.renderer.clear(true, true, true);

    if (this.occluderLayer !== null) {
      this.camera.layers.set(this.occluderLayer);
      this.renderer.render(this.scene, this.camera);
      this.renderer.clearColor();
    }

    this.camera.layers.set(CREATURE_HALO_LAYER);
    this.renderer.render(this.scene, this.camera);

    this.renderBlur(
      this.maskTarget,
      this.blurTarget,
      this.horizontal,
      this.parameters.creatureHaloInnerRadius,
    );
    this.renderBlur(
      this.blurTarget,
      this.innerTarget,
      this.vertical,
      this.parameters.creatureHaloInnerRadius,
    );
    this.renderBlur(
      this.maskTarget,
      this.blurTarget,
      this.horizontal,
      this.parameters.creatureHaloOuterRadius,
    );
    this.renderBlur(
      this.blurTarget,
      this.outerTarget,
      this.vertical,
      this.parameters.creatureHaloOuterRadius,
    );

    this.camera.layers.mask = previousLayerMask;
    this.scene.background = previousBackground;
    this.renderer.autoClear = previousAutoClear;
    this.renderer.setClearColor(this.clearColor, previousClearAlpha);
    this.renderer.setRenderTarget(previousTarget);

    const uniforms = this.compositePass.material.uniforms;
    uniforms.uInnerStrength.value = this.parameters.creatureHaloInnerStrength;
    uniforms.uOuterStrength.value = this.parameters.creatureHaloOuterStrength;
    uniforms.uHaloColor.value.copy(this.parameters.creatureHaloColor);
  }

  dispose() {
    this.maskTarget.dispose();
    this.blurTarget.dispose();
    this.innerTarget.dispose();
    this.outerTarget.dispose();
    this.blurMaterial.dispose();
    this.fullscreenQuad.dispose();
    this.compositePass.dispose();
  }
}
