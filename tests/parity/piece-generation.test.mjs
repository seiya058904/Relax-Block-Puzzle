import test from 'node:test';
import assert from 'node:assert/strict';

import { versions } from '../fixtures/core-vectors.mjs';
import { loadPieceInternals, loadVersion } from '../helpers/version-adapter.mjs';
import { withRandomSequence } from '../helpers/platform-mocks.mjs';

const expectedBaseIds = [
  'single', 'line2', 'line3', 'l3', 'line4', 'square2', 'corner4',
  'z', 's', 'stair5', 't4', 't5', 'l5', 'cross5', 'square3', 'line5'
];

function summarizeRack(result) {
  return {
    success: result.success,
    pieces: result.pieces && result.pieces.map((item) => ({
      cells: item.cells,
      category: item.category,
      baseId: item.baseId,
      isSnake: item.isSnake
    })),
    meta: result.meta
  };
}

for (const version of versions) {
  test(`${version}: shape definitions and difficulty configuration match the frozen specification`, async () => {
    const { SHAPE_LIBRARY, DIFFICULTY_RULES } = await loadPieceInternals(version);
    const baseIds = Object.values(SHAPE_LIBRARY).flat().map((shape) => shape.baseId);
    assert.deepEqual([...new Set(baseIds)].sort(), expectedBaseIds.slice().sort());
    for (const shape of Object.values(SHAPE_LIBRARY).flat()) {
      assert.ok(shape.cells.length > 0);
      assert.ok(shape.cells.every((cell) => Number.isInteger(cell.x) && Number.isInteger(cell.y)));
      assert.ok(shape.cells.every((cell) => cell.x >= 0 && cell.y >= 0));
      assert.ok(['rescue', 'simple', 'medium', 'hard'].includes(shape.category));
    }
    assert.deepEqual(DIFFICULTY_RULES.easy.categoryWeights, { rescue: 40, simple: 35, medium: 25 });
    assert.deepEqual(DIFFICULTY_RULES.normal.categoryWeights, { rescue: 35, simple: 37, medium: 20, hard: 8 });
    assert.deepEqual(DIFFICULTY_RULES.master.categoryWeights, { rescue: 20, simple: 25, medium: 30, hard: 25 });
    assert.equal(DIFFICULTY_RULES.easy.requireRescue, true);
    assert.equal(DIFFICULTY_RULES.easy.allowHard, false);
    assert.equal(DIFFICULTY_RULES.normal.maxHard, 1);
    assert.equal(DIFFICULTY_RULES.master.maxHard, 2);
  });

  test(`${version}: easy racks always include rescue pieces and exclude hard pieces`, async () => {
    const { Board, createRack } = await loadVersion(version);
    const board = new Board();
    for (const value of [0, 0.2, 0.5, 0.8, 0.999]) {
      const result = await withRandomSequence(Array(40).fill(value), () => createRack(board, 'easy'));
      assert.equal(result.success, true);
      assert.ok(result.pieces.some((item) => item.category === 'rescue'));
      assert.ok(result.pieces.every((item) => item.category !== 'hard'));
      assert.ok(result.pieces.filter((item) => item.category === 'medium').length <= 2);
    }
  });

  test(`${version}: normal and master rack constraints reject disabled combinations`, async () => {
    const { isRackValidForDifficulty } = await loadPieceInternals(version);
    const make = (category, baseId = category) => ({ category, baseId, isSnake: ['z', 's', 'stair5'].includes(baseId) });
    assert.equal(isRackValidForDifficulty([make('hard'), make('hard'), make('rescue')], 'normal'), false);
    assert.equal(isRackValidForDifficulty([make('hard', 'z'), make('simple'), make('rescue')], 'normal', { previousHadSnake: true }), false);
    assert.equal(isRackValidForDifficulty([make('hard'), make('hard'), make('hard')], 'master'), false);
    assert.equal(isRackValidForDifficulty([make('hard', 'z'), make('hard', 's'), make('hard', 'stair5')], 'master'), false);
  });

  test(`${version}: createRack stops after the configured maximum attempts`, async () => {
    const { createRack } = await loadVersion(version);
    let moveChecks = 0;
    const blockedBoard = {
      grid: Array.from({ length: 10 }, () => Array(10).fill({ color: 'x' })),
      hasAnyValidMove() {
        moveChecks += 1;
        return false;
      }
    };
    const result = await withRandomSequence(Array(100).fill(0), () =>
      createRack(blockedBoard, 'easy', { maxAttempts: 4 })
    );
    assert.equal(result.success, false);
    assert.equal(result.pieces, null);
    assert.equal(moveChecks, 4);
  });
}

test('fixed random sequences generate equivalent racks in both versions', async () => {
  const wechat = await loadVersion('wechat');
  const android = await loadVersion('android');
  const sequence = [0.02, 0.15, 0.31, 0.48, 0.64, 0.79, 0.93, 0.27, 0.55, 0.84, 0.11, 0.72];
  for (const difficulty of ['easy', 'normal', 'master']) {
    const wechatResult = await withRandomSequence(sequence, () =>
      wechat.createRack(new wechat.Board(), difficulty, { previousHadSnake: false })
    );
    const androidResult = await withRandomSequence(sequence, () =>
      android.createRack(new android.Board(), difficulty, { previousHadSnake: false })
    );
    assert.deepEqual(summarizeRack(wechatResult), summarizeRack(androidResult));
  }
});
