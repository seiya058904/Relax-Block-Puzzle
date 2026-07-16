import test from 'node:test';
import assert from 'node:assert/strict';

import { loadVersion } from '../helpers/version-adapter.mjs';

test('web: loads the same deterministic modules as Android', async () => {
  const [web, android] = await Promise.all([loadVersion('web'), loadVersion('android')]);

  assert.equal(typeof web.Board, 'function');
  assert.equal(typeof web.createRack, 'function');
  assert.equal(typeof web.ScoreManager, 'function');
  assert.equal(typeof web.storage.loadSettings, 'function');
  assert.equal(web.constants.BOARD_SIZE, android.constants.BOARD_SIZE);
});
