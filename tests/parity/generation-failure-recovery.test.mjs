import test from 'node:test';
import assert from 'node:assert/strict';

import { versions } from '../fixtures/core-vectors.mjs';
import { loadVersion } from '../helpers/version-adapter.mjs';
import { createMemoryStorage, installWxStorage } from '../helpers/platform-mocks.mjs';

// Deterministic RNG so the "no candidate rack" path is reproducible.
function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function withSeed(seed, callback) {
  const original = Math.random;
  Math.random = seededRandom(seed);
  try {
    return callback();
  } finally {
    Math.random = original;
  }
}

// Legal late game: alternating filled cells leave only isolated single cells
// empty. No row or column is complete, so the next placement cannot clear a
// line and every multi-cell shape is unplaceable.
function buildIsolatedHoleBoard(board) {
  board.reset();
  for (let row = 0; row < board.size; row += 1) {
    for (let col = 0; col < board.size; col += 1) {
      if ((row + col) % 2 === 0) {
        board.grid[row][col] = { color: '#123456' };
      }
    }
  }
}

function fillBoard(board) {
  board.reset();
  for (let row = 0; row < board.size; row += 1) {
    for (let col = 0; col < board.size; col += 1) {
      board.grid[row][col] = { color: '#123456' };
    }
  }
}

function makePiece(baseId, cells, used = false) {
  const maxX = Math.max(...cells.map((cell) => cell.x));
  const maxY = Math.max(...cells.map((cell) => cell.y));
  return {
    id: `${baseId}-${Math.random()}`,
    cells: cells.map((cell) => ({ ...cell })),
    color: '#FFD60A',
    used,
    bounds: { width: maxX + 1, height: maxY + 1 },
    category: baseId === 'l3' ? 'simple' : 'rescue',
    baseId,
    isSnake: false
  };
}

function findPlacement(board, piece) {
  for (let row = 0; row <= board.size - piece.bounds.height; row += 1) {
    for (let col = 0; col <= board.size - piece.bounds.width; col += 1) {
      if (board.canPlace(piece.cells, row, col)) {
        return { row, col };
      }
    }
  }
  return null;
}

function installSimpleLayout(state) {
  state.setLayout({ cellSize: 30, boardRect: { x: 20, y: 100, width: 300, height: 300 } });
}

// Mirrors DIFFICULTY_RULES: a rescued rack must still be a legal rack for the
// current difficulty instead of bypassing the constraints.
function assertDifficultyRackRules(pieces, difficulty) {
  const counts = { rescue: 0, simple: 0, medium: 0, hard: 0 };
  for (const piece of pieces) counts[piece.category] += 1;
  const baseIds = pieces.map((piece) => piece.baseId);
  const snakes = pieces.filter((piece) => piece.isSnake).length;

  if (difficulty === 'easy') {
    assert.ok(counts.rescue >= 1, 'easy rack must contain a rescue shape');
    assert.ok(counts.medium <= 2, 'easy rack medium cap');
    assert.notEqual(counts.rescue, 3, 'easy rack must not be all rescue shapes');
    assert.equal(counts.hard, 0, 'easy rack never contains hard shapes');
    assert.ok(baseIds.filter((id) => id === 'single').length <= 1, 'easy single-cell cap');
    assert.equal(new Set(baseIds).size, baseIds.length, 'easy rack forbids duplicate bases');
  } else if (difficulty === 'normal') {
    assert.ok(counts.hard <= 1, 'normal hard cap');
    assert.ok(counts.medium + counts.hard <= 2, 'normal medium+hard cap');
    assert.ok(snakes <= 1, 'normal snake cap');
    for (const id of new Set(baseIds)) {
      assert.ok(baseIds.filter((value) => value === id).length <= 2, 'normal same-base cap');
    }
  } else {
    assert.ok(counts.hard <= 2, 'master hard cap');
    assert.ok(snakes < 3, 'master snake cap');
  }
}

