import { BEST_SCORES_KEY, LEGACY_BEST_SCORE_KEY } from '../game/constants.js';

export const SETTINGS_KEY = 'block_puzzle_settings_v1';

export const DEFAULT_SETTINGS = {
  soundEnabled: true,
  bgmEnabled: false,
  vibrationEnabled: true,
  bgmTrack: 2,
  difficulty: 'normal',
  localMembershipEnabled: false
};

export const DEFAULT_BEST_SCORES = {
  easy: 0,
  normal: 0,
  master: 0
};

export function normalizeDifficulty(difficulty) {
  return ['easy', 'normal', 'master'].indexOf(difficulty) >= 0 ? difficulty : 'normal';
}

function sanitizeBestScores(value) {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_BEST_SCORES };
  }

  return {
    easy: Number.isFinite(value.easy) ? value.easy : 0,
    normal: Number.isFinite(value.normal) ? value.normal : 0,
    master: Number.isFinite(value.master) ? value.master : 0
  };
}

export function loadBestScores() {
  try {
    const stored = wx.getStorageSync(BEST_SCORES_KEY);
    if (stored && typeof stored === 'object') {
      return sanitizeBestScores(stored);
    }
  } catch (error) {
    // Ignore and fall back to legacy migration.
  }

  const migrated = { ...DEFAULT_BEST_SCORES };

  try {
    const legacy = wx.getStorageSync(LEGACY_BEST_SCORE_KEY);
    if (Number.isFinite(legacy) && legacy > 0) {
      migrated.normal = legacy;
    }
  } catch (error) {
    // Ignore legacy storage failures.
  }

  try {
    wx.setStorageSync(BEST_SCORES_KEY, migrated);
  } catch (error) {
    // Ignore storage failures so the local game keeps running.
  }

  return migrated;
}

export function saveBestScores(bestScores) {
  try {
    wx.setStorageSync(BEST_SCORES_KEY, sanitizeBestScores(bestScores));
  } catch (error) {
    // Ignore storage failures so the local game keeps running.
  }
}

export function loadBestScore(difficulty = 'normal') {
  const bestScores = loadBestScores();
  return bestScores[normalizeDifficulty(difficulty)] || 0;
}

export function saveBestScore(difficulty, score) {
  const bestScores = loadBestScores();
  bestScores[normalizeDifficulty(difficulty)] = Number.isFinite(score) ? score : 0;
  saveBestScores(bestScores);
}

export function resetBestScore(difficulty = 'normal') {
  const bestScores = loadBestScores();
  bestScores[normalizeDifficulty(difficulty)] = 0;
  saveBestScores(bestScores);
}

export function loadSettings() {
  try {
    const value = wx.getStorageSync(SETTINGS_KEY);
    if (!value || typeof value !== 'object') {
      return { ...DEFAULT_SETTINGS };
    }
    return {
      ...DEFAULT_SETTINGS,
      ...value,
      difficulty: normalizeDifficulty(value.difficulty),
      localMembershipEnabled: !!value.localMembershipEnabled
    };
  } catch (error) {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    wx.setStorageSync(SETTINGS_KEY, {
      ...DEFAULT_SETTINGS,
      ...settings,
      difficulty: normalizeDifficulty(settings.difficulty),
      localMembershipEnabled: !!settings.localMembershipEnabled
    });
  } catch (error) {
    // Ignore storage failures so the local game keeps running.
  }
}
