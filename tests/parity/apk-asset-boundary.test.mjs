import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const forbidden = path.join(root, 'we xin xiao cheng xu-android-apk/app/src/main/assets/js/js');

test('Android assets do not retain the ignored nested legacy engine directory', () => {
  assert.equal(fs.existsSync(forbidden), false, `forbidden asset directory exists: ${forbidden}`);
});
