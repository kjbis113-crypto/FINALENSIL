/**
 * 스테이지 — 빔프로젝터에 띄우는 필드 파노라마. 크롬·버튼 없이 구석 라벨만 둔다.
 * 콘솔이 붙으면 pulse 신호에 화면이 한 번 번진다.
 *
 * 구버전 ENSIL 의 src/routes/Stage.tsx 를 React 없이 옮긴 것.
 */

import { createPanoramaField } from './field/panorama.js';
import { openFieldLink } from './field/field-link.js';
import { isStageShortcut } from './stage-window.js';

const mount = document.querySelector('#field-mount');
const loading = document.querySelector('#field-loading');
const loadingValue = document.querySelector('#field-loading-value');
const consoleDot = document.querySelector('#console-dot');
const consoleLabel = document.querySelector('#console-label');
const hint = document.querySelector('#fullscreen-hint');
const page = document.querySelector('.stage-page');

const field = createPanoramaField(mount, {
  onProgress: (percent) => {
    loadingValue.textContent = `${percent}%`;
  },
  onMode: (mode) => {
    if (mode === 'error') {
      loadingValue.textContent = '—';
      loading.querySelector('span').textContent = 'WEBGL OR PANORAMA TEXTURE UNAVAILABLE';
      return;
    }
    loading.remove();
    page.dataset.panorama = mode;
  },
});

const link = openFieldLink('stage', {
  onMessage: (msg) => {
    if (msg.type === 'pulse') flashPulse();
  },
  onPeerChange: (alive) => {
    consoleDot.dataset.alive = alive ? 'true' : 'false';
    consoleLabel.textContent = alive ? 'CONSOLE LINKED' : 'CONSOLE WAITING';
  },
});

/** 콘솔 신호가 올 때마다 화면 전체에 한 번 번지는 빛 — 애니메이션은 매번 새로 시작한다. */
function flashPulse() {
  document.querySelector('.stage-page__pulse')?.remove();
  const pulse = document.createElement('div');
  pulse.className = 'stage-page__pulse';
  pulse.setAttribute('aria-hidden', 'true');
  pulse.addEventListener('animationend', () => pulse.remove(), { once: true });
  page.append(pulse);
}

// 전체화면 — 사용자 제스처가 필요하므로 첫 클릭 또는 단축키(F / Ctrl+Alt+Shift+O)로 진입
const toggleFullscreen = () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(() => undefined);
};

window.addEventListener('pointerdown', () => {
  if (!document.fullscreenElement) toggleFullscreen();
});

window.addEventListener('keydown', (event) => {
  if (isStageShortcut(event) || (event.key.toLowerCase() === 'f' && !event.metaKey && !event.ctrlKey)) {
    event.preventDefault();
    toggleFullscreen();
  }
});

document.addEventListener('fullscreenchange', () => {
  hint.hidden = Boolean(document.fullscreenElement);
});

window.addEventListener('pagehide', () => {
  field.dispose();
  link.close();
});
