import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await fs.readFile(path.join(rootDir, 'config', 'platform-manifest.json'), 'utf8'));
const marker = '// GENERATED FILE - edit shared/js source and run npm run sync.\n';

for (const relativePath of manifest.generated) {
  const source = await fs.readFile(path.join(rootDir, 'shared', 'js', relativePath), 'utf8');
  if (source.includes('\ufeff')) throw new Error(`BOM is not allowed in shared/${relativePath}`);
  const expected = marker + source.replaceAll('\r\n', '\n');
  for (const platform of Object.keys(manifest.targets)) {
    const output = path.join(rootDir, manifest.targets[platform], relativePath);
    const actual = (await fs.readFile(output, 'utf8')).replaceAll('\r\n', '\n');
    if (actual !== expected) throw new Error(`generated file drift: ${path.relative(rootDir, output)}`);
  }
}

console.log(`verified ${manifest.generated.length} shared files across ${Object.keys(manifest.targets).length} targets`);
