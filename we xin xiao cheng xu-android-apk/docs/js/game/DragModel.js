// GENERATED FILE - edit shared/js source and run npm run sync.
const DEFAULT_HYSTERESIS = 0.16;
const DEFAULT_RELEASE_TOLERANCE = 0.2;

function pieceBounds(cells) {
  return cells.reduce(
    (bounds, cell) => ({
      width: Math.max(bounds.width, cell.x + 1),
      height: Math.max(bounds.height, cell.y + 1)
    }),
    { width: 0, height: 0 }
  );
}

function snapAxis(position, origin, cellSize, current, hysteresis) {
  const normalized = (position - origin) / cellSize;
  const delta = normalized - current;
  const threshold = 0.5 + hysteresis;
  return Math.abs(delta) <= threshold ? current : Math.round(normalized);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function createDragModel({
  boardRect,
  cellSize,
  canPlace,
  hysteresis = DEFAULT_HYSTERESIS,
  releaseTolerance = DEFAULT_RELEASE_TOLERANCE
}) {
  if (!boardRect || !Number.isFinite(cellSize) || cellSize <= 0 || typeof canPlace !== 'function') {
    throw new TypeError('drag model requires boardRect, positive cellSize, and canPlace');
  }

  let state = {
    active: false,
    phase: 'idle',
    pointerX: 0,
    pointerY: 0,
    visualX: 0,
    visualY: 0,
    row: null,
    col: null,
    canPlace: false,
    lastValid: null
  };

  function updateCandidate() {
    const normalizedX = (state.visualX - boardRect.x) / cellSize;
    const normalizedY = (state.visualY - boardRect.y) / cellSize;
    const rawCol = Math.round(normalizedX);
    const rawRow = Math.round(normalizedY);

    state.col = state.col === null
      ? rawCol
      : snapAxis(state.visualX, boardRect.x, cellSize, state.col, hysteresis);
    state.row = state.row === null
      ? rawRow
      : snapAxis(state.visualY, boardRect.y, cellSize, state.row, hysteresis);
    state.canPlace = !!canPlace(state.row, state.col);

    if (state.canPlace) {
      state.lastValid = {
        row: state.row,
        col: state.col,
        visualX: state.visualX,
        visualY: state.visualY
      };
    }
  }

  function updatePointer(pointerX, pointerY) {
    const bounds = pieceBounds(state.pieceCells);
    state.pointerX = pointerX;
    state.pointerY = pointerY;
    state.visualX = pointerX - (bounds.width * state.displayCellSize) / 2;
    state.visualY = pointerY - bounds.height * state.displayCellSize - state.fingerOffsetY;
    updateCandidate();
  }

  return {
    begin({ pointerX, pointerY, pieceCells, displayCellSize, fingerOffsetY }) {
      state = {
        active: true,
        phase: 'dragging',
        pointerX,
        pointerY,
        visualX: 0,
        visualY: 0,
        row: null,
        col: null,
        canPlace: false,
        lastValid: null,
        pieceCells: pieceCells.map((cell) => ({ x: cell.x, y: cell.y })),
        displayCellSize,
        fingerOffsetY
      };
      updatePointer(pointerX, pointerY);
      return this.snapshot();
    },

    move({ pointerX, pointerY }) {
      if (!state.active) return this.snapshot();
      updatePointer(pointerX, pointerY);
      return this.snapshot();
    },

    release({ pointerX, pointerY }) {
      if (!state.active) return { accepted: false };
      updatePointer(pointerX, pointerY);

      if (state.canPlace) {
        return {
          accepted: true,
          row: state.row,
          col: state.col,
          fromLastValid: !!state.lastValid
        };
      }

      if (state.lastValid && distance(state, state.lastValid) <= releaseTolerance * cellSize) {
        return {
          accepted: true,
          row: state.lastValid.row,
          col: state.lastValid.col,
          fromLastValid: true
        };
      }

      return { accepted: false };
    },

    cancel() {
      state = {
        active: false,
        phase: 'idle',
        pointerX: 0,
        pointerY: 0,
        visualX: 0,
        visualY: 0,
        row: null,
        col: null,
        canPlace: false,
        lastValid: null
      };
    },

    snapshot() {
      return {
        active: state.active,
        phase: state.phase,
        pointerX: state.pointerX,
        pointerY: state.pointerY,
        visualX: state.visualX,
        visualY: state.visualY,
        row: state.row,
        col: state.col,
        canPlace: state.canPlace,
        lastValid: state.lastValid ? { ...state.lastValid } : null
      };
    }
  };
}
