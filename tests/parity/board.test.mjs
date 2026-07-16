import test from 'node:test';
import assert from 'node:assert/strict';

import { versions } from '../fixtures/core-vectors.mjs';
import { loadVersion } from '../helpers/version-adapter.mjs';

function piece(cells, color = '#fff') {
  return { cells, color, used: false };
}

for (const version of versions) {
  test(`${version}: initializes an empty 10x10 board`, async () => {
    const { Board } = await loadVersion(version);
    const board = new Board();
    assert.equal(board.size, 10);
    assert.equal(board.grid.length, 10);
    assert.ok(board.grid.every((row) => row.length === 10 && row.every((cell) => cell === null)));
  });

  test(`${version}: accepts legal placement and rejects bounds and overlap`, async () => {
    const { Board } = await loadVersion(version);
    const board = new Board();
    const block = piece([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
    assert.equal(board.canPlace(block.cells, 0, 0), true);
    assert.equal(board.canPlace(block.cells, 0, 9), false);
    assert.equal(board.canPlace(block.cells, -1, 0), false);
    assert.equal(board.place(block, 0, 0), 2);
    assert.equal(board.canPlace([{ x: 0, y: 0 }], 0, 0), false);
  });

  test(`${version}: finds and clears horizontal, vertical, crossing and multiple lines`, async () => {
    const { Board } = await loadVersion(version);
    const board = new Board();
    for (let col = 0; col < 10; col += 1) board.grid[2][col] = { color: 'a' };
    for (let col = 0; col < 10; col += 1) board.grid[4][col] = { color: 'b' };
    for (let row = 0; row < 10; row += 1) board.grid[row][6] = { color: 'c' };

    assert.deepEqual(board.findCompletedLines(), { rows: [2, 4], cols: [6] });
    board.clearLines([2, 4], [6]);
    assert.ok(board.grid[2].every((cell) => cell === null));
    assert.ok(board.grid[4].every((cell) => cell === null));
    assert.ok(board.grid.every((row) => row[6] === null));
  });

  test(`${version}: clearArea clips at edges and reports removed cells`, async () => {
    const { Board } = await loadVersion(version);
    const board = new Board();
    board.grid[0][0] = { color: 'a' };
    board.grid[0][1] = { color: 'b' };
    board.grid[1][0] = { color: 'c' };
    board.grid[2][2] = { color: 'outside' };
    const removed = board.clearArea(0, 0, 1);
    assert.equal(removed.length, 3);
    assert.equal(board.grid[2][2].color, 'outside');
  });

  test(`${version}: detects when no remaining piece can be placed`, async () => {
    const { Board } = await loadVersion(version);
    const board = new Board();
    for (let row = 0; row < 10; row += 1) {
      for (let col = 0; col < 10; col += 1) board.grid[row][col] = { color: 'filled' };
    }
    assert.equal(board.hasAnyValidMove([piece([{ x: 0, y: 0 }])]), false);
    board.grid[9][9] = null;
    assert.equal(board.hasAnyValidMove([piece([{ x: 0, y: 0 }])]), true);
    assert.equal(board.hasAnyValidMove([piece([{ x: 0, y: 0 }, { x: 1, y: 0 }])]), false);
  });
}

test('board operations produce identical snapshots in both versions', async () => {
  const wechat = await loadVersion('wechat');
  const android = await loadVersion('android');
  const boards = [new wechat.Board(), new android.Board()];
  for (const board of boards) {
    board.place(piece([{ x: 0, y: 0 }, { x: 1, y: 0 }], '#123'), 3, 4);
    board.clearArea(3, 4, 1);
  }
  assert.deepEqual(boards[0].getSnapshot(), boards[1].getSnapshot());
});
