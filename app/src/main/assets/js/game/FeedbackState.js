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
  clearScore: 900,
  scorePulse: 500,
  highScore: 1200,
  dragLift: 200,
  dragSettle: 140,
  dragInvalid: 160
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
