import * as THREE from 'three';

export const FIELD_CENTRES = [
  new THREE.Vector3(-15, 0, -10),
  new THREE.Vector3(15, 0, -10),
  new THREE.Vector3(-15, 0, 12),
  new THREE.Vector3(15, 0, 12),
];

function seeded(index: number, salt = 0) {
  const value = Math.sin(index * 78.233 + salt * 92.817) * 43758.5453;
  return value - Math.floor(value);
}

export function commonFieldHeight(x: number, z: number) {
  const fold = Math.sin(x * 0.092 + z * 0.027) * 0.68
    + Math.cos(z * 0.105 - x * 0.018) * 0.52
    + Math.sin((x + z) * 0.041) * 0.74;
  const accretionDistance = Math.hypot((x + 15) / 18, (z + 10) / 14);
  const resonanceDistance = Math.hypot((x - 15) / 18, (z + 10) / 14);
  const phototropicDistance = Math.hypot((x + 15) / 19, (z - 12) / 15);
  const radialDistance = Math.hypot((x - 15) / 19, (z - 12) / 15);
  const accretion = -3.8 * Math.exp(-accretionDistance * accretionDistance * 2.2);
  const resonance = (-1.55 + Math.cos(resonanceDistance * 15) * 0.34)
    * Math.exp(-resonanceDistance * 1.45);
  const phototropicRaw = Math.sin(x * 0.13) * 0.23 - Math.exp(-phototropicDistance * phototropicDistance * 4.8) * 0.52;
  const phototropic = Math.round(phototropicRaw * 3) / 3 * Math.exp(-phototropicDistance * 0.62);
  const radial = Math.max(0, Math.cos(Math.atan2(z - 12, x - 15) * 5) * 0.27 + 0.16 - radialDistance * 0.1);
  return fold + accretion + resonance + phototropic + radial - 0.65;
}

export type CommonFieldLandscape = {
  group: THREE.Group;
  terrain: THREE.Mesh;
  ghostStructures: THREE.InstancedMesh;
  update: (time: number) => void;
};

