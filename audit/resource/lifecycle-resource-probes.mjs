import { auditOutputFile, auditSourceRoot } from '../source-path.mjs';
// Audit-only independent probes. Product source is imported without changes.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { runInThisContext } from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = auditSourceRoot;
const roots = {
  wechat: path.join(root, 'we xin xiao cheng xu'),
  web: path.join(root, 'we xin xiao cheng xu-android-apk/docs'),
  android: path.join(root, 'we xin xiao cheng xu-android-apk/app/src/main/assets')
};
const report = { audioStress: {}, canvasStress: {}, initialHidden: {}, shimPool: {} };

for (const [platform, directory] of Object.entries(roots)) {
  const contexts = [];
  globalThis.wx = { createInnerAudioContext() {
    const audio = { src: '', playing: false, destroyed: false, playCalls: 0, stopCalls: 0, seekCalls: 0,
      play() { assert.equal(this.destroyed, false); this.playing = true; this.playCalls++; },
      stop() { this.playing = false; this.stopCalls++; },
      seek() { this.seekCalls++; },
      destroy() { this.playing = false; this.destroyed = true; }
    };
    contexts.push(audio);
    return audio;
  } };
  const { default: SoundManager } = await import(pathToFileURL(path.join(directory, 'js/game/SoundManager.js')));
  const manager = new SoundManager();
  manager.setSettings({ soundEnabled: true, bgmEnabled: true, bgmTrack: 2 });
  const effectNames = ['pickup', 'place', 'clear', 'combo', 'combo3', 'click', 'gameover'];
  effectNames.forEach(key => manager.playEffect(key));
  for (let iteration = 0; iteration < 200; iteration++) {
    manager.handleAppHide();
    assert.equal(contexts.some(item => item.playing), false);
    const before = contexts.reduce((sum, item) => sum + item.playCalls, 0);
    effectNames.forEach(key => manager.playEffect(key));
    manager.setSettings({ ...manager.settings, bgmTrack: iteration % 4 + 1 });
    assert.equal(contexts.reduce((sum, item) => sum + item.playCalls, 0), before, 'hidden audio must never restart');
    manager.handleAppShow();
    assert.equal(contexts.filter(item => item.playing).length, 1, 'foreground restarts only BGM');
    effectNames.forEach(key => manager.playEffect(key));
    const current = manager.bgmContext;
    const stopBefore = current.stopCalls;
    const seekBefore = current.seekCalls;
    manager.setSettings({ ...manager.settings, vibrationEnabled: iteration % 2 === 0 });
    assert.equal(current.stopCalls, stopBefore);
    assert.equal(current.seekCalls, seekBefore);
    manager.setSettings({ ...manager.settings, soundEnabled: false });
    assert.equal(contexts.filter(item => item.playing).length, 1, 'muting effects must leave BGM active');
    manager.setSettings({ ...manager.settings, soundEnabled: true });
    assert.equal(contexts.filter(item => item.playing).length, 1, 'unmute cannot replay effects');
    assert.equal(Object.keys(manager.effectContexts).length, 7);
    assert.equal(contexts.filter(item => !item.destroyed).length, 8);
  }
  manager.handleAppHide();
  report.audioStress[platform] = {
    cycles: 200,
    liveEffectContexts: Object.keys(manager.effectContexts).length,
    liveBgmContexts: contexts.filter(item => !item.destroyed && item.loop).length,
    destroyedBgmContexts: contexts.filter(item => item.destroyed).length,
    playingAfterHide: contexts.filter(item => item.playing).length,
    assertions: 'pass'
  };

  const surfaces = [];
  const context = () => new Proxy({
    globalAlpha: 1,
    getTransform: () => ({ a: 2.5 }),
    measureText: value => ({ width: String(value).length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} })
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  wx.createOffscreenCanvas = () => {
    const surface = { width: 0, height: 0, getContext: () => context() };
    surfaces.push(surface);
    return surface;
  };
  const { default: Renderer } = await import(pathToFileURL(path.join(directory, 'js/game/Renderer.js')));
  const renderer = new Renderer(context(), { screenWidth: 390, screenHeight: 844 }, { menuButton: null, safeArea: null });
  let largestPixels = 0;
  for (let iteration = 0; iteration < 1000; iteration++) {
    const width = 320 + iteration % 1200, height = 560 + iteration % 1100;
    renderer.setViewport({ screenWidth: width, screenHeight: height }, { menuButton: null, safeArea: null });
    assert.equal(surfaces.reduce((sum, surface) => sum + surface.width * surface.height, 0), 0);
    for (const [name, rect] of [
      ['background', { x: 0, y: 0, width, height }],
      ['board', renderer.layout.boardPanelRect]
    ]) {
      renderer.drawCachedSurface(name, String(iteration), rect, () => {});
      const count = surfaces.length;
      renderer.drawCachedSurface(name, String(iteration), rect, () => {});
      assert.equal(surfaces.length, count, 'same key reuses surface');
    }
    const allocated = surfaces.reduce((sum, surface) => sum + surface.width * surface.height, 0);
    largestPixels = Math.max(largestPixels, allocated);
    assert.equal(allocated, renderer.surfacePixels);
    assert.ok(allocated <= renderer.quality.surfaceCachePixelMax);
    assert.ok(renderer.surfaceCache.size <= 2);
  }
  renderer.clearSurfaceCache();
  assert.equal(surfaces.reduce((sum, surface) => sum + surface.width * surface.height, 0), 0);
  report.canvasStress[platform] = {
    resizeCycles: 1000,
    maximumCachePixels: largestPixels,
    pixelBudget: renderer.quality.surfaceCachePixelMax,
    retainedPixelsAfterClear: renderer.surfacePixels,
    assertions: 'pass'
  };
}
delete globalThis.wx;

const { installBrowserEnvironment } = await import(pathToFileURL(path.join(root, 'tests/helpers/platform-mocks.mjs')));
for (const platform of ['web', 'android']) {
  const env = installBrowserEnvironment({ block_puzzle_settings_v1: JSON.stringify({ bgmEnabled: true, bgmTrack: 2 }) });
  document.hidden = true;
  const events = new Map();
  document.addEventListener = (type, handler) => { events.set(type, [...events.get(type) || [], handler]); };
  const audio = [];
  const OriginalAudio = globalThis.Audio;
  globalThis.Audio = class extends OriginalAudio {
    constructor() { super(); this.playing = false; this.playCalls = 0; audio.push(this); }
    play() { this.playing = true; this.playCalls++; return Promise.resolve(); }
    pause() { this.playing = false; }
  };
  const surface = document.getElementById('gameCanvas');
  surface.getContext = () => new Proxy({
    getTransform: () => ({ a: 2 }),
    measureText: value => ({ width: String(value).length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} })
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  const frames = new Map();
  let id = 0;
  globalThis.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
  globalThis.cancelAnimationFrame = key => frames.delete(key);
  const shim = path.join(roots[platform], 'browser-wx-shim.js');
  const inspectPool = runInThisContext(`(() => {\n${await readFile(shim, 'utf8')}\nreturn () => loopingAudioContexts.size;\n})();`, { filename: shim });
  wx.withStorageLock = (_, update) => Promise.resolve().then(update);
  const { default: Main } = await import(pathToFileURL(path.join(roots[platform], 'js/main.js')));
  const main = new Main();
  const initial = { documentHidden: document.hidden, mainPaused: main.isPaused,
    soundManagerHidden: main.soundManager.appHidden, bgmPlayCalls: audio.reduce((sum, item) => sum + item.playCalls, 0),
    scheduledFrames: frames.size };
  // A redundant visibilitychange that still reports hidden also emits no hide.
  for (const handler of events.get('visibilitychange') || []) handler();
  const afterHiddenNotification = { mainPaused: main.isPaused, soundManagerHidden: main.soundManager.appHidden,
    playingAudio: audio.filter(item => item.playing).length };
  report.initialHidden[platform] = { initial, afterHiddenNotification,
    violation: document.hidden && (!main.isPaused || audio.some(item => item.playing)),
    evidenceType: 'real product shim and Main with controlled initial browser visibility; not a native device or natural background-tab reproduction' };
  document.hidden = false;
  main.handleAppForeground();
  for (let iteration = 0; iteration < 200; iteration++) {
    main.soundManager.setSettings({ ...main.soundManager.settings, bgmTrack: iteration % 4 + 1 });
    assert.equal(inspectPool(), 1, 'BGM replacements must remove the destroyed context from the shim retry pool');
    assert.equal(audio.filter(item => item.src).length, 1, 'destroyed HTMLAudio resources must release src');
  }
  main.handleAppBackground();
  assert.equal(audio.some(item => item.playing), false);
  main.soundManager.destroyBgmContext();
  assert.equal(inspectPool(), 0);
  assert.equal(audio.filter(item => item.src).length, 0);
  report.shimPool[platform] = { bgmReplacements: 200, remainingLoopingContexts: inspectPool(), retainedSources: audio.filter(item => item.src).length, assertions: 'pass' };
  await new Promise(resolve => setImmediate(resolve));
  env.restore();
  delete globalThis.requestAnimationFrame;
  delete globalThis.cancelAnimationFrame;
  delete globalThis.ANDROID_APP_BACKGROUND;
  delete globalThis.ANDROID_APP_FOREGROUND;
  delete globalThis.__syncKeyboardInputPosition;
}
await writeFile(auditOutputFile('resource', 'lifecycle-resource-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
