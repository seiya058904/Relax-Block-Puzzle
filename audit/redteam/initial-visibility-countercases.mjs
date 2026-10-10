import { auditSourceRoot } from '../source-path.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { runInThisContext } from 'node:vm';
import { pathToFileURL } from 'node:url';

const root = process.env.REDTEAM_SOURCE_ROOT || auditSourceRoot;
const {getVersionPath} = await import(pathToFileURL(path.join(root, 'tests/helpers/version-adapter.mjs')).href);
const {installBrowserEnvironment, createMemoryStorage} = await import(pathToFileURL(path.join(root, 'tests/helpers/platform-mocks.mjs')).href);
const settingsKey = 'block_puzzle_settings_v1';
const scoresKey = 'block_puzzle_best_scores_v1';
const records = [];

function context() {
  return new Proxy({globalAlpha: 1, getTransform: () => ({a: 2}),
    measureText: text => ({width: String(text).length * 8}),
    createLinearGradient: () => ({addColorStop() {}}),
    createRadialGradient: () => ({addColorStop() {}})
  }, {get: (target, key) => key in target ? target[key] : () => {}});
}

function events(target) {
  const map = new Map();
  target.addEventListener = (name, callback) => map.set(name, [...map.get(name) || [], callback]);
  return (name, event = {}) => {for (const callback of map.get(name) || []) callback(event);};
}

