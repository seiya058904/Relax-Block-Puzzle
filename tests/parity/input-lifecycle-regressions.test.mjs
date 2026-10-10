import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { runInThisContext } from 'node:vm';
import { getVersionPath, loadVersion } from '../helpers/version-adapter.mjs';
import { installBrowserEnvironment, createMemoryStorage, installWxStorage } from '../helpers/platform-mocks.mjs';

const key = 'block_puzzle_best_scores_v1';
const tickPromises = () => new Promise(resolve => setImmediate(resolve));

function attachEvents(target) {
  const listeners = new Map();
  target.addEventListener = (type, callback) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(callback);
  };
  target.removeEventListener = (type, callback) => {
    listeners.set(type, (listeners.get(type) || []).filter(item => item !== callback));
  };
  return (type, event = {}) => {
    event.preventDefault ||= () => { event.defaultPrevented = true; };
    for (const handler of listeners.get(type) || []) handler(event);
    return event;
  };
}

async function withMain(version, check, { hidden = false, bgmEnabled = false } = {}) {
  const env = installBrowserEnvironment({
    [key]: JSON.stringify({ easy: 0, normal: 0, master: 0 }),
    block_puzzle_settings_v1: JSON.stringify({ bgmEnabled, bgmTrack: 2 })
  });
  document.hidden = hidden;
  const dispatchWindow = attachEvents(globalThis);
  const dispatchDocument = attachEvents(document);
  const surface = document.getElementById('gameCanvas');
  const keyboard = document.getElementById('wxKeyboard');
  const inputLayer = { style: {} };
  const dispatchCanvas = attachEvents(surface);
  const dispatchInput = attachEvents(inputLayer);
  const dispatchKeyboard = attachEvents(keyboard);
  keyboard.blur = () => dispatchKeyboard('blur');
  const getElement = document.getElementById.bind(document);
  document.getElementById = id => id === 'inputLayer' ? inputLayer : getElement(id);
  const ctx = new Proxy({
    measureText: text => ({ width: String(text).length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    getTransform: () => ({ a: 2 })
  }, { get: (target, name) => name in target ? target[name] : () => {} });
  surface.getContext = () => ctx;
  const frames = new Map();
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  let nextId = 0, time = 1, renders = 0, main;
  globalThis.requestAnimationFrame = callback => { frames.set(++nextId, callback); return nextId; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const tick = () => {
    const pending = [...frames.values()]; frames.clear(); time += 16;
    pending.forEach(callback => callback(time));
    assert.ok(frames.size <= 1);
  };
  const settle = () => {
    for (let i = 0; i < 300 && frames.size; i++) tick();
    assert.equal(frames.size, 0, 'idle rendering must stop');
  };
  try {
    const shimPath = getVersionPath(version, '../browser-wx-shim.js');
    runInThisContext(`(() => {\n${await readFile(shimPath, 'utf8')}\n})();`, { filename: shimPath });
    wx.withStorageLock = (_, update) => Promise.resolve().then(update);
    let audioPlayCalls = 0;
    const createAudio = wx.createInnerAudioContext.bind(wx);
    wx.createInnerAudioContext = () => {
      const audio = createAudio();
      const play = audio.play.bind(audio);
      audio.play = () => { audioPlayCalls++; return play(); };
      return audio;
    };
    const { default: Main } = await import(pathToFileURL(getVersionPath(version, 'main.js')));
    main = new Main();
    const render = main.renderer.render.bind(main.renderer);
    main.renderer.render = state => { renders++; return render(state); };
    settle();
    await check({ main, frames, keyboard, tick, settle, renders: () => renders,
      audioPlays: () => audioPlayCalls,
      dispatchWindow, dispatchDocument, dispatchKeyboard,
      dispatchPointer: version === 'web' ? dispatchInput : dispatchCanvas });
  } finally {
    main?.handleAppBackground();
    if (previousRaf) globalThis.requestAnimationFrame = previousRaf;
    else delete globalThis.requestAnimationFrame;
    if (previousCancel) globalThis.cancelAnimationFrame = previousCancel;
    else delete globalThis.cancelAnimationFrame;
    delete globalThis.removeEventListener;
    delete globalThis.ANDROID_APP_BACKGROUND;
    delete globalThis.ANDROID_APP_FOREGROUND;
    delete globalThis.__syncKeyboardInputPosition;
    env.restore();
  }
}

for (const version of ['web', 'android']) {
  test(`${version}: initially hidden startup neither plays saved BGM nor schedules drawing`, async () => {
    await withMain(version, async ({ main, frames, renders, audioPlays, dispatchDocument, settle }) => {
      assert.equal(main.isPaused, true);
      assert.equal(main.gameState.lifecyclePaused, true);
      assert.equal(main.soundManager.appHidden, true);
      assert.equal(audioPlays(), 0);
      assert.equal(renders(), 0);
      assert.equal(frames.size, 0);
      dispatchDocument('visibilitychange');
      assert.equal(audioPlays(), 0, 'duplicate hidden notifications remain inert');
      assert.equal(frames.size, 0);
      document.hidden = false; dispatchDocument('visibilitychange'); settle();
      assert.equal(main.isPaused, false);
      assert.equal(main.gameState.lifecyclePaused, false);
      assert.equal(main.soundManager.appHidden, false);
      assert.ok(audioPlays() > 0, 'the saved BGM preference resumes when the page is visible');
      assert.ok(renders() > 0);
      assert.equal(frames.size, 0);
    }, { hidden: true, bgmEnabled: true });
  });

  test(`${version}: delayed storage events use their own values while an own write is pending`, async () => {
    await withMain(version, async ({ main, dispatchWindow }) => {
      const state = main.gameState;
      const releases = [];
      wx.withStorageLock = (_, update) => {
        const result = update();
        return new Promise(resolve => releases.push(() => resolve(result)));
      };
      state.startNewGame();
      state.scoreManager.applyPlacement(state, 1);
      assert.equal(state.pendingBestScoreWrites, 1);
      assert.equal(state.bestScore, 0);
      localStorage.setItem(key, JSON.stringify({ easy: 90, normal: 10, master: 0 }));
      dispatchWindow('storage', { key,
        oldValue: JSON.stringify({ easy: 0, normal: 0, master: 0 }),
        newValue: JSON.stringify({ easy: 90, normal: 0, master: 0 }) });
      assert.equal(state.bestScore, 10);
      assert.equal(state.startingHighScore, 0, 'an unrelated event cannot attribute our own in-flight write to another tab');
      releases.shift()(); await tickPromises();
      state.scoreManager.applyPlacement(state, 1);
      releases.shift()(); await tickPromises();
      assert.equal(state.hasShownNewRecord, false);
      localStorage.setItem(key, JSON.stringify({ easy: 90, normal: 30, master: 0 }));
      dispatchWindow('storage', { key,
        oldValue: JSON.stringify({ easy: 90, normal: 0, master: 0 }),
        newValue: JSON.stringify({ easy: 90, normal: 20, master: 0 }) });
      assert.equal(state.bestScore, 30);
      assert.equal(state.startingHighScore, 20, 'the event record, not our later persisted score, supplies the threshold');
      localStorage.setItem(key, JSON.stringify({ easy: 90, normal: 10, master: 0 }));
      dispatchWindow('storage', { key,
        oldValue: JSON.stringify({ easy: 90, normal: 30, master: 0 }),
        newValue: JSON.stringify({ easy: 90, normal: 0, master: 0 }) });
      assert.equal(state.bestScore, 10);
      assert.equal(state.startingHighScore, 0, 'a reset notification preserves the first-record rule');
    });
  });

  test(`${version}: real keyboard callbacks redraw idle input and preserve validation feedback`, async () => {
    await withMain(version, async ({ main, keyboard, dispatchKeyboard, settle, frames, renders }) => {
      const state = main.gameState;
      state.openSettings(); state.openMembershipPanel(); main.requestImmediateRender(); settle();
      for (const [event, value] of [['input', 'INVALID-AUDIT'], ['keydown', 'INVALID-AUDIT-2'], ['blur', 'INVALID-AUDIT-3']]) {
        const before = renders();
        keyboard.value = value;
        dispatchKeyboard(event, { key: 'Enter' }); settle();
        assert.equal(state.membershipInput, value);
        assert.ok(renders() > before, `${event} must invalidate the canvas`);
      }
      main.renderer.getMembershipKeyHit = () => null;
      main.renderer.getMembershipAction = () => 'confirm';
      main.inputManager.handleMembershipTouch({ x: 0, y: 0 });
      assert.equal(state.membershipError, '福利码无效');
      settle();
      const beforeHide = renders();
      main.handleAppBackground();
      keyboard.value = 'DELAYED-HIDDEN'; dispatchKeyboard('input');
      assert.equal(frames.size, 0);
      assert.equal(renders(), beforeHide, 'hidden callbacks cannot restart rendering');
      main.handleAppForeground(); settle();
      assert.ok(renders() > beforeHide);
      state.closeMembershipPanel(); main.requestImmediateRender(); settle();
      const closed = state.membershipInput;
      keyboard.value = 'LATE-CLOSED'; dispatchKeyboard('input');
      assert.equal(state.membershipInput, closed);
      assert.equal(frames.size, 0);
    });
  });

  test(`${version}: losing a mouse release cancels only input and never changes audio visibility`, async () => {
    await withMain(version, async ({ main, dispatchPointer, dispatchWindow, dispatchDocument, settle }) => {
      const state = main.gameState;
      state.startNewGame(); main.requestImmediateRender(); settle();
      let hides = 0, shows = 0;
      wx.onHide(() => hides++); wx.onShow(() => shows++);
      const pick = () => {
        const area = main.renderer.rackHitAreas[0];
        const event = dispatchPointer('mousedown', { button: 0, buttons: 1,
          clientX: area.x + area.width / 2, clientY: area.y + area.height / 2 });
        assert.equal(event.defaultPrevented, true, 'canvas actions retain requested native input focus');
        assert.equal(state.dragState.isDragging, true);
      };
      pick();
      const board = state.board.getSnapshot();
      dispatchWindow('mouseup', { button: 2, buttons: 1, clientX: 0, clientY: 0 });
      assert.equal(state.dragState.isDragging, true, 'releasing a secondary button does not release the owned drag');
      dispatchWindow('blur');
      assert.equal(state.dragState.isDragging, false);
      assert.equal(main.inputManager.activeTouchIdentifier, null);
      assert.deepEqual({ hides, shows, paused: main.isPaused }, { hides: 0, shows: 0, paused: false });
      pick();
      dispatchPointer('mousemove', { buttons: 0, clientX: 100, clientY: 200 });
      assert.equal(state.dragState.isDragging, false, 'button-state recovery also cancels a lost release');
      dispatchWindow('mouseup', { button: 0, buttons: 0, clientX: 100, clientY: 200 });
      assert.deepEqual(state.board.getSnapshot(), board);
      assert.equal(state.score, 0);
      settle();
      document.hidden = true; dispatchDocument('visibilitychange');
      assert.deepEqual({ hides, shows, paused: main.isPaused }, { hides: 1, shows: 0, paused: true });
      document.hidden = false; dispatchDocument('visibilitychange');
      assert.deepEqual({ hides, shows, paused: main.isPaused }, { hides: 1, shows: 1, paused: false });
    });
  });

  test(`${version}: another difficulty's storage event does not invent a first-game record threshold`, async () => {
    await withMain(version, async ({ main, dispatchWindow }) => {
      const state = main.gameState;
      state.startNewGame();
      state.scoreManager.applyPlacement(state, 1); await tickPromises();
      assert.equal(state.bestScore, 10);
      assert.equal(state.startingHighScore, 0);
      localStorage.setItem(key, JSON.stringify({ easy: 90, normal: 10, master: 0 }));
      dispatchWindow('storage', { key,
        oldValue: JSON.stringify({ easy: 0, normal: 10, master: 0 }),
        newValue: JSON.stringify({ easy: 90, normal: 10, master: 0 }) });
      assert.equal(state.bestScores.easy, 90);
      assert.equal(state.startingHighScore, 0);
      state.scoreManager.applyPlacement(state, 1); await tickPromises();
      assert.equal(state.hasShownNewRecord, false);
      localStorage.setItem(key, JSON.stringify({ easy: 90, normal: 50, master: 0 }));
      dispatchWindow('storage', { key,
        oldValue: JSON.stringify({ easy: 90, normal: 20, master: 0 }),
        newValue: JSON.stringify({ easy: 90, normal: 50, master: 0 }) });
      assert.equal(state.startingHighScore, 50, 'a real external higher record still updates the threshold');
      const read = wx.getStorageSync;
      wx.getStorageSync = () => { throw new Error('read failure'); };
      dispatchWindow('storage', { key });
      assert.equal(state.bestScore, 50);
      wx.getStorageSync = read;
    });
  });
}

for (const version of ['wechat', 'web', 'android']) {
  test(`${version}: cancelling the next drag preserves feedback from the previous placement`, async () => {
    const restore = installWxStorage(createMemoryStorage());
    Object.assign(wx, { onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {} });
    try {
      const { GameState, InputManager } = await loadVersion(version);
      const state = new GameState(); state.startNewGame();
      state.setLayout({ cellSize: 30, boardRect: { x: 0, y: 0, width: 300, height: 300 } });
      state.rackPieces = [0, 1].map(index => ({ id: `single-${index}`, baseId: 'single', category: 'rescue',
        bounds: { width: 1, height: 1 }, cells: [{ x: 0, y: 0 }], color: '#abcdef', used: false }));
      state.dragState.activePieceIndex = 0;
      state.previewState = { row: 0, col: 0, visible: true, canPlace: true };
      assert.equal(state.tryPlaceDraggedPiece(), true);
      const gain = structuredClone(state.feedbackState.gain);
      assert.equal(gain.active, true);
      const input = new InputManager(state, {}, {}, () => {});
      assert.equal(state.startDrag(1, 100, 500, { x: 100, y: 450, cellSize: 24 }), true);
      input.activeTouchIdentifier = 7;
      input.handleTouchCancel({ changedTouches: [{ identifier: 7 }] });
      assert.equal(state.dragState.isDragging, false);
      assert.deepEqual(state.feedbackState.gain, gain);
      assert.equal(state.score, 10);
      assert.equal(state.board.grid.flat().filter(Boolean).length, 1);
    } finally { restore(); }
  });
}
