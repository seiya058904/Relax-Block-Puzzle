import { auditModuleUrl } from '../source-path.mjs';
import assert from 'node:assert/strict';
const { loadVersion } = await import(auditModuleUrl('tests/helpers/version-adapter.mjs'));
const { createMemoryStorage, installWxStorage } = await import(auditModuleUrl('tests/helpers/platform-mocks.mjs'));

const key = 'block_puzzle_best_scores_v1';
const tick = () => new Promise(resolve => setImmediate(resolve));
function queueLocks() {
  const queue = [];
  wx.withStorageLock = (_, update) => new Promise(resolve => queue.push(() => resolve(update())));
  return queue;
}
function place(state, col) {
  state.rackPieces = [{ id: 'audit-single', baseId: 'single', category: 'rescue', isSnake: false,
    bounds: { width: 1, height: 1 }, cells: [{ x: 0, y: 0 }], color: '#abcdef', used: false }];
  state.dragState.activePieceIndex = 0;
  state.previewState = { row: 0, col, canPlace: true, visible: true };
  assert.equal(state.tryPlaceDraggedPiece(), true);
}
for (const version of ['web', 'android']) {
  const { GameState } = await loadVersion(version);
  {
    const memory = createMemoryStorage({ [key]: { easy: 2, normal: 5, master: 3 } });
    const restore = installWxStorage(memory);
    try {
      const state = new GameState();
      const queue = queueLocks();
      state.startNewGame();
      place(state, 0);
      state.confirmReturnHome();
      state.setSettings({ difficulty: 'easy' });
      assert.equal(state.bestScore, 2);
      queue.shift()(); await tick();
      assert.equal(state.activeDifficulty, 'easy');
      assert.equal(memory.snapshot()[key].easy, 2);
      assert.equal(state.bestScore, 10, 'baseline bug: old normal completion overwrites easy UI');
      console.log(`${version} C1 reproduced: return home + easy selected, persisted easy=2, displayed best=${state.bestScore}`);
    } finally { restore(); }
  }
  {
    const memory = createMemoryStorage({ [key]: { easy: 12, normal: 100, master: 30 } });
    const restore = installWxStorage(memory);
    try {
      const state = new GameState();
      const queue = queueLocks();
      const reset = state.confirmResetBestScore();
      assert.equal(state.bestScore, 0);
      state.startNewGame();
      assert.equal(state.bestScore, 100);
      queue.shift()(); await reset; await tick();
      assert.equal(memory.snapshot()[key].normal, 0);
      assert.equal(state.bestScore, 100, 'baseline bug: reset completion never reconciles new game UI');
      place(state, 0);
      queue.shift()(); await tick();
      assert.equal(memory.snapshot()[key].normal, 10);
      assert.equal(state.bestScore, 100);
      console.log(`${version} C2 reproduced: reset then new game, persisted normal=10, displayed best=${state.bestScore}`);
    } finally { restore(); }
  }
}
for (const version of ['wechat', 'web', 'android']) {
  const { GameState } = await loadVersion(version);
  const memory = createMemoryStorage({ [key]: { easy: 12, normal: 100, master: 30 } });
  const restore = installWxStorage(memory);
  try {
    const state = new GameState();
    if (version !== 'wechat') wx.withStorageLock = (_, update) => Promise.resolve().then(update);
    wx.setStorageSync = () => { throw new Error('audit quota failure'); };
    await state.confirmResetBestScore();
    assert.equal(memory.snapshot()[key].normal, 100);
    assert.equal(state.bestScore, 0, 'baseline bug: failed reset falsely updates UI');
    console.log(`${version} C3 reproduced: quota-failed reset, persisted normal=100, displayed best=${state.bestScore}`);
  } finally { restore(); }
}
{
  const { GameState } = await loadVersion('wechat');
  const memory = createMemoryStorage({ [key]: { easy: 0, normal: 0, master: 0 } });
  const restore = installWxStorage(memory);
  try {
    const state = new GameState();
    let finishAdmin;
    state.setAuthClient({ verifyAdmin: () => new Promise(resolve => { finishAdmin = resolve; }) });
    assert.equal(state.openAdminPanel(), true);
    state.setAdminInput('audit-fixture');
    const verify = state.submitAdminCode();
    state.closeAdminPanel();
    state.startNewGame();
    place(state, 0);
    assert.equal(state.undoSnapshot.bestScoreEligible, true);
    finishAdmin({ adminMode: true });
    assert.equal(await verify, true);
    assert.equal(state.bestScoreEligible, false);
    assert.equal(state.isAdminModeActive(), true);
    assert.equal(state.useUndoTool(), true);
    assert.equal(state.bestScoreEligible, true, 'baseline bug: undo reopens official high-score eligibility');
    place(state, 0); place(state, 1);
    assert.equal(memory.snapshot()[key].normal, 20);
    console.log('wechat A1 independently reproduced: delayed verified admin completion + old undo, admin=true eligibility=true, persisted normal=20');
  } finally { restore(); }
}
