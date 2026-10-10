import test from 'node:test';
import assert from 'node:assert/strict';
import { loadVersion } from '../helpers/version-adapter.mjs';
import { createMemoryStorage, installWxStorage } from '../helpers/platform-mocks.mjs';

const key = 'block_puzzle_best_scores_v1';
const initial = { easy: 12, normal: 100, master: 30 };
const tick = () => new Promise(resolve => setImmediate(resolve));

function holdLocks() {
  const queue = [];
  wx.withStorageLock = (_, update) => new Promise((resolve, reject) => queue.push({ update, resolve, reject }));
  return queue;
}

for (const version of ['wechat', 'web', 'android']) {
  test(`${version}: a failed read after a successful reset recovers before the next own score`, async () => {
    const restore = installWxStorage(createMemoryStorage({ [key]: initial }));
    try {
      const { GameState } = await loadVersion(version);
      const queue = version === 'wechat' ? [] : holdLocks();
      const state = new GameState(); state.startNewGame();
      const read = wx.getStorageSync;
      if (version === 'wechat') {
        let reads = 0;
        wx.getStorageSync = name => {
          if (++reads === 2) throw new Error('one reconciliation read fails');
          return read(name);
        };
        await state.confirmResetBestScore();
      } else {
        const pending = state.confirmResetBestScore();
        const operation = queue.shift();
        const outcome = operation.update();
        wx.getStorageSync = () => { throw new Error('one reconciliation read fails'); };
        operation.resolve(outcome); await pending;
      }
      wx.getStorageSync = read;
      assert.equal(read(key).normal, 0);
      state.scoreManager.applyPlacement(state, 1);
      if (queue.length) {
        const operation = queue.shift(); operation.resolve(operation.update()); await tick();
      }
      assert.deepEqual(read(key), { ...initial, normal: 10 });
      assert.equal(state.bestScore, 10);
      assert.equal(state.startingHighScore, 0);
      assert.equal(state.hasShownNewRecord, false);
    } finally { restore(); }
  });
}

for (const version of ['web', 'android']) {
  for (const queuedBeforeReconcile of [false, true]) {
    test(`${version}: display-only refresh cannot hide a pending reset threshold (${queuedBeforeReconcile ? 'queued' : 'next'} own score)`, async () => {
      const restore = installWxStorage(createMemoryStorage({ [key]: initial }));
      try {
        const { GameState } = await loadVersion(version);
        const queue = holdLocks();
        const state = new GameState(); state.startNewGame();
        const pending = state.confirmResetBestScore();
        if (queuedBeforeReconcile) state.scoreManager.applyPlacement(state, 1);
        const reset = queue.shift(); reset.update();
        const read = wx.getStorageSync;
        wx.getStorageSync = () => { throw new Error('one reconciliation read fails'); };
        reset.reject(new Error('abort after the update')); await pending;
        wx.getStorageSync = read;
        wx.setStorageSync(key, { ...initial, easy: 20, normal: 0 });
        // Main does this for an event that changes only another difficulty.
        state.refreshBestScores({ updateRecordThreshold: false });
        assert.equal(state.bestScore, 0);
        assert.equal(state.startingHighScore, 100);
        if (!queuedBeforeReconcile) state.scoreManager.applyPlacement(state, 1);
        const save = queue.shift(); save.resolve(save.update()); await tick();
        assert.equal(read(key).normal, 10);
        assert.equal(state.bestScore, 10);
        assert.equal(state.startingHighScore, 0);
        assert.equal(state.hasShownNewRecord, false);
      } finally { restore(); }
    });
  }

  test(`${version}: reset completion reconciles its threshold even when display is already current`, async () => {
    const restore = installWxStorage(createMemoryStorage({ [key]: initial }));
    try {
      const { GameState } = await loadVersion(version);
      const queue = holdLocks();
      const state = new GameState(); state.startNewGame();
      const pending = state.confirmResetBestScore();
      const reset = queue.shift(); const outcome = reset.update();
      state.refreshBestScores({ updateRecordThreshold: false });
      assert.equal(state.bestScore, 0);
      assert.equal(state.startingHighScore, 100);
      reset.resolve(outcome); await pending;
      assert.equal(state.startingHighScore, 0);
      state.scoreManager.applyPlacement(state, 1);
      const save = queue.shift(); save.resolve(save.update()); await tick();
      assert.equal(state.hasShownNewRecord, false);
    } finally { restore(); }
  });

  for (const mode of ['success', 'reject-after-update', 'reject-before-update']) {
    for (const queuedBeforeReconcile of [false, true]) {
      // The synchronous success path without a queued write is covered above.
      if (mode === 'success' && !queuedBeforeReconcile) continue;
      test(`${version}: reset ${mode}, failed read, own write queued ${queuedBeforeReconcile ? 'before' : 'after'} completion`, async () => {
        const restore = installWxStorage(createMemoryStorage({ [key]: initial }));
        try {
          const { GameState } = await loadVersion(version);
          const queue = holdLocks();
          const state = new GameState(); state.startNewGame();
          const pending = state.confirmResetBestScore();
          if (queuedBeforeReconcile) state.scoreManager.applyPlacement(state, 1);
          const reset = queue.shift();
          const outcome = mode === 'reject-before-update' ? undefined : reset.update();
          const read = wx.getStorageSync;
          wx.getStorageSync = () => { throw new Error('reconciliation read unavailable'); };
          if (mode === 'success') reset.resolve(outcome);
          else reset.reject(new Error('coordinator failure'));
          await pending;
          wx.getStorageSync = read;
          if (!queuedBeforeReconcile) state.scoreManager.applyPlacement(state, 1);
          const save = queue.shift(); save.resolve(save.update()); await tick();
          const expectedBest = mode === 'reject-before-update' ? 100 : 10;
          assert.deepEqual(read(key), { ...initial, normal: expectedBest });
          assert.equal(state.bestScore, expectedBest);
          assert.equal(state.startingHighScore, mode === 'reject-before-update' ? 100 : 0);
          assert.equal(state.hasShownNewRecord, false);
          assert.equal(state.pendingBestScoreWrites, 0);
        } finally { restore(); }
      });
    }
  }
}
