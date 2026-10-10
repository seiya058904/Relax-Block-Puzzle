import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { getVersionPath, loadVersion } from '../helpers/version-adapter.mjs';
import { createMemoryStorage, installWxStorage } from '../helpers/platform-mocks.mjs';

for (const version of ['wechat', 'web', 'android']) {
  test(`${version}: combo excludes nested pauses but still expires during idle play without frames`, async () => {
    const restore = installWxStorage(createMemoryStorage());
    const originalNow = Date.now;
    let now = 10000;
    Date.now = () => now;
    try {
      const { GameState } = await loadVersion(version);
      const state = new GameState(); state.startNewGame();
      state.handleLineClear(1);
      now = 11000; state.openPause();
      now = 16000; state.setLifecyclePaused(true);
      now = 18000; state.setLifecyclePaused(true);
      now = 21000; state.closePause();
      assert.equal(state.canAdvanceTime(), false);
      now = 24000; state.setLifecyclePaused(false);
      now = 24500; state.setLifecyclePaused(false);
      now = 25000; state.handleLineClear(1);
      assert.equal(state.comboState.comboCount, 2, 'only 2000ms of active time elapsed');
      now = 28000; state.handleLineClear(1);
      assert.equal(state.comboState.comboCount, 3, 'the existing 3000ms boundary remains inclusive');
      now = 31001; state.handleLineClear(1);
      assert.equal(state.comboState.comboCount, 1, 'idle time expires the window without any update() calls');
      now = 32000; state.openSettings();
      now = 50000; state.closeSettings();
      now = 51000; state.handleLineClear(1);
      assert.equal(state.comboState.comboCount, 2);
    } finally { Date.now = originalNow; restore(); }
  });

  test(`${version}: an unusable viewport cannot draw negative cells or advance a pending clear`, async () => {
    const restore = installWxStorage(createMemoryStorage());
    Object.assign(wx, { onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {} });
    try {
      const { GameState, InputManager } = await loadVersion(version);
      const { default: Renderer } = await import(pathToFileURL(getVersionPath(version, 'game/Renderer.js')));
      const texts = [];
      const ctx = new Proxy({
        measureText: value => ({ width: String(value).length * 8 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }),
        getTransform: () => ({ a: 1 }),
        fillText: text => texts.push(text),
        arcTo: (x1, y1, x2, y2, radius) => assert.ok(radius >= 0, 'Canvas arc radius must be nonnegative')
      }, { get: (target, name) => name in target ? target[name] : () => {} });
      const viewport = (width, height) => ({ screenWidth: width, screenHeight: height, pixelRatio: 1 });
      const safeArea = { menuButton: null, safeArea: null };
      const state = new GameState(); state.startNewGame();
      const renderer = new Renderer(ctx, viewport(390, 844), safeArea);
      const input = new InputManager(state, renderer, {});
      renderer.render(state);
      state.board.grid[0].fill({ color: '#abcdef' }, 0, 9);
      state.rackPieces = [{ id: 'single', baseId: 'single', category: 'rescue', isSnake: false,
        bounds: { width: 1, height: 1 }, cells: [{ x: 0, y: 0 }], color: '#abcdef', used: false }];
      state.dragState.activePieceIndex = 0;
      state.previewState = { row: 0, col: 9, visible: true, canPlace: true };
      assert.equal(state.tryPlaceDraggedPiece(), true);
      assert.equal(state.score, 10);
      const pending = structuredClone(state.pendingClear);
      const board = state.board.getSnapshot();
      for (const [width, height] of [[568, 320], [640, 360], [280, 640]]) {
        renderer.setViewport(viewport(width, height), safeArea); renderer.render(state);
        assert.equal(renderer.layout.viewportBlocked, true);
        assert.ok(renderer.layout.cellSize > 0);
        assert.equal(state.canAdvanceTime(), false);
        assert.equal(state.canDragPieces(), false);
        assert.equal(state.canUseTool(), false);
        assert.deepEqual(renderer.rackHitAreas, []);
        assert.deepEqual(renderer.homeActionRects, {});
        assert.equal(renderer.settingsButtonRect, null);
        const finger = { identifier: 0, clientX: 100, clientY: 100 };
        input.handleTouchStart({ touches: [finger], changedTouches: [finger] });
        assert.equal(input.activeTouchIdentifier, null);
        state.update(500);
        assert.deepEqual(state.pendingClear, pending);
        assert.deepEqual(state.board.getSnapshot(), board);
        assert.equal(state.score, 10);
      }
      assert.ok(texts.includes('请转为竖屏或增大窗口'));
      renderer.setViewport(viewport(320, 568), safeArea); renderer.render(state);
      assert.equal(renderer.layout.viewportBlocked, false, 'the established compact portrait remains supported');
      state.update(180);
      assert.equal(state.pendingClear, null);
      assert.equal(state.score, 160);
      state.update(500);
      assert.equal(state.score, 160, 'the frozen line clears exactly once after recovery');
    } finally { restore(); }
  });
}
