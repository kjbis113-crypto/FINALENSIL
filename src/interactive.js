import { Experience } from './experience/Experience.js';
import { revealEncryptedText } from './components/ui/encrypted-text.js';
import { mountDither } from './dither-mount.jsx';
import { installStageShortcut } from './stage-window.js';

const sceneElement = document.querySelector('#scene');
mountDither(document.querySelector('#dither-background'), {
  enableMouseInteraction: false,
  frameRate: 24,
});
const experience = new Experience(sceneElement);
const infoLink = document.querySelector('.study-number-link');
const headerLink = document.querySelector('.study-info-link');
const numberLabel = infoLink.querySelector('.object-number');
const objectId = Math.min(4, Math.max(1, Number(new URLSearchParams(window.location.search).get('id')) || 1));

for (const link of [infoLink, headerLink]) {
  link.href = `/info.html?id=${objectId}`;
}

revealEncryptedText(numberLabel, {
  text: `NO. ${objectId}`,
  revealDelayMs: 50,
  startDelayMs: 180,
  maxDurationMs: 1200,
});

revealEncryptedText(headerLink, {
  text: 'READ INFORMATION',
  revealDelayMs: 50,
  startDelayMs: 260,
  maxDurationMs: 1100,
});

// The scramble writes its own aria-label, so restore the spoken one after it.
for (const link of [infoLink, headerLink]) {
  link.setAttribute('aria-label', `Read information about NO. ${objectId}`);
}

const openInformation = (event) => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  event.preventDefault();
  const destination = event.currentTarget.href;
  document.body.classList.add('is-leaving');
  window.setTimeout(() => {
    window.location.assign(destination);
  }, 560);
};

infoLink.addEventListener('click', openInformation);
headerLink.addEventListener('click', openInformation);

if (new URLSearchParams(window.location.search).get('debug') === 'true') {
  window.__ENSIL__ = experience;
}

// 운영용 — Ctrl+Alt+Shift+O 로 빔프로젝터 스테이지 창을 연다.
installStageShortcut();
