#!/usr/bin/env python3
"""Read-only source-boundary evidence; run after restoring the Android audio mirror."""
import argparse
import datetime
import difflib
import hashlib
import json
import pathlib
import re
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('project', type=pathlib.Path)
parser.add_argument('baseline_manifest', type=pathlib.Path)
parser.add_argument('output', type=pathlib.Path)
parser.add_argument('--baseline-zip', type=pathlib.Path)
args = parser.parse_args()
root = args.project.resolve()
args.output.mkdir(parents=True, exist_ok=True)
old = json.loads(args.baseline_manifest.read_text())
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
current = {str(p.relative_to(root)): digest(p) for p in root.rglob('*') if p.is_file()}
changed = [p for p, sha in old.items() if p in current and current[p] != sha]
missing = [p for p in old if p not in current]
added = [p for p in current if p not in old]
manifest = json.loads((root / 'config/platform-manifest.json').read_text())
marker = '// GENERATED FILE - edit shared/js source and run npm run sync.\n'
drift = []
for relative in manifest['generated']:
    source = (root / 'shared/js' / relative).read_text()
    for platform, target in manifest['targets'].items():
        p = root / target / relative
        if not p.is_file() or p.read_text() != marker + source:
            drift.append(str(p.relative_to(root)))

protected = {}
for p, sha in old.items():
    if (p.startswith(('server/', '.github/', 'config/')) or 'gradle' in p.lower()
            or p.endswith(('.kt', '.kts', 'AndroidManifest.xml', 'project.config.json',
                           'game.json', 'index.html', 'game.js'))
            or any(part in p for part in ('/config/', '/res/', '/api/'))):
        protected[p] = current.get(p) == sha

audio = {}
paths = {
    'wechat': 'we xin xiao cheng xu/audio',
    'web': 'we xin xiao cheng xu-android-apk/docs/audio',
    'android': 'we xin xiao cheng xu-android-apk/app/src/main/assets/audio',
}
for platform, relative in paths.items():
    directory = root / relative
    files = sorted(p for p in directory.rglob('*') if p.is_file())
    audio[platform] = {
        'files': len(files), 'bytes': sum(p.stat().st_size for p in files),
        'sha256': {str(p.relative_to(directory)): digest(p) for p in files},
    }
audio['fullMirrorsIdentical'] = audio['web']['sha256'] == audio['android']['sha256']

scopes = ['shared/js', 'we xin xiao cheng xu', 'we xin xiao cheng xu-android-apk/docs',
          'we xin xiao cheng xu-android-apk/app/src/main/assets']
unresolved, extensionless, edges = [], [], 0
pattern = re.compile(r'''(?:import\s+(?:[^;]*?\s+from\s+)?|export\s+[^;]*?\s+from\s+)["'](\.[^"']+)["']''')
for scope in scopes:
    for p in (root / scope).rglob('*.js'):
        for match in pattern.finditer(p.read_text()):
            edges += 1
            value = match.group(1)
            item = {'source': str(p.relative_to(root)), 'import': value}
            candidates = [p.parent / value]
            if not pathlib.Path(value).suffix:
                candidates.append(p.parent / (value + '.js'))
                extensionless.append(item)
            if not any(candidate.is_file() for candidate in candidates):
                unresolved.append(item)

time = datetime.datetime.now(datetime.timezone.utc).isoformat()
inventory = {
    'checkedAtUtc': time, 'originalFiles': len(old), 'currentFiles': len(current),
    'changed': changed, 'missing': missing, 'added': added,
    'generatedDrift': drift, 'protectedFilesUnchanged': protected, 'audio': audio,
}
entry = {
    'checkedAtUtc': time, 'relativeImportEdges': edges, 'unresolvedImports': unresolved,
    'extensionlessEntryImports': extensionless, 'protectedCompared': len(protected),
    'protectedUnchanged': all(protected.values()), 'protectedHashesUnchanged': protected,
}
for name, report in [('inventory-check.json', inventory), ('entry-config-check.json', entry)]:
    (args.output / name).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')

if args.baseline_zip:
    with zipfile.ZipFile(args.baseline_zip) as archive:
        names = archive.namelist()
        patches = []
        for p in changed:
            if pathlib.Path(p).suffix not in {'.js', '.mjs', '.md', '.json', '.kt', '.kts', '.html'}:
                continue
            matches = [name for name in names if name == p or name.endswith('/' + p)]
            if len(matches) != 1:
                continue
            before = archive.read(matches[0]).decode('utf8').replace('\r\n', '\n').splitlines(keepends=True)
            after = (root / p).read_text().splitlines(keepends=True)
            patches.extend(difflib.unified_diff(before, after, fromfile='baseline/' + p, tofile='audit/' + p))
        (args.output / 'current-diff.patch').write_text(''.join(patches))

print(json.dumps({
    'checkedAtUtc': time, 'originalFiles': len(old), 'currentFiles': len(current),
    'modifiedOriginalFiles': len(changed), 'missingOriginalFiles': missing,
    'generatedCopies': len(manifest['generated']) * len(manifest['targets']),
    'generatedDrift': drift, 'protectedCompared': len(protected),
    'protectedUnchanged': all(protected.values()), 'relativeImportEdges': edges,
    'unresolvedImports': unresolved,
    'audio': {k: {'files': v['files'], 'bytes': v['bytes']} for k, v in audio.items() if isinstance(v, dict)},
    'fullAudioMirrorsIdentical': audio['fullMirrorsIdentical'],
}, ensure_ascii=False, indent=2))
if missing or drift or unresolved or not all(protected.values()) or not audio['fullMirrorsIdentical']:
    raise SystemExit(1)