for (const version of versions) {
  test(`${version}: seed 59 late-game refill keeps playing instead of ending the round`, async () => {
    const restore = installWxStorage(createMemoryStorage());
    try {
      const { GameState } = await loadVersion(version);
      withSeed(59, () => {
        const state = new GameState();
        state.setSettings({ ...state.settings, difficulty: 'normal' });
        state.screen = 'playing';
        buildIsolatedHoleBoard(state.board);
        // Two pieces were used; the single cell is the player's next and final move.
        state.rackPieces = [
          makePiece('line2', [{ x: 0, y: 0 }, { x: 1, y: 0 }], true),
          makePiece('l3', [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], true),
          makePiece('single', [{ x: 0, y: 0 }], false)
        ];
        installSimpleLayout(state);

        state.dragState.activePieceIndex = 2;
        state.previewState = { row: 9, col: 8, canPlace: true, visible: true };
        assert.equal(state.tryPlaceDraggedPiece(), true, 'the legal final placement must succeed');
        assert.equal(state.pendingClear, null, 'this late-game placement cannot clear a line');

        // All three pieces are used, so the refill path ran. The board still has
        // isolated empty cells, so the round must continue with a playable rack.
        assert.equal(state.isGameOver, false, 'refill must not declare game over while a move exists');
        assert.equal(state.screen, 'playing');
        assert.equal(state.rackPieces.length, 3);
        assert.equal(state.board.hasAnyValidMove(state.rackPieces), true);
        assertDifficultyRackRules(state.rackPieces, 'normal');

        const nextIndex = state.rackPieces.findIndex((piece) => !piece.used && findPlacement(state.board, piece));
        assert.notEqual(nextIndex, -1, 'the rescued rack must still allow another move');
        const placement = findPlacement(state.board, state.rackPieces[nextIndex]);
        state.dragState.activePieceIndex = nextIndex;
        state.previewState = { ...placement, canPlace: true, visible: true };
        assert.equal(state.tryPlaceDraggedPiece(), true, 'play must continue after the rescue');
      });
    } finally {
      restore();
    }
  });

  test(`${version}: seed 59 fallback racks stay inside the difficulty rules`, async () => {
    const { Board, createRack } = await loadVersion(version);
    withSeed(59, () => {
      for (const difficulty of ['easy', 'normal', 'master']) {
        for (let sample = 0; sample < 40; sample += 1) {
          const board = new Board();
          buildIsolatedHoleBoard(board);
          const result = createRack(board, difficulty, {});
          assert.equal(result.success, true, `${difficulty} sample ${sample} reported no rack`);
          assert.equal(result.pieces.length, 3);
          assertDifficultyRackRules(result.pieces, difficulty);
          assert.equal(board.hasAnyValidMove(result.pieces), true);
        }
      }
    });
  });

  test(`${version}: a full board still ends the round`, async () => {
    const restore = installWxStorage(createMemoryStorage());
    try {
      const { GameState } = await loadVersion(version);
      withSeed(59, () => {
        const state = new GameState();
        state.setSettings({ ...state.settings, difficulty: 'normal' });
        state.screen = 'playing';
        fillBoard(state.board);
        state.rackPieces = [
          makePiece('single', [{ x: 0, y: 0 }], true),
          makePiece('line2', [{ x: 0, y: 0 }, { x: 1, y: 0 }], true),
          makePiece('l3', [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], true)
        ];
        state.generateRackForPlay(true);
        assert.equal(state.isGameOver, true);
        assert.equal(state.screen, 'gameover');
      });
    } finally {
      restore();
    }
  });
}

test('createRack still reports failure when the board is full', async () => {
  for (const version of versions) {
    const { Board, createRack } = await loadVersion(version);
    const board = new Board();
    fillBoard(board);
    for (const difficulty of ['easy', 'normal', 'master']) {
      const result = createRack(board, difficulty, {});
      assert.equal(result.success, false, `${version}/${difficulty} must not invent a rack on a full board`);
      assert.equal(result.pieces, null);
    }
  }
});
