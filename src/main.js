import { mountDither } from './dither-mount.jsx';
import { installStageShortcut } from './stage-window.js';
import { installInputGuard } from './input-guard.js';

installInputGuard();

const cards = document.querySelectorAll('.media-card');
const gallery = document.querySelector('.gallery');

mountDither(document.querySelector('#dither-background'));

const setObjectFocus = (card, isFocused) => {
  card.classList.toggle('is-object-hovered', isFocused);
  gallery.classList.toggle('has-object-focus', isFocused);
};

const createObjectSampler = (card, video, fallback) => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const sampleWidth = 72;
  const sampleHeight = 90;

  canvas.width = sampleWidth;
  canvas.height = sampleHeight;

  return (event) => {
    if (event.pointerType === 'touch' || !context) return;

    const source = video.readyState >= 2 ? video : fallback;
    const bounds = card.getBoundingClientRect();
    const normalizedX = (event.clientX - bounds.left) / bounds.width;
    const normalizedY = (event.clientY - bounds.top) / bounds.height;
    const sampleX = Math.max(1, Math.min(sampleWidth - 2, Math.floor(normalizedX * sampleWidth)));
    const sampleY = Math.max(1, Math.min(sampleHeight - 2, Math.floor(normalizedY * sampleHeight)));

    try {
      context.clearRect(0, 0, sampleWidth, sampleHeight);
      context.drawImage(source, 0, 0, sampleWidth, sampleHeight);

      const pixels = context.getImageData(sampleX - 1, sampleY - 1, 3, 3).data;
      let strongestObjectPixel = 0;

      for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const alpha = pixels[index + 3] / 255;
        const distanceFromWhite = ((255 - red) + (255 - green) + (255 - blue)) / 3;
        strongestObjectPixel = Math.max(strongestObjectPixel, distanceFromWhite * alpha);
      }

      setObjectFocus(card, strongestObjectPixel > 14);
    } catch {
      setObjectFocus(card, false);
    }
  };
};

const prepareVideo = async (video) => {
  const source = video.dataset.src;

  if (!source) return;

  try {
    const response = await fetch(source, { method: 'HEAD' });

    if (!response.ok) return;

    video.src = source;
    video.addEventListener(
      'canplay',
      () => {
        video.closest('.media-card')?.classList.add('has-video');
        video.play().catch(() => {});
      },
      { once: true },
    );
    video.load();
  } catch {
    // The animated artwork remains visible until the matching local video is added.
  }
};

cards.forEach((card) => {
  const video = card.querySelector('.media-video');
  const fallback = card.querySelector('.media-fallback');
  const sampleObjectUnderPointer = createObjectSampler(card, video, fallback);

  prepareVideo(video);
  card.addEventListener('pointermove', sampleObjectUnderPointer);
  card.addEventListener('pointerleave', () => setObjectFocus(card, false));
  card.addEventListener('focus', () => gallery.classList.add('has-object-focus'));
  card.addEventListener('blur', () => gallery.classList.remove('has-object-focus'));
  card.addEventListener('click', (event) => {
    const isMouseClick = event.detail > 0 && window.matchMedia('(hover: hover)').matches;

    if (isMouseClick && !card.classList.contains('is-object-hovered')) {
      event.preventDefault();
    }
  });
});

// 운영용 — Ctrl+Alt+Shift+O 로 빔프로젝터 스테이지 창을 연다.
installStageShortcut();
