import test from 'node:test';
import assert from 'node:assert/strict';
import { getActionVisual, getCanvasPixelRatio, getClearCellVisual, getFeedbackCue, unionDamageRects } from '../../shared/js/game/Presentation.js';
import { getQualityProfile } from '../../shared/js/config/quality.js';

test('directional clear starts at the placement, preserves crossing uniqueness, and expires within its effect', () => {
  const effect = { duration: 560, remaining: 400, origin: { row: 3, col: 1 }, clearedRows: [3], clearedCols: [1] };
  const near = getClearCellVisual(effect, { row: 3, col: 1 });
  const far = getClearCellVisual(effect, { row: 3, col: 9 });
  assert.ok(near.alpha < far.alpha);
  assert.equal(near.offsetX, 0);
  assert.equal(near.offsetY, 0);
  for (const cell of [{ row: 3, col: 9 }, { row: 9, col: 1 }, { row: 3, col: 1 }]) {
    const completed = getClearCellVisual({ ...effect, remaining: 0 }, cell);
    assert.equal(completed.alpha, 0);
  }
  const gentle = getClearCellVisual(effect, { row: 3, col: 9 }, true);
  assert.deepEqual({ x: gentle.offsetX, y: gentle.offsetY, scale: gentle.scale }, { x: 0, y: 0, scale: 1 });
  assert.ok(gentle.alpha < 1, 'reduced motion still communicates the clear');
});

test('rack arrival is bounded and reduced motion preserves action acknowledgment', () => {
  const action = { active: true, kind: 'refresh', duration: 260, remaining: 130 };
  const first = getActionVisual(action, 0);
  const last = getActionVisual(action, 2);
  assert.ok(first.alpha > last.alpha);
  assert.equal(getActionVisual({ ...action, remaining: 0 }, 2).offsetY, 0);
  const gentle = getActionVisual(action, 0, true);
  assert.equal(gentle.scale, 1);
  assert.equal(gentle.offsetY, 0);
  assert.ok(gentle.alpha > 0);
});

test('main canvas plus reserved caches stay inside both platform budgets at high DPR', () => {
  for (const profile of ['light', 'full']) {
    const quality = getQualityProfile(profile);
    for (const [width, height] of [[320, 568], [390, 844], [1280, 900], [3840, 2160]]) {
      for (const rawDpr of [1, 2, 3, 4]) {
        const dpr = getCanvasPixelRatio(width, height, rawDpr, quality);
        const pixels = Math.floor(width * dpr) * Math.floor(height * dpr);
        assert.ok(pixels + quality.surfaceCachePixelMax <= quality.canvasPixelMax);
        assert.ok(dpr <= rawDpr && dpr <= quality.maxDpr);
        assert.ok(dpr > 0);
      }
    }
  }
  assert.equal(getCanvasPixelRatio(390, 844, 3, getQualityProfile('full')), 2.5);
});

test('damage union includes old and new drag positions and clips to the viewport', () => {
  const damage = unionDamageRects([
    { x: -20, y: 20, width: 60, height: 60 },
    { x: 200, y: 800, width: 120, height: 100 }
  ], { screenWidth: 390, screenHeight: 844 });
  assert.deepEqual(damage, { x: 0, y: 20, width: 320, height: 824 });
  assert.equal(unionDamageRects([], { screenWidth: 390, screenHeight: 844 }), null);
});

test('sound and vibration have one owner per outcome and distinguish clear strength', () => {
  assert.deepEqual(getFeedbackCue({ type: 'place' }), { sound: 'playPlace', vibration: 'light' });
  assert.deepEqual(getFeedbackCue({ type: 'combo3' }), { sound: 'playCombo3', vibration: 'heavy' });
  assert.equal(getFeedbackCue({ type: 'linesCleared' }), null, 'compatibility clear cue owns playback');
  assert.equal(getFeedbackCue({ type: 'itemUsed', payload: { item: 'clear' } }), null);
  assert.deepEqual(getFeedbackCue({ type: 'itemUsed', payload: { item: 'undo' } }), { sound: 'playClick', vibration: 'light' });
  assert.deepEqual(getFeedbackCue({ type: 'reviveStarted' }), { sound: 'playClick', vibration: 'medium' });
});
