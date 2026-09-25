import test from 'node:test';
import assert from 'node:assert/strict';

import { loadVersion } from '../helpers/version-adapter.mjs';
import { withRandomSequence } from '../helpers/platform-mocks.mjs';

// Rack history is runtime state shared by all three targets; web must be
// exercised directly instead of relying on file identity with android.
const versions = ['wechat', 'android', 'web'];

function makeSequence(length, seed) {
  const values = new Array(length);
  let value = seed >>> 0;
  for (let index = 0; index < length; index += 1) {
    value = (value * 1664525 + 1013904223) >>> 0;
    values[index] = value / 4294967296;
  }
  return values;
}

function currentRackBaseIds(state) {
  return state.rackPieces.map((piece) => piece.baseId);
}

// The rack history must always reference the CURRENT rack; revive replaces
// the rack, so all three versions must re-point the history at it.
for (const version of versions) {
  test(`${version}: consumeRevive re-points rack history at the regenerated rack`, async () => {
    const { GameState } = await loadVersion(version);
    const state = new GameState();
    state.startNewGame();

    const beforeRack = currentRackBaseIds(state).join('|');
    // Simulate a stale history that differs from the upcoming revive rack.
    state.recentRackBaseIds = ['line5', 'cross5', 'square3'];
    state.reviveCount = 2;

    let revived = false;
    await withRandomSequence(makeSequence(400, 9152), () => {
      revived = state.consumeRevive();
    });

    assert.equal(revived, true, 'revive should succeed with remaining charges');
    assert.deepEqual(
      state.recentRackBaseIds,
      currentRackBaseIds(state),
      'revive must update the history to the regenerated rack'
    );
    assert.notEqual(
      state.recentRackBaseIds.join('|'),
      'line5|cross5|square3',
      'stale history must not survive a revive'
    );
    assert.equal(state.reviveUsedCount, 1);
    assert.notEqual(beforeRack, '');
  });

  test(`${version}: undo restores the rack history saved with the snapshot`, async () => {
    const { GameState } = await loadVersion(version);
    const state = new GameState();
    state.startNewGame();

    const historyAtSnapshot = ['single', 'line2', 'l3'];
    state.recentRackBaseIds = historyAtSnapshot.slice();
    state.undoSnapshot = state.createUndoSnapshot();

    // A later generation rewrites the history (auto-refill or refresh).
    const rackAfterRefill = ['line4', 't4', 'z'];
    state.recentRackBaseIds = rackAfterRefill.slice();
    state.rackPieces[0].used = true;

    const undone = state.useUndoTool();
    assert.equal(undone, true, 'undo should apply with a fresh snapshot');
    assert.equal(state.rackPieces[0].used, false, 'undo restores the earlier rack');
    assert.deepEqual(
      state.recentRackBaseIds,
      historyAtSnapshot,
      'undo must restore the history captured with the snapshot'
    );
    assert.notDeepEqual(state.recentRackBaseIds, rackAfterRefill);
  });
}
