import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await fs.readFile(path.join(rootDir, 'config', 'platform-manifest.json'), 'utf8'));
const resourceMap = JSON.parse(await fs.readFile(path.join(rootDir, 'config', 'resource-map.json'), 'utf8'));

async function filesIn(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function expectedAudioFiles(tier) {
  return new Set(Object.values(resourceMap).map((mapping) => mapping[tier].replace(/^audio[\\/]/, '')));
}

async function summarize(relativeDirectory, tier) {
  const directory = path.join(rootDir, relativeDirectory);
  const files = await filesIn(directory);
  const expected = expectedAudioFiles(tier);
  const hashes = new Map();
  let totalBytes = 0;
  let largest = { path: '', bytes: 0 };

  for (const file of files) {
    const data = await fs.readFile(file);
    totalBytes += data.length;
    if (data.length > largest.bytes) largest = { path: path.relative(rootDir, file), bytes: data.length };
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    hashes.set(hash, (hashes.get(hash) || 0) + 1);
  }

  return {
    files: files.length,
    totalBytes,
    largest,
    duplicateFileCount: Array.from(hashes.values()).filter((count) => count > 1).reduce((sum, count) => sum + count, 0),
    unusedFiles: files
      .map((file) => path.relative(directory, file).replaceAll('\\', '/'))
      .filter((file) => !expected.has(file)),
    missingFiles: Array.from(expected).filter((file) => !files.some((candidate) => path.relative(directory, candidate).replaceAll('\\', '/') === file))
  };
}

const report = {
  wechatAudio: await summarize('we xin xiao cheng xu/audio', 'wechat'),
  webAudio: await summarize('we xin xiao cheng xu-android-apk/docs/audio', 'full'),
  androidAudio: await summarize('we xin xiao cheng xu-android-apk/app/src/main/assets/audio', 'full')
};

for (const [name, summary] of Object.entries(report)) {
  if (summary.unusedFiles.length > 0) throw new Error(`${name} contains unused audio: ${summary.unusedFiles.join(', ')}`);
  if (summary.missingFiles.length > 0) throw new Error(`${name} is missing mapped audio: ${summary.missingFiles.join(', ')}`);
}

if (report.wechatAudio.totalBytes > manifest.resources.wechat.audioMaxBytes) {
  throw new Error(`wechat audio exceeds budget: ${report.wechatAudio.totalBytes}`);
}
if (report.webAudio.totalBytes < manifest.resources.full.audioMinBytes) {
  throw new Error(`web audio is below full-resource floor: ${report.webAudio.totalBytes}`);
}
if (report.androidAudio.totalBytes < manifest.resources.full.audioMinBytes) {
  throw new Error(`Android audio is below full-resource floor: ${report.androidAudio.totalBytes}`);
}

console.log(JSON.stringify(report, null, 2));
