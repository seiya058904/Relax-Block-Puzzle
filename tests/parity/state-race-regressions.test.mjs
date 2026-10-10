import test from 'node:test';
import assert from 'node:assert/strict';
import { loadVersion } from '../helpers/version-adapter.mjs';
import { createMemoryStorage, installWxStorage } from '../helpers/platform-mocks.mjs';

const key = 'block_puzzle_best_scores_v1';
const tick = () => new Promise(resolve => setImmediate(resolve));

function holdLocks() {
  const queue = [];
  wx.withStorageLock = (_, update) => new Promise(resolve => queue.push(() => resolve(update())));
  return queue;
}

function place(state, col) {
  state.rackPieces = [{ id: 'single', baseId: 'single', category: 'rescue', isSnake: false,
    bounds: { width: 1, height: 1 }, cells: [{ x: 0, y: 0 }], color: '#abcdef', used: false }];
  state.dragState.activePieceIndex = 0;
  state.previewState = { row: 0, col, canPlace: true, visible: true };
  assert.equal(state.tryPlaceDraggedPiece(), true);
}

for (const version of ['web', 'android']) {
  test(`${version}: resetting next round's difficulty does not invalidate active-round saves`, async () => {
    const memory = createMemoryStorage({ [key]: { easy: 50, normal: 0, master: 30 } });
    const restore = installWxStorage(memory);
    try {
      const { GameState } = await loadVersion(version);
      const state = new GameState();
      const queue = holdLocks();
      state.startNewGame(); place(state, 0); place(state, 1); place(state, 2);
      const generation = state.bestScoreGeneration;
      state.openSettings(); state.setSettings({ difficulty: 'easy' });
      const reset = state.confirmResetBestScore();
      state.closeSettings();
      while (queue.length) { queue.shift()(); await tick(); }
      await reset;
      assert.equal(state.bestScoreGeneration, generation);
      assert.equal(state.activeDifficulty, 'normal');
      assert.equal(state.startingHighScore, 0);
      place(state, 3); queue.shift()(); await tick();
      assert.equal(state.hasShownNewRecord, false);
      assert.deepEqual(memory.snapshot()[key], { easy: 0, normal: 40, master: 30 });
    } finally { restore(); }
  });

  test(`${version}: old-round saves retain history without changing the selected home difficulty`, async () => {
    const memory = createMemoryStorage({ [key]: { easy: 2, normal: 5, master: 3 } });
    const restore = installWxStorage(memory);
    try {
      const { GameState } = await loadVersion(version);
      const state = new GameState();
      const queue = holdLocks();
      state.startNewGame();
      place(state, 0);
      state.openPause(); state.requestReturnHome(); state.confirmReturnHome();
      state.setSettings({ difficulty: 'easy' });
      queue.shift()(); await tick();
      assert.deepEqual(memory.snapshot()[key], { easy: 2, normal: 10, master: 3 });
      assert.equal(state.activeDifficulty, 'easy');
      assert.equal(state.bestScore, 2);
      assert.equal(state.bestScores.easy, 2);
      assert.equal(state.hasShownNewRecord, false);
      state.setSettings({ difficulty: 'normal' });
      state.startNewGame(); place(state, 0); place(state, 1);
      state.openPause(); state.requestReturnHome(); state.confirmReturnHome();
      while (queue.length) { queue.shift()(); await tick(); }
      assert.equal(state.bestScore, 20, 'same-difficulty home also reflects the newly committed history');
      assert.equal(state.bestScores.normal, 20);
    } finally { restore(); }
  });

  test(`${version}: reset completion reconciles a new round and preserves a newly selected difficulty`, async () => {
    const memory = createMemoryStorage({ [key]: { easy: 12, normal: 100, master: 30 } });
    const restore = installWxStorage(memory);
    try {
      const { GameState } = await loadVersion(version);
      const state = new GameState();
      const queue = holdLocks();
      state.requestResetBestScore();
      const reset = state.confirmResetBestScore();
      state.startNewGame();
      queue.shift()(); await reset; await tick();
      assert.equal(memory.snapshot()[key].normal, 0);
      assert.equal(state.bestScore, 0);
      assert.equal(state.startingHighScore, 0);
      place(state, 0);
      queue.shift()(); await tick();
      assert.equal(state.bestScore, 10);
      assert.equal(state.hasShownNewRecord, false, 'own first record after reset is not an external record');
      state.confirmReturnHome();
      const secondReset = state.confirmResetBestScore();
      state.setSettings({ difficulty: 'easy' });
      queue.shift()(); await secondReset;
      assert.equal(state.bestScore, 12);
      assert.deepEqual(memory.snapshot()[key], { easy: 12, normal: 0, master: 30 });
    } finally { restore(); }
  });

  test(`${version}: reset queued after an old score wins without an unlocked write`, async () => {
    const memory = createMemoryStorage({ [key]: { easy: 12, normal: 5, master: 30 } });
    const restore = installWxStorage(memory);
    try {
      const { GameState } = await loadVersion(version);
      const state = new GameState();
      const queue = holdLocks();
      state.startNewGame(); place(state, 0);
      const reset = state.confirmResetBestScore();
      assert.equal(memory.snapshot()[key].normal, 5, 'no write before lock acquisition');
      queue.shift()(); await tick();
      queue.shift()(); await reset; await tick();
      assert.deepEqual(memory.snapshot()[key], { easy: 12, normal: 0, master: 30 });
      assert.equal(state.bestScore, 0);
      assert.equal(state.pendingBestScoreWrites, 0);
    } finally { restore(); }
  });
}

