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
    const result = saveBestScore(difficulty, state.score);
    if (!result) return;
    // An external higher record changes the threshold; our own earlier writes
    // must not turn a first-ever game into a new-record celebration.
    if (result.previous > state.bestScore) {
      state.startingHighScore = Math.max(state.startingHighScore || 0, result.previous);
    }
    state.bestScore = Math.max(state.bestScore, result.score);
    state.bestScores = {
      ...state.bestScores,
      [difficulty]: state.bestScore
    };
  }
}
