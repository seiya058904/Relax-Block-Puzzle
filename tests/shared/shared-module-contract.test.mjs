import test from 'node:test';
import assert from 'node:assert/strict';

import Board from '../../shared/js/game/Board.js';
import { createRack } from '../../shared/js/game/Piece.js';
import ScoreManager from '../../shared/js/game/ScoreManager.js';
import { DEFAULT_SETTINGS, loadSettings } from '../../shared/js/utils/storage.js';

test('shared deterministic modules preserve the current public contract', () => {
  const board = new Board();
  const rack = createRack(board, 'normal', { random: () => 0.1 });
  const score = new ScoreManager();

  assert.equal(board.size, 10);
  assert.equal(rack.success, true);
  assert.equal(rack.pieces.length, 3);
  assert.equal(score.getPlacementScore(0), 0);
  assert.equal(loadSettings().difficulty, DEFAULT_SETTINGS.difficulty);
});

test('shared deterministic modules do not require platform globals at import time', async () => {
  const source = await Promise.all([
    import('../../shared/js/game/Board.js'),
    import('../../shared/js/game/Piece.js'),
    import('../../shared/js/game/ScoreManager.js'),
    import('../../shared/js/utils/storage.js')
  ]);

  assert.equal(source.length, 4);
  assert.equal(globalThis.window, undefined);
  assert.equal(globalThis.document, undefined);
});