async function scenario(version, hidden, bgmEnabled, noDocument = false) {
  const env = installBrowserEnvironment({
    [settingsKey]: JSON.stringify({bgmEnabled, bgmTrack: 4, soundEnabled: true}),
    [scoresKey]: JSON.stringify({easy: 0, normal: 0, master: 0})
  });
  const priorRaf = ['requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const doc = document, surface = doc.getElementById('gameCanvas');
  doc.hidden = hidden; surface.getContext = () => ctx;
  const ctx = context(), frames = new Map(), audio = [];
  const dispatchDocument = events(doc), dispatchWindow = events(window);
  let nextId = 0, time = 1, renders = 0, main, initial;
  globalThis.requestAnimationFrame = callback => {frames.set(++nextId, callback); return nextId;};
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const settle = () => {
    for (let i = 0; i < 100 && frames.size; i++) {
      const batch = [...frames.values()]; frames.clear(); time += 16;
      batch.forEach(callback => callback(time));
      assert.ok(frames.size <= 1, 'at most one RAF owner');
    }
    assert.equal(frames.size, 0, 'startup and foreground return to idle');
  };
  const playCount = () => audio.reduce((sum, item) => sum + item.plays, 0);
  const active = () => audio.filter(item => item.playing);
  const label = noDocument ? 'native-like host without document' : `initial hidden=${hidden}, saved BGM=${bgmEnabled}, nondefault track=4`;
  try {
    if (noDocument) {
      const storage = createMemoryStorage({
        [settingsKey]: {bgmEnabled, bgmTrack: 4, soundEnabled: true},
        [scoresKey]: {easy: 0, normal: 0, master: 0}
      });
      globalThis.GameGlobal = globalThis;
      globalThis.wx = {
        createCanvas: () => surface,
        getSystemInfoSync: () => ({windowWidth: 390, windowHeight: 844, pixelRatio: 2}),
        getWindowInfo: () => ({windowWidth: 390, windowHeight: 844, pixelRatio: 2}),
        getStorageSync: storage.getStorageSync, setStorageSync: storage.setStorageSync,
        createInnerAudioContext: () => {
          const item = {plays: 0, playing: false, src: '', loop: false,
            play() {this.plays++; this.playing = true;},
            stop() {this.playing = false;}, seek() {}, destroy() {this.playing = false;}};
          audio.push(item); return item;
        }
      };
      for (const name of ['TouchStart','TouchMove','TouchEnd','TouchCancel','KeyboardInput','KeyboardConfirm','KeyboardComplete','Hide','Show','WindowResize']) wx[`on${name}`] = () => {};
      delete globalThis.document;
    } else {
      const OriginalAudio = Audio;
      globalThis.Audio = class extends OriginalAudio {
        constructor() {super(); this.playing = false; this.plays = 0; audio.push(this);}
        play() {this.plays++; this.playing = true; return Promise.resolve();}
        pause() {this.playing = false;}
      };
      const shimPath = getVersionPath(version, '../browser-wx-shim.js');
      runInThisContext(`(() => {\n${await readFile(shimPath, 'utf8')}\n})();`, {filename: shimPath});
      wx.withStorageLock = (_, update) => Promise.resolve().then(update);
    }
    const {default: Main} = await import(pathToFileURL(getVersionPath(version, 'main.js')).href);
    main = new Main();
    const render = main.renderer.render.bind(main.renderer);
    main.renderer.render = state => {renders++; return render(state);};
    initial = {isPaused: main.isPaused, lifecyclePaused: !!main.gameState.lifecyclePaused,
      audioHidden: main.soundManager.appHidden, audioPlayCalls: playCount(), scheduledFrames: frames.size};
    assert.equal(main.isPaused, hidden);
    assert.equal(!!main.gameState.lifecyclePaused, hidden);
    assert.equal(main.soundManager.appHidden, hidden);
    assert.equal(playCount(), !hidden && bgmEnabled ? 1 : 0);
    assert.equal(frames.size, hidden ? 0 : 1);
    settle();
    if (hidden) {
      assert.equal(renders, 0);
      for (let i = 0; i < 3; i++) {
        dispatchDocument('visibilitychange'); dispatchWindow('pagehide');
        window.ANDROID_APP_BACKGROUND();
        main.soundManager.playClick();
        main.requestImmediateRender();
      }
      assert.equal(frames.size, 0); assert.equal(renders, 0); assert.equal(playCount(), 0);
      doc.hidden = false; dispatchDocument('visibilitychange'); settle();
      assert.equal(main.isPaused, false); assert.equal(main.gameState.lifecyclePaused, false);
      assert.equal(main.soundManager.appHidden, false);
      assert.equal(playCount(), bgmEnabled ? 1 : 0); assert.ok(renders > 0);
    }

    for (let cycle = 0; cycle < 3; cycle++) {
      main.soundManager.playClick();
      assert.equal(active().filter(item => !item.loop).length, 1, 'visible effect remains functional');
      const afterEffect = playCount();
      if (noDocument) window.ANDROID_APP_BACKGROUND();
      else {doc.hidden = true; dispatchDocument('visibilitychange');}
      assert.equal(active().length, 0, 'background stops BGM and effects');
      const hiddenRenders = renders;
      for (let i = 0; i < 3; i++) {
        if (!noDocument) {dispatchDocument('visibilitychange'); dispatchWindow('pagehide');}
        window.ANDROID_APP_BACKGROUND();
        main.soundManager.playClick(); main.requestImmediateRender();
      }
      assert.equal(playCount(), afterEffect); assert.equal(frames.size, 0); assert.equal(renders, hiddenRenders);
      if (noDocument) window.ANDROID_APP_FOREGROUND();
      else {doc.hidden = false; dispatchDocument('visibilitychange');}
      settle();
      assert.equal(playCount(), afterEffect + (bgmEnabled ? 1 : 0), 'foreground resumes only enabled BGM');
      assert.equal(active().filter(item => !item.loop).length, 0, 'foreground never replays old effects');
      const stablePlays = playCount(), stableRenders = renders;
      if (!noDocument) {
        for (let i = 0; i < 3; i++) {dispatchDocument('visibilitychange'); dispatchWindow('pageshow');}
        assert.equal(renders, stableRenders, 'duplicate browser visibility is inert');
      }
      for (let i = 0; i < 3; i++) window.ANDROID_APP_FOREGROUND();
      settle(); assert.equal(playCount(), stablePlays, 'duplicate host foreground does not restart BGM');
    }
    records.push({version, label, pass: true, initial, cycles: 3, finalFrames: frames.size});
  } catch (error) {
    records.push({version, label, pass: false, initial, actual: error.actual, expected: error.expected, message: error.message, stack: error.stack});
  } finally {
    main?.handleAppBackground();
    for (const [key, descriptor] of priorRaf) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    delete globalThis.ANDROID_APP_BACKGROUND; delete globalThis.ANDROID_APP_FOREGROUND;
    delete globalThis.__syncKeyboardInputPosition;
    env.restore();
  }
}

for (const version of ['web','android']) {
  for (const hidden of [false,true]) for (const bgmEnabled of [false,true]) await scenario(version, hidden, bgmEnabled);
  await scenario(version, false, true, true);
}
records.forEach(record => console.log(JSON.stringify(record)));
console.log(JSON.stringify({summary: true, root, total: records.length, passed: records.filter(r => r.pass).length, failed: records.filter(r => !r.pass).length}));
if (records.some(record => !record.pass)) process.exitCode = 1;
