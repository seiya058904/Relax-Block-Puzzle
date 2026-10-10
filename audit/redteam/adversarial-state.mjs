import { auditSourceRoot } from '../source-path.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.env.REDTEAM_SOURCE_ROOT || auditSourceRoot;
const { loadVersion } = await import(pathToFileURL(path.join(root, 'tests/helpers/version-adapter.mjs')).href);
const { createMemoryStorage, installWxStorage } = await import(pathToFileURL(path.join(root, 'tests/helpers/platform-mocks.mjs')).href);
const key = 'block_puzzle_best_scores_v1';
const records = [];
const tick = () => new Promise(resolve => setImmediate(resolve));
const layout = {cellSize: 30, boardRect: {x: 20, y: 100, width: 300, height: 300}};

async function check(version, name, run, initial = {easy: 200, normal: 100, master: 300}) {
  const memory = createMemoryStorage({[key]: initial});
  const restore = installWxStorage(memory);
  try {
    const { GameState } = await loadVersion(version);
    const state = new GameState();
    state.setLayout(layout);
    await run({state, memory});
    records.push({version, name, pass: true});
  } catch (error) {
    records.push({version, name, pass: false, actual: error.actual, expected: error.expected, error: error.message});
  } finally {restore();}
}

function play(state) {
  for (let index = 0; index < state.rackPieces.length; index++) {
    const piece = state.rackPieces[index];
    if (piece.used) continue;
    for (let row = 0; row < state.board.size; row++) for (let col = 0; col < state.board.size; col++) {
      if (!state.board.canPlace(piece.cells, row, col)) continue;
      const area = {x: 40 + index * 80, y: 450, width: 60, height: 60, cellSize: 20};
      assert.equal(state.startDrag(index, area.x + 30, area.y + 30, area), true);
      const display = layout.cellSize * .96;
      state.moveDrag(layout.boardRect.x + col * layout.cellSize + piece.bounds.width * display / 2,
        layout.boardRect.y + row * layout.cellSize + piece.bounds.height * display + state.getDragFingerOffsetY());
      assert.equal(state.endDrag(), true);
      state.update(260);
      return state.score;
    }
  }
  assert.fail('Generated rack unexpectedly has no legal placement');
}

function deferredAuth(state) {
  const requests = [];
  state.setAuthClient({verifyAdmin: () => new Promise((resolve, reject) => requests.push({resolve, reject}))});
  assert.equal(state.openAdminPanel(), true);
  state.setAdminInput('fixture-local-only');
  return requests;
}

function holdLocks() {
  const queue = [];
  wx.withStorageLock = (_, update) => new Promise(resolve => queue.push(() => resolve(update())));
  return queue;
}

for (const outcome of ['success', 'denied', 'rejected']) {
  await check('wechat', `current admin request ${outcome} preserves valid behavior`, async ({state}) => {
    const req = deferredAuth(state);
    const pending = state.submitAdminCode();
    if (outcome === 'rejected') req[0].reject(new Error('fixture'));
    else req[0].resolve({adminMode: outcome === 'success'});
    assert.equal(await pending, outcome === 'success');
    assert.equal(state.isAdminModeActive(), outcome === 'success');
    assert.equal(state.ui.isAdminPanelOpen, outcome !== 'success');
    assert.equal(state.adminError, outcome === 'success' ? '' : '验证失败');
  });
}

for (const oldOutcome of ['success', 'denied', 'rejected']) {
  await check('wechat', `cancel and reopen isolates old ${oldOutcome}`, async ({state}) => {
    const req = deferredAuth(state);
    const old = state.submitAdminCode();
    state.closeAdminPanel();
    assert.equal(state.openAdminPanel(), true);
    state.setAdminInput('new-panel-input');
    const uiBefore = {input: state.adminInput, error: state.adminError, allowed: state.authState.isAdminAllowed};
    if (oldOutcome === 'rejected') req[0].reject(new Error('fixture'));
    else req[0].resolve({adminMode: oldOutcome === 'success'});
    assert.equal(await old, false);
    assert.equal(state.isAdminModeActive(), false);
    assert.equal(state.ui.isAdminPanelOpen, true);
    assert.deepEqual({input: state.adminInput, error: state.adminError, allowed: state.authState.isAdminAllowed}, uiBefore);
  });
}

for (const order of ['old-first', 'new-first']) {
  await check('wechat', `latest denied request dominates older success (${order})`, async ({state}) => {
    const req = deferredAuth(state);
    const old = state.submitAdminCode();
    const current = state.submitAdminCode();
    if (order === 'old-first') {
      req[0].resolve({adminMode: true});
      assert.equal(await old, false);
      assert.equal(state.isAdminModeActive(), false);
      req[1].resolve({adminMode: false}); await current;
    } else {
      req[1].resolve({adminMode: false}); await current;
      req[0].resolve({adminMode: true}); assert.equal(await old, false);
    }
    assert.equal(state.isAdminModeActive(), false);
    assert.equal(state.ui.isAdminPanelOpen, true);
    assert.equal(state.adminError, '验证失败');
  });
}

await check('wechat', 'blank new submission supersedes pending success', async ({state}) => {
  const req = deferredAuth(state);
  const old = state.submitAdminCode();
  state.setAdminInput('');
  assert.equal(await state.submitAdminCode(), false);
  req[0].resolve({adminMode: true});
  assert.equal(await old, false);
  assert.equal(state.isAdminModeActive(), false);
  assert.equal(state.adminError, '验证失败');
});

