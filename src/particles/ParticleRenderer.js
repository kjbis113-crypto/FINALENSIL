import * as THREE from 'three';
import particlesVertexShader from '../shaders/particles.vert.glsl?raw';
import particlesFragmentShader from '../shaders/particles.frag.glsl?raw';

export class ParticleRenderer {
  constructor(surfaceData, simulation, parameters, pixelRatio, layerCount = 3) {
    this.parameters = parameters;
    this.simulation = simulation;
    this.pixelRatio = pixelRatio;
    this.root = new THREE.Group();
    this.root.name = 'particle-layers';

    const { textureSize, particleCount } = surfaceData;
    const uvData = new Float32Array(particleCount * 2);
    const seedData = new Float32Array(particleCount);
    const positionData = new Float32Array(particleCount * 3);

    for (let index = 0; index < particleCount; index += 1) {
      uvData[index * 2] = ((index % textureSize) + 0.5) / textureSize;
      uvData[index * 2 + 1] = (Math.floor(index / textureSize) + 0.5) / textureSize;
      seedData[index] = Math.random();
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positionData, 3));
    this.geometry.setAttribute('aParticleUv', new THREE.BufferAttribute(uvData, 2));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seedData, 1));
    this.geometry.setDrawRange(0, particleCount);

    const layerMaterials = [
      this.createMaterial(0, 1, THREE.NormalBlending),
      this.createMaterial(1, 0.78, THREE.AdditiveBlending),
      this.createMaterial(2, 0.58, THREE.AdditiveBlending),
    ];
    this.materials = layerMaterials.slice(0, Math.max(1, Math.min(3, layerCount)));

    this.layers = this.materials.map((material) => {
      const points = new THREE.Points(this.geometry, material);
      points.frustumCulled = false;
      this.root.add(points);
      return points;
    });
  }

  createMaterial(layer, opacity, blending) {
    return new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        uPositionState: { value: this.simulation.positionTexture },
        uVelocityState: { value: this.simulation.velocityTexture },
        uNormal: { value: this.simulation.normalTexture },
        uTime: { value: 0 },
        uPointSize: { value: this.parameters.pointSize },
        uPixelRatio: { value: this.pixelRatio },
        uLayer: { value: layer },
        uOpacity: { value: opacity },
      },
      vertexShader: particlesVertexShader,
      fragmentShader: particlesFragmentShader,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending,
    });
  }

  update(time, pixelRatio) {
    this.materials.forEach((material) => {
      material.uniforms.uPositionState.value = this.simulation.positionTexture;
      material.uniforms.uVelocityState.value = this.simulation.velocityTexture;
      material.uniforms.uTime.value = time;
      material.uniforms.uPointSize.value = this.parameters.pointSize;
      material.uniforms.uPixelRatio.value = pixelRatio;
    });
  }
}
