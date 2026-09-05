import { createRoot } from 'react-dom/client';
import Dither from './components/Dither.jsx';

const ENSIL_GREEN = [25 / 255, 37 / 255, 39 / 255];

export function mountDither(
  element,
  { enableMouseInteraction = true, frameRate = 30 } = {},
) {
  if (!element) return null;

  const root = createRoot(element);
  root.render(
    <Dither
      waveColor={[1, 1, 1]}
      backgroundColor={ENSIL_GREEN}
      disableAnimation={false}
      enableMouseInteraction={enableMouseInteraction}
      frameRate={frameRate}
      mouseRadius={0.6}
      colorNum={11.3}
      pixelSize={2}
      waveAmplitude={0.3}
      waveFrequency={1.9}
      waveSpeed={0.05}
    />,
  );

  return root;
}
