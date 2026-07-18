import test from 'node:test';
import assert from 'node:assert/strict';

import { versions } from '../fixtures/core-vectors.mjs';
import { loadVersion } from '../helpers/version-adapter.mjs';

const clearResult = {
  placementScore: 0,
  lineClearScore: 200,
  bonusScore: 200,
  totalAdded: 400,
  clearedLines: 2
};

const lineClearDetails = {
  rows: [2],
  cols: [5],
  cells: [
    { row: 2, col: 0 },
    { row: 2, col: 1 },
    { row: 0, col: 5 },
    { row: 1, col: 5 },
    { row: 2, col: 5 }
  ]
};

const multiLineDetails = {
  rows: [1, 2, 3],
  cols: [4, 5],
  cells: Array.from({ length: 50 }, (_, index) => ({
    row: Math.floor(index / 10),
    col: index % 10
  }))
};

function transientSummary(state) {
  return {
    clearScore: state.clearScore,
    clearEffects: state.clearEffects,
    scorePulse: state.scorePulse,
    highScore: state.highScore,
    drag: state.drag
  };
}

for (const version of versions) {
  test(`${version}: feedback state starts inactive and uses the unified durations`, async () => {
    const { feedback } = await loadVersion(version);
    const state = feedback.createFeedbackState();
    assert.equal(feedback.FEEDBACK_DURATIONS.clearEffect, 560);
    assert.equal(feedback.FEEDBACK_DURATIONS.clearEffect <= 650, true);
    assert.equal(feedback.FEEDBACK_DURATIONS.clearScore, 900);
    assert.equal(feedback.FEEDBACK_DURATIONS.scorePulse, 500);
    assert.equal(feedback.FEEDBACK_DURATIONS.highScore, 1200);
    assert.equal(feedback.FEEDBACK_DURATIONS.dragLift, 200);
    assert.equal(feedback.hasActiveFeedback(state), false);
    assert.deepEqual(state.clearEffects, []);
    assert.deepEqual(
      [state.clearScore.active, state.scorePulse.active, state.highScore.active, state.drag.active],
      [false, false, false, false]
    );
  });

  test(`${version}: score feedback advances, freezes when not advanced, and expires`, async () => {
    const { feedback } = await loadVersion(version);
    const state = feedback.createFeedbackState();
    feedback.triggerClearScore(state, clearResult);
    feedback.triggerHighScore(state);
    assert.equal(state.clearScore.totalAdded, 400);
    assert.equal(state.clearScore.clearedLines, 2);
    assert.equal(state.scorePulse.remaining, 500);
    assert.equal(state.highScore.remaining, 1200);

    feedback.advanceFeedbackState(state, 300);
    assert.equal(state.clearScore.remaining, 600);
    assert.equal(state.scorePulse.remaining, 200);
    assert.equal(state.highScore.remaining, 900);

    const frozen = structuredClone(state);
    assert.deepEqual(state, frozen, 'no explicit advance means paused state remains frozen');

    feedback.advanceFeedbackState(state, 900);
    assert.equal(state.clearScore.active, false);
    assert.equal(state.scorePulse.active, false);
    assert.equal(state.highScore.active, false);
  });

  test(`${version}: newer clear feedback replaces older data and restarts timers`, async () => {
    const { feedback } = await loadVersion(version);
    const state = feedback.createFeedbackState();
    feedback.triggerClearScore(state, { ...clearResult, totalAdded: 150, clearedLines: 1 });
    feedback.advanceFeedbackState(state, 400);
    feedback.triggerClearScore(state, clearResult);
    assert.equal(state.clearScore.remaining, 900);
    assert.equal(state.scorePulse.remaining, 500);
    assert.equal(state.clearScore.totalAdded, 400);
    assert.equal(state.clearScore.clearedLines, 2);
  });

  test(`${version}: line clear effect records rows, cols, cells and deterministic particles`, async () => {
    const { feedback } = await loadVersion(version);
    const state = feedback.createFeedbackState();
    const effect = feedback.triggerLineClearEffect(state, lineClearDetails);
    assert.equal(effect.duration, 560);
    assert.equal(effect.duration <= 650, true);
    assert.equal(effect.lineCount, 2);
    assert.deepEqual(effect.axes, { rows: true, cols: true });
    assert.equal(effect.crossCells.length, 1);
    assert.deepEqual(effect.crossCells[0], { row: 2, col: 5 });
    assert.deepEqual(effect.clearedRows, [2]);
    assert.deepEqual(effect.clearedCols, [5]);
    assert.deepEqual(effect.cells, [
      { row: 0, col: 5 },
      { row: 1, col: 5 },
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 2, col: 5 }
    ]);
    assert.deepEqual(effect.lasers, [
      { kind: 'row', index: 2, origin: 0.5 },
      { kind: 'col', index: 5, origin: 0.5 }
    ]);
    assert.equal(effect.bursts, undefined);
    assert.equal(effect.particles.length, 16);
    assert.equal(feedback.CLEAR_EFFECT_LIMITS.maxParticles, version === 'wechat' ? 20 : 40);
    assert.equal(effect.particles.length <= feedback.CLEAR_EFFECT_LIMITS.maxParticles, true);
    assert.deepEqual(effect.particles, feedback.createLineClearParticles(effect.particleCells, effect.id, effect.lineCount));
    assert.deepEqual(effect.impact, {
      intensity: 2,
      shakePixels: 0,
      pulseScale: 1,
      duration: 80
    });
    assert.equal(feedback.hasActiveFeedback(state), true);
  });

  test(`${version}: column-only and multi-line clears produce bounded laser polish`, async () => {
    const { feedback } = await loadVersion(version);
    const state = feedback.createFeedbackState();
    const columnEffect = feedback.triggerLineClearEffect(state, {
      rows: [],
      cols: [4],
      cells: Array.from({ length: 10 }, (_, row) => ({ row, col: 4 }))
    });
    const multiEffect = feedback.triggerLineClearEffect(state, multiLineDetails);

    assert.deepEqual(columnEffect.clearedRows, []);
    assert.deepEqual(columnEffect.clearedCols, [4]);
    assert.deepEqual(columnEffect.lasers, [
      { kind: 'col', index: 4, origin: 0.5 }
    ]);
    const columnParticle = columnEffect.particles[columnEffect.particleCells.findIndex((cell) => cell.axis === 'col')];
    const rowParticle = multiEffect.particles[multiEffect.particleCells.findIndex((cell) => cell.axis === 'row')];
    assert.equal(Math.abs(columnParticle.velocityY) > Math.abs(columnParticle.velocityX), true);
    assert.equal(Math.abs(rowParticle.velocityX) > Math.abs(rowParticle.velocityY), true);
    assert.equal(columnEffect.impact.intensity, 1);
    assert.equal(columnEffect.impact.shakePixels, 0);
    assert.equal(multiEffect.impact.intensity, 5);
    assert.equal(multiEffect.impact.shakePixels, 0);
    assert.equal(multiEffect.impact.pulseScale, 1);
    assert.equal(multiEffect.particles.length, feedback.CLEAR_EFFECT_LIMITS.maxParticles);
    assert.equal(multiEffect.particles.length <= 40, true);
    assert.equal(multiEffect.particles.some((particle) => particle.shape === 'spark'), true);
    assert.equal(multiEffect.particles.every((particle) => ['dot', 'spark'].includes(particle.shape)), true);
    assert.deepEqual(multiEffect.particles, feedback.createLineClearParticles(multiEffect.particleCells, multiEffect.id, multiEffect.lineCount));
    assert.equal(multiEffect.lasers.length, 5);
  });

  test(`${version}: line clear effect advances phases, expires, and does not grow without bound`, async () => {
    const { feedback } = await loadVersion(version);
    const state = feedback.createFeedbackState();
    feedback.triggerLineClearEffect(state, { rows: [0], cols: [], cells: [{ row: 0, col: 0 }] });
    const charge = feedback.getLineClearEffectVisual(state.clearEffects[0]);
    assert.equal(charge.phase, 'charge');
    assert.equal(charge.laserProgress, 0);
    assert.equal(charge.shakeX, 0);
    assert.equal(charge.boardScale, 1);
    feedback.advanceFeedbackState(state, 80);
    const handoff = feedback.getLineClearEffectVisual(state.clearEffects[0]);
    assert.equal(handoff.laserAlpha > 0, true);
    feedback.advanceFeedbackState(state, 100);
    const laser = feedback.getLineClearEffectVisual(state.clearEffects[0]);
    assert.equal(laser.phase, 'laser');
    assert.equal(laser.laserProgress > 0 && laser.laserProgress < 1, true);
    assert.equal(laser.boardScale >= 1 && laser.boardScale < 1.02, true);
    assert.equal(laser.particleAlpha, 0);
    assert.equal(laser.impactAlpha > 0 && laser.impactAlpha < 1, true);
    assert.equal(laser.scoreSyncProgress > 0 && laser.scoreSyncProgress < 1, true);
    feedback.advanceFeedbackState(state, 220);
    const erase = feedback.getLineClearEffectVisual(state.clearEffects[0]);
    assert.equal(erase.phase, 'erase');
    assert.equal(erase.particleAlpha > 0 && erase.particleAlpha <= 1, true);
    assert.equal(erase.impactAlpha >= 0 && erase.impactAlpha <= 1, true);
    assert.equal(erase.residualAlpha > 0 && erase.residualAlpha <= 1, true);
    assert.equal(erase.boardScale >= 1 && erase.boardScale < 1.02, true);
    assert.equal(erase.scoreSyncProgress, 1);
    feedback.advanceFeedbackState(state, 240);
    assert.deepEqual(state.clearEffects, []);

    for (let index = 0; index < 10; index += 1) {
      feedback.triggerLineClearEffect(state, { rows: [index % 10], cols: [], cells: [{ row: index % 10, col: 0 }] });
    }
    assert.equal(state.clearEffects.length <= 6, true);
  });

  test(`${version}: clearing feedback removes active line clear effects for undo and restart`, async () => {
    const { feedback } = await loadVersion(version);
    const state = feedback.createFeedbackState();
    feedback.triggerClearScore(state, clearResult);
    feedback.triggerLineClearEffect(state, lineClearDetails);
    assert.equal(state.clearEffects.length, 1);
    feedback.clearFeedbackState(state);
    assert.equal(feedback.hasActiveFeedback(state), false);
    assert.deepEqual(state.clearEffects, []);
  });

  test(`${version}: drag phases move from lifting to dragging and clear after release feedback`, async () => {
    const { feedback } = await loadVersion(version);
    const state = feedback.createFeedbackState();
    feedback.startDragFeedback(state, {
      pieceIndex: 1,
      pointerX: 120,
      pointerY: 500,
      visualX: 100,
      visualY: 420,
      startX: 40,
      startY: 560,
      displayCellSize: 24,
      piece: { cells: [{ x: 0, y: 0 }], bounds: { width: 1, height: 1 }, color: '#fff' }
    });
    assert.equal(state.drag.phase, 'lifting');
    feedback.advanceFeedbackState(state, 200);
    assert.equal(state.drag.phase, 'dragging');
    feedback.updateDragFeedback(state, { pointerX: 130, pointerY: 480, visualX: 110, visualY: 400 });
    assert.equal(state.drag.visualX, 110);
    feedback.releaseDragFeedback(state, 'invalid');
    assert.equal(state.drag.phase, 'invalid');
    feedback.advanceFeedbackState(state, feedback.FEEDBACK_DURATIONS.dragInvalid);
    assert.equal(state.drag.active, false);
    assert.equal(state.drag.phase, 'idle');
  });

  test(`${version}: renderer-facing drag visual follows the shared phase interpolation`, async () => {
    const { feedback } = await loadVersion(version);
    const state = feedback.createFeedbackState();
    feedback.startDragFeedback(state, {
      pieceIndex: 0,
      pointerX: 100,
      pointerY: 200,
      visualX: 80,
      visualY: 120,
      startX: 20,
      startY: 220,
      displayCellSize: 20,
      piece: { cells: [{ x: 0, y: 0 }], bounds: { width: 1, height: 1 }, color: '#fff' }
    });
    const start = feedback.getDragVisual(state.drag);
    assert.deepEqual({ x: start.x, y: start.y, scale: start.scale }, { x: 20, y: 220, scale: 1 });
    feedback.advanceFeedbackState(state, 200);
    const dragging = feedback.getDragVisual(state.drag);
    assert.deepEqual({ x: dragging.x, y: dragging.y, scale: dragging.scale }, { x: 80, y: 120, scale: 1.08 });
    feedback.releaseDragFeedback(state, 'invalid', { targetX: 20, targetY: 220 });
    feedback.advanceFeedbackState(state, feedback.FEEDBACK_DURATIONS.dragInvalid / 2);
    const returning = feedback.getDragVisual(state.drag);
    assert.equal(returning.x > 20 && returning.x < 80, true);
    assert.equal(returning.y > 120 && returning.y < 220, true);
  });

  test(`${version}: clear feedback labels remain identical`, async () => {
    const { feedback } = await loadVersion(version);
    assert.equal(feedback.getClearFeedbackLabel(1), '清除 1 线');
    assert.equal(feedback.getClearFeedbackLabel(2), '双线消除');
    assert.equal(feedback.getClearFeedbackLabel(3), '三线消除');
    assert.equal(feedback.getClearFeedbackLabel(4), '清除 4 线');
  });

  test(`${version}: clearing feedback resets all transient state`, async () => {
    const { feedback } = await loadVersion(version);
    const state = feedback.createFeedbackState();
    feedback.triggerClearScore(state, clearResult);
    feedback.triggerHighScore(state);
    feedback.startDragFeedback(state, {
      pieceIndex: 0,
      pointerX: 1,
      pointerY: 2,
      visualX: 3,
      visualY: 4,
      startX: 5,
      startY: 6,
      displayCellSize: 10,
      piece: { cells: [], bounds: { width: 0, height: 0 }, color: '#000' }
    });
    feedback.clearFeedbackState(state);
    assert.equal(feedback.hasActiveFeedback(state), false);
    assert.deepEqual(state, feedback.createFeedbackState());
  });
}

test('both production feedback modules produce identical state transitions', async () => {
  const modules = await Promise.all(versions.map(loadVersion));
  const states = modules.map(({ feedback }) => {
    const state = feedback.createFeedbackState();
    feedback.triggerClearScore(state, clearResult);
    feedback.triggerLineClearEffect(state, lineClearDetails);
    feedback.triggerHighScore(state);
    feedback.advanceFeedbackState(state, 250);
    return transientSummary(state);
  });
  assert.deepEqual(states[0], states[1]);
});
