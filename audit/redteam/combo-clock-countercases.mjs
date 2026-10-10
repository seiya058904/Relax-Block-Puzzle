import { auditSourceRoot } from '../source-path.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.env.REDTEAM_SOURCE_ROOT || auditSourceRoot;
const {loadVersion, getVersionPath} = await import(pathToFileURL(path.join(root, 'tests/helpers/version-adapter.mjs')).href);
const {createMemoryStorage, installWxStorage} = await import(pathToFileURL(path.join(root, 'tests/helpers/platform-mocks.mjs')).href);
const originalNow = Date.now, originalRandom = Math.random;
const originalGlobals = ['canvas', 'GameGlobal'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
globalThis.GameGlobal = globalThis;
let now = 1000, seed = 887;
Date.now = () => now;
Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const records = [];
const layout = {cellSize: 30, boardRect: {x: 20, y: 100, width: 300, height: 300}};

// Only the host shell methods unrelated to the combo clock are no-ops here.
// Background/foreground run the actual production Main methods.
function lifecycleHost(Main, state) {
  const host = {gameState: state, isPaused: false,
    inputManager: {cancelInputSession: () => state.cancelDrag()},
    soundManager: {handleAppHide() {}, handleAppShow() {}},
    stopLoop() {}, refreshViewport() {}, handleViewportChange() {},
    requestImmediateRender() {}, requestRender() {}
  };
  return {hide: () => Main.prototype.handleAppBackground.call(host),
    show: () => Main.prototype.handleAppForeground.call(host)};
}

function play(state) {
  for (let index = 0; index < state.rackPieces.length; index++) {
    const piece = state.rackPieces[index];
    if (piece.used) continue;
    for (let row = 0; row < state.board.size; row++) for (let col = 0; col < state.board.size; col++) {
      if (!state.board.canPlace(piece.cells, row, col)) continue;
      const area = {x: 40 + index * 80, y: 450, width: 60, height: 60, cellSize: 20};
      assert.equal(state.startDrag(index, area.x + 30, area.y + 30, area), true);
      const display = layout.cellSize * .96;
      state.moveDrag(layout.boardRect.x + col * layout.cellSize + piece.bounds.width * display / 2,
        layout.boardRect.y + row * layout.cellSize + piece.bounds.height * display + state.getDragFingerOffsetY());
      assert.equal(state.endDrag(), true);
      state.update(260);
      return true;
    }
  }
  return false;
}

async function check(version, name, fn) {
  const restore = installWxStorage(createMemoryStorage());
  wx.getSystemInfoSync = () => ({windowWidth: 360, windowHeight: 640, pixelRatio: 1});
  wx.createCanvas = () => ({getContext: () => ({setTransform() {}})});
  now = 1000; seed = 887;
  try {
    const {GameState} = await loadVersion(version);
    const {default: Main} = await import(pathToFileURL(getVersionPath(version, 'main.js')).href);
    const state = new GameState(); state.setLayout(layout); state.startNewGame();
    await fn(state, lifecycleHost(Main, state));
    records.push({version, name, pass: true});
  } catch (error) {
    records.push({version, name, pass: false, actual: error.actual, expected: error.expected, message: error.message});
  } finally {restore();}
}

try {
  for (const version of ['wechat','web','android']) {
    for (const modal of ['Pause','Settings']) {
      for (const ordering of ['close-modal-first','show-first']) {
        await check(version, `${modal} plus background ${ordering}, duplicate hide/show`, async (s, host) => {
          s.handleLineClear(1);
          now = 1500; s[`open${modal}`]();
          now = 2000; host.hide(); now = 3000; host.hide();
          if (ordering === 'close-modal-first') {
            now = 6000; s[`close${modal}`]();
            now = 10000; host.show(); now = 10100; host.show();
          } else {
            now = 6000; host.show(); now = 6100; host.show();
            now = 10000; s[`close${modal}`]();
          }
          now = 10500; s.handleLineClear(1);
          assert.equal(s.comboState.comboCount, 2, 'only 1000ms active gameplay elapsed');
          now = 14501; s.handleLineClear(1);
          assert.equal(s.comboState.comboCount, 1, 'subsequent 4001ms frontmost idle must expire');
        });
      }
    }

    await check(version, 'pure background repeated hide is counted once', async (s, host) => {
      s.handleLineClear(1);
      now = 1500; host.hide(); now = 7000; host.hide();
      now = 11000; host.show(); now = 11500; host.show();
      now = 12000; s.handleLineClear(1);
      assert.equal(s.comboState.comboCount, 2);
    });

    await check(version, 'short viewport, modal and host pause resume only after all three reasons clear', async (s, host) => {
      const {default: Renderer} = await import(pathToFileURL(getVersionPath(version, 'game/Renderer.js')).href);
      const safe = {safeArea: null, menuButton: null};
      const blocked = new Renderer({}, {screenWidth: 568, screenHeight: 320}, safe).layout;
      const normal = new Renderer({}, {screenWidth: 390, screenHeight: 844}, safe).layout;
      assert.equal(blocked.viewportBlocked, true); assert.equal(normal.viewportBlocked, false);
      s.handleLineClear(1);
      now = 1500; s.setLayout(blocked); assert.equal(s.canAdvanceTime(), false);
      now = 2000; s.openPause();
      now = 2500; host.hide();
      now = 6000; s.closePause();
      now = 7000; s.setLayout(normal); assert.equal(s.canAdvanceTime(), false);
      now = 10000; host.show(); assert.equal(s.canAdvanceTime(), true);
      now = 10500; s.handleLineClear(1); assert.equal(s.comboState.comboCount, 2);
      now = 14501; s.handleLineClear(1); assert.equal(s.comboState.comboCount, 1);
    });

    await check(version, 'foreground idle expires without update or RAF', async s => {
      s.handleLineClear(1); now = 5001; s.handleLineClear(1);
      assert.equal(s.comboState.comboCount, 1);
    });

    await check(version, 'exact 3000ms active window retained and 3001ms expires', async s => {
      s.handleLineClear(1);
      now = 2000; s.openPause(); now = 12000; s.closePause();
      now = 14000; s.handleLineClear(1);
      assert.equal(s.comboState.comboCount, 2);
      now = 17001; s.handleLineClear(1);
      assert.equal(s.comboState.comboCount, 1);
    });

    await check(version, 'undo after a long pause does not restore an obsolete wall-clock offset', async s => {
      // Combo handler receives the ordinary committed-clear signal; snapshot
      // creation and undo use an actual generated-piece placement.
      s.handleLineClear(1);
      now = 1500; assert.equal(play(s), true);
      assert.equal(s.undoSnapshot.comboState.comboCount, 1);
      now = 2000; s.openPause(); now = 12000; s.closePause();
      now = 12500; assert.equal(s.useUndoTool(), true);
      now = 13000; s.handleLineClear(1);
      assert.equal(s.comboState.comboCount, 2, 'restored last clear has only 2000ms active age');
      now = 17001; s.handleLineClear(1);
      assert.equal(s.comboState.comboCount, 1, 'undo must not freeze later ordinary idle');
    });

    await check(version, 'return home and long home idle cannot carry the previous combo into a new round', async s => {
      s.handleLineClear(2); now = 1500; s.openPause();
      now = 10000; s.requestReturnHome(); s.confirmReturnHome();
      now = 100000; s.startNewGame(); assert.equal(s.comboState.comboCount, 0);
      s.handleLineClear(1); assert.equal(s.comboState.comboCount, 1);
      now = 100500; s.openSettings(); now = 110500; s.closeSettings();
      now = 111000; s.handleLineClear(1); assert.equal(s.comboState.comboCount, 2);
    });

    await check(version, 'new round during hidden state preserves the host pause reason', async (s, host) => {
      now = 1500; host.hide();
      now = 3000; s.startNewGame();
      assert.equal(s.lifecyclePaused, true, 'reset does not replace host lifecycle state');
      const before = s.getComboNow();
      now = 9000; assert.equal(s.getComboNow(), before, 'new combo clock stays frozen while host remains hidden');
      host.show(); now = 9500;
      assert.equal(s.getComboNow(), before + 500);
    });

    await check(version, 'revive reached from genuine generated placements resets combo and resumes its new window', async s => {
      s.setSettings({localMembershipEnabled: true}); s.startNewGame();
      let moves = 0;
      while (s.screen === 'playing' && !s.ui.isRevivePromptOpen && moves < 500) {
        assert.equal(play(s), true, 'playing state offers a legal generated piece');
        moves++;
      }
      assert.equal(s.ui.isRevivePromptOpen, true, 'greedy legal sequence reaches real no-moves prompt');
      const beforeRevives = s.reviveUsedCount;
      now = 50000; assert.equal(s.acceptRevive(), true);
      assert.equal(s.reviveUsedCount, beforeRevives + 1);
      assert.equal(s.comboState.comboCount, 0); assert.equal(s.undoSnapshot, null);
      now = 50500; s.handleLineClear(1); assert.equal(s.comboState.comboCount, 1);
      now = 51000; s.openPause(); now = 61000; s.closePause();
      now = 61500; s.handleLineClear(1); assert.equal(s.comboState.comboCount, 2);
    });
  }
} finally {
  Date.now = originalNow; Math.random = originalRandom;
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
}

records.forEach(record => console.log(JSON.stringify(record)));
console.log(JSON.stringify({summary: true, root, total: records.length, passed: records.filter(r => r.pass).length, failed: records.filter(r => !r.pass).length}));
if (records.some(record => !record.pass)) process.exitCode = 1;
