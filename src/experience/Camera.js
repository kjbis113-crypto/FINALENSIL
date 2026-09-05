import * as THREE from 'three';

export class Camera {
  constructor(parameters) {
    this.parameters = parameters;
    this.instance = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.01, 100);
    this.instance.position.set(0, 0, parameters.cameraDistance);
    this.instance.lookAt(0, 0, 0);
  }

  frame(bounds) {
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const verticalFov = THREE.MathUtils.degToRad(this.instance.fov);
    const distance = (sphere.radius / Math.sin(verticalFov / 2)) * 1.08;
    this.parameters.cameraDistance = THREE.MathUtils.clamp(distance, 3.4, 5.4);
    this.instance.position.z = this.parameters.cameraDistance;
    this.instance.near = Math.max(0.01, this.parameters.cameraDistance - sphere.radius * 2.5);
    this.instance.far = this.parameters.cameraDistance + sphere.radius * 4;
    this.instance.updateProjectionMatrix();
  }

  update() {
    this.instance.position.z += (this.parameters.cameraDistance - this.instance.position.z) * 0.08;
    this.instance.lookAt(0, 0, 0);
  }

  resize() {
    this.instance.aspect = window.innerWidth / window.innerHeight;
    this.instance.updateProjectionMatrix();
  }
}
