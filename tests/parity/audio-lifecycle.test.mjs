import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { getVersionPath } from '../helpers/version-adapter.mjs';

function installAudio() {
  const previous = globalThis.wx;
  const contexts = [];
  globalThis.wx = { createInnerAudioContext() {
    const context = {
      playing: false, playCalls: 0, stopCalls: 0, seekCalls: 0,
      play() { this.playing = true; this.playCalls++; },
      stop() { this.playing = false; this.stopCalls++; },
      seek() { this.seekCalls++; },
      destroy() { this.playing = false; }
    };
    contexts.push(context);
    return context;
  } };
  return { contexts, restore() {
    if (previous === undefined) delete globalThis.wx;
    else globalThis.wx = previous;
  } };
}

for (const version of ['wechat', 'web', 'android']) {
  test(`${version}: mute and background stop existing effects without replaying them on return`, async () => {
    const api = installAudio();
    try {
      const { default: SoundManager } = await import(pathToFileURL(getVersionPath(version, 'game/SoundManager.js')));
      const manager = new SoundManager();
      manager.setSettings({ soundEnabled: true, bgmEnabled: true, bgmTrack: 2 });
      const bgm = api.contexts[0];
      manager.playClear();
      const effect = api.contexts[1];
      manager.handleAppHide();
      assert.equal(effect.playing, false);
      assert.equal(bgm.playing, false);
      const effectPlays = effect.playCalls;
      manager.playClear();
      assert.equal(effect.playCalls, effectPlays, 'hidden effect requests are ignored');
      manager.handleAppShow();
      assert.equal(bgm.playing, true);
      assert.equal(effect.playCalls, effectPlays, 'foreground resumes BGM only');
      manager.playClear();
      manager.setSettings({ ...manager.settings, soundEnabled: false });
      assert.equal(effect.playing, false, 'mute immediately stops an already playing effect');
      assert.equal(bgm.playing, true, 'effect mute does not mute BGM');
      manager.playClear();
      assert.equal(effect.playCalls, effectPlays + 1);
      manager.setSettings({ ...manager.settings, soundEnabled: true });
      assert.equal(effect.playCalls, effectPlays + 1, 'unmute never replays old effects');
      manager.playClear();
      assert.equal(effect.playCalls, effectPlays + 2);
      assert.equal(api.contexts.length, 2, 'repeated effects reuse their existing context');
    } finally { api.restore(); }
  });

  test(`${version}: changing vibration leaves the current BGM playback position alone`, async () => {
    const api = installAudio();
    try {
      const { default: SoundManager } = await import(pathToFileURL(getVersionPath(version, 'game/SoundManager.js')));
      const manager = new SoundManager();
      manager.setSettings({ soundEnabled: true, bgmEnabled: true, bgmTrack: 2, vibrationEnabled: true });
      const bgm = api.contexts[0];
      const before = { stop: bgm.stopCalls, seek: bgm.seekCalls };
      manager.setSettings({ ...manager.settings, vibrationEnabled: false });
      assert.deepEqual({ stop: bgm.stopCalls, seek: bgm.seekCalls }, before);
      assert.equal(bgm.playing, true);
      assert.equal(api.contexts.length, 1);
    } finally { api.restore(); }
  });
}
