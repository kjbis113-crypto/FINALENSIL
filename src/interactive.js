import { Experience } from './experience/Experience.js';
import { revealEncryptedText } from './components/ui/encrypted-text.js';
import { mountDither } from './dither-mount.jsx';

const sceneElement = document.querySelector('#scene');
mountDither(document.querySelector('#dither-background'), {
  enableMouseInteraction: false,
  frameRate: 24,
});
const experience = new Experience(sceneElement);
const infoLink = document.querySelector('.study-number-link');
const numberLabel = infoLink.querySelector('.object-number');
const objectId = Math.min(4, Math.max(1, Number(new URLSearchParams(window.location.search).get('id')) || 1));

infoLink.href = `/info.html?id=${objectId}`;
infoLink.setAttribute('aria-label', `Read information about NO. ${objectId}`);

revealEncryptedText(numberLabel, {
  text: `NO. ${objectId}`,
  revealDelayMs: 50,
  startDelayMs: 180,
  maxDurationMs: 1200,
});

infoLink.addEventListener('click', (event) => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  event.preventDefault();
  document.body.classList.add('is-leaving');
  window.setTimeout(() => {
    window.location.assign(infoLink.href);
  }, 560);
});

if (new URLSearchParams(window.location.search).get('debug') === 'true') {
  window.__ENSIL__ = experience;
}
