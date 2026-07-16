// GENERATED FILE - edit shared/js source and run npm run sync.
export const QUALITY_PROFILES = Object.freeze({
  light: Object.freeze({
    clearEffectMs: 560,
    dragSettleMs: 140,
    maxParticles: 20,
    maxLaserDraws: 4,
    maxStackedEffects: 4,
    shadowBlurScale: 0.6,
    canvasPixelMax: 4000000,
    highCostEffects: false
  }),
  full: Object.freeze({
    clearEffectMs: 560,
    dragSettleMs: 140,
    maxParticles: 40,
    maxLaserDraws: 8,
    maxStackedEffects: 6,
    shadowBlurScale: 1,
    canvasPixelMax: 5000000,
    highCostEffects: true
  })
});

export function getQualityProfile(name = 'full') {
  return QUALITY_PROFILES[name] || QUALITY_PROFILES.full;
}
