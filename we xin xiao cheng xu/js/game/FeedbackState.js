import { QUALITY_PROFILE } from './constants.js';
import { getQualityProfile } from '../config/quality.js';

const QUALITY = getQualityProfile(QUALITY_PROFILE);

export const FEEDBACK_EVENTS = Object.freeze({
  piecePicked: 'piecePicked',
  piecePlaced: 'piecePlaced',
  invalidPlacement: 'invalidPlacement',
  linesCleared: 'linesCleared',
  scoreChanged: 'scoreChanged',
  highScoreBroken: 'highScoreBroken',
  itemUsed: 'itemUsed',
  gameOver: 'gameOver',
  reviveStarted: 'reviveStarted',
  feedbackCleared: 'feedbackCleared'
});

export const FEEDBACK_DURATIONS = Object.freeze({
  clearEffect: 560,
  clearScore: 900,
  scorePulse: 500,
  highScore: 1200,
  dragLift: 200,
  dragSettle: 140,
  dragInvalid: 160
});

export const CLEAR_EFFECT_LIMITS = Object.freeze({
  maxParticles: QUALITY.maxParticles,
  maxStackedEffects: QUALITY.maxStackedEffects
});

function createTimedState(duration) {
  return {
    active: false,
    startedAt: 0,
    duration,
    remaining: 0
  };
}

function createDragState() {
  return {
    active: false,
    phase: 'idle',
    pieceIndex: -1,
    piece: null,
    pointerX: 0,
    pointerY: 0,
    visualX: 0,
    visualY: 0,
    startX: 0,
    startY: 0,
    targetX: 0,
    targetY: 0,
    displayCellSize: 0,
    startedAt: 0,
    duration: 0,
    remaining: 0
  };
}

export function createFeedbackState() {
  return {
    clock: 0,
    clearScore: {
      ...createTimedState(FEEDBACK_DURATIONS.clearScore),
      totalAdded: 0,
      lineClearScore: 0,
      bonusScore: 0,
      clearedLines: 0
    },
    clearEffects: [],
    nextClearEffectId: 1,
    scorePulse: createTimedState(FEEDBACK_DURATIONS.scorePulse),
    highScore: createTimedState(FEEDBACK_DURATIONS.highScore),
    drag: createDragState()
  };
}

function activateTimed(state, clock) {
  state.active = true;
  state.startedAt = clock;
  state.remaining = state.duration;
}

function advanceTimed(state, deltaTime) {
  if (!state.active) {
    return;
  }

  state.remaining = Math.max(0, state.remaining - deltaTime);
  if (state.remaining === 0) {
    state.active = false;
  }
}

function normalizeCells(cells) {
  const unique = new Map();
  (cells || []).forEach((cell) => {
    const row = Number(cell.row);
    const col = Number(cell.col);
    if (!Number.isInteger(row) || !Number.isInteger(col)) {
      return;
    }
    unique.set(`${row}:${col}`, { row, col, ...(cell.axis ? { axis: cell.axis } : {}) });
  });
  return Array.from(unique.values()).sort((a, b) => a.row - b.row || a.col - b.col);
}

