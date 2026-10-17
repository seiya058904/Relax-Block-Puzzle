import test from 'node:test';
import assert from 'node:assert/strict';

import { toolCountsByDifficulty, versions } from '../fixtures/core-vectors.mjs';
import { loadVersion } from '../helpers/version-adapter.mjs';

// Platform policy, pinned on purpose:
// - WeChat verifies admin codes through the backend, so its default auth state
//   carries no admin permission.
// - The offline Web and Android builds expose a local admin entry, which is an
//   intentional product decision documented in docs/PARITY_AUDIT.md §4.14. The
//   entry still disqualifies the round from the official best score.
// Changing any of these defaults must be a deliberate, reviewable edit.
const EXPECTED_ADMIN_DEFAULT = { wechat: false, android: true, web: true };

for (const version of versions) {
  test(`${version}: default auth state matches the documented admin policy`, async () => {
    const { GameState } = await loadVersion(version);
    const state = new GameState();
    assert.equal(state.authState.isAdminAllowed, EXPECTED_ADMIN_DEFAULT[version]);
    assert.equal(state.adminModeEnabled, false);
    assert.equal(state.bestScoreEligible, true);
  });

  test(`${version}: default tool counts match the shared difficulty contract`, async () => {
    const { GameState } = await loadVersion(version);
    for (const difficulty of ['easy', 'normal', 'master']) {
      const state = new GameState();
      state.setSettings({ ...state.settings, difficulty });
      assert.deepEqual(
        {
          refreshCount: state.toolState.refreshCount,
          clearCount: state.toolState.clearCount,
          undoCount: state.toolState.undoCount
        },
        toolCountsByDifficulty[difficulty],
        `${version}/${difficulty}`
      );
    }
  });

  test(`${version}: storage keys and score constants stay the shared contract`, async () => {
    const { constants, ScoreManager } = await loadVersion(version);
    assert.equal(constants.BOARD_SIZE, 10);
    assert.equal(constants.RACK_SIZE, 3);
    assert.equal(constants.BEST_SCORES_KEY, 'block_puzzle_best_scores_v1');
    assert.equal(constants.LEGACY_BEST_SCORE_KEY, 'block_puzzle_best_score_v1');
    assert.equal(constants.CLEAR_ANIMATION_MS, 180);
    const scores = new ScoreManager();
    assert.equal(scores.getPlacementScore(3), 30);
    assert.equal(scores.getLineScore(1), 100);
    assert.equal(scores.getComboBonus(2), 200);
  });
}
