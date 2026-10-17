import test from 'node:test';
import assert from 'node:assert/strict';

import { toolCountsByDifficulty, versions } from '../fixtures/core-vectors.mjs';
import { loadVersion } from '../helpers/version-adapter.mjs';

// Platform policy, pinned on purpose — the defaults are intentionally different:
// - WeChat verifies admin codes through the backend, so its default auth state
//   carries no admin permission (isAdminAllowed=false, authClient required).
// - The Android private-test APK exposes a local admin entry.
// - The published Web build is built from the same platform code and keeps the
//   same local entry as an explicit published policy, not an accident. The entry
//   disqualifies the round from the official best score (bestScoreEligible=false).
// These are compatibility contracts: changing one is a product decision, not a
// cleanup. See docs/PARITY_AUDIT.md §14 and docs/UNIFIED_SPEC.md §2.5.
const EXPECTED_ADMIN_DEFAULT = { wechat: false, android: true, web: true };
const EXPECTED_DEBUG_CODE_ENABLED = { wechat: true, android: true, web: true };

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
    assert.equal(constants.DEBUG_CODE_ENABLED, EXPECTED_DEBUG_CODE_ENABLED[version]);
    const scores = new ScoreManager();
    assert.equal(scores.getPlacementScore(3), 30);
    assert.equal(scores.getLineScore(1), 100);
    assert.equal(scores.getComboBonus(2), 200);
  });

  test(`${version}: drag tuning matches the documented platform contract`, async () => {
    const { constants } = await loadVersion(version);
    // WeChat uses a larger finger offset; the browser and Android WebView share
    // one smaller offset. Both values are compatibility contracts.
    const expected = version === 'wechat'
      ? { multiplier: 1.5, min: 70, max: 90 }
      : { multiplier: 1.2, min: 48, max: 72 };
    assert.equal(constants.DRAG_FINGER_OFFSET_MULTIPLIER, expected.multiplier);
    assert.equal(constants.DRAG_FINGER_OFFSET_MIN, expected.min);
    assert.equal(constants.DRAG_FINGER_OFFSET_MAX, expected.max);
  });
}
