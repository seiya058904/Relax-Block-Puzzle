import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifestPath = path.join(rootDir, 'config', 'platform-manifest.json');

test('platform manifest declares shared, platform-specific, generated, and resource sections', async () => {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

  for (const key of ['shared', 'platformSpecific', 'generated', 'resources']) {
    assert.ok(manifest[key], `missing manifest section: ${key}`);
  }

  assert.ok(manifest.shared.includes('game/Board.js'));
  assert.ok(manifest.shared.includes('game/Piece.js'));
  assert.ok(manifest.shared.includes('game/ScoreManager.js'));
  assert.ok(manifest.resources.wechat.audioMaxBytes > 0);
  assert.equal(manifest.resources.syncAudio, false);
});

test('platform manifest never classifies audio as shared source', async () => {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

  assert.equal(manifest.shared.some((file) => file.startsWith('audio/')), false);
  assert.equal(manifest.generated.some((file) => file.startsWith('audio/')), false);
});
