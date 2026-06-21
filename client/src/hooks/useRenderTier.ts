export type RenderTier = 'high' | 'low';

export function useRenderTier(): RenderTier {
  const cores = navigator.hardwareConcurrency ?? 2;
  const dpr = window.devicePixelRatio ?? 1;
  return cores >= 4 && dpr >= 1.5 ? 'high' : 'low';
}
