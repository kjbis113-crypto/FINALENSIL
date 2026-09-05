import { Experience } from './experience/Experience.js';

const sceneElement = document.querySelector('#scene');
const experience = new Experience(sceneElement);
const infoLink = document.querySelector('.study-number-link');
const numberLabel = infoLink.querySelector('.object-number');
const objectId = Math.min(4, Math.max(1, Number(new URLSearchParams(window.location.search).get('id')) || 1));

infoLink.href = `/info.html?id=${objectId}`;
infoLink.setAttribute('aria-label', `Read information about NO. ${objectId}`);

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const label = `NO. ${objectId}`;
  numberLabel.textContent = '';
  numberLabel.setAttribute('aria-label', label);
  Array.from(label).forEach((char, index) => {
    const span = document.createElement('span');
    span.className = 'study-char';
    span.textContent = char;
    span.style.animationDelay = `${220 + index * 115 + ((index * 31) % 4) * 18}ms`;
    numberLabel.append(span);
  });
}

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
