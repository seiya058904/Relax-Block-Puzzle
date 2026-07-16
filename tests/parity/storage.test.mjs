import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

import { versions } from '../fixtures/core-vectors.mjs';
import { getVersionPath, loadVersion } from '../helpers/version-adapter.mjs';
import {
  createMemoryStorage,
  installBrowserEnvironment,
  installWxStorage
} from '../helpers/platform-mocks.mjs';

const defaultSettings = {
  soundEnabled: true,
  bgmEnabled: false,
  vibrationEnabled: true,
  bgmTrack: 2,
  difficulty: 'normal',
  localMembershipEnabled: false
};

for (const version of versions) {
  test(`${version}: returns defaults for empty and invalid storage values`, async () => {
    const storage = createMemoryStorage({ block_puzzle_settings_v1: 'not-an-object' });
    const restore = installWxStorage(storage);
    try {
      const { storage: api } = await loadVersion(version);
      assert.deepEqual(api.loadSettings(), defaultSettings);
      assert.deepEqual(api.loadBestScores(), { easy: 0, normal: 0, master: 0 });
    } finally {
      restore();
    }
  });

  test(`${version}: fills missing settings and normalizes invalid fields`, async () => {
    const storage = createMemoryStorage({
      block_puzzle_settings_v1: { soundEnabled: false, difficulty: 'impossible', extra: 'ignored-on-read' }
    });
    const restore = installWxStorage(storage);
    try {
      const { storage: api } = await loadVersion(version);
      assert.deepEqual(api.loadSettings(), {
        ...defaultSettings,
        soundEnabled: false,
        difficulty: 'normal',
        extra: 'ignored-on-read'
      });
    } finally {
      restore();
    }
  });

  test(`${version}: saves settings and separate difficulty best scores`, async () => {
    const storage = createMemoryStorage();
    const restore = installWxStorage(storage);
    try {
      const { storage: api } = await loadVersion(version);
      api.saveSettings({ ...defaultSettings, bgmEnabled: true, difficulty: 'master' });
      api.saveBestScore('easy', 11);
      api.saveBestScore('normal', 22);
      api.saveBestScore('master', 33);
      assert.equal(api.loadSettings().bgmEnabled, true);
      assert.deepEqual(api.loadBestScores(), { easy: 11, normal: 22, master: 33 });
    } finally {
      restore();
    }
  });

  test(`${version}: sanitizes wrong best-score types and migrates the legacy score`, async () => {
    const invalidStorage = createMemoryStorage({
      block_puzzle_best_scores_v1: { easy: '10', normal: 7, master: null }
    });
    let restore = installWxStorage(invalidStorage);
    try {
      const { storage: api } = await loadVersion(version);
      assert.deepEqual(api.loadBestScores(), { easy: 0, normal: 7, master: 0 });
    } finally {
      restore();
    }

    const legacyStorage = createMemoryStorage({ block_puzzle_best_score_v1: 88 });
    restore = installWxStorage(legacyStorage);
    try {
      const { storage: api } = await loadVersion(version);
      assert.deepEqual(api.loadBestScores(), { easy: 0, normal: 88, master: 0 });
      assert.deepEqual(legacyStorage.snapshot().block_puzzle_best_scores_v1, { easy: 0, normal: 88, master: 0 });
    } finally {
      restore();
    }
  });
}

test('Android shim returns malformed JSON safely and storage logic falls back to defaults', async () => {
  const environment = installBrowserEnvironment({ block_puzzle_settings_v1: '{broken-json' });
  try {
    const shimPath = path.resolve(
      'we xin xiao cheng xu-android-apk', 'app', 'src', 'main', 'assets', 'browser-wx-shim.js'
    );
    await import(`${pathToFileURL(shimPath).href}?test=${Date.now()}`);
    assert.equal(globalThis.wx.getStorageSync('block_puzzle_settings_v1'), '{broken-json');
    const storageModule = await import(pathToFileURL(getVersionPath('android', 'utils/storage.js')).href);
    assert.deepEqual(storageModule.loadSettings(), defaultSettings);
    storageModule.saveSettings({ ...defaultSettings, soundEnabled: false });
    assert.equal(JSON.parse(environment.localStorage.snapshot().block_puzzle_settings_v1).soundEnabled, false);
  } finally {
    environment.restore();
  }
});

test('logical save objects remain equivalent across WeChat and Android modules', async () => {
  const snapshots = [];
  for (const version of versions) {
    const storage = createMemoryStorage();
    const restore = installWxStorage(storage);
    try {
      const { storage: api } = await loadVersion(version);
      api.saveSettings({ ...defaultSettings, vibrationEnabled: false, difficulty: 'easy' });
      api.saveBestScores({ easy: 12, normal: 34, master: 56 });
      snapshots.push(storage.snapshot());
    } finally {
      restore();
    }
  }
  assert.deepEqual(snapshots[0], snapshots[1]);
});
