import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await fs.readFile(path.join(rootDir, 'config', 'platform-manifest.json'), 'utf8'));
const checkOnly = process.argv.includes('--check');
const marker = '// GENERATED FILE - edit shared/js source and run npm run sync.\n';

function targetPath(platform, relativePath) {
  return path.join(rootDir, manifest.targets[platform], relativePath);
}

async function readUtf8(filePath) {
  const data = await fs.readFile(filePath);
  if (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    throw new Error(`BOM is not allowed: ${path.relative(rootDir, filePath)}`);
  }
  return data.toString('utf8').replaceAll('\r\n', '\n');
}

const drift = [];
for (const relativePath of manifest.generated) {
  const sourcePath = path.join(rootDir, 'shared', 'js', relativePath);
  const source = await readUtf8(sourcePath);
  const expected = marker + source;

  for (const platform of Object.keys(manifest.targets)) {
    const outputPath = targetPath(platform, relativePath);
    let current = '';
    try {
      current = await readUtf8(outputPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    if (current !== expected) {
      drift.push(path.relative(rootDir, outputPath));
      if (!checkOnly) {
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, expected, 'utf8');
      }
    }
  }
}

if (drift.length > 0) {
  if (checkOnly) {
    console.error(`platform drift (${drift.length}):`);
    for (const file of drift) console.error(`- ${file}`);
    process.exitCode = 1;
  } else {
    console.log(`synced ${drift.length} generated files`);
  }
} else {
  console.log(checkOnly ? 'platforms are in sync' : 'no generated files changed');
}
