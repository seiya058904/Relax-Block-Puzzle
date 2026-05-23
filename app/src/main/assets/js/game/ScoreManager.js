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
    const points = this.getPlacementScore(cellCount);
    state.score += points;
    this.syncBestScore(state);
    return points;
  }

  applyLineClear(state, lineCount) {
    const lineScore = this.getLineScore(lineCount);
    const comboBonus = this.getComboBonus(lineCount);
    state.score += lineScore + comboBonus;
    this.syncBestScore(state);
    return {
      lineScore,
      comboBonus,
      total: lineScore + comboBonus
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
