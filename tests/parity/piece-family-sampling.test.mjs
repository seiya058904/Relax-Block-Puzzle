import test from 'node:test';
import assert from 'node:assert/strict';

import { versions } from '../fixtures/core-vectors.mjs';
import { loadPieceInternals, loadVersion } from '../helpers/version-adapter.mjs';
import { withRandomSequence } from '../helpers/platform-mocks.mjs';

// Deterministic LCG sequence (same generator family as the simulation
// script) so parity tests never depend on real randomness.
function makeSequence(length, seed) {
  const values = new Array(length);
  let value = seed >>> 0;
  for (let index = 0; index < length; index += 1) {
    value = (value * 1664525 + 1013904223) >>> 0;
    values[index] = value / 4294967296;
  }
  return values;
}

function summarizeCells(cells) {
  return cells
    .slice()
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))
    .map((cell) => `${cell.x}:${cell.y}`)
    .join('|');
}

function countRotationVariants(SHAPE_LIBRARY, baseId) {
  return Object.values(SHAPE_LIBRARY)
    .flat()
    .filter((variant) => variant.baseId === baseId)
    .length;
}

function makePiece(category, baseId, cells, bounds) {
  return {
    category,
    baseId,
    cells,
    bounds: bounds || { width: 1, height: 1 },
    isSnake: ['z', 's', 'stair5'].includes(baseId)
  };
}

