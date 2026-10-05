import test from 'node:test';
import assert from 'node:assert/strict';
import { loadVersion } from '../helpers/version-adapter.mjs';
import { createMemoryStorage, installWxStorage } from '../helpers/platform-mocks.mjs';

for (const version of ['wechat', 'android', 'web']) {
  test(`${version}: independent real games retain the latest record and correct feedback`, async () => {
    const memory = createMemoryStorage({ block_puzzle_best_scores_v1: { easy: 123, normal: 5, master: 789 } });
    const restore = installWxStorage(memory);
    try {
      const { GameState, storage } = await loadVersion(version);
      const a = new GameState(), b = new GameState();
      a.startNewGame(); b.startNewGame();
      function place(state, col) {
        state.rackPieces = [{ id: 'single', cells: [{x:0,y:0}], color:'#123456', used:false, bounds:{width:1,height:1}, category:'rescue', baseId:'single', isSnake:false }];
        state.dragState.activePieceIndex = 0;
        state.previewState = { row:0, col, canPlace:true, visible:true };
        assert.equal(state.tryPlaceDraggedPiece(), true);
      }
      place(a, 0); place(a, 1);
      assert.equal(memory.snapshot().block_puzzle_best_scores_v1.normal, 20);
      place(b, 0);
      assert.equal(memory.snapshot().block_puzzle_best_scores_v1.normal, 20);
      assert.equal(b.bestScore, 20);
      assert.equal(b.hasShownNewRecord, false, '10 must not claim to beat the actual 20 record');
      place(b, 1); place(b, 2);
      assert.equal(memory.snapshot().block_puzzle_best_scores_v1.normal, 30);
      assert.equal(b.bestScore, 30);
      assert.equal(b.hasShownNewRecord, true);
      assert.deepEqual(memory.snapshot().block_puzzle_best_scores_v1, {easy:123, normal:30, master:789});
      storage.resetBestScore('normal');
      assert.equal(storage.loadBestScore('normal'), 0, 'explicit reset remains effective');
    } finally { restore(); }
  });
}

test('ordinary best writes preserve failure and explicit-reset contracts', async () => {
  const { storage, ScoreManager } = await loadVersion('web');
  const memory = createMemoryStorage({block_puzzle_best_scores_v1:{easy:10,normal:20,master:30}});
  const restore = installWxStorage(memory);
  try {
    const write = wx.setStorageSync;
    wx.setStorageSync = () => { throw new Error('quota'); };
    assert.deepEqual(storage.saveBestScore('normal', 50), {previous:20,score:20});
    assert.equal(memory.snapshot().block_puzzle_best_scores_v1.normal, 20);
    wx.setStorageSync = write;
    assert.deepEqual(storage.saveBestScore('normal', 50), {previous:20,score:50});
    storage.resetBestScore('normal');
    const state = {score:10,bestScore:0,bestScores:{normal:0},activeDifficulty:'normal',bestScoreEligible:true,startingHighScore:0};
    const manager = new ScoreManager();
    manager.syncBestScore(state); state.score = 20; manager.syncBestScore(state);
    assert.equal(state.startingHighScore, 0, 'own earlier writes do not change first-game feedback rule');
    wx.getStorageSync = () => { throw new Error('read failed'); };
    let writes = 0; wx.setStorageSync = () => { writes++; };
    assert.equal(storage.saveBestScore('normal', 1000), undefined);
    assert.equal(writes, 0);
  } finally { restore(); }
});

test('browser coordination serializes complete mutations and explicit reset', async () => {
  const { storage, ScoreManager } = await loadVersion('web');
  const memory = createMemoryStorage({ block_puzzle_best_scores_v1: { easy: 10, normal: 20, master: 30 } });
  const restore = installWxStorage(memory);
  const queue = [];
  const keys = [];
  try {
    wx.withStorageLock = (key, update) => { keys.push(key); return new Promise(resolve => queue.push(() => resolve(update()))); };
    const high = storage.saveBestScore('normal', 100);
    const lower = storage.saveBestScore('normal', 90);
    const other = storage.saveBestScore('easy', 15);
    assert.deepEqual(memory.snapshot().block_puzzle_best_scores_v1, { easy: 10, normal: 20, master: 30 }, 'no mutation before lock entry');
    queue.shift()(); await high;
    queue.shift()(); await lower;
    queue.shift()(); await other;
    assert.deepEqual(memory.snapshot().block_puzzle_best_scores_v1, { easy: 15, normal: 100, master: 30 });
    const reset = storage.resetBestScore('normal');
    assert.equal(memory.snapshot().block_puzzle_best_scores_v1.normal, 100);
    queue.shift()(); await reset;
    assert.equal(memory.snapshot().block_puzzle_best_scores_v1.normal, 0);
    assert.equal(new Set(keys).size, 1, 'save and reset share one lock');
    const state = { score: 10, bestScore: 0, bestScores: { normal: 0 }, activeDifficulty: 'normal', bestScoreEligible: true, startingHighScore: 0, bestScoreGeneration: 1 };
    const manager = new ScoreManager();
    manager.syncBestScore(state);
    assert.equal(state.pendingBestScoreWrites, 1);
    state.bestScoreGeneration++;
    queue.shift()(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(state.bestScore, 0, 'completion from old round cannot rewrite reset/new-round UI');
    assert.equal(state.pendingBestScoreWrites, 0);
  } finally { restore(); }
});
