// Presentation math and cues only. Never writes gameplay or persistent state.
export function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function easeOut(value) {
  return 1 - Math.pow(1 - clamp01(value), 3);
}

export function getDragPose(drag, reducedMotion = false) {
  if (!drag || !drag.active) return null;
  const progress = drag.duration > 0 ? clamp01(1 - drag.remaining / drag.duration) : 1;
  const eased = reducedMotion ? 1 : easeOut(progress);
  const originScale = drag.originCellSize > 0 ? drag.originCellSize / drag.displayCellSize : 1;
  if (drag.phase === 'lifting') {
    return {
      x: drag.startX + (drag.visualX - drag.startX) * eased,
      y: drag.startY + (drag.visualY - drag.startY) * eased,
      scale: originScale + (1.08 - originScale) * eased,
      alpha: 1,
      elevation: eased
    };
  }
  if (drag.phase === 'invalid' || drag.phase === 'settling') {
    const targetScale = drag.targetCellSize > 0 ? drag.targetCellSize / drag.displayCellSize : 1;
    return {
      x: drag.startX + (drag.targetX - drag.startX) * eased,
      y: drag.startY + (drag.targetY - drag.startY) * eased,
      scale: (drag.releaseScale || 1.08) + (targetScale - (drag.releaseScale || 1.08)) * eased,
      alpha: 1,
      elevation: (drag.releaseElevation ?? 1) * (1 - eased)
    };
  }
  return { x: drag.visualX, y: drag.visualY, scale: 1.08, alpha: 1, elevation: 1 };
}

export function getClearCellVisual(effect, cell, reducedMotion = false) {
  const elapsed = Math.max(0, effect.duration - effect.remaining);
  const rowIndex = effect.clearedRows.indexOf(cell.row);
  const colIndex = effect.clearedCols.indexOf(cell.col);
  // Both axes travel outward from the placed piece. The intersection clears once.
  const origin = effect.origin || { row: 4.5, col: 4.5 };
  const rowDelay = rowIndex >= 0 ? Math.abs(cell.col - origin.col) * 13 + rowIndex * 18 : Infinity;
  const colDelay = colIndex >= 0 ? Math.abs(cell.row - origin.row) * 13 + colIndex * 18 : Infinity;
  const delay = reducedMotion ? 0 : Math.min(150, rowDelay, colDelay);
  const progress = clamp01((elapsed - 100 - delay) / 240);
  const eased = easeOut(progress);
  return {
    alpha: 1 - eased,
    scale: reducedMotion ? 1 : 1 - eased * 0.24,
    highlight: Math.sin(Math.PI * clamp01((elapsed - delay) / 180)) * (1 - eased),
    offsetX: reducedMotion || rowIndex < 0 ? 0 : Math.sign(cell.col - origin.col) * eased * 0.12,
    offsetY: reducedMotion || colIndex < 0 ? 0 : Math.sign(cell.row - origin.row) * eased * 0.12
  };
}

export function getActionVisual(action, index = 0, reducedMotion = false) {
  if (!action || !action.active) return null;
  const elapsed = action.duration - action.remaining;
  const progress = clamp01((elapsed - (reducedMotion ? 0 : index * 24)) / Math.max(1, action.duration - 48));
  const eased = easeOut(progress);
  return {
    alpha: action.kind === 'clear' ? 1 - eased : 0.5 + eased * 0.5,
    scale: reducedMotion ? 1 : action.kind === 'clear' ? 1 - eased * 0.2 : 0.94 + eased * 0.06,
    offsetY: reducedMotion ? 0 : (action.kind === 'undo' ? -1 : 1) * 7 * (1 - eased),
    strength: Math.sin(Math.PI * progress)
  };
}

export function getDisplayedScore(score, gain) {
  if (!gain || !gain.active) return score;
  const progress = gain.duration > 0 ? 1 - gain.remaining / gain.duration : 1;
  return Math.round(gain.from + (gain.to - gain.from) * easeOut(progress));
}

export function getFeedbackCue(event) {
  const cues = {
    pickup: { sound: 'playPickup', vibration: null },
    place: { sound: 'playPlace', vibration: 'light' },
    invalid: { sound: 'playInvalid', vibration: 'light' },
    clear: { sound: 'playClear', vibration: 'medium' },
    combo: { sound: 'playCombo', vibration: 'medium' },
    combo3: { sound: 'playCombo3', vibration: 'heavy' },
    gameOver: { sound: 'playGameOver', vibration: null }
  };
  if (event.type === 'itemUsed') {
    return event.payload?.item === 'clear'
      ? null // The existing clear cue owns this action's sound and vibration.
      : { sound: 'playClick', vibration: 'light' };
  }
  if (event.type === 'reviveStarted') return { sound: 'playClick', vibration: 'medium' };
  return cues[event.type] || null;
}

export function getCanvasPixelRatio(width, height, rawDpr, quality) {
  const budget = quality.canvasPixelMax - quality.surfaceCachePixelMax;
  return Math.min(Math.max(1, Number(rawDpr) || 1), quality.maxDpr, Math.sqrt(budget / Math.max(1, width * height)));
}

export function unionDamageRects(rects, viewport) {
  const valid = rects.filter(Boolean);
  if (valid.length === 0) return null;
  const x = Math.max(0, Math.floor(Math.min(...valid.map((rect) => rect.x))));
  const y = Math.max(0, Math.floor(Math.min(...valid.map((rect) => rect.y))));
  const right = Math.min(viewport.screenWidth, Math.ceil(Math.max(...valid.map((rect) => rect.x + rect.width))));
  const bottom = Math.min(viewport.screenHeight, Math.ceil(Math.max(...valid.map((rect) => rect.y + rect.height))));
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}
