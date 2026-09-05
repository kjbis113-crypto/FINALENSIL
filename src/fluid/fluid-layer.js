/**
 * 커서 유체 레이어 — 구버전 ENSIL 의 shell/FluidVeil.tsx 를 React 없이 옮긴 것.
 * 원형 솔리드 커서(LiquidCursor)는 가져오지 않았다 — 커서 뒤의 유체만.
 *
 * 부모 위에 pointer-events:none 캔버스를 깔고, 정규화 화면 좌표(0~1, 위=0)로 들어오는
 * 스플랫을 FluidSim 에 넣어 초록 액체가 흐르게 한다. 스플랫이 끊기고 IDLE_STOP_MS 가 지나면
 * rAF 를 완전히 멈춘다 — 필드 자체가 무거우니 놀고 있을 땐 비용 0.
 *
 * 필드 1(field-page.js)은 자기 포인터로, 필드 2(stage.js)는 링크로 건너온 필드 1 의 커서로
 * 같은 레이어를 돌린다. 색·블렌드가 같으니 두 화면에 같은 액체가 보인다.
 */
import { FluidSim } from './FluidSim';

const IDLE_STOP_MS = 3500;
/** 염료가 512px 이라 캔버스를 더 촘촘히 그려도 보이는 게 없다. 프로젝터 1080p 에서도 충분. */
const MAX_DPR = 1;
/**
 * 흰 바닥 위에서 보이는 유체의 최종 색 (sRGB 0~1). 캔버스가 multiply 라 개체의 짙은 잉크는
 * 이 아래로 비쳐 보인다 — 덮지 않는다. 필드 키컬러(#58d6c3)보다 초록으로 당긴 값.
 */
export const FLUID_COLOR = [0.17, 0.78, 0.43];

/**
 * @param {{ parent: HTMLElement, className?: string, color?: number[], maxDpr?: number }} options
 * @returns {null | { canvas: HTMLCanvasElement, splat(x: number, y: number, dx: number, dy: number, strength?: number): void, wake(): void, resize(): void, dispose(): void }}
 *   WebGL2 가 없거나 reduced-motion 이면 null — 부르는 쪽은 유체 없이 그대로 간다.
 */
export function createFluidLayer({ parent, className = 'fluid-layer', color = FLUID_COLOR, maxDpr = MAX_DPR } = {}) {
  if (!parent) return null;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;

  const canvas = document.createElement('canvas');
  canvas.className = className;
  canvas.setAttribute('aria-hidden', 'true');
  parent.appendChild(canvas);

  const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
  const fit = () => {
    canvas.width = Math.max(2, Math.round(parent.clientWidth * dpr));
    canvas.height = Math.max(2, Math.round(parent.clientHeight * dpr));
  };
  fit();

  // display 패스가 최대 채널을 1 로 정규화하므로 색조(dye)와 밝기(tint)를 나눠 넣는다
  const peak = Math.max(1e-4, ...color);
  const dye = color.map((channel) => channel / peak);
  const sim = new FluidSim(canvas, { tint: [peak, peak, peak] });
  if (!sim.supported) {
    canvas.remove();
    return null;
  }

  const pending = [];
  let lastActive = 0;
  let running = false;
  let prevFrame = 0;
  let raf = 0;
  let disposed = false;

  const loop = (now) => {
    if (disposed) return;
    const dt = Math.min(1 / 30, Math.max(1 / 240, (now - prevFrame) / 1000));
    prevFrame = now;
    while (pending.length) sim.splat(pending.shift());
    sim.step(dt);
    sim.render();
    if (now - lastActive > IDLE_STOP_MS) {
      running = false;
      return;
    }
    raf = requestAnimationFrame(loop);
  };
  const wake = () => {
    lastActive = performance.now();
    if (running) return;
    running = true;
    prevFrame = performance.now();
    raf = requestAnimationFrame(loop);
  };
  const onVisibility = () => {
    if (!document.hidden) return;
    cancelAnimationFrame(raf);
    running = false;
  };
  const onResize = () => {
    fit();
    sim.resize();
  };
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    canvas,
    /**
     * 한 번 찍는다. x, y 는 정규화 화면 좌표(0~1, 위=0). dx, dy 는 같은 단위의 속도
     * (createFluidStroke 가 만든다), strength 는 염료 농도. dx=dy=0 이면 밀지 않고 염료만 고인다.
     */
    splat(x, y, dx, dy, strength = 1) {
      pending.push({ x, y: 1 - y, dx, dy: -dy, color: [dye[0] * strength, dye[1] * strength, dye[2] * strength] });
      if (pending.length > 24) pending.shift();
      wake();
    },
    wake,
    resize: onResize,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      sim.dispose();
      canvas.remove();
    },
  };
}

/**
 * 연속 좌표 → 스플랫. ENSIL FluidVeil 의 포인터 공식 그대로: 이벤트 간격으로 정규화한 이동량이
 * 속도가 되고, 빠를수록 염료가 짙어진다. 필드 1 은 pointermove 를, 스테이지는 링크로 온 점을 넣는다.
 *  - gain     속도 배율. 스테이지는 점이 절반 빈도(약 30Hz)로 오므로 키워서 맞춘다
 *  - dyeGain  염료 배율, 같은 이유
 *  - maxStep  한 번에 밀 수 있는 최대 이동(정규화). 링크 지터나 카메라 회전으로 튄 점이 폭발하지 않게
 */
export function createFluidStroke(layer, { gain = 1.3, dyeGain = 1, maxStep = 0.2 } = {}) {
  let last = null;
  return {
    move(x, y, t = performance.now()) {
      if (!layer) return;
      if (last) {
        const dt = Math.max(1, t - last.t);
        const rate = Math.min(3, 16 / dt) * gain;
        let dx = (x - last.x) * rate;
        let dy = (y - last.y) * rate;
        const step = Math.hypot(dx, dy);
        if (step > maxStep) {
          dx *= maxStep / step;
          dy *= maxStep / step;
        }
        if (Math.abs(dx) + Math.abs(dy) > 0.0001) {
          const speed = Math.min(1, Math.hypot(dx, dy) * 8);
          layer.splat(x, y, dx, dy, (0.45 + speed * 0.6) * dyeGain);
        }
      }
      last = { x, y, t };
    },
    reset() {
      last = null;
    },
  };
}

/**
 * 고임 — 커서가 개체 위에 멈춰 있을 때 그 자리에 염료를 조금씩 계속 부어 액체가 고이게 한다.
 * "이 개체를 보고 있다"는 표시. getPosition 은 매 프레임 불려 {x, y}(정규화, 위=0) 또는 null 을 준다 —
 * 스테이지는 카메라가 계속 돌므로 매 프레임 다시 투영해야 한다.
 */
export function createFluidPool(layer, { strength = 0.028 } = {}) {
  let raf = 0;
  let source = null;
  const tick = (now) => {
    raf = 0;
    if (!source) return;
    const position = source();
    if (position) layer.splat(position.x, position.y, 0, 0, strength * (0.8 + 0.2 * Math.sin(now * 0.004)));
    raf = requestAnimationFrame(tick);
  };
  return {
    start(getPosition) {
      if (!layer) return;
      source = getPosition;
      if (!raf) raf = requestAnimationFrame(tick);
    },
    stop() {
      source = null;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
