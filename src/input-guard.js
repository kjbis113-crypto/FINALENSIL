const ZOOM_KEYS = new Set(['+', '-', '=', '_', '0']);
const ZOOM_CODES = new Set(['NumpadAdd', 'NumpadSubtract', 'Numpad0']);

export function installInputGuard() {
  if (document.documentElement.dataset.inputGuard === 'true') return;
  document.documentElement.dataset.inputGuard = 'true';

  document.addEventListener('dragstart', (event) => event.preventDefault());

  document.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    },
    { passive: false },
  );

  document.addEventListener(
    'keydown',
    (event) => {
      const hasZoomModifier = event.ctrlKey || event.metaKey;
      if (
        hasZoomModifier &&
        (ZOOM_KEYS.has(event.key) || ZOOM_CODES.has(event.code))
      ) {
        event.preventDefault();
      }
    },
    { capture: true },
  );

  document.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length > 1) event.preventDefault();
    },
    { passive: false },
  );

  for (const eventName of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(eventName, (event) => event.preventDefault(), {
      passive: false,
    });
  }
}
