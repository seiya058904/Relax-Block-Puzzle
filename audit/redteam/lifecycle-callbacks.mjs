import { auditSourceRoot } from '../source-path.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.env.REDTEAM_SOURCE_ROOT || auditSourceRoot;
const { getVersionPath } = await import(pathToFileURL(path.join(root, 'tests/helpers/version-adapter.mjs')).href);
const { createMemoryStorage, installBrowserEnvironment } = await import(pathToFileURL(path.join(root, 'tests/helpers/platform-mocks.mjs')).href);
const tickAsync = () => new Promise(resolve => setImmediate(resolve));
const key = 'block_puzzle_best_scores_v1';
const outcomes = [];

function frameHarness() {
  const frames = new Map();
  const prior = ['requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  let id = 0, clock = 1;
  globalThis.requestAnimationFrame = callback => {frames.set(++id, callback); return id;};
  globalThis.cancelAnimationFrame = key => frames.delete(key);
  return {frames, drain() {
    for (let i = 0; i < 200; i++) {
      const pending = [...frames.values()]; frames.clear();
      pending.forEach(fn => fn(clock)); clock += 16;
      assert.ok(frames.size <= 1, 'single RAF owner');
      if (frames.size === 0) return;
    }
    assert.fail('scheduler failed to return to idle within 200 frames');
  }, restore() { for (const [key, descriptor] of prior) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }}};
}

function drawingContext() {
  return new Proxy({globalAlpha: 1,
    getTransform: () => ({a: 2, b: 0, c: 0, d: 2, e: 0, f: 0}),
    measureText: text => ({width: String(text).length * 8}),
    createLinearGradient: () => ({addColorStop() {}}),
    createRadialGradient: () => ({addColorStop() {}})
  }, {get: (target, key) => key in target ? target[key] : () => {}});
}

async function record(version, name, fn) {
  try {await fn(); outcomes.push({version, name, pass: true});}
  catch (error) {outcomes.push({version, name, pass: false, actual: error.actual, expected: error.expected, message: error.message, stack: error.stack});}
}

for (const outcome of ['success', 'denied', 'cancelled-success', 'cancelled-failure']) {
  await record('wechat', `hidden ${outcome} callback preserves scheduler and current panel`, async () => {
    const prior = ['wx', 'canvas', 'GameGlobal'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
    const raf = frameHarness(), callbacks = {}, storage = createMemoryStorage();
    const context = drawingContext();
    const surface = {getContext: () => context};
    globalThis.GameGlobal = globalThis;
    globalThis.wx = {getStorageSync: storage.getStorageSync, setStorageSync: storage.setStorageSync,
      getSystemInfoSync: () => ({windowWidth: 390, windowHeight: 844, pixelRatio: 2}),
      getWindowInfo: () => ({windowWidth: 390, windowHeight: 844, pixelRatio: 2}),
      createCanvas: () => surface};
    for (const event of ['TouchStart','TouchMove','TouchEnd','TouchCancel','KeyboardInput','KeyboardConfirm','KeyboardComplete','Hide','Show','WindowResize']) {
      wx[`on${event}`] = fn => callbacks[event] = fn;
    }
    let main;
    try {
      const {default: Main} = await import(pathToFileURL(getVersionPath('wechat', 'main.js')).href);
      const initialize = Main.prototype.initializeAuth;
      Main.prototype.initializeAuth = async () => {};
      try {main = new Main();} finally {Main.prototype.initializeAuth = initialize;}
      await tickAsync(); raf.drain(); assert.equal(raf.frames.size, 0);
      const state = main.gameState;
      let complete;
      state.setAuthClient({verifyAdmin: () => new Promise((resolve, reject) => complete = {resolve, reject})});
      assert.equal(state.openAdminPanel(), true); state.setAdminInput('local-fixture');
      main.renderer.getAdminAction = () => 'confirm';
      main.inputManager.handleAdminTouch({x: 0, y: 0});
      main.requestRender(); raf.drain(); assert.equal(raf.frames.size, 0);
      if (outcome.startsWith('cancelled')) {
        state.closeAdminPanel(); state.openAdminPanel(); state.setAdminInput('new-panel');
        main.requestRender(); raf.drain();
      }
      callbacks.Hide();
      let renders = 0;
      const originalRender = main.renderer.render.bind(main.renderer);
      main.renderer.render = state => {renders++; return originalRender(state);};
      if (outcome === 'cancelled-failure') complete.reject(new Error('fixture'));
      else complete.resolve({adminMode: outcome !== 'denied'});
      await tickAsync();
      assert.equal(raf.frames.size, 0, 'hidden completion cannot schedule frames');
      assert.equal(renders, 0, 'hidden completion cannot draw synchronously');
      assert.equal(state.isAdminModeActive(), outcome === 'success');
      if (outcome.startsWith('cancelled')) {
        assert.equal(state.adminInput, 'new-panel'); assert.equal(state.adminError, '');
        assert.equal(state.ui.isAdminPanelOpen, true);
      }
      if (outcome === 'denied') assert.equal(state.adminError, '验证失败');
      callbacks.Show(); raf.drain();
      assert.ok(renders > 0, 'foreground shows current completion state');
      assert.equal(raf.frames.size, 0, 'foreground expires to idle');
    } finally {
      main?.stopLoop(); raf.restore();
      for (const [key, descriptor] of prior) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
      }
    }
  });
}

