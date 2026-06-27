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
    if (state.score > state.bestScore) {
      state.bestScore = state.score;
      state.bestScores = {
        ...state.bestScores,
        [difficulty]: state.score
      };
      saveBestScore(difficulty, state.score);
    }
  }
}
