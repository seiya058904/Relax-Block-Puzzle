import { auditModuleUrl } from '../source-path.mjs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { getVersionPath } = await import(auditModuleUrl('tests/helpers/version-adapter.mjs'));
const { installBrowserEnvironment } = await import(auditModuleUrl('tests/helpers/platform-mocks.mjs'));
const key = 'block_puzzle_best_scores_v1';
const tick = () => new Promise(resolve => setImmediate(resolve));
for (const version of ['web', 'android']) {
  const environment = installBrowserEnvironment({ [key]: JSON.stringify({ easy: 0, normal: 0, master: 0 }) });
  try {
    let frameId = 0;
    globalThis.requestAnimationFrame = () => ++frameId;
    globalThis.cancelAnimationFrame = () => {};
    const ctx = new Proxy({
      measureText: s => ({width: String(s).length * 8}),
      createLinearGradient: () => ({addColorStop() {}}),
      createRadialGradient: () => ({addColorStop() {}})
    }, { get: (target, prop) => prop in target ? target[prop] : () => {} });
    document.getElementById('gameCanvas').getContext = () => ctx;
    navigator.locks = { request: (_, update) => Promise.resolve().then(update) };
    await import(`${pathToFileURL(getVersionPath(version, '../browser-wx-shim.js')).href}?concurrency-audit`);
    let storageHandler;
    wx.onStorageChange = handler => { storageHandler = handler; };
    const { default: Main } = await import(pathToFileURL(getVersionPath(version, 'main.js')).href);
    const main = new Main();
    const state = main.gameState;
    state.startNewGame();
    function place(col) {
      state.rackPieces = [{ id: 'audit-single', baseId:'single', category:'rescue', isSnake: false,
        bounds:{width:1,height:1}, cells:[{x:0,y:0}], color:'#abcdef', used:false }];
      state.dragState.activePieceIndex = 0;
      state.previewState = { row:0, col, canPlace:true, visible:true };
      assert.equal(state.tryPlaceDraggedPiece(), true);
    }
    place(0); await tick();
    assert.equal(state.score, 10);
    assert.equal(state.startingHighScore, 0);
    assert.equal(state.hasShownNewRecord, false);
    const scores = JSON.parse(localStorage.getItem(key));
    scores.easy = 20; // the other tab only earns an EASY record, NORMAL is unchanged
    localStorage.setItem(key, JSON.stringify(scores));
    storageHandler({key});
    assert.equal(state.startingHighScore, 10, 'baseline bug: unrelated easy event adopts own normal record as external threshold');
    place(1); await tick();
    assert.equal(state.hasShownNewRecord, true, 'baseline bug: first-ever normal round now celebrates a record');
    console.log(`${version} C4 reproduced with real Main listener: normal first-ever round threshold changed 0→10 by unrelated easy record; next placement celebrates.`);
  } finally {
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
    delete globalThis.ANDROID_APP_BACKGROUND;
    delete globalThis.ANDROID_APP_FOREGROUND;
    environment.restore();
  }
}