await check('wechat', 'cancelled administrator response leaves subsequent normal gameplay and undo eligible', async ({state, memory}) => {
  const req = deferredAuth(state);
  const old = state.submitAdminCode();
  state.closeAdminPanel(); state.startNewGame(); play(state);
  req[0].resolve({adminMode: true});
  assert.equal(await old, false);
  assert.equal(state.bestScoreEligible, true);
  assert.equal(state.useUndoTool(), true);
  const earned = play(state);
  assert.equal(state.isAdminModeActive(), false);
  assert.equal(state.bestScoreEligible, true);
  assert.equal(memory.snapshot()[key].normal, earned);
}, {easy: 0, normal: 0, master: 0});

for (const version of ['wechat', 'web', 'android']) {
  await check(version, 'completed admin round remains ineligible after disable and undo; next normal round qualifies', async ({state, memory}) => {
    // This is the ordinary valid admin-at-home entry, not mid-round state corruption.
    state.applyAuthState({isAdminAllowed: true}); state.enableAdminMode(); state.startNewGame();
    play(state);
    state.openSettings(); state.disableAdminMode(); state.closeSettings();
    state.update(300);
    assert.equal(state.useUndoTool(), true);
    assert.equal(state.bestScoreEligible, false);
    play(state); play(state);
    assert.equal(memory.snapshot()[key].normal, 0);
    state.openPause(); state.confirmReturnHome(); state.startNewGame();
    const normal = play(state);
    assert.equal(state.bestScoreEligible, true);
    assert.equal(memory.snapshot()[key].normal, normal);
  }, {easy: 0, normal: 0, master: 0});

  await check(version, 'failed reset preserves trusted unrelated records and later retry works', async ({state, memory}) => {
    if (version !== 'wechat') wx.withStorageLock = (_, fn) => Promise.resolve().then(fn);
    const originalSet = wx.setStorageSync;
    wx.setStorageSync = () => { throw new Error('quota fixture'); };
    state.openSettings(); state.requestResetBestScore();
    await state.confirmResetBestScore();
    assert.equal(state.bestScore, 100);
    assert.deepEqual(state.bestScores, {easy: 200, normal: 100, master: 300});
    wx.setStorageSync = originalSet;
    state.requestResetBestScore(); await state.confirmResetBestScore();
    assert.deepEqual(memory.snapshot()[key], {easy: 200, normal: 0, master: 300});
    assert.deepEqual(state.bestScores, memory.snapshot()[key]);
    assert.equal(state.startingHighScore, 0);
  });
}

for (const version of ['web', 'android']) {
  await check(version, 'reset of next difficulty cannot turn the current first round own save into an external record', async ({state, memory}) => {
    const queue = holdLocks();
    state.startNewGame(); play(state);
    state.openSettings(); state.setSettings({difficulty: 'easy'}); state.requestResetBestScore();
    const reset = state.confirmResetBestScore();
    queue.shift()(); await tick();
    queue.shift()(); await reset; await tick();
    assert.equal(state.activeDifficulty, 'normal');
    assert.equal(state.startingHighScore, 0, 'clearing easy must retain first-ever normal-round feedback semantics');
    state.closeSettings(); state.update(300); const earned = play(state);
    queue.shift()(); await tick();
    assert.equal(state.hasShownNewRecord, false);
    assert.deepEqual(memory.snapshot()[key], {easy: 0, normal: earned, master: 30});
  }, {easy: 12, normal: 0, master: 30});

  await check(version, 'pending reset completed after switching and starting another difficulty keeps its own score', async ({state, memory}) => {
    const queue = holdLocks();
    state.openSettings(); state.requestResetBestScore();
    const reset = state.confirmResetBestScore();
    state.setSettings({difficulty: 'easy'}); state.closeSettings(); state.startNewGame();
    const earned = play(state);
    queue.shift()(); await reset; await tick();
    assert.equal(state.activeDifficulty, 'easy');
    assert.equal(state.bestScore, 200);
    queue.shift()(); await tick();
    assert.equal(state.bestScore, Math.max(200, earned));
    assert.deepEqual(memory.snapshot()[key], {easy: Math.max(200, earned), normal: 0, master: 300});
    assert.equal(state.pendingBestScoreWrites, 0);
  });

  await check(version, 'new round score queued after successful reset must become its new record', async ({state, memory}) => {
    const queue = holdLocks();
    state.openSettings(); state.requestResetBestScore();
    const reset = state.confirmResetBestScore();
    state.closeSettings(); state.startNewGame();
    const earned = play(state);
    queue.shift()(); await reset; await tick();
    assert.equal(state.bestScore, 0);
    queue.shift()(); await tick();
    assert.equal(state.bestScore, earned);
    assert.equal(state.startingHighScore, 0);
    assert.equal(state.hasShownNewRecord, false);
    assert.equal(memory.snapshot()[key].normal, earned);
  });

  await check(version, 'old save on return-home cannot rewrite another difficulty even when lock completes last', async ({state, memory}) => {
    const queue = holdLocks();
    state.startNewGame(); const earned = play(state);
    state.openPause(); state.requestReturnHome(); state.confirmReturnHome();
    state.setSettings({difficulty: 'master'});
    queue.shift()(); await tick();
    assert.equal(state.bestScore, 3);
    assert.equal(state.activeDifficulty, 'master');
    assert.equal(memory.snapshot()[key].normal, earned);
    assert.equal(state.pendingBestScoreWrites, 0);
  }, {easy: 200, normal: 0, master: 3});
}

records.forEach(record => console.log(JSON.stringify(record)));
console.log(JSON.stringify({summary: true, root, total: records.length, passed: records.filter(r => r.pass).length, failed: records.filter(r => !r.pass).length}));
if (records.some(r => !r.pass)) process.exitCode = 1;
