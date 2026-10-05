import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { getVersionPath } from '../helpers/version-adapter.mjs';
import { createMemoryStorage } from '../helpers/platform-mocks.mjs';

test('wechat: real Main wakes on native callbacks, idles, freezes, resizes, and never replays feedback', async () => {
  const names = ['wx', 'canvas', 'GameGlobal', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const previous = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const handlers = {};
  const frames = new Map();
  const storage = createMemoryStorage();
  const vibrations = [];
  const transforms = [];
  let metrics = { windowWidth: 390, windowHeight: 844, pixelRatio: 3,
    safeArea: { top: 44, bottom: 810, left: 0, right: 390 } };
  let bitmapWrites = 0;
  let nextId = 0;
  const context = new Proxy({
    globalAlpha: 1,
    measureText: (text) => ({ width: String(text).length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    setTransform: (...args) => transforms.push(args)
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  const surface = { getContext: () => context };
  for (const dimension of ['width', 'height']) {
    let size = 0;
    Object.defineProperty(surface, dimension, { get: () => size, set: (value) => { bitmapWrites++; size = value; } });
  }
  globalThis.GameGlobal = globalThis;
  globalThis.wx = {
    getStorageSync: storage.getStorageSync,
    setStorageSync: storage.setStorageSync,
    getSystemInfoSync: () => metrics,
    getWindowInfo: () => metrics,
    getMenuButtonBoundingClientRect: () => ({ top: 48, height: 32, left: 280, width: 88 }),
    createCanvas: () => surface,
    vibrateShort: ({ type }) => vibrations.push(type)
  };
  for (const event of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'KeyboardInput', 'KeyboardConfirm', 'KeyboardComplete', 'Hide', 'Show', 'WindowResize']) {
    wx[`on${event}`] = (callback) => { handlers[event] = callback; };
  }
  globalThis.requestAnimationFrame = (callback) => { frames.set(++nextId, callback); return nextId; };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  let time = 1;
  function tick(count = 1) {
    for (let i = 0; i < count; i++) {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(time));
      time += 16;
      assert.ok(frames.size <= 1, 'one scheduling owner');
    }
  }
  try {
    const { default: Main } = await import(pathToFileURL(getVersionPath('wechat', 'main.js')).href);
    // Auth is outside this local rendering/lifecycle test; the original Main,
    // input registrations, state, renderer, and canvas controller still run.
    const initializeAuth = Main.prototype.initializeAuth;
    Main.prototype.initializeAuth = async () => {};
    let main;
    try { main = new Main(); } finally { Main.prototype.initializeAuth = initializeAuth; }
    await Promise.resolve();
    tick(2);
    assert.equal(frames.size, 0, 'home becomes idle');
    assert.equal(surface.width, 780, 'light profile caps native DPR at two');
    assert.equal(bitmapWrites, 2);
    handlers.WindowResize();
    assert.equal(bitmapWrites, 2, 'same viewport never resets bitmap');

    const start = main.renderer.homeActionRects.start;
    const finger = { identifier: 0, clientX: start.x + start.width / 2, clientY: start.y + start.height / 2 };
    handlers.TouchStart({ touches: [finger], changedTouches: [finger] });
    handlers.TouchEnd({ touches: [], changedTouches: [finger] });
    tick(100);
    assert.equal(main.gameState.screen, 'playing');
    assert.equal(frames.size, 0, 'rack arrival expires into idle');

    const area = main.renderer.rackHitAreas[0];
    const pickup = { identifier: 0, clientX: area.x + area.width / 2, clientY: area.y + area.height / 2 };
    let pickupSounds = 0;
    main.soundManager.playPickup = () => pickupSounds++;
    main.applySettings({ vibrationEnabled: true });
    handlers.TouchStart({ touches: [pickup], changedTouches: [pickup] });
    tick(1);
    assert.equal(main.gameState.dragState.isDragging, true);
    assert.equal(pickupSounds, 1);
    assert.deepEqual(vibrations, [], 'pickup keeps the existing audio-only cue');
    handlers.TouchMove({ touches: [{ ...pickup, clientX: 1, clientY: 1 }] });
    const before = main.gameState.board.getSnapshot();
    handlers.Hide();
    assert.equal(frames.size, 0);
    assert.equal(main.inputManager.activeTouchIdentifier, null);
    assert.equal(main.gameState.dragState.isDragging, false);
    tick(100);
    assert.deepEqual(main.gameState.board.getSnapshot(), before);
    metrics = { ...metrics, windowWidth: 360, windowHeight: 740, pixelRatio: 1.5,
      safeArea: { top: 32, bottom: 706, left: 0, right: 360 } };
    handlers.WindowResize();
    assert.equal(bitmapWrites, 2, 'hidden resize defers bitmap work');
    handlers.Show();
    tick(100);
    assert.equal(surface.width, 540);
    assert.equal(main.renderer.layout.screenHeight, 740);
    assert.deepEqual(transforms.at(-1), [1.5, 0, 0, 1.5, 0, 0]);
    assert.equal(pickupSounds, 1, 'foreground never replays old pickup');
    assert.equal(frames.size, 0);

    const state = main.gameState;
    state.board.grid[0].fill({ color: '#23ccd3' });
    state.pendingClear = { rows: [0], cols: [], lineCount: 1, remainingTime: 120 };
    state.inputLocked = true;
    state.openPause();
    main.requestRender();
    tick(100);
    assert.equal(state.pendingClear.remainingTime, 120, 'pause freezes clear commit');
    assert.equal(frames.size, 0, 'modal becomes idle');
    state.closePause();
    main.requestRender();
    tick(100);
    assert.equal(state.pendingClear, null);
    assert.ok(state.board.grid[0].every((cell) => cell === null));
    assert.equal(frames.size, 0);

    state.startNewGame();
    state.useRefreshTool();
    let clicks = 0;
    main.soundManager.playClick = () => clicks++;
    main.requestRender();
    tick(100);
    assert.equal(clicks, 1, 'successful tool has one sound owner');
    assert.equal(vibrations.at(-1), 'light');
    for (let i = 0; i < 50; i++) {
      handlers.Hide(); handlers.Hide(); handlers.Show(); handlers.Show(); tick(1);
      assert.equal(frames.size, 0);
    }
    assert.equal(clicks, 1, 'lifecycle cycling never repeats a consumed tool result');
    for (const outcome of ['success', 'failure', 'exception', 'hidden']) {
      state.initializeHomeState();
      state.openAdminPanel();
      state.adminInput = 'local-test-code';
      let complete;
      state.setAuthClient({ verifyAdmin: () => new Promise((resolve, reject) => { complete = () => outcome === 'exception' ? reject(new Error('offline')) : resolve({ adminMode: outcome === 'success' }); }) });
      main.renderer.getAdminAction = () => 'confirm';
      main.inputManager.handleAdminTouch({ x: 0, y: 0 });
      main.requestRender();
      tick(100);
      assert.equal(frames.size, 0, `${outcome}: button animation has expired before reply`);
      if (outcome === 'hidden') handlers.Hide();
      complete();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      assert.equal(frames.size, outcome === 'hidden' ? 0 : 1, `${outcome}: completion wakes exactly the existing scheduler`);
      if (outcome === 'hidden') handlers.Show();
      tick(100);
      assert.equal(frames.size, 0, `${outcome}: completion returns to idle`);
      if (outcome === 'success') { assert.equal(state.ui.isAdminPanelOpen, false); state.disableAdminMode(); }
      else assert.equal(state.adminError, '验证失败');
    }
    main.stopLoop();
  } finally {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
