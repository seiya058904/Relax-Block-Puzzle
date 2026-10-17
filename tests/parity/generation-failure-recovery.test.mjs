import test from 'node:test';
import assert from 'node:assert/strict';

import { versions } from '../fixtures/core-vectors.mjs';
import { loadVersion } from '../helpers/version-adapter.mjs';
import { createMemoryStorage, installWxStorage } from '../helpers/platform-mocks.mjs';

// Isolated holes: every empty cell is a single cell, so no multi-cell shape can
// be placed. This is the state that used to make createRack() give up and the
// caller report a false game over.
function fillIsolatedHoles(board) {
  board.reset();
  for (let row = 0; row < board.size; row += 1) {
    for (let col = 0; col < board.size; col += 1) {
      if ((row + col) % 2 === 0) {
        board.grid[row][col] = { color: '#123456' };
      }
    }
  }
}

function usedSingleCellPiece(id) {
  return {
    id,
    cells: [{ x: 0, y: 0 }],
    color: '#FFD60A',
    used: true,
    bounds: { width: 1, height: 1 },
    category: 'rescue',
    baseId: 'single',
    isSnake: false
  };
}

function fillBoard(board) {
  board.reset();
  for (let row = 0; row < board.size; row += 1) {
    for (let col = 0; col < board.size; col += 1) {
      board.grid[row][col] = { color: '#123456' };
    }
  }
}

for (const version of versions) {
  test(`${version}: createRack keeps returning playable racks while isolated single cells remain`, async () => {
    const { Board, createRack } = await loadVersion(version);
    for (const difficulty of ['easy', 'normal', 'master']) {
      for (let sample = 0; sample < 120; sample += 1) {
        const board = new Board();
        fillIsolatedHoles(board);
        const result = createRack(board, difficulty, {});
        assert.equal(result.success, true, `${difficulty} sample ${sample} reported no rack`);
        assert.equal(result.pieces.length, 3);
        assert.equal(board.hasAnyValidMove(result.pieces), true);
      }
    }
  });

  test(`${version}: a generator miss never replaces a legal placement with game over`, async () => {
    const restore = installWxStorage(createMemoryStorage());
    try {
      const { GameState } = await loadVersion(version);
      for (let trial = 0; trial < 60; trial += 1) {
        const state = new GameState();
        state.setSettings({ ...state.settings, difficulty: 'normal' });
        state.screen = 'playing';
        fillIsolatedHoles(state.board);
        state.rackPieces = [
          usedSingleCellPiece('a'),
          usedSingleCellPiece('b'),
          usedSingleCellPiece('c')
        ];
        state.generateRackForPlay(true);
        assert.equal(state.isGameOver, false, `trial ${trial} ended a playable round`);
        assert.equal(state.screen, 'playing');
        assert.equal(state.rackPieces.length, 3);
        assert.equal(state.board.hasAnyValidMove(state.rackPieces), true);
      }
    } finally {
      restore();
    }
  });

  test(`${version}: a genuinely full board still ends the round`, async () => {
    const restore = installWxStorage(createMemoryStorage());
    try {
      const { GameState } = await loadVersion(version);
      const state = new GameState();
      state.setSettings({ ...state.settings, difficulty: 'normal' });
      state.screen = 'playing';
      fillBoard(state.board);
      state.rackPieces = [
        usedSingleCellPiece('a'),
        usedSingleCellPiece('b'),
        usedSingleCellPiece('c')
      ];
      state.generateRackForPlay(true);
      assert.equal(state.isGameOver, true);
      assert.equal(state.screen, 'gameover');
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
