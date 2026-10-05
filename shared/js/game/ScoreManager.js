import { saveBestScore } from '../utils/storage.js';

export default class ScoreManager {
  getPlacementScore(cellCount) {
    return cellCount * 10;
  }

  getLineScore(lineCount) {
    return lineCount * 100;
  }

  getComboBonus(lineCount) {
    return lineCount * lineCount * 50;
  }

  applyPlacement(state, cellCount) {
    const placementScore = this.getPlacementScore(cellCount);
    state.score += placementScore;
    this.syncBestScore(state);
    return {
      placementScore,
      lineClearScore: 0,
      bonusScore: 0,
      totalAdded: placementScore,
      clearedLines: 0
    };
  }

  applyLineClear(state, lineCount) {
    const lineClearScore = this.getLineScore(lineCount);
    const bonusScore = this.getComboBonus(lineCount);
    const totalAdded = lineClearScore + bonusScore;
    state.score += totalAdded;
    this.syncBestScore(state);
    return {
      placementScore: 0,
      lineClearScore,
      bonusScore,
      totalAdded,
      clearedLines: lineCount
    };
  }

  syncBestScore(state) {
    if (!state.bestScoreEligible) {
      return;
    }

    const difficulty = state.activeDifficulty || 'normal';
    const generation = state.bestScoreGeneration || 0;
    const result = saveBestScore(difficulty, state.score);
    const apply = (saved) => {
      if (!saved || generation !== (state.bestScoreGeneration || 0)) return;
      // An external higher record changes the threshold; our own earlier writes
      // must not turn a first-ever game into a new-record celebration.
      if (saved.previous > state.bestScore) {
        state.startingHighScore = Math.max(state.startingHighScore || 0, saved.previous);
      }
      state.bestScore = Math.max(state.bestScore, saved.score);
      state.bestScores = {
        ...state.bestScores,
        [difficulty]: state.bestScore
      };
    };
    if (result?.then) {
      state.pendingBestScoreWrites = (state.pendingBestScoreWrites || 0) + 1;
      result.then(apply).finally(() => {
        state.pendingBestScoreWrites--;
        if (generation === (state.bestScoreGeneration || 0)) state.checkNewRecord?.();
        state.onBestScoreUpdated?.();
      });
    } else apply(result);
  }
}