function seededUnit(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export function createLineClearParticles(cells, seed = 1, lineCount = 1) {
  const normalized = normalizeCells(cells);
  if (normalized.length === 0) {
    return [];
  }

  const maxParticles = Math.min(
    CLEAR_EFFECT_LIMITS.maxParticles,
    Math.max(12, lineCount * 8, Math.ceil(normalized.length * 1.1))
  );
  const particles = [];

  for (let index = 0; index < maxParticles; index += 1) {
    const cell = normalized[index % normalized.length];
    const particleSeed = seed * 97 + index * 31 + cell.row * 13 + cell.col * 17;
    const direction = cell.axis === 'row' ? 0 : cell.axis === 'col' ? Math.PI / 2 : seededUnit(particleSeed) * Math.PI * 2;
    const spread = (seededUnit(particleSeed + 7) - 0.5) * (cell.axis ? 0.85 : Math.PI * 2);
    const angle = direction + spread;
    const speed = 0.08 + seededUnit(particleSeed + 1) * 0.22;
    const shapeRoll = seededUnit(particleSeed + 6);
    particles.push({
      row: cell.row,
      col: cell.col,
      shape: shapeRoll < 0.62 ? 'dot' : 'spark',
      offsetX: seededUnit(particleSeed + 2) - 0.5,
      offsetY: seededUnit(particleSeed + 3) - 0.5,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed,
      size: 1.2 + seededUnit(particleSeed + 4) * (shapeRoll < 0.62 ? 1.8 : 2.4),
      life: 180 + seededUnit(particleSeed + 5) * 180
    });
  }

  return particles;
}

function createImpact(lineCount) {
  const intensity = Math.max(1, lineCount);
  const capped = Math.min(5, intensity);
  return {
    intensity: capped,
    shakePixels: 0,
    pulseScale: 1,
    duration: 80
  };
}

function createLasers(rows, cols) {
  return [
    ...rows.map((row) => ({ kind: 'row', index: row, origin: 0.5 })),
    ...cols.map((col) => ({ kind: 'col', index: col, origin: 0.5 }))
  ];
}

function createCrossCells(rows, cols, cells) {
  const rowSet = new Set(rows);
  const colSet = new Set(cols);
  return cells.filter((cell) => rowSet.has(cell.row) && colSet.has(cell.col));
}

export function triggerLineClearEffect(state, details) {
  const clearedRows = (details.rows || [])
    .map((row) => Number(row))
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
  const clearedCols = (details.cols || [])
    .map((col) => Number(col))
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
  const cells = normalizeCells(details.cells);
  if (clearedRows.length === 0 && clearedCols.length === 0 && cells.length === 0) {
    return null;
  }

  const id = state.nextClearEffectId;
  state.nextClearEffectId += 1;
  const lineCount = Math.max(1, clearedRows.length + clearedCols.length);
  const crossCells = createCrossCells(clearedRows, clearedCols, cells);
  const particleCells = cells.map((cell) => ({
    ...cell,
    axis: clearedRows.includes(cell.row) && clearedCols.includes(cell.col)
      ? 'cross'
      : clearedRows.includes(cell.row) ? 'row' : 'col'
  }));
  const effect = {
    id,
    startedAt: state.clock,
    duration: FEEDBACK_DURATIONS.clearEffect,
    remaining: FEEDBACK_DURATIONS.clearEffect,
    clearedRows,
    clearedCols,
    cells,
    lineCount,
    axes: { rows: clearedRows.length > 0, cols: clearedCols.length > 0 },
    crossCells,
    particleCells,
    impact: createImpact(lineCount),
    lasers: createLasers(clearedRows, clearedCols),
    particles: createLineClearParticles(particleCells, id, lineCount)
  };

  state.clearEffects.push(effect);
  if (state.clearEffects.length > CLEAR_EFFECT_LIMITS.maxStackedEffects) {
    state.clearEffects.splice(0, state.clearEffects.length - CLEAR_EFFECT_LIMITS.maxStackedEffects);
  }
  return effect;
}

export function getLineClearEffectVisual(effect) {
  if (!effect) {
    return null;
  }

  const duration = effect.duration || FEEDBACK_DURATIONS.clearEffect;
  const elapsed = Math.max(0, Math.min(duration, duration - effect.remaining));
  const progress = duration > 0 ? elapsed / duration : 1;
  let phase = 'erase';
  if (elapsed < 80) {
    phase = 'charge';
  } else if (elapsed < 300) {
    phase = 'laser';
  }
  const smoothstep = (value) => value * value * (3 - 2 * value);
  const chargeProgress = smoothstep(Math.max(0, Math.min(1, elapsed / 120)));
  const laserProgress = Math.max(0, Math.min(1, (elapsed - 80) / 220));
  const fadeIn = smoothstep(Math.max(0, Math.min(1, (elapsed - 60) / 40)));
  const fadeOut = smoothstep(Math.max(0, Math.min(1, (elapsed - 280) / 160)));
  const laserAlpha = fadeIn * (1 - fadeOut);
  const eraseProgress = Math.max(0, Math.min(1, (elapsed - 160) / 320));
  const fadeAlpha = Math.max(0, 1 - eraseProgress);
  const particleAlpha = smoothstep(Math.max(0, Math.min(1, (elapsed - 220) / 80))) * fadeAlpha;
  const impactProgress = smoothstep(Math.max(0, Math.min(1, (elapsed - 145) / 145)));
  const impactAlpha = Math.sin(Math.PI * impactProgress);
  const scoreSyncProgress = smoothstep(Math.max(0, Math.min(1, (elapsed - 120) / 120)));

  return {
    phase,
    progress,
    chargeAlpha: 1 - chargeProgress,
    laserProgress,
    laserAlpha,
    impactProgress,
    impactAlpha,
    scoreSyncProgress,
    shakeX: 0,
    shakeY: 0,
    boardScale: 1 + impactAlpha * Math.min(5, effect.impact?.intensity || 1) * 0.0015,
    highlightAlpha: Math.max((1 - chargeProgress) * 0.5, laserAlpha * 0.34, impactAlpha * 0.22),
    sweepProgress: laserProgress,
    fadeAlpha,
    particleAlpha,
    cellFlashAlpha: Math.max((1 - chargeProgress) * 0.55, impactAlpha * 0.42),
    residualAlpha: smoothstep(Math.max(0, Math.min(1, (elapsed - 260) / 80))) *
      (1 - smoothstep(Math.max(0, Math.min(1, (elapsed - 420) / 140)))),
    cellScale: 1 + (1 - chargeProgress) * 0.035 - eraseProgress * 0.18
  };
}

export function triggerScorePulse(state) {
  activateTimed(state.scorePulse, state.clock);
}

export function triggerClearScore(state, scoreResult) {
  const clearScore = state.clearScore;
  clearScore.totalAdded = Number(scoreResult.totalAdded) || 0;
  clearScore.lineClearScore = Number(scoreResult.lineClearScore) || 0;
  clearScore.bonusScore = Number(scoreResult.bonusScore) || 0;
  clearScore.clearedLines = Number(scoreResult.clearedLines) || 0;
  activateTimed(clearScore, state.clock);
  triggerScorePulse(state);
}

export function triggerHighScore(state) {
  activateTimed(state.highScore, state.clock);
}

export function startDragFeedback(state, details) {
  state.drag = {
    ...createDragState(),
    ...details,
    piece: details.piece ? {
      ...details.piece,
      cells: (details.piece.cells || []).map((cell) => ({ ...cell })),
      bounds: details.piece.bounds ? { ...details.piece.bounds } : null
    } : null,
    active: true,
    phase: 'lifting',
    startedAt: state.clock,
    duration: FEEDBACK_DURATIONS.dragLift,
    remaining: FEEDBACK_DURATIONS.dragLift,
    targetX: Number(details.visualX) || 0,
    targetY: Number(details.visualY) || 0
  };
}

export function updateDragFeedback(state, details) {
  if (!state.drag.active || !['lifting', 'dragging'].includes(state.drag.phase)) {
    return;
  }

  Object.assign(state.drag, details);
  if (Object.prototype.hasOwnProperty.call(details, 'visualX')) {
    state.drag.targetX = details.visualX;
  }
  if (Object.prototype.hasOwnProperty.call(details, 'visualY')) {
    state.drag.targetY = details.visualY;
  }
}

export function releaseDragFeedback(state, phase, target = {}) {
  if (!state.drag.active) {
    return;
  }

  const duration = phase === 'settling'
    ? FEEDBACK_DURATIONS.dragSettle
    : FEEDBACK_DURATIONS.dragInvalid;
  state.drag.phase = phase;
  state.drag.startedAt = state.clock;
  state.drag.duration = duration;
  state.drag.remaining = duration;
  state.drag.startX = state.drag.visualX;
  state.drag.startY = state.drag.visualY;
  state.drag.targetX = Object.prototype.hasOwnProperty.call(target, 'targetX')
    ? target.targetX
    : state.drag.targetX;
  state.drag.targetY = Object.prototype.hasOwnProperty.call(target, 'targetY')
    ? target.targetY
    : state.drag.targetY;
}

export function clearDragFeedback(state) {
  state.drag = createDragState();
}

export function clearFeedbackState(state) {
  const fresh = createFeedbackState();
  Object.keys(state).forEach((key) => {
    delete state[key];
  });
  Object.assign(state, fresh);
}

export function advanceFeedbackState(state, deltaTime) {
  const safeDelta = Math.max(0, Number(deltaTime) || 0);
  state.clock += safeDelta;
  advanceTimed(state.clearScore, safeDelta);
  advanceTimed(state.scorePulse, safeDelta);
  advanceTimed(state.highScore, safeDelta);
  state.clearEffects = (state.clearEffects || [])
    .map((effect) => ({
      ...effect,
      remaining: Math.max(0, effect.remaining - safeDelta)
    }))
    .filter((effect) => effect.remaining > 0);

  const drag = state.drag;
  if (!drag.active) {
    return;
  }

  drag.remaining = Math.max(0, drag.remaining - safeDelta);
  if (drag.remaining > 0) {
    return;
  }

  if (drag.phase === 'lifting') {
    drag.phase = 'dragging';
    drag.startedAt = state.clock;
    drag.duration = 0;
    drag.remaining = 0;
    return;
  }

  if (drag.phase === 'settling' || drag.phase === 'invalid') {
    clearDragFeedback(state);
  }
}

export function hasActiveFeedback(state) {
  return !!(
    state &&
    (state.clearScore.active ||
      (state.clearEffects && state.clearEffects.length > 0) ||
      state.scorePulse.active ||
      state.highScore.active ||
      state.drag.active)
  );
}

export function getClearFeedbackLabel(clearedLines) {
  if (clearedLines === 1) return '清除 1 线';
  if (clearedLines === 2) return '双线消除';
  if (clearedLines === 3) return '三线消除';
  return `清除 ${clearedLines} 线`;
}
function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

export function getDragVisual(drag) {
  if (!drag || !drag.active) {
    return null;
  }

  if (drag.phase === 'lifting') {
    const progress = drag.duration > 0
      ? 1 - drag.remaining / drag.duration
      : 1;
    const eased = easeOutCubic(Math.max(0, Math.min(1, progress)));
    return {
      x: drag.startX + (drag.visualX - drag.startX) * eased,
      y: drag.startY + (drag.visualY - drag.startY) * eased,
      scale: 1 + 0.08 * eased,
      alpha: 1
    };
  }

  if (drag.phase === 'invalid' || drag.phase === 'settling') {
    const progress = drag.duration > 0
      ? 1 - drag.remaining / drag.duration
      : 1;
    const eased = easeOutCubic(Math.max(0, Math.min(1, progress)));
    return {
      x: drag.startX + (drag.targetX - drag.startX) * eased,
      y: drag.startY + (drag.targetY - drag.startY) * eased,
      scale: 1.08 - 0.08 * eased,
      alpha: drag.phase === 'settling' ? 1 - eased : 1
    };
  }

  return {
    x: drag.visualX,
    y: drag.visualY,
    scale: 1.08,
    alpha: 1
  };
}
