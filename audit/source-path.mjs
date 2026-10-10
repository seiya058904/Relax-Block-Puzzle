// Audit harness path plumbing only; no product code or test oracle.
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
export const auditSourceRoot = resolve(process.env.AUDIT_SOURCE_ROOT || packageRoot);
export const auditModuleUrl = relative => pathToFileURL(resolve(auditSourceRoot, relative)).href;
export function auditOutputDir(area) {
  const directory = join(resolve(process.env.AUDIT_OUTPUT_DIR || join(packageRoot, 'audit/rerun')), area);
  mkdirSync(directory, { recursive: true });
  return directory;
}
export const auditOutputFile = (area, name) => join(auditOutputDir(area), name);
