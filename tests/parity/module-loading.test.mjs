import test from 'node:test';
import assert from 'node:assert/strict';

import { loadVersion } from '../helpers/version-adapter.mjs';

for (const version of ['wechat', 'android']) {
  test(`${version}: loads the shared core modules`, async () => {
    const modules = await loadVersion(version);

    assert.equal(typeof modules.Board, 'function');
    assert.equal(typeof modules.createRack, 'function');
    assert.equal(typeof modules.ScoreManager, 'function');
    assert.equal(typeof modules.GameState, 'function');
    assert.equal(typeof modules.storage.loadSettings, 'function');
  });
}
