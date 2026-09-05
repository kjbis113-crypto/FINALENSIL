import * as THREE from 'three';

export class PointerField {
  constructor(element, camera, interactionRoot, artRoot) {
    this.element = element;
    this.camera = camera;
    this.interactionRoot = interactionRoot;
    this.artRoot = artRoot;
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2(9, 9);
    this.position = new THREE.Vector3(99, 99, 99);
    this.targetPosition = this.position.clone();
    this.velocity = new THREE.Vector3();
    this.targetVelocity = new THREE.Vector3();
    this.rotation = new THREE.Vector2();
    this.targetRotation = new THREE.Vector2();
    this.active = 0;
    this.targetActive = 0;
    this.down = 0;
    this.hold = 0;
    this.zoom = 1;
    this.lastPointer = new THREE.Vector2();
    this.lastTime = 0;
    this.lastMovementAt = 0;
    this.hasPointer = false;

    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.debugSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 18, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.55 }),
    );
    this.debugSphere.visible = false;
    artRoot.add(this.debugSphere);

    element.addEventListener('pointermove', this.onPointerMove, { passive: true });
    element.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    element.addEventListener('pointerup', this.onPointerUp, { passive: true });
    element.addEventListener('pointercancel', this.onPointerUp, { passive: true });
    element.addEventListener('pointerleave', this.onPointerLeave, { passive: true });
  }

  onPointerMove = (event) => {
    const rect = this.element.getBoundingClientRect();
    const now = performance.now();
    const current = new THREE.Vector2(event.clientX, event.clientY);
    const elapsed = Math.max(8, now - (this.lastTime || now - 16)) / 1000;

    this.ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );

    if (this.hasPointer) {
      const movementX = current.x - this.lastPointer.x;
      const movementY = current.y - this.lastPointer.y;
      const screenVelocityX = (current.x - this.lastPointer.x) / rect.width / elapsed;
      const screenVelocityY = -(current.y - this.lastPointer.y) / rect.height / elapsed;
      this.right.setFromMatrixColumn(this.camera.matrixWorld, 0);
      this.up.setFromMatrixColumn(this.camera.matrixWorld, 1);
      this.targetVelocity
        .copy(this.right)
        .multiplyScalar(screenVelocityX)
        .addScaledVector(this.up, screenVelocityY)
        .clampLength(0, 3.4);

      if (this.down) {
        this.targetRotation.y += movementX * 0.006;
        this.targetRotation.x += movementY * 0.0045;
      }
    }

    this.lastPointer.copy(current);
    this.lastTime = now;
    this.lastMovementAt = now;
    this.hasPointer = true;
    this.castToSurface();
  };

  onPointerDown = (event) => {
    this.down = 1;
    this.element.dataset.dragging = 'true';
    this.element.setPointerCapture?.(event.pointerId);
    this.onPointerMove(event);
  };

  onPointerUp = (event) => {
    this.down = 0;
    this.element.dataset.dragging = 'false';
    if (this.element.hasPointerCapture?.(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }
  };

  onPointerLeave = () => {
    if (this.down) return;
    this.targetActive = 0;
    this.targetVelocity.set(0, 0, 0);
    this.hasPointer = false;
  };

  castToSurface() {
    this.artRoot.updateWorldMatrix(true, true);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const intersections = this.raycaster.intersectObject(this.interactionRoot, true);

    if (intersections.length > 0) {
      this.targetPosition.copy(intersections[0].point);
      this.artRoot.worldToLocal(this.targetPosition);
      this.targetActive = 1;
    } else {
      this.targetActive = 0;
    }
  }

  update(delta, showDebugSphere) {
    if (!this.down && performance.now() - this.lastMovementAt > 180) {
      this.targetActive = 0;
    }
    const positionLerp = 1 - Math.exp(-18 * delta);
    const velocityLerp = 1 - Math.exp(-10 * delta);
    const rotationLerp = 1 - Math.exp(-11 * delta);
    const activeLerp = 1 - Math.exp(-(this.targetActive > this.active ? 20 : 4.5) * delta);
    this.position.lerp(this.targetPosition, positionLerp);
    this.velocity.lerp(this.targetVelocity, velocityLerp);
    this.rotation.lerp(this.targetRotation, rotationLerp);
    this.targetVelocity.multiplyScalar(Math.exp(-5.5 * delta));
    this.active += (this.targetActive - this.active) * activeLerp;

    const isHoldingSurface = this.down && (this.targetActive > 0.25 || this.active > 0.35);
    if (isHoldingSurface) {
      this.hold = Math.min(1, this.hold + delta / 1.35);
    } else {
      this.hold *= Math.exp(-2.2 * delta);
    }

    const zoomTarget = this.hasPointer
      ? THREE.MathUtils.clamp(1 + this.ndc.y * 0.34, 0.72, 1.34)
      : 1;
    this.zoom += (zoomTarget - this.zoom) * (1 - Math.exp(-5.5 * delta));

    this.debugSphere.visible = Boolean(showDebugSphere && this.active > 0.03);
    this.debugSphere.position.copy(this.position);
  }
}
