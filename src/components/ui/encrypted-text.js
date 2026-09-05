const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>/[]{}—=+*^?#';

const activeAnimations = new WeakMap();

function randomGlyph(index, frame) {
  return GLYPHS[(index * 17 + frame * 23) % GLYPHS.length];
}

/**
 * Reveals an element's text through a restrained encrypted/scramble state.
 * The browser only rebuilds the short text nodes; layout and navigation stay
 * owned by the existing vanilla application.
 */
export function revealEncryptedText(
  element,
  {
    text = element?.textContent ?? '',
    revealDelayMs = 50,
    startDelayMs = 0,
    maxDurationMs = 2400,
  } = {},
) {
  if (!element) return Promise.resolve();

  const previous = activeAnimations.get(element);
  if (previous) {
    window.clearTimeout(previous.startTimer);
    window.clearInterval(previous.interval);
  }

  const characters = Array.from(text);
  element.textContent = text;
  element.setAttribute('aria-label', text.replace(/\s+/g, ' ').trim());

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || characters.length === 0) {
    element.classList.add('encrypted-text-complete');
    return Promise.resolve();
  }

  element.textContent = '';
  element.classList.add('encrypted-text-active');
  element.classList.remove('encrypted-text-complete');

  const fragment = document.createDocumentFragment();
  const glyphNodes = [];

  characters.forEach((character, index) => {
    if (/\s/.test(character)) {
      fragment.append(document.createTextNode(character));
      return;
    }

    const span = document.createElement('span');
    span.className = 'encrypted-char';
    span.textContent = randomGlyph(index, 0);
    span.dataset.character = character;
    span.dataset.index = String(index);
    glyphNodes.push(span);
    fragment.append(span);
  });

  element.append(fragment);

  const maximumTicks = Math.max(1, Math.floor(maxDurationMs / revealDelayMs));
  const revealBatch = Math.max(1, Math.ceil(glyphNodes.length / maximumTicks));

  return new Promise((resolve) => {
    const state = { startTimer: 0, interval: 0 };
    activeAnimations.set(element, state);

    state.startTimer = window.setTimeout(() => {
      let revealedCount = 0;
      let frame = 0;

      const renderFrame = () => {
        frame += 1;
        revealedCount = Math.min(glyphNodes.length, revealedCount + revealBatch);

        glyphNodes.forEach((node, index) => {
          if (index < revealedCount) {
            node.textContent = node.dataset.character;
            node.classList.add('is-revealed');
          } else {
            node.textContent = randomGlyph(Number(node.dataset.index), frame);
          }
        });

        if (revealedCount >= glyphNodes.length) {
          window.clearInterval(state.interval);
          element.textContent = text;
          element.classList.remove('encrypted-text-active');
          element.classList.add('encrypted-text-complete');
          activeAnimations.delete(element);
          resolve();
        }
      };

      renderFrame();
      if (revealedCount < glyphNodes.length) {
        state.interval = window.setInterval(renderFrame, revealDelayMs);
      }
    }, startDelayMs);
  });
}

export function revealEncryptedCollection(elements, options = {}) {
  return Promise.all(
    Array.from(elements).map((element, index) =>
      revealEncryptedText(element, {
        ...options,
        startDelayMs: (options.startDelayMs ?? 0) + index * (options.staggerMs ?? 70),
        maxDurationMs:
          element.tagName === 'P' || element.hasAttribute('data-encrypted-body')
            ? options.bodyDurationMs ?? 2600
            : options.labelDurationMs ?? 1200,
      }),
    ),
  );
}
