import test from 'node:test';
import assert from 'node:assert/strict';

import { QUALITY_PROFILES, getQualityProfile } from '../../shared/js/config/quality.js';

test('quality profiles keep timing semantics shared while limiting WeChat effects', () => {
  const light = getQualityProfile('light');
  const full = getQualityProfile('full');

  assert.equal(light.clearEffectMs, full.clearEffectMs);
  assert.equal(light.dragSettleMs, full.dragSettleMs);
  assert.ok(light.maxParticles < full.maxParticles);
  assert.ok(light.maxLaserDraws < full.maxLaserDraws);
  assert.equal(light.highCostEffects, false);
  assert.equal(full.highCostEffects, true);
  assert.equal(QUALITY_PROFILES.light.canvasPixelMax, 4000000);
});
