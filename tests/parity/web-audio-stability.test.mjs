import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = path.resolve('.');
const targets = [
  ['web', path.join(rootDir, 'we xin xiao cheng xu-android-apk', 'docs')],
  ['android', path.join(rootDir, 'we xin xiao cheng xu-android-apk', 'app', 'src', 'main', 'assets')]
];

async function loadSoundManager(target) {
  const modulePath = path.join(target, 'js', 'game', 'SoundManager.js');
  return (await import(`${pathToFileURL(modulePath).href}?audio-test=${Date.now()}-${Math.random()}`)).default;
}

function installAudioApi() {
  const previousWx = globalThis.wx;
  const instances = [];
  globalThis.wx = {
    createInnerAudioContext() {
      const audio = {
        stopCalls: 0,
        seekCalls: 0,
        playCalls: 0,
        stop() { this.stopCalls += 1; },
        seek() { this.seekCalls += 1; },
        play() { this.playCalls += 1; },
        destroy() {}
      };
      instances.push(audio);
      return audio;
    }
  };
  return {
    instances,
    restore() {
      if (previousWx === undefined) delete globalThis.wx;
      else globalThis.wx = previousWx;
    }
  };
}

for (const [name, target] of targets) {
  test(`${name}: repeated BGM synchronization resumes without resetting the track`, async () => {
    const audioApi = installAudioApi();
    try {
      const SoundManager = await loadSoundManager(target);
      const manager = new SoundManager();
      manager.setSettings({ bgmEnabled: true, bgmTrack: 2 });
      const bgm = audioApi.instances[0];

      manager.setSettings({ bgmEnabled: true, bgmTrack: 2 });

      assert.equal(bgm.stopCalls, 0);
      assert.equal(bgm.seekCalls, 0);
      assert.equal(bgm.playCalls, 2);

      manager.setSettings({ bgmEnabled: false });
      assert.equal(bgm.stopCalls, 1);
    } finally {
      audioApi.restore();
    }
  });

  test(`${name}: browser shim reserves lifecycle callbacks for real page visibility`, async () => {
    const shim = await fs.readFile(path.join(target, 'browser-wx-shim.js'), 'utf8');
    assert.doesNotMatch(shim, /window\.addEventListener\('blur'/);
    assert.doesNotMatch(shim, /window\.addEventListener\('focus'/);
    assert.match(shim, /document\.addEventListener\('visibilitychange'/);
    assert.match(shim, /resumeRequestedLoopingAudio/);
  });
}
