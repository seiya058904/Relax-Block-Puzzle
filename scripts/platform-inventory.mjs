import fs from 'node:fs/promises';
import path from 'node:path';

export const marker = '// GENERATED FILE - edit shared/js source and run npm run sync.\n';

function normalizeMapping(value) {
  if (typeof value !== 'string' || !value || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) {
    throw new Error(`invalid generated path: ${value}`);
  }
  const parts = value.replaceAll('\\', '/').split('/');
  if (parts.includes('..') || value.includes(':')) throw new Error(`unsafe generated path: ${value}`);
  const normalized = path.posix.normalize(parts.join('/'));
  if (normalized === '.' || normalized.endsWith('/')) throw new Error(`invalid generated file: ${value}`);
  return normalized;
}

function inventory(values, label) {
  if (!Array.isArray(values)) throw new Error(`missing inventory: ${label}`);
  const result = new Set();
  const folded = new Map();
  for (const value of values) {
    const normalized = normalizeMapping(value);
    const key = normalized.toLowerCase();
    if (folded.has(key)) throw new Error(`${label} duplicate/case collision: ${folded.get(key)} / ${value}`);
    folded.set(key, value);
    result.add(normalized);
  }
  return result;
}

async function filesUnder(directory, prefix = '') {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error(`symlink in platform inventory: ${directory}/${entry.name}`);
    if (entry.isDirectory()) files.push(...await filesUnder(path.join(directory, entry.name), relative + '/'));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function equalInventory(actual, declared, label) {
  const missing = [...actual].filter((file) => !declared.has(file));
  const extra = [...declared].filter((file) => !actual.has(file));
  if (missing.length || extra.length) {
    throw new Error(`${label} coverage mismatch; undeclared: ${missing.join(', ')}; missing source: ${extra.join(', ')}`);
  }
}

export async function validateInventory(rootDir, manifest) {
  const actual = inventory(await filesUnder(path.join(rootDir, 'shared', 'js')), 'shared/js');
  const shared = inventory(manifest.shared, 'shared');
  const generated = inventory(manifest.generated, 'generated');
  equalInventory(actual, shared, 'shared');
  equalInventory(actual, generated, 'generated');

  for (const [platform, target] of Object.entries(manifest.targets)) {
    const targetDir = path.resolve(rootDir, target);
    const relativeTarget = path.relative(rootDir, targetDir);
    if (!relativeTarget || relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
      throw new Error(`unsafe target: ${target}`);
    }
    for (const declaration of manifest.platformSpecific[platform] || []) {
      // These are adapter declarations, not generated mappings (Android has ../java/).
      const adapter = path.posix.normalize(declaration.replaceAll('\\', '/')).toLowerCase();
      for (const file of actual) {
        if (file.toLowerCase() === adapter || (adapter.endsWith('/') && file.toLowerCase().startsWith(adapter))) {
          throw new Error(`shared/platform-specific conflict: ${platform}/${file}`);
        }
      }
    }
    let targetFiles;
    try {
      targetFiles = await filesUnder(targetDir);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      targetFiles = [];
    }
    inventory(targetFiles, `${platform} files`);
    for (const file of targetFiles) {
      const contents = await fs.readFile(path.join(targetDir, file), 'utf8');
      if (contents.replaceAll('\r\n', '\n').replace(/^\ufeff/, '').startsWith(marker) && !actual.has(file)) {
        throw new Error(`orphan generated file: ${platform}/${file}`);
      }
    }
  }
  return [...actual].sort();
}
