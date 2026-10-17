import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The published browser build (docs/js) and the bundled Android WebView assets
// (app/src/main/assets/js) are two copies of the same platform code. Only the
// shared modules are written by `npm run sync`; everything else is maintained by
// hand, so an automated byte comparison is the only guard against letting the
// deployed Web build drift away from the APK build.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const docsRoot = path.join(rootDir, 'we xin xiao cheng xu-android-apk', 'docs', 'js');
const assetRoot = path.join(rootDir, 'we xin xiao cheng xu-android-apk', 'app', 'src', 'main', 'assets', 'js');

async function filesUnder(directory, prefix = '') {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await filesUnder(path.join(directory, entry.name), relative + '/'));
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
}

function normalized(buffer) {
  return buffer.toString('utf8').replace(/\r\n/g, '\n');
}

test('docs/js and the Android asset copy contain the same files', async () => {
  const docs = await filesUnder(docsRoot);
  const assets = await filesUnder(assetRoot);
  assert.ok(docs.length > 0);
  assert.deepEqual(assets, docs, 'browser build and Android asset file sets differ');
});

test('every browser/Android platform module is byte-identical', async () => {
  const files = await filesUnder(docsRoot);
  for (const relative of files) {
    const docsText = normalized(await fs.readFile(path.join(docsRoot, relative)));
    const assetText = normalized(await fs.readFile(path.join(assetRoot, relative)));
    assert.equal(assetText, docsText, `${relative} drifted between docs/js and assets/js`);
  }
});