for (const version of ['wechat', 'web', 'android']) {
  test(`${version}: reset failure never pretends the stored record was cleared`, async () => {
    const memory = createMemoryStorage({ [key]: { easy: 12, normal: 100, master: 30 } });
    const restore = installWxStorage(memory);
    try {
      const { GameState } = await loadVersion(version);
      const state = new GameState();
      if (version !== 'wechat') wx.withStorageLock = (_, update) => Promise.resolve().then(update);
      wx.setStorageSync = () => { throw new Error('quota'); };
      await state.confirmResetBestScore();
      assert.equal(state.bestScore, 100);
      assert.deepEqual(state.bestScores, { easy: 12, normal: 100, master: 30 });
      assert.deepEqual(memory.snapshot()[key], state.bestScores);
      wx.getStorageSync = () => { throw new Error('read unavailable'); };
      await state.confirmResetBestScore();
      assert.equal(state.bestScore, 100, 'failed reads must preserve the last trustworthy cache');
    } finally { restore(); }
  });

  test(`${version}: undo cannot requalify a round after administrator tools become available`, async () => {
    const memory = createMemoryStorage({ [key]: { easy: 0, normal: 0, master: 0 } });
    const restore = installWxStorage(memory);
    try {
      const { GameState, ScoreManager } = await loadVersion(version);
      const state = new GameState();
      state.startNewGame(); place(state, 0);
      state.applyAuthState({ isAdminAllowed: true });
      state.enableAdminMode();
      assert.equal(state.bestScoreEligible, false);
      assert.equal(state.useUndoTool(), true);
      assert.equal(state.bestScoreEligible, false);
      place(state, 0); place(state, 1);
      state.disableAdminMode();
      place(state, 2);
      assert.equal(memory.snapshot()[key].normal, 10);
      // The persistence boundary also rejects an inconsistent eligibility flag.
      const inconsistent = { score: 999, bestScore: 10, activeDifficulty: 'normal',
        bestScores: { normal: 10 }, bestScoreEligible: true, adminModeEnabled: true };
      new ScoreManager().syncBestScore(inconsistent);
      assert.equal(memory.snapshot()[key].normal, 10);
    } finally { restore(); }
  });
}

test('wechat: cancelled and superseded admin verification cannot affect a later panel or round', async () => {
  const memory = createMemoryStorage({ [key]: { easy: 0, normal: 0, master: 0 } });
  const restore = installWxStorage(memory);
  try {
    const { GameState } = await loadVersion('wechat');
    const state = new GameState();
    const requests = [];
    state.setAuthClient({ verifyAdmin: () => new Promise((resolve, reject) => requests.push({ resolve, reject })) });
    assert.equal(state.openAdminPanel(), true);
    state.setAdminInput('local-test-fixture');
    const cancelled = state.submitAdminCode();
    state.closeAdminPanel();
    state.startNewGame(); place(state, 0);
    requests.shift().resolve({ adminMode: true });
    assert.equal(await cancelled, false);
    assert.equal(state.isAdminModeActive(), false);
    assert.equal(state.bestScoreEligible, true);
    assert.equal(state.adminError, '');
    state.confirmReturnHome();
    assert.equal(state.openAdminPanel(), true);
    state.setAdminInput('local-test-fixture');
    const oldRequest = state.submitAdminCode();
    const currentRequest = state.submitAdminCode();
    const old = requests.shift(), current = requests.shift();
    current.resolve({ adminMode: true });
    assert.equal(await currentRequest, true);
    old.reject(new Error('late failure'));
    assert.equal(await oldRequest, false);
    assert.equal(state.isAdminModeActive(), true);
    assert.equal(state.adminError, '', 'old failures cannot overwrite a newer successful result');
  } finally { restore(); }
});
