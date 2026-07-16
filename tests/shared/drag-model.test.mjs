import test from 'node:test';
import assert from 'node:assert/strict';

import { createDragModel } from '../../shared/js/game/DragModel.js';

function makeModel(canPlace = () => true) {
  return createDragModel({
    boardRect: { x: 10, y: 20 },
    cellSize: 40,
    hysteresis: 0.16,
    releaseTolerance: 0.2,
    canPlace
  });
}

test('drag model maps the pointer to a lifted visual position and candidate cell', () => {
  const model = makeModel();
  model.begin({
    pointerX: 110,
    pointerY: 180,
    pieceCells: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    displayCellSize: 38,
    fingerOffsetY: 50
  });

  const state = model.snapshot();
  assert.equal(state.visualX, 72);
  assert.equal(state.visualY, 92);
  assert.deepEqual({ row: state.row, col: state.col }, { row: 2, col: 2 });
  assert.equal(state.canPlace, true);
});

test('drag model keeps a candidate until movement crosses hysteresis', () => {
  const model = makeModel();
  model.begin({
    pointerX: 110,
    pointerY: 180,
    pieceCells: [{ x: 0, y: 0 }],
    displayCellSize: 40,
    fingerOffsetY: 40
  });

  model.move({ pointerX: 128, pointerY: 220 });
  assert.equal(model.snapshot().col, 2);
  model.move({ pointerX: 138, pointerY: 220 });
  assert.equal(model.snapshot().col, 3);
});

test('drag model remembers the last valid candidate and accepts a near-valid release', () => {
  const model = makeModel((row, col) => row === 2 && col === 2);
  model.begin({
    pointerX: 110,
    pointerY: 180,
    pieceCells: [{ x: 0, y: 0 }],
    displayCellSize: 40,
    fingerOffsetY: 40
  });
  model.move({ pointerX: 118, pointerY: 188 });

  const result = model.release({ pointerX: 121, pointerY: 190 });
  assert.deepEqual(result, { accepted: true, row: 2, col: 2, fromLastValid: true });
});

test('drag model rejects a clearly invalid release and cancel clears all transient state', () => {
  const model = makeModel(() => false);
  model.begin({
    pointerX: 110,
    pointerY: 180,
    pieceCells: [{ x: 0, y: 0 }],
    displayCellSize: 40,
    fingerOffsetY: 40
  });

  assert.equal(model.release({ pointerX: 300, pointerY: 300 }).accepted, false);
  model.cancel();
  assert.equal(model.snapshot().active, false);
  assert.equal(model.snapshot().lastValid, null);
});