export function buildCommonFieldLandscape(scene: THREE.Scene, mobile: boolean): CommonFieldLandscape {
  const group = new THREE.Group();
  group.name = 'ENSIL_COMMON_GROUND';
  scene.add(group);

  const segmentsX = mobile ? 34 : 58;
  const segmentsZ = mobile ? 26 : 44;
  const terrainGeometry = new THREE.PlaneGeometry(104, 78, segmentsX, segmentsZ);
  terrainGeometry.rotateX(-Math.PI / 2);
  const position = terrainGeometry.getAttribute('position') as THREE.BufferAttribute;
  const colours = new Float32Array(position.count * 3);
  const pale = new THREE.Color(0xffffff);
  const grey = new THREE.Color(0xd9d9d9);
  const dark = new THREE.Color(0x002928);
  const colour = new THREE.Color();
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const y = commonFieldHeight(x, z);
    position.setY(index, y);
    const shade = THREE.MathUtils.clamp(0.55 + y * 0.055 + seeded(index, 4) * 0.16, 0, 1);
    colour.copy(grey).lerp(pale, shade);
    if (seeded(index, 8) > 0.982) colour.lerp(dark, 0.5);
    colours[index * 3] = colour.r;
    colours[index * 3 + 1] = colour.g;
    colours[index * 3 + 2] = colour.b;
  }
  terrainGeometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  terrainGeometry.computeVertexNormals();
  const terrainMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.015,
    flatShading: true,
  });
  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.name = 'COMMON_FIELD_SURFACE';
  terrain.receiveShadow = true;
  terrain.userData.isCommonField = true;
  group.add(terrain);

  const mineralMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.03,
    flatShading: true,
    vertexColors: true,
  });
  const fragmentCount = mobile ? 160 : 520;
  const fragments = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.34, 0), mineralMaterial, fragmentCount);
  const dummy = new THREE.Object3D();
  const fragmentColour = new THREE.Color();
  for (let index = 0; index < fragmentCount; index += 1) {
    const angle = seeded(index, 12) * Math.PI * 2;
    const radial = Math.pow(seeded(index, 15), 0.72);
    const x = Math.cos(angle) * radial * 47;
    const z = Math.sin(angle) * radial * 34;
    const scale = 0.28 + seeded(index, 21) * (seeded(index, 23) > 0.92 ? 3.8 : 1.35);
    dummy.position.set(x, commonFieldHeight(x, z) + scale * 0.18, z);
    dummy.rotation.set(seeded(index, 25) * 1.4, angle, seeded(index, 27) * 1.1);
    dummy.scale.set(scale * (0.6 + seeded(index, 29)), scale * (0.3 + seeded(index, 31) * 0.8), scale);
    dummy.updateMatrix();
    fragments.setMatrixAt(index, dummy.matrix);
    fragmentColour.set(index % 4 === 0 ? 0xd9d9d9 : 0x002928);
    fragments.setColorAt(index, fragmentColour);
  }
  group.add(fragments);

  const ghostCount = mobile ? 76 : 240;
  const ghostMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0.04,
    flatShading: true,
    vertexColors: true,
  });
  const ghostStructures = new THREE.InstancedMesh(new THREE.ConeGeometry(0.22, 1, 5, 1, true), ghostMaterial, ghostCount);
  for (let index = 0; index < ghostCount; index += 1) {
    const cluster = index % 17;
    const clusterAngle = cluster * (Math.PI * 2 / 17) + seeded(cluster, 33) * 0.4;
    const clusterRadius = 8 + cluster * 2.05;
    const x = Math.cos(clusterAngle) * clusterRadius + (seeded(index, 35) - 0.5) * 8;
    const z = Math.sin(clusterAngle) * clusterRadius * 0.7 + (seeded(index, 37) - 0.5) * 6;
    const height = 1.3 + seeded(index, 39) * 5.5;
    dummy.position.set(x, commonFieldHeight(x, z) + height * 0.47, z);
    dummy.rotation.set((seeded(index, 41) - 0.5) * 0.2, seeded(index, 43) * Math.PI, (seeded(index, 45) - 0.5) * 0.22);
    dummy.scale.set(0.38 + seeded(index, 47) * 0.9, height, 0.38 + seeded(index, 49) * 0.9);
    dummy.updateMatrix();
    ghostStructures.setMatrixAt(index, dummy.matrix);
    fragmentColour.set(index % 3 === 0 ? 0x002928 : 0xd9d9d9);
    ghostStructures.setColorAt(index, fragmentColour);
  }
  group.add(ghostStructures);

  const biofilmCount = mobile ? 210 : 680;
  const biofilmMaterial = new THREE.MeshStandardMaterial({ color: 0xd9d9d9, roughness: 0.97, flatShading: true });
  const biofilm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.13, 0), biofilmMaterial, biofilmCount);
  for (let index = 0; index < biofilmCount; index += 1) {
    const cluster = index % 23;
    const centreX = (seeded(cluster, 53) - 0.5) * 78;
    const centreZ = (seeded(cluster, 55) - 0.5) * 56;
    const angle = seeded(index, 57) * Math.PI * 2;
    const radius = Math.pow(seeded(index, 59), 1.8) * 6.5;
    const x = centreX + Math.cos(angle) * radius;
    const z = centreZ + Math.sin(angle) * radius;
    const scale = 0.34 + seeded(index, 61) * 1.3;
    dummy.position.set(x, commonFieldHeight(x, z) + 0.1, z);
    dummy.rotation.set(0, angle, 0);
    dummy.scale.set(scale, scale * (0.38 + seeded(index, 63) * 0.42), scale);
    dummy.updateMatrix();
    biofilm.setMatrixAt(index, dummy.matrix);
  }
  group.add(biofilm);

  const cablePositions: number[] = [];
  const cableCount = mobile ? 90 : 280;
  for (let branch = 0; branch < cableCount; branch += 1) {
    const startX = (seeded(branch, 67) - 0.5) * 94;
    const startZ = (seeded(branch, 69) - 0.5) * 66;
    const angle = seeded(branch, 71) * Math.PI * 2;
    const reach = 2.5 + seeded(branch, 73) * 9;
    let previousX = startX;
    let previousZ = startZ;
    for (let segment = 1; segment <= 3; segment += 1) {
      const unit = segment / 3;
      const nextX = startX + Math.cos(angle + Math.sin(segment + branch) * 0.35) * reach * unit;
      const nextZ = startZ + Math.sin(angle + Math.sin(segment + branch) * 0.35) * reach * unit;
      cablePositions.push(
        previousX, commonFieldHeight(previousX, previousZ) + 0.035, previousZ,
        nextX, commonFieldHeight(nextX, nextZ) + 0.035, nextZ,
      );
      previousX = nextX;
      previousZ = nextZ;
    }
  }
  const cableGeometry = new THREE.BufferGeometry();
  cableGeometry.setAttribute('position', new THREE.Float32BufferAttribute(cablePositions, 3));
  group.add(new THREE.LineSegments(cableGeometry, new THREE.LineBasicMaterial({ color: 0x002928, transparent: true, opacity: 0.52 })));

  const contourMaterial = new THREE.LineBasicMaterial({ color: 0x002928, transparent: true, opacity: 0.34 });
  for (let ringIndex = 0; ringIndex < (mobile ? 11 : 22); ringIndex += 1) {
    const points: THREE.Vector3[] = [];
    const radius = 5 + ringIndex * 2.05;
    for (let step = 0; step < 132; step += 1) {
      const angle = step / 132 * Math.PI * 2;
      const irregular = 1 + Math.sin(angle * 5 + ringIndex) * 0.035 + Math.sin(angle * 2.3) * 0.025;
      const x = Math.cos(angle) * radius * irregular;
      const z = Math.sin(angle) * radius * irregular * 0.73;
      points.push(new THREE.Vector3(x, commonFieldHeight(x, z) + 0.07 + (ringIndex % 6 === 2 ? 0.15 : 0), z));
    }
    group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), contourMaterial));
  }

  return {
    group,
    terrain,
    ghostStructures,
    update(time) {
      ghostStructures.rotation.y = Math.sin(time * 0.000021) * 0.004;
      biofilm.scale.y = 0.92 + Math.sin(time * 0.00017) * 0.04;
    },
  };
}