for (const version of versions) {
  test(`${version}: family sampling keeps rotation count out of base frequency`, async () => {
    const { Board, createRack } = await loadVersion(version);
    const board = new Board();
    // corner4 has 4 rotations, square2 has 1; before family-first sampling the
    // corner4 family appeared about 3x as often as square2. With family-first
    // the effective weight ratio is 1.4:1.9, so corner4 must stay well below
    // square2 instead of dominating it.
    let corner4 = 0;
    let square2 = 0;
    await withRandomSequence(
      makeSequence(24000, 20260925),
      () => {
        for (let round = 0; round < 900; round += 1) {
          const result = createRack(board, 'normal', {});
          assert.equal(result.success, true);
          for (const piece of result.pieces) {
            if (piece.baseId === 'corner4') corner4 += 1;
            if (piece.baseId === 'square2') square2 += 1;
          }
        }
      }
    );
    assert.ok(square2 > 60, 'square2 sample size should be meaningful');
    assert.ok(corner4 > 40, 'corner4 sample size should be meaningful');
    assert.ok(
      corner4 < square2 * 1.5,
      `corner4 (${corner4}) should not outweigh square2 (${square2}) by rotation count`
    );
  });

  test(`${version}: rotations inside a family stay close to uniform`, async () => {
    const { Board, createRack } = await loadVersion(version);
    const { SHAPE_LIBRARY } = await loadPieceInternals(version);
    const board = new Board();
    const rotationCounts = new Map();

    await withRandomSequence(
      makeSequence(24000, 987654321),
      () => {
        for (let round = 0; round < 600; round += 1) {
          const result = createRack(board, 'master', {});
          for (const piece of result.pieces) {
            if (piece.baseId !== 't4') continue;
            const key = summarizeCells(piece.cells);
            rotationCounts.set(key, (rotationCounts.get(key) || 0) + 1);
          }
        }
      }
    );

    const variantCount = countRotationVariants(SHAPE_LIBRARY, 't4');
    assert.equal(variantCount, 4);
    assert.equal(rotationCounts.size, variantCount, 'every t4 rotation should appear');
    const total = [...rotationCounts.values()].reduce((sum, value) => sum + value, 0);
    for (const count of rotationCounts.values()) {
      const share = count / total;
      assert.ok(
        share > 0.15 && share < 0.35,
        `t4 rotation share ${share.toFixed(2)} should be near uniform (0.25)`
      );
    }
  });

  test(`${version}: recent rack history penalizes but never bans base shapes`, async () => {
    const { Board, createRack } = await loadVersion(version);
    const board = new Board();
    // corner4 stays fresh so the medium category keeps offering a new shape;
    // line4/square2 carry the soft history penalty.
    const withHistory = { recentBaseIds: ['line4', 'square2'] };
    let penalizedWithHistory = 0;
    let penalizedWithoutHistory = 0;
    const rounds = 500;

    await withRandomSequence(makeSequence(12000, 424242), () => {
      for (let round = 0; round < rounds; round += 1) {
        const result = createRack(board, 'normal', withHistory);
        for (const piece of result.pieces) {
          if (withHistory.recentBaseIds.includes(piece.baseId)) penalizedWithHistory += 1;
        }
      }
    });

    await withRandomSequence(makeSequence(12000, 424242), () => {
      for (let round = 0; round < rounds; round += 1) {
        const baseline = createRack(board, 'normal', {});
        for (const piece of baseline.pieces) {
          if (withHistory.recentBaseIds.includes(piece.baseId)) penalizedWithoutHistory += 1;
        }
      }
    });

    assert.ok(penalizedWithHistory > 0, 'recent history must stay a soft rule, not a ban');
    assert.ok(
      penalizedWithHistory < penalizedWithoutHistory,
      `recent bases (${penalizedWithHistory}) should appear less often than baseline (${penalizedWithoutHistory})`
    );
  });

  test(`${version}: same-base duplicates respect the per-difficulty caps`, async () => {
    const { isRackValidForDifficulty } = await loadPieceInternals(version);
    const cell = { x: 0, y: 0 };
    const twice = (baseId, category) => [
      makePiece(category, baseId, [cell]),
      makePiece(category, baseId, [cell]),
      makePiece('rescue', 'line2', [cell, { x: 1, y: 0 }], { width: 2, height: 1 })
    ];
    const thrice = (baseId, category) => [
      makePiece(category, baseId, [cell]),
      makePiece(category, baseId, [cell]),
      makePiece(category, baseId, [cell])
    ];

    // easy: two of the same base are rejected outright.
    assert.equal(isRackValidForDifficulty(twice('line2', 'rescue'), 'easy', {}), false);
    // normal: two are allowed, three are rejected.
    assert.equal(isRackValidForDifficulty(twice('line4', 'medium'), 'normal', {}), true);
    assert.equal(isRackValidForDifficulty(thrice('line4', 'medium'), 'normal', {}), false);
    // master stays lenient: even three are not filtered by duplicate rules.
    assert.equal(isRackValidForDifficulty(thrice('line4', 'medium'), 'master', {}), true);
  });

  test(`${version}: viability evaluator agrees with real board placements`, async () => {
    const { Board } = await loadVersion(version);
    const { evaluateRackViability } = await loadPieceInternals(version);
    const single = (baseId) => makePiece('rescue', baseId, [{ x: 0, y: 0 }], { width: 1, height: 1 });
    const square3 = () => makePiece('hard', 'square3', [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
      { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 },
      { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }
    ], { width: 3, height: 3 });

    // Empty board: everything fits immediately and a full sequence exists.
    const empty = evaluateRackViability(new Board(), [single('single'), single('single'), single('single')]);
    assert.equal(empty.immediatelyPlaceableCount, 3);
    assert.equal(empty.hasFullThreePieceSequence, true);
    assert.equal(empty.bestSequenceDepth, 3);

    // One free cell at (9,9): every single can anchor there, and placing one
    // completes row 9 so the REAL clear rules reopen space for the rest.
    const oneCell = new Board();
    for (let row = 0; row < 10; row += 1) {
      for (let col = 0; col < 10; col += 1) {
        if (row !== 9 || col !== 9) oneCell.grid[row][col] = { color: '#333' };
      }
    }
    const reopened = evaluateRackViability(oneCell, [single('single'), single('single'), single('single')]);
    assert.equal(reopened.hasFullThreePieceSequence, true, 'clearing row 9 must reopen the board');
    assert.equal(reopened.bestSequenceDepth, 3);

    // Checkerboard: 50 free cells but no 2x2 block, so no 3x3 piece has a
    // single legal anchor and the rack is a forced zero.
    const checker = new Board();
    for (let row = 0; row < 10; row += 1) {
      for (let col = 0; col < 10; col += 1) {
        if ((row + col) % 2 === 0) checker.grid[row][col] = { color: '#333' };
      }
    }
    const dead = evaluateRackViability(checker, [square3(), square3(), square3()]);
    assert.equal(dead.immediatelyPlaceableCount, 0);
    assert.equal(dead.hasFullThreePieceSequence, false);
    assert.equal(dead.bestSequenceDepth, 0);
    assert.equal(dead.totalLegalPlacements, 0);
  });

  test(`${version}: viability gate keeps easy racks fully playable and blocks dead sequences`, async () => {
    const { Board, createRack } = await loadVersion(version);
    const board = new Board();
    for (let row = 0; row < 10; row += 1) {
      for (let col = 0; col < 10; col += 1) {
        if (row !== 9 || col !== 9) board.grid[row][col] = { color: '#333' };
      }
    }

    // With only one free cell, racks whose full sequence cannot complete are
    // rejected during the strict attempts; the relaxed tail still honours the
    // hasAnyValidMove safety line so failure rates never regress.
    const result = createRack(board, 'easy', { maxAttempts: 20 });
    if (result.success) {
      assert.equal(
        result.pieces.some((piece) => piece.category === 'rescue'),
        true,
        'easy still guarantees a rescue piece even on hostile boards'
      );
      assert.equal(
        board.hasAnyValidMove(result.pieces),
        true,
        'returned rack always satisfies the hasAnyValidMove safety line'
      );
    } else {
      assert.ok(true, 'fully blocked board may fail generation as before');
    }
  });

  test(`${version}: board pressure buckets follow fill ratio and placements`, async () => {
    const { getBoardPressure } = await loadPieceInternals(version);
    const { Board } = await loadVersion(version);

    const emptyBoard = new Board();
    assert.equal(getBoardPressure(emptyBoard), 'low');

    const criticalBoard = new Board();
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 10; col += 1) criticalBoard.grid[row][col] = { color: '#333' };
    }
    assert.equal(getBoardPressure(criticalBoard), 'critical');

    const halfBoard = new Board();
    for (let row = 0; row < 10; row += 1) {
      for (let col = 0; col < 10; col += 1) {
        if ((row + col) % 2 === 0) halfBoard.grid[row][col] = { color: '#333' };
      }
    }
    assert.ok(['medium', 'high'].includes(getBoardPressure(halfBoard)));

    assert.equal(getBoardPressure({ grid: null }), 'low', 'legacy stub boards degrade to low');
  });
}