for (const version of ['web', 'android']) {
  await record(version, 'hidden score and reset completions perform no drawing and settle to idle after show', async () => {
    const env = installBrowserEnvironment({[key]: JSON.stringify({easy: 12, normal: 0, master: 30})});
    const raf = frameHarness();
    let main;
    try {
      const context = drawingContext();
      document.getElementById('gameCanvas').getContext = () => context;
      await import(`${pathToFileURL(getVersionPath(version, '../browser-wx-shim.js')).href}?redteamLifecycle`);
      const {default: Main} = await import(pathToFileURL(getVersionPath(version, 'main.js')).href);
      main = new Main(); raf.drain(); assert.equal(raf.frames.size, 0);
      const queue = [];
      wx.withStorageLock = (_, fn) => new Promise(resolve => queue.push(() => resolve(fn())));
      const state = main.gameState; state.startNewGame(); main.requestImmediateRender(); raf.drain();
      const piece = state.rackPieces[0], area = main.renderer.rackHitAreas[0], board = state.layout.boardRect;
      const finger = {identifier: 0, clientX: area.x + area.width / 2, clientY: area.y + area.height / 2};
      main.inputManager.handleTouchStart({touches: [finger], changedTouches: [finger]});
      const release = {identifier: 0, clientX: board.x + state.dragState.pieceWidth / 2,
        clientY: board.y + state.dragState.pieceHeight + state.dragState.dragFingerOffsetY};
      main.inputManager.handleTouchEnd({touches: [], changedTouches: [release]});
      assert.equal(state.score, piece.cells.length * 10);
      assert.equal(queue.length, 1);
      main.handleAppBackground();
      let renders = 0;
      const originalRender = main.renderer.render.bind(main.renderer);
      main.renderer.render = state => {renders++; return originalRender(state);};
      queue.shift()(); await tickAsync();
      assert.equal(raf.frames.size, 0); assert.equal(renders, 0);
      assert.equal(state.bestScore, state.score);
      main.handleAppForeground(); raf.drain(); assert.equal(raf.frames.size, 0);
      state.openPause(); state.requestReturnHome(); state.confirmReturnHome();
      state.openSettings(); state.requestResetBestScore();
      const reset = state.confirmResetBestScore();
      main.requestImmediateRender(); raf.drain();
      main.handleAppBackground(); renders = 0;
      queue.shift()(); await reset; await tickAsync();
      assert.equal(raf.frames.size, 0); assert.equal(renders, 0);
      assert.equal(state.bestScore, 0);
      main.handleAppForeground(); raf.drain(); assert.equal(raf.frames.size, 0);
      assert.ok(renders > 0);
    } finally {
      main?.stopLoop?.(); raf.restore();
      delete globalThis.ANDROID_APP_BACKGROUND; delete globalThis.ANDROID_APP_FOREGROUND;
      env.restore();
    }
  });
}

outcomes.forEach(outcome => console.log(JSON.stringify(outcome)));
console.log(JSON.stringify({summary: true, root, total: outcomes.length, passed: outcomes.filter(r => r.pass).length, failed: outcomes.filter(r => !r.pass).length}));
if (outcomes.some(outcome => !outcome.pass)) process.exitCode = 1;
