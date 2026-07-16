import test from 'node:test';
import assert from 'node:assert/strict';

import { lineScoreVectors, scoreVectors, versions } from '../fixtures/core-vectors.mjs';
import { loadVersion } from '../helpers/version-adapter.mjs';
import { createMemoryStorage, installWxStorage } from '../helpers/platform-mocks.mjs';

const SCORE_RESULT_KEYS = [
  'placementScore',
  'lineClearScore',
  'bonusScore',
  'totalAdded',
  'clearedLines'
];

function createState(bestScoreEligible = true) {
  return {
    score: 0,
    bestScore: 0,
    bestScores: { easy: 0, normal: 0, master: 0 },
    activeDifficulty: 'normal',
    bestScoreEligible
  };
}

function assertUnifiedScoreResult(result) {
  assert.deepEqual(Object.keys(result), SCORE_RESULT_KEYS);
  for (const key of SCORE_RESULT_KEYS) {
    assert.equal(typeof result[key], 'number', `${key} must be a number`);
    assert.equal(Number.isFinite(result[key]), true, `${key} must be finite`);
  }
  assert.equal(
    result.totalAdded,
    result.placementScore + result.lineClearScore + result.bonusScore
  );
}

for (const version of versions) {
  test(`${version}: placement and line formulas match the frozen values`, async () => {
    const { ScoreManager } = await loadVersion(version);
    const manager = new ScoreManager();
    for (const vector of scoreVectors) assert.equal(manager.getPlacementScore(vector.cells), vector.placement);
    for (const vector of lineScoreVectors) {
      assert.equal(manager.getLineScore(vector.lines), vector.lineScore);
      assert.equal(manager.getComboBonus(vector.lines), vector.bonus);
    }
  });

  test(`${version}: placement returns the unified score result without changing its value`, async () => {
    const storage = createMemoryStorage();
    const restore = installWxStorage(storage);
    try {
      const { ScoreManager } = await loadVersion(version);
      const state = createState();
      const result = new ScoreManager().applyPlacement(state, 3);
      assert.equal(state.score, 30);
      assertUnifiedScoreResult(result);
      assert.deepEqual(result, {
        placementScore: 30,
        lineClearScore: 0,
        bonusScore: 0,
        totalAdded: 30,
        clearedLines: 0
      });
    } finally {
      restore();
    }
  });

  test(`${version}: every line-clear vector returns the unified score result`, async () => {
    const storage = createMemoryStorage();
    const restore = installWxStorage(storage);
    try {
      const { ScoreManager } = await loadVersion(version);
      const manager = new ScoreManager();
      for (const vector of lineScoreVectors) {
        const state = createState();
        const result = manager.applyLineClear(state, vector.lines);
        assert.equal(state.score, vector.total);
        assertUnifiedScoreResult(result);
        assert.deepEqual(result, {
          placementScore: 0,
          lineClearScore: vector.lineScore,
          bonusScore: vector.bonus,
          totalAdded: vector.total,
          clearedLines: vector.lines
        });
      }
    } finally {
      restore();
    }
  });

  test(`${version}: updates only a higher eligible best score`, async () => {
    const storage = createMemoryStorage();
    const restore = installWxStorage(storage);
    try {
      const { ScoreManager } = await loadVersion(version);
      let syncCount = 0;
      class CountingScoreManager extends ScoreManager {
        syncBestScore(state) {
          syncCount += 1;
          return super.syncBestScore(state);
        }
      }
      const manager = new CountingScoreManager();
      const state = createState();
      state.bestScore = 20;
      state.bestScores.normal = 20;
      manager.applyPlacement(state, 3);
      assert.equal(state.bestScore, 30);
      assert.equal(storage.snapshot().block_puzzle_best_scores_v1.normal, 30);
      assert.equal(syncCount, 1, 'one scoring call must evaluate the best score once');
      state.score = 5;
      manager.syncBestScore(state);
      assert.equal(state.bestScore, 30);
      assert.equal(syncCount, 2);
    } finally {
      restore();
    }
  });

  test(`${version}: administrator-ineligible scores never update official best scores`, async () => {
    const storage = createMemoryStorage({
      block_puzzle_best_scores_v1: { easy: 4, normal: 25, master: 6 }
    });
    const restore = installWxStorage(storage);
    try {
      const { ScoreManager } = await loadVersion(version);
      const state = createState(false);
      state.score = 1000;
      state.bestScore = 25;
      state.bestScores.normal = 25;
      new ScoreManager().syncBestScore(state);
      assert.equal(state.bestScore, 25);
      assert.equal(storage.snapshot().block_puzzle_best_scores_v1.normal, 25);
    } finally {
      restore();
    }
  });
}

test('both versions return deeply equal production score results for the same vectors', async () => {
  const modules = await Promise.all(versions.map(loadVersion));
  const storage = createMemoryStorage();
  const restore = installWxStorage(storage);
  try {
    for (const vector of lineScoreVectors) {
      const results = modules.map(({ ScoreManager }) => {
        const state = createState();
        const manager = new ScoreManager();
        const placement = manager.applyPlacement(state, 4);
        const lineClear = manager.applyLineClear(state, vector.lines);
        return { placement, lineClear, score: state.score };
      });
      assert.deepEqual(results[0], results[1]);
      assert.equal(results[0].score, 40 + vector.total);
      assert.equal(results[0].placement.totalAdded + results[0].lineClear.totalAdded, results[0].score);
    }
  } finally {
    restore();
  }
});
