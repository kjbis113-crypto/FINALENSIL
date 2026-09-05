import * as THREE from 'three';
import { commonFieldHeight } from './CommonFieldLandscape';

type Options = {
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  onActiveChange?: (active: boolean) => void;
  onInteract?: () => void;
};

const FIELD_BOUNDS = { x: 45, z: 33 };
const EYE_HEIGHT = 3.2;

export class FirstPersonFieldController {
  readonly camera: THREE.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  private onActiveChange?: (active: boolean) => void;
  private onInteract?: () => void;
  private keys = new Set<string>();
  private velocity = new THREE.Vector3();
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private input = new THREE.Vector3();
  private yaw = 0;
  private pitch = -0.06;
  private active = false;
  private mobile = window.matchMedia('(pointer: coarse)').matches;
  private lookTouch: { id: number; x: number; y: number } | null = null;
  private moveTouch: { id: number; x: number; y: number; originX: number; originY: number } | null = null;

  constructor({ camera, canvas, onActiveChange, onInteract }: Options) {
    this.camera = camera;
    this.canvas = canvas;
    this.onActiveChange = onActiveChange;
    this.onInteract = onInteract;
    this.camera.rotation.order = 'YXZ';

    const stored = sessionStorage.getItem('ensil-field-position');
    if (stored) {
      try {
        const state = JSON.parse(stored) as { x: number; z: number; yaw: number; pitch: number };
        this.camera.position.set(
          THREE.MathUtils.clamp(state.x, -FIELD_BOUNDS.x, FIELD_BOUNDS.x),
          0,
          THREE.MathUtils.clamp(state.z, -FIELD_BOUNDS.z, FIELD_BOUNDS.z),
        );
        this.yaw = Number.isFinite(state.yaw) ? state.yaw : this.yaw;
        this.pitch = Number.isFinite(state.pitch) ? state.pitch : this.pitch;
      } catch {
        this.camera.position.set(0, 0, 27);
      }
    } else {
      this.camera.position.set(0, 0, 27);
    }
    this.camera.position.y = commonFieldHeight(this.camera.position.x, this.camera.position.z) + EYE_HEIGHT;
    this.applyRotation();

    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    canvas.addEventListener('click', this.handleCanvasClick);
    canvas.addEventListener('pointerdown', this.handleTouchStart);
    canvas.addEventListener('pointermove', this.handleTouchMove);
    canvas.addEventListener('pointerup', this.handleTouchEnd);
    canvas.addEventListener('pointercancel', this.handleTouchEnd);
  }

  requestEntry() {
    if (this.mobile) {
      this.setActive(true);
      this.canvas.focus();
      return;
    }
    this.canvas.requestPointerLock?.();
  }

  exit() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
    this.setActive(false);
  }

  get isActive() {
    return this.active;
  }

  private setActive(next: boolean) {
    if (this.active === next) return;
    this.active = next;
    document.documentElement.classList.toggle('is-field-immersive', next);
    this.onActiveChange?.(next);
  }

  private handlePointerLockChange = () => {
    if (this.mobile) return;
    this.setActive(document.pointerLockElement === this.canvas);
  };

  private handleMouseMove = (event: MouseEvent) => {
    if (!this.active || this.mobile) return;
    this.yaw -= event.movementX * 0.00165;
    this.pitch = THREE.MathUtils.clamp(this.pitch - event.movementY * 0.00145, -1.15, 1.05);
    this.applyRotation();
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    if (!this.active) return;
    this.keys.add(event.code);
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    if (event.code === 'KeyE' || event.code === 'Enter') this.onInteract?.();
  };

  private handleKeyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  private handleBlur = () => { this.keys.clear(); };

  private handleCanvasClick = () => {
    if (this.active) {
      this.onInteract?.();
      return;
    }
    if (!this.mobile) this.requestEntry();
  };

  private handleTouchStart = (event: PointerEvent) => {
    if (!this.mobile) return;
    this.setActive(true);
    this.canvas.setPointerCapture?.(event.pointerId);
    if (event.clientX < window.innerWidth * 0.48 && !this.moveTouch) {
      this.moveTouch = { id: event.pointerId, x: event.clientX, y: event.clientY, originX: event.clientX, originY: event.clientY };
    } else if (!this.lookTouch) {
      this.lookTouch = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }
  };

  private handleTouchMove = (event: PointerEvent) => {
    if (!this.mobile || !this.active) return;
    if (this.lookTouch?.id === event.pointerId) {
      const dx = event.clientX - this.lookTouch.x;
      const dy = event.clientY - this.lookTouch.y;
      this.lookTouch.x = event.clientX;
      this.lookTouch.y = event.clientY;
      this.yaw -= dx * 0.0042;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0038, -1.05, 0.95);
      this.applyRotation();
    }
    if (this.moveTouch?.id === event.pointerId) {
      this.moveTouch.x = event.clientX;
      this.moveTouch.y = event.clientY;
    }
  };

  private handleTouchEnd = (event: PointerEvent) => {
    if (this.lookTouch?.id === event.pointerId) this.lookTouch = null;
    if (this.moveTouch?.id === event.pointerId) this.moveTouch = null;
  };

  private applyRotation() {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  update(dt: number) {
    if (!this.active) return;
    let moveX = 0;
    let moveZ = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveZ += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveZ -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveX += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveX -= 1;
    if (this.moveTouch) {
      moveX += THREE.MathUtils.clamp((this.moveTouch.x - this.moveTouch.originX) / 56, -1, 1);
      moveZ += THREE.MathUtils.clamp((this.moveTouch.originY - this.moveTouch.y) / 56, -1, 1);
    }

    this.camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    this.forward.normalize();
    this.right.crossVectors(this.forward, this.camera.up).normalize();
    this.input.set(0, 0, 0)
      .addScaledVector(this.forward, moveZ)
      .addScaledVector(this.right, moveX);
    if (this.input.lengthSq() > 1) this.input.normalize();

    const fast = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = fast ? 10.5 : 6.6;
    const acceleration = 1 - Math.exp(-8 * dt);
    this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, this.input.x * speed, acceleration);
    this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, this.input.z * speed, acceleration);
    if (this.input.lengthSq() === 0) {
      const friction = Math.exp(-7.5 * dt);
      this.velocity.x *= friction;
      this.velocity.z *= friction;
    }

    this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x + this.velocity.x * dt, -FIELD_BOUNDS.x, FIELD_BOUNDS.x);
    this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z + this.velocity.z * dt, -FIELD_BOUNDS.z, FIELD_BOUNDS.z);
    const ground = commonFieldHeight(this.camera.position.x, this.camera.position.z) + EYE_HEIGHT;
    this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, ground, 1 - Math.exp(-9 * dt));
  }

  dispose() {
    sessionStorage.setItem('ensil-field-position', JSON.stringify({
      x: this.camera.position.x,
      z: this.camera.position.z,
      yaw: this.yaw,
      pitch: this.pitch,
    }));
    document.documentElement.classList.remove('is-field-immersive');
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    document.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.canvas.removeEventListener('click', this.handleCanvasClick);
    this.canvas.removeEventListener('pointerdown', this.handleTouchStart);
    this.canvas.removeEventListener('pointermove', this.handleTouchMove);
    this.canvas.removeEventListener('pointerup', this.handleTouchEnd);
    this.canvas.removeEventListener('pointercancel', this.handleTouchEnd);
  }
}
