import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = JSON.parse(await fs.readFile(path.join(rootDir, 'config', 'platform-manifest.json'), 'utf8'));
const resourceMap = JSON.parse(await fs.readFile(path.join(rootDir, 'config', 'resource-map.json'), 'utf8'));

async function totalBytes(directory) {
  const files = await fs.readdir(directory, { withFileTypes: true });
  let total = 0;
  for (const file of files) {
    const fullPath = path.join(directory, file.name);
    if (file.isDirectory()) total += await totalBytes(fullPath);
    else total += (await fs.stat(fullPath)).size;
  }
  return total;
}

test('wechat audio remains under the light resource budget', async () => {
  const bytes = await totalBytes(path.join(rootDir, 'we xin xiao cheng xu', 'audio'));
  assert.ok(bytes <= manifest.resources.wechat.audioMaxBytes, `${bytes} > ${manifest.resources.wechat.audioMaxBytes}`);
});

test('web and Android retain the full audio budget', async () => {
  const [web, android] = await Promise.all([
    totalBytes(path.join(rootDir, 'we xin xiao cheng xu-android-apk', 'docs', 'audio')),
    totalBytes(path.join(rootDir, 'we xin xiao cheng xu-android-apk', 'app', 'src', 'main', 'assets', 'audio'))
  ]);
  assert.ok(web >= manifest.resources.full.audioMinBytes);
  assert.ok(android >= manifest.resources.full.audioMinBytes);
});

test('resource map resolves every logical sound on both quality tiers', async () => {
  for (const [name, mapping] of Object.entries(resourceMap)) {
    for (const tier of ['wechat', 'full']) {
      assert.equal(typeof mapping[tier], 'string', `${name}.${tier} is missing`);
    }
  }
  assert.equal(Object.keys(resourceMap).length, 11);
});

test('published audio directories contain only mapped audio files', async () => {
  for (const [tier, directory] of [
    ['wechat', path.join(rootDir, 'we xin xiao cheng xu', 'audio')],
    ['full', path.join(rootDir, 'we xin xiao cheng xu-android-apk', 'docs', 'audio')],
    ['full', path.join(rootDir, 'we xin xiao cheng xu-android-apk', 'app', 'src', 'main', 'assets', 'audio')]
  ]) {
    const expected = new Set(Object.values(resourceMap).map((mapping) => mapping[tier].replace(/^audio[\\/]/, '')));
    const actual = new Set((await fs.readdir(directory)).filter((name) => name.endsWith('.mp3')));
    assert.deepEqual([...actual].sort(), [...expected].sort());
  }
});

test('Android and web full audio files remain byte-identical', async () => {
  const webDir = path.join(rootDir, 'we xin xiao cheng xu-android-apk', 'docs');
  const androidDir = path.join(rootDir, 'we xin xiao cheng xu-android-apk', 'app', 'src', 'main', 'assets');
  for (const mapping of Object.values(resourceMap)) {
    const [web, android] = await Promise.all([
      fs.readFile(path.join(webDir, mapping.full)),
      fs.readFile(path.join(androidDir, mapping.full))
    ]);
    assert.deepEqual(web, android);
  }
});
