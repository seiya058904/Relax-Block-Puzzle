import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resourceMap = JSON.parse(await fs.readFile(path.join(rootDir, 'config/resource-map.json'), 'utf8'));
const sourceDir = path.join(rootDir, 'we xin xiao cheng xu-android-apk/docs/audio');
const targetDir = path.join(rootDir, 'we xin xiao cheng xu-android-apk/app/src/main/assets/audio');
const names = [...new Set(Object.values(resourceMap).map(mapping => {
  if (!/^audio\/[A-Za-z0-9_.-]+$/.test(mapping.full)) throw new Error('Unexpected full audio path');
  return mapping.full.slice('audio/'.length);
}))].sort();

async function checkDirectory(directory, allowMissing) {
  let entries;
  try { entries = await fs.readdir(directory, { withFileTypes: true }); }
  catch (error) {
    if (allowMissing && error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !names.includes(entry.name)) {
      throw new Error(`Unmapped entry in ${path.relative(rootDir, directory)}: ${entry.name}`);
    }
  }
  if (!allowMissing && entries.length !== names.length) throw new Error('The retained full audio source is incomplete');
}

// Never copy the containing directory into an existing target (audio/audio).
// Refuse unrelated entries instead of deleting files to make verification pass.
await checkDirectory(sourceDir, false);
await checkDirectory(targetDir, true);
await fs.mkdir(targetDir, { recursive: true });
let bytes = 0;
const sha256 = data => createHash('sha256').update(data).digest('hex');
for (const name of names) {
  const source = await fs.readFile(path.join(sourceDir, name));
  const target = path.join(targetDir, name);
  await fs.writeFile(target, source);
  if (sha256(await fs.readFile(target)) !== sha256(source)) throw new Error(`Audio hash mismatch: ${name}`);
  bytes += source.length;
}
console.log(`Restored and SHA-256 verified ${names.length} Android audio files (${bytes} bytes). Safe to rerun.`);
