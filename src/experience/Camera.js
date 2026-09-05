import * as THREE from 'three';

export class Camera {
  constructor(parameters) {
    this.parameters = parameters;
    this.instance = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.01, 100);
    this.instance.position.set(0, 0, parameters.cameraDistance);
    this.instance.lookAt(0, 0, 0);
  }

  /**
   * Fit the bounding sphere, then pull in by frameScale. The sphere over-estimates
   * anything deep or flat -- a long tail, a wide cluster seen side-on -- so models
   * whose silhouette is much smaller than their sphere get a factor below 1.
   */
  frame(bounds, frameScale = 1) {
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const verticalFov = THREE.MathUtils.degToRad(this.instance.fov);
    const distance = (sphere.radius / Math.sin(verticalFov / 2)) * 1.08 * frameScale;
    this.parameters.cameraDistance = THREE.MathUtils.clamp(distance, 2.4, 5.4);
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
