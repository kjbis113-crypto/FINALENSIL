import * as THREE from 'three';
import { ModelLoader } from '../loaders/ModelLoader.js';
import { ParticleSimulation } from '../particles/ParticleSimulation.js';
import { ParticleRenderer } from '../particles/ParticleRenderer.js';
import { DEFAULT_PARAMETERS, MODEL_CONFIGS } from '../config.js';
import particlesFragmentShader from '../shaders/particles.frag.glsl?raw';

/**
 * 필드 안의 개체를 아카이브(interactive.html)와 같은 GPU 포인트클라우드로 그린다.
 *
 * 시뮬레이션·렌더러·셰이더는 아카이브 것을 그대로 쓴다. 필드에서 달라지는 건 둘뿐이다:
 *  - 흰 지형 위라 흰 점이 보이지 않으므로 프래그먼트의 출력 색만 잉크로 바꾼다
 *  - 카메라가 30단위쯤 떨어져 있어 점 크기가 셰이더 하한에 붙으므로 pointSize 를 키워 상한에 대게 한다
 *
 * 포인터 대신 개체의 activity(호버·pulse·목업 trigger 로 오름)를 자극원으로 넣는다 —
 * 몸 위를 도는 가상 포인터의 세기가 activity 를 따라가므로, 신호를 받은 개체만 흐트러진다.
 *
 * 성능: 개체 하나가 textureSize² 개의 파티클을 돌린다. 192 → 36,864 × 4 = 약 15만.
 * 올릴수록 제곱으로 무거워지니 현장에서는 이 값으로 조절한다.
 */

export const FIELD_PARTICLE_TEXTURE_SIZE = 192;
const FIELD_LAYERS = 1;
const FIELD_INK = new THREE.Color(0x002928);
const FIELD_POINT_SIZE_BOOST = 10;

/** 아카이브 프래그먼트 셰이더의 필드 변형 — 같은 감쇠·열감, 색만 잉크. */
const fieldFragmentShader = particlesFragmentShader
  .replace('uniform float uOpacity;', 'uniform float uOpacity;\nuniform vec3 uColor;')
  .replace(
    'outColor = vec4(vec3(luminance), alpha);',
    'outColor = vec4(uColor, alpha * (0.55 + 0.45 * luminance));',
  );

if (!fieldFragmentShader.includes('uColor')) {
  console.warn('[ENSIL] particles.frag.glsl changed shape — field particles will render white on white.');
}

/**
 * @param {{ renderer: THREE.WebGLRenderer, modelIndex: number, size: number, pixelRatio: number, textureSize?: number, color?: THREE.Color }} options
 */
export async function createParticleCreature({
  renderer,
  modelIndex,
  size,
  pixelRatio,
  textureSize = FIELD_PARTICLE_TEXTURE_SIZE,
  color = FIELD_INK,
}) {
  const config = MODEL_CONFIGS[modelIndex];
  if (!config) throw new Error(`No point-cloud model for creature ${modelIndex}`);

  const parameters = {
    ...DEFAULT_PARAMETERS,
    pointSize: DEFAULT_PARAMETERS.pointSize * config.pointSize * FIELD_POINT_SIZE_BOOST,
  };

  const loader = new ModelLoader(config);
  const model = await loader.load();
  const surface = await loader.sampleSurface(model, textureSize);
  const simulation = new ParticleSimulation(renderer, surface, parameters);
  const points = new ParticleRenderer(surface, simulation, parameters, pixelRatio, FIELD_LAYERS);

  points.materials.forEach((material) => {
    material.fragmentShader = fieldFragmentShader;
    material.uniforms.uColor = { value: color.clone() };
    material.blending = THREE.NormalBlending; // additive layers only brighten, useless on paper
    material.needsUpdate = true;
  });

  // Normalised model: 2.35 across its largest axis, centred on the origin. Fit it to the
  // creature's field size and stand it on the ground the way the GLB path did.
  const root = new THREE.Group();
  root.name = 'particle-creature';
  const inner = new THREE.Group();
  const maxDimension = Math.max(model.size.x, model.size.y, model.size.z) || 1;
  const scale = size / maxDimension;
  inner.scale.setScalar(scale);
  inner.position.y = -model.bounds.min.y * scale;
  inner.add(model.interactionRoot, points.root);
  root.add(inner);

  // The simulation wants a pointer in model space; we synthesise one that circles the
  // body, and let the creature's activity set how hard it presses.
  const pointer = {
    position: new THREE.Vector3(99, 99, 99),
    velocity: new THREE.Vector3(),
    active: 0,
    down: 0,
    hold: 0,
  };
  let level = 0;

  return {
    root,
    particleCount: surface.particleCount,
    /**
     * @param {number} time seconds
     * @param {number} dt seconds
     * @param {number} drive 0..1 — how agitated the creature is right now
     */
    update(time, dt, drive) {
      level += (drive - level) * (1 - Math.exp(-(drive > level ? 6 : 1.2) * dt));
      const angle = time * 1.7;
      pointer.position.set(Math.cos(angle) * 0.55, Math.sin(angle * 0.63) * 0.35, Math.sin(angle) * 0.55);
      pointer.velocity
        .set(-Math.sin(angle), 0.2 * Math.cos(angle * 0.63), Math.cos(angle))
        .multiplyScalar(1.6 * level);
      pointer.active = level;
      simulation.update(time, dt, pointer);
      points.update(time, pixelRatio);
    },
    dispose() {
      simulation.dispose();
      points.geometry.dispose();
      points.materials.forEach((material) => material.dispose());
      surface.restTexture.dispose();
      surface.normalTexture.dispose();
      model.interactionRoot.traverse((child) => {
        child.geometry?.dispose();
        child.material?.dispose();
      });
    },
  };
}
