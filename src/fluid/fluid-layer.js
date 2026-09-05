/**
 * 커서 유체 레이어 — 구버전 ENSIL 의 shell/FluidVeil.tsx 를 React 없이 옮긴 것.
 * 원형 솔리드 커서(LiquidCursor)는 가져오지 않았다 — 커서 뒤의 유체만.
 *
 * 원본과 같은 두 겹 구성:
 *  1. 유체 캔버스 — 근백색 실버-틸 염료를 difference 로 얹는다. 흰 종이 위에서는 어둡게,
 *     개체의 짙은 잉크 위에서는 밝게 뒤집혀 어느 면 위에서든 읽힌다.
 *  2. 글레이즈 캔버스 — 유체 모양 그대로 키컬러를 color 블렌드로 입혀, 반전이 만드는 붉은 기를
 *     민트~청록으로 정렬한다 (원본의 fluid-veil-tint).
 *
 * 부모 위에 pointer-events:none 으로 깔리고, 정규화 화면 좌표(0~1, 위=0)로 들어오는 스플랫을
 * FluidSim 에 넣는다. 스플랫이 끊기고 IDLE_STOP_MS 가 지나면 rAF 를 완전히 멈춘다 —
 * 필드 자체가 무거우니 놀고 있을 땐 비용 0.
 *
 * 필드 1(field-page.js)은 자기 포인터로, 필드 2(stage.js)는 링크로 건너온 필드 1 의 커서로
 * 같은 레이어를 돌린다. 염료·블렌드가 같으니 두 화면에 같은 액체가 보인다.
 */
import { FluidSim } from './FluidSim';

const IDLE_STOP_MS = 3500;
/** 염료가 512px 이라 캔버스를 더 촘촘히 그려도 보이는 게 없다. 프로젝터 1080p 에서도 충분. */
const MAX_DPR = 1;
/** 글레이즈는 색만 입히므로 저해상도로 충분 (원본과 같은 값) */
const TINT_DPR = 0.6;
/**
 * 글레이즈 세기 (원본 .fluid-veil-tint 의 opacity 0.9). CSS opacity 가 아니라 페인트 알파로 넣는다 —
 * 필드·스테이지의 .is-ready canvas { opacity: 1 } 규칙이 더 구체적이어서 CSS 쪽은 덮어써진다.
 */
const TINT_OPACITY = 0.9;
/** 키컬러 — 민트~청록. 필드·스테이지 CSS 의 --field-key / --stage-key 와 같은 값 */
export const FLUID_KEY_COLOR = '#58d6c3';

/** 근백색 실버-틸 염료 — difference 에서 모노톤 반전으로 읽힌다 (원본 dyeColor 그대로, 천천히 숨 쉰다) */
function dyeColor(t) {
  const k = 0.5 + 0.5 * Math.sin(t * 0.14);
  return [0.62 + 0.1 * k, 0.8 - 0.04 * k, 0.77];
}

/**
 * @param {{ parent: HTMLElement, className?: string, keyColor?: string, maxDpr?: number }} options
 * @returns {null | { canvas: HTMLCanvasElement, tintCanvas: HTMLCanvasElement, splat(x: number, y: number, dx: number, dy: number, strength?: number): void, wake(): void, resize(): void, dispose(): void }}
 *   WebGL2 가 없거나 reduced-motion 이면 null — 부르는 쪽은 유체 없이 그대로 간다.
 */
export function createFluidLayer({ parent, className = 'fluid-layer', keyColor = FLUID_KEY_COLOR, maxDpr = MAX_DPR } = {}) {
  if (!parent) return null;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;

  const canvas = document.createElement('canvas');
  canvas.className = className;
  canvas.setAttribute('aria-hidden', 'true');
  const tint = document.createElement('canvas');
  tint.className = `${className}-tint`;
  tint.setAttribute('aria-hidden', 'true');
  parent.append(canvas, tint);

  const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
  const fit = () => {
    canvas.width = Math.max(2, Math.round(parent.clientWidth * dpr));
    canvas.height = Math.max(2, Math.round(parent.clientHeight * dpr));
    tint.width = Math.max(2, Math.round(parent.clientWidth * TINT_DPR));
    tint.height = Math.max(2, Math.round(parent.clientHeight * TINT_DPR));
  };
  fit();

  const sim = new FluidSim(canvas);
  if (!sim.supported) {
    canvas.remove();
    tint.remove();
    return null;
  }
  const tintCtx = tint.getContext('2d');

  // difference 결과 위에 유체 모양 그대로 키컬러를 입힌다 (color 블렌드 글레이즈) — 원본 paintTint
  const paintTint = () => {
    if (!tintCtx) return;
    tintCtx.globalCompositeOperation = 'copy';
    tintCtx.drawImage(canvas, 0, 0, tint.width, tint.height);
    tintCtx.globalCompositeOperation = 'source-in';
    tintCtx.globalAlpha = TINT_OPACITY;
    tintCtx.fillStyle = keyColor;
    tintCtx.fillRect(0, 0, tint.width, tint.height);
    tintCtx.globalAlpha = 1;
    tintCtx.globalCompositeOperation = 'source-over';
  };

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
    paintTint();
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
    tintCanvas: tint,
    /**
     * 한 번 찍는다. x, y 는 정규화 화면 좌표(0~1, 위=0). dx, dy 는 같은 단위의 속도
     * (createFluidStroke 가 만든다), strength 는 염료 농도. dx=dy=0 이면 밀지 않고 염료만 고인다.
     */
    splat(x, y, dx, dy, strength = 1) {
      const base = dyeColor(performance.now() / 1000);
      pending.push({ x, y: 1 - y, dx, dy: -dy, color: [base[0] * strength, base[1] * strength, base[2] * strength] });
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
      tint.remove();
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
