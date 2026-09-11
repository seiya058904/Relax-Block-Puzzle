import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { getVersionPath } from '../helpers/version-adapter.mjs';
import { installBrowserEnvironment } from '../helpers/platform-mocks.mjs';

for (const version of ['web', 'android']) {
  test(`${version}: real Main and state resize, freeze, consume events, and resume`, async () => {
    const environment = installBrowserEnvironment();
    const frames = new Map();
    const previousRaf = globalThis.requestAnimationFrame;
    const previousCancel = globalThis.cancelAnimationFrame;
    let nextId = 0;
    globalThis.requestAnimationFrame = (callback) => { frames.set(++nextId, callback); return nextId; };
    globalThis.cancelAnimationFrame = (id) => frames.delete(id);
    const tick = (time) => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(time));
      assert.ok(frames.size <= 1);
    };
    try {
      const transforms = [];
      const context = new Proxy({
        measureText: (value) => ({ width: String(value).length * 8 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }),
        setTransform: (...args) => transforms.push(args)
      }, { get: (target, key) => key in target ? target[key] : () => {} });
      const surface = document.getElementById('gameCanvas');
      surface.getContext = () => context;
      let bitmapWrites = 0;
      for (const dimension of ['width', 'height']) {
        let size;
        Object.defineProperty(surface, dimension, { configurable: true, get: () => size, set: (value) => { bitmapWrites++; size = value; } });
      }
      await import(`${pathToFileURL(getVersionPath(version, '../browser-wx-shim.js')).href}?runtime`);
      wx.createCanvas();
      assert.equal(bitmapWrites, 0, 'shim must never own the bitmap');
      const { default: Main } = await import(pathToFileURL(getVersionPath(version, 'main.js')).href);
      const main = new Main();
      tick(1);
      assert.equal(frames.size, 0);
      assert.equal(bitmapWrites, 2);
      let renders = 0;
      const render = main.renderer.render.bind(main.renderer);
      main.renderer.render = (state) => { renders++; render(state); };
      main.handleViewportChange();
      assert.equal(bitmapWrites, 2, 'unchanged key must not reset bitmap');
      globalThis.devicePixelRatio = 1.25;
      main.handleViewportChange();
      assert.equal(bitmapWrites, 4, 'DPR-only change must reset bitmap once');
      assert.equal(canvas.width, 450);
      assert.deepEqual(transforms.at(-1), [1.25, 0, 0, 1.25, 0, 0]);
      main.gameState.startNewGame();
      // Cancellation during a viewport change clears identity and queued input.
      main.requestImmediateRender();
      const pickup = main.renderer.rackHitAreas[0];
      const finger = { identifier: 0, clientX: pickup.x + pickup.width / 2, clientY: pickup.y + pickup.height / 2 };
      main.inputManager.handleTouchStart({ touches: [finger], changedTouches: [finger] });
      main.inputManager.handleTouchMove({ touches: [{ ...finger, clientX: 1, clientY: 1 }] });
      const boardBefore = main.gameState.board.getSnapshot();
      main.handleViewportChange();
      main.inputManager.flushPendingInput();
      assert.equal(main.inputManager.activeTouchIdentifier, null);
      assert.equal(main.gameState.dragState.isDragging, false);
      assert.deepEqual(main.gameState.board.getSnapshot(), boardBefore);
      main.gameState.showNotice('pause fixture');
      main.gameState.openPause();
      main.requestImmediateRender();
      assert.equal(frames.size, 0);
      const remaining = main.gameState.notice.remainingTime;
      globalThis.innerWidth = 400;
      main.handleViewportChange();
      assert.equal(main.renderer.layout.screenWidth, 400);
      assert.equal(main.gameState.layout.screenWidth, 400);
      const frozenRenders = renders;
      tick(500);
      assert.equal(renders, frozenRenders);
      assert.equal(main.gameState.notice.remainingTime, remaining);
      main.gameState.closePause();
      main.requestImmediateRender();
      for (let time = 520; time < 4000; time += 16) tick(time);
      assert.equal(main.gameState.notice, null);
      assert.equal(frames.size, 0);
      for (const modal of ['isSettingsOpen', 'isAdminPanelOpen', 'isRevivePromptOpen']) {
        main.gameState.ui[modal] = true;
        main.gameState.showNotice('frozen modal');
        main.requestImmediateRender();
        assert.equal(frames.size, 0, modal);
        main.gameState.update(500);
        assert.equal(main.gameState.notice.remainingTime, 1200);
        main.gameState.ui[modal] = false;
      }
      main.gameState.board.grid[0].fill({ color: '#aabbcc' });
      main.gameState.pendingClear = { rows: [0], cols: [], lineCount: 1, remainingTime: 120 };
      main.gameState.inputLocked = true;
      main.gameState.openPause();
      const pending = structuredClone(main.gameState.pendingClear);
      globalThis.innerHeight = 700;
      main.handleViewportChange();
      assert.deepEqual(main.gameState.pendingClear, pending);
      assert.equal(frames.size, 0);
      main.gameState.closePause();
      main.requestImmediateRender();
      for (let time = 4000; time < 6500; time += 16) tick(time);
      assert.equal(main.gameState.pendingClear, null);
      assert.ok(main.gameState.board.grid[0].every((cell) => cell === null));

      // Actual touchend -> place -> no moves -> gameOver -> immediate drain.
      const state = main.gameState;
      state.startNewGame();
      state.reviveCount = 0;
      state.board.grid = Array.from({ length: state.board.size }, (_, row) => Array.from({ length: state.board.size }, (_, col) => (row + col) % 2 ? { color: '#aabbcc' } : null));
      state.rackPieces = [
        { bounds: { width: 1, height: 1 }, cells: [{ x: 0, y: 0 }], color: '#abc', used: false },
        { bounds: { width: 2, height: 1 }, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }], color: '#abc', used: false },
        { bounds: { width: 1, height: 2 }, cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }], color: '#abc', used: false }
      ];
      main.requestImmediateRender();
      const area = main.renderer.rackHitAreas[0];
      const pointer = { identifier: 0, clientX: area.x + area.width / 2, clientY: area.y + area.height / 2 };
      main.inputManager.handleTouchStart({ touches: [pointer], changedTouches: [pointer] });
      assert.equal(state.dragState.isDragging, true);
      const release = { identifier: 0,
        clientX: state.layout.boardRect.x + state.dragState.pieceWidth / 2,
        clientY: state.layout.boardRect.y + state.dragState.pieceHeight + state.dragState.dragFingerOffsetY };
      let gameOverSounds = 0;
      main.soundManager.playGameOver = () => gameOverSounds++;
      main.inputManager.handleTouchEnd({ touches: [], changedTouches: [release] });
      assert.equal(state.screen, 'gameover');
      assert.equal(gameOverSounds, 1);
      assert.equal(frames.size, 0, 'sound must not depend on a following RAF');
      main.requestImmediateRender();
      assert.equal(gameOverSounds, 1);
      assert.ok(state.placementPulse.length > 0);
      main.handleAppBackground();
      const beforeBackground = bitmapWrites;
      globalThis.innerHeight = 720;
      main.handleViewportChange();
      assert.equal(bitmapWrites, beforeBackground);
      assert.equal(frames.size, 0);
      main.handleAppForeground();
      assert.equal(main.renderer.layout.screenHeight, 720);
      assert.equal(frames.size, 0);
      for (let i = 0; i < 100; i++) {
        main.handleAppBackground(); main.handleAppBackground();
        main.handleAppForeground(); main.handleAppForeground();
        assert.equal(frames.size, 0);
      }
    } finally {
      if (previousRaf) globalThis.requestAnimationFrame = previousRaf;
      else delete globalThis.requestAnimationFrame;
      if (previousCancel) globalThis.cancelAnimationFrame = previousCancel;
      else delete globalThis.cancelAnimationFrame;
      delete globalThis.ANDROID_APP_BACKGROUND;
      delete globalThis.ANDROID_APP_FOREGROUND;
      environment.restore();
    }
  });
}
