import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { getVersionPath, loadVersion } from '../helpers/version-adapter.mjs';
import { createMemoryStorage, installWxStorage, withRandomSequence } from '../helpers/platform-mocks.mjs';
import { getDisplayedScore } from '../../shared/js/game/Presentation.js';

const platforms = ['wechat', 'web', 'android'];
const piece = { id: 'single', baseId: 'single', category: 'rescue', isSnake: false,
  cells: [{ x: 0, y: 0 }], bounds: { width: 1, height: 1 }, color: '#3A86FF', used: false };

test('three feedback adapters keep identical event, motion, and lifetime implementation', async () => {
  const sources = await Promise.all(platforms.map((platform) => readFile(getVersionPath(platform, 'game/FeedbackState.js'), 'utf8')));
  assert.equal(sources[0], sources[1]);
  assert.equal(sources[1], sources[2]);
});

for (const platform of platforms) {
  test(`${platform}: quick release keeps the current pose and returns exactly to the rack footprint`, async () => {
    const { feedback } = await loadVersion(platform);
    const state = feedback.createFeedbackState();
    feedback.startDragFeedback(state, { piece, displayCellSize: 30, originCellSize: 16,
      startX: 60, startY: 540, visualX: 90, visualY: 440 });
    assert.equal(feedback.getDragVisual(state.drag).scale * 30, 16);
    feedback.advanceFeedbackState(state, 40);
    const before = feedback.getDragVisual(state.drag);
    feedback.releaseDragFeedback(state, 'invalid', { targetX: 60, targetY: 540, targetCellSize: 16 });
    assert.deepEqual(feedback.getDragVisual(state.drag), before, 'release must not jump to the future pointer pose');
    state.drag.remaining = 0;
    const returned = feedback.getDragVisual(state.drag);
    assert.equal(returned.x, 60);
    assert.equal(returned.y, 540);
    assert.equal(returned.scale * 30, 16);
    feedback.advanceFeedbackState(state, 1);
    assert.equal(state.drag.active, false);
  });

  test(`${platform}: settling remains opaque and matches board cell size`, async () => {
    const { feedback } = await loadVersion(platform);
    const state = feedback.createFeedbackState();
    feedback.startDragFeedback(state, { piece, displayCellSize: 28.8, originCellSize: 20,
      startX: 60, startY: 540, visualX: 80, visualY: 120 });
    feedback.advanceFeedbackState(state, 200);
    feedback.releaseDragFeedback(state, 'settling', { targetX: 100, targetY: 140, targetCellSize: 30, row: 2, col: 3 });
    state.drag.remaining = 0;
    const settled = feedback.getDragVisual(state.drag);
    assert.equal(settled.alpha, 1);
    assert.equal(settled.x, 100);
    assert.equal(settled.y, 140);
    assert.ok(Math.abs(settled.scale * 28.8 - 30) < 1e-9);
    assert.equal(state.drag.targetRow, 2);
    assert.equal(state.drag.targetCol, 3);
    // A clearing placement must not paint a second copy at its destination
    // while the same piece is still being drawn by the landing layer.
    feedback.triggerLineClearEffect(state, { rows: [2], cols: [], cells:
      Array.from({ length: 10 }, (_, col) => ({ row: 2, col, color: piece.color })) });
    const ctx = new Proxy({ globalAlpha: 1 }, { get: (target, key) => key in target ? target[key] : () => {} });
    const { default: Renderer } = await import(pathToFileURL(getVersionPath(platform, 'game/Renderer.js')).href);
    const renderer = new Renderer(ctx, { screenWidth: 390, screenHeight: 844 }, { menuButton: null, safeArea: null });
    const boardState = { feedbackState: state, pendingClear: { rows: [2], cols: [] }, board:
      { grid: Array.from({ length: 10 }, () => Array(10).fill({ color: piece.color })) } };
    const drawnColors = [];
    renderer.drawBlockCell = (_x, _y, _size, color) => drawnColors.push(color);
    renderer.drawLineClearEffects(boardState);
    assert.equal(drawnColors.length, 9, 'landing layer owns the placed cell');
    feedback.advanceFeedbackState(state, 1);
    drawnColors.length = 0;
    renderer.drawLineClearEffects(boardState);
    assert.equal(drawnColors.length, 10, 'clear layer takes ownership after landing');
    assert.ok(drawnColors.every((color) => color === piece.color));
  });

  test(`${platform}: score interpolation never writes score and action feedback freezes, expires, and clears`, async () => {
    const restore = installWxStorage(createMemoryStorage());
    try {
      const { GameState, feedback } = await loadVersion(platform);
      const state = new GameState();
      state.startNewGame();
      state.score = 150;
      feedback.triggerScoreGain(state.feedbackState, 0, 150);
      feedback.triggerActionFeedback(state.feedbackState, 'clear', { cells: [{ row: 2, col: 3, color: '#123456' }] });
      state.update(100);
      assert.ok(getDisplayedScore(state.score, state.feedbackState.gain) > 0);
      assert.ok(getDisplayedScore(state.score, state.feedbackState.gain) < 150);
      assert.equal(state.score, 150);
      state.openPause();
      const before = structuredClone(state.feedbackState);
      state.update(1000);
      assert.deepEqual(state.feedbackState, before);
      state.closePause();
      state.update(200);
      assert.equal(getDisplayedScore(state.score, state.feedbackState.gain), 150);
      assert.equal(state.feedbackState.action.active, false);
      assert.deepEqual(state.feedbackState.action.cells, []);
      feedback.triggerActionFeedback(state.feedbackState, 'undo', { rack: true });
      state.clearScoreFeedback();
      assert.equal(feedback.hasActiveFeedback(state.feedbackState), false);
    } finally { restore(); }
  });

  test(`${platform}: successful tools emit one result, failed tools emit none, revive preserves its eligibility`, async () => {
    const restore = installWxStorage(createMemoryStorage());
    try {
      const { GameState } = await loadVersion(platform);
      const state = new GameState();
      await withRandomSequence(Array(100).fill(0), () => state.startNewGame());
      state.consumeEvents();
      assert.equal(state.useUndoTool(), false);
      assert.equal(state.consumeEvents().some((event) => event.type === 'itemUsed'), false);
      assert.equal(state.useRefreshTool(), true);
      assert.deepEqual(state.consumeEvents().filter((event) => event.type === 'itemUsed').map((event) => event.payload.item), ['refresh']);
      state.rackPieces = [structuredClone(piece)];
      state.dragState.activePieceIndex = 0;
      state.previewState = { visible: true, canPlace: true, row: 0, col: 0 };
      assert.equal(state.tryPlaceDraggedPiece(), true);
      state.consumeEvents();
      assert.equal(state.useUndoTool(), true);
      assert.equal(state.score, 0);
      assert.deepEqual(state.consumeEvents().filter((event) => event.type === 'itemUsed').map((event) => event.payload.item), ['undo']);
      state.board.grid[0][0] = { color: piece.color };
      state.toggleClearTool();
      assert.equal(state.useClearTool(0, 0), true);
      const clearEvents = state.consumeEvents();
      assert.equal(clearEvents.filter((event) => event.type === 'itemUsed').length, 1);
      assert.equal(clearEvents.filter((event) => event.type === 'clear').length, 1);
      assert.equal(state.score, 0);
      state.setSettings({ localMembershipEnabled: true });
      state.score = 210;
      assert.equal(state.consumeRevive(), true);
      const reviveEvents = state.consumeEvents();
      assert.equal(reviveEvents.filter((event) => event.type === 'reviveStarted').length, 1);
      assert.equal(reviveEvents.filter((event) => event.type === 'reviveCompleted').length, 1);
      assert.equal(state.score, 210);
      assert.equal(state.bestScoreEligible, true);
      assert.equal(state.feedbackState.action.kind, 'revive');
    } finally { restore(); }
  });

  test(`${platform}: raster cache is bounded, reuses a dense board, and releases on resize`, async () => {
    const restore = installWxStorage(createMemoryStorage());
    const surfaces = [];
    let gradients = 0;
    const context = () => new Proxy({
      globalAlpha: 1,
      getTransform: () => ({ a: 2.5 }),
      measureText: (value) => ({ width: String(value).length * 8 }),
      createLinearGradient: () => { gradients++; return { addColorStop() {} }; },
      createRadialGradient: () => { gradients++; return { addColorStop() {} }; }
    }, { get: (target, key) => key in target ? target[key] : () => {} });
    wx.createOffscreenCanvas = () => {
      const surface = { width: 0, height: 0, getContext: () => context() };
      surfaces.push(surface);
      return surface;
    };
    try {
      const { GameState } = await loadVersion(platform);
      const { default: Renderer } = await import(pathToFileURL(getVersionPath(platform, 'game/Renderer.js')).href);
      const renderer = new Renderer(context(), { screenWidth: 390, screenHeight: 844 }, { menuButton: null, safeArea: null });
      const state = new GameState();
      state.startNewGame();
      state.update(260);
      state.board.grid = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => ({ color: piece.color })));
      renderer.drawBackground(false);
      renderer.drawBoard(state);
      const created = gradients;
      for (let index = 0; index < 60; index++) {
        renderer.drawBackground(false);
        renderer.drawBoard(state);
      }
      assert.equal(gradients, created, 'resting materials must not create gradients again');
      assert.equal(surfaces.length, 2, 'background and board coexist without eviction thrash');
      const allocated = surfaces.reduce((total, surface) => total + surface.width * surface.height, 0);
      assert.ok(allocated <= renderer.quality.surfaceCachePixelMax);
      renderer.setViewport({ screenWidth: 360, screenHeight: 640 }, { menuButton: null, safeArea: null });
      assert.equal(surfaces.reduce((total, surface) => total + surface.width * surface.height, 0), 0);
    } finally { restore(); }
  });
}
