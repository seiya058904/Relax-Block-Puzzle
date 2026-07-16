import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

test('piece generation simulation reports per-difficulty statistics', async () => {
  const { stdout } = await run(process.execPath, ['scripts/simulate-piece-generation.mjs', '--samples', '100'], {
    cwd: process.cwd()
  });
  const report = JSON.parse(stdout);

  for (const difficulty of ['easy', 'normal', 'master']) {
    assert.equal(report[difficulty].samples, 100);
    assert.ok(report[difficulty].categoryRatios);
    assert.ok(Number.isFinite(report[difficulty].failedRate));
    assert.ok(Number.isFinite(report[difficulty].maxSnakeStreak));
  }
});
