import test from 'node:test';
import assert from 'node:assert/strict';
import { loadVersion } from '../helpers/version-adapter.mjs';
import { installWxStorage } from '../helpers/platform-mocks.mjs';

const key = 'block_puzzle_best_scores_v1';
const original = { easy: 123, normal: 456, master: 789 };
for (const version of ['wechat', 'web', 'android']) {
  test(`${version}: failed or malformed reads never authorize writes`, async () => {
    const { storage: api } = await loadVersion(version);
    for (const failure of ['exception', 'legacy exception', 'string', 'array', 'null', 'number', 'boolean']) {
      for (const operation of [() => api.loadBestScores(), () => api.saveBestScore('normal', 500), () => api.resetBestScore('normal')]) {
        let writes = 0;
        let stored = structuredClone(original);
        const restore = installWxStorage({
          getStorageSync(name) {
            if (name === key) {
              if (failure === 'exception') throw new Error('read failure');
              if (failure === 'legacy exception') return '';
              return { string: 'broken', array: [], null: null, number: 0, boolean: false }[failure];
            }
            if (failure === 'legacy exception') throw new Error('legacy read failure');
            return 999;
          },
          setStorageSync(name, value) { writes++; stored = value; }
        });
        try {
          operation();
          assert.equal(writes, 0, failure);
          assert.deepEqual(stored, original);
        } finally { restore(); }
      }
    }
  });

  test(`${version}: partial objects and recovery preserve other difficulties`, async () => {
    const { storage: api } = await loadVersion(version);
    let stored = { easy: 12 };
    let fail = false;
    const restore = installWxStorage({
      getStorageSync() { if (fail) { fail = false; throw new Error('once'); } return stored; },
      setStorageSync(name, value) { stored = value; }
    });
    try {
      assert.deepEqual(api.loadBestScores(), { easy: 12, normal: 0, master: 0 });
      stored = structuredClone(original);
      fail = true;
      api.saveBestScore('normal', 500);
      assert.deepEqual(stored, original);
      api.saveBestScore('normal', 500);
      assert.deepEqual(stored, { ...original, normal: 500 });
      api.resetBestScore('normal');
      assert.deepEqual(stored, { ...original, normal: 0 });
    } finally { restore(); }
  });
}
