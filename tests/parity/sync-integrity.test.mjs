import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relax-sync 空格-'));
  const write = async (file, contents) => {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), contents);
  };
  for (const name of ['sync-platforms.mjs', 'verify-platforms.mjs', 'platform-inventory.mjs']) {
    await write(`scripts/${name}`, await fs.readFile(`scripts/${name}`));
  }
  const manifest = {
    shared: ['game/Foo.js'], generated: ['game/Foo.js'],
    targets: { wechat: 'wechat/js', web: 'web/js', android: 'android/js' },
    platformSpecific: { wechat: [], web: [], android: ['../java/', '../res/'] }
  };
  const saveManifest = () => write('config/platform-manifest.json', JSON.stringify(manifest));
  await write('shared/js/game/Foo.js', 'export const score = 10;\n');
  await saveManifest();
  const run = (script = 'sync-platforms.mjs', args = []) => spawnSync(process.execPath, [`scripts/${script}`, ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(run().status, 0);
  return { root, write, manifest, saveManifest, run };
}

test('sync inventory is complete, normalized and independently checks orphan files', async () => {
  for (const scenario of ['omitted', 'both omitted', 'new source', 'retired', 'alias', 'case', 'escape', 'absolute']) {
    const f = await fixture();
    if (scenario === 'omitted') f.manifest.generated = [];
    if (scenario === 'both omitted') f.manifest.shared = f.manifest.generated = [];
    if (scenario === 'new source') await f.write('shared/js/game/New.js', 'export const n = 1;');
    if (scenario === 'retired') {
      await fs.unlink(path.join(f.root, 'shared/js/game/Foo.js'));
      f.manifest.shared = f.manifest.generated = [];
    }
    if (scenario === 'alias') f.manifest.generated.push('game\\./Foo.js');
    if (scenario === 'case') f.manifest.generated.push('game/foo.js');
    if (scenario === 'escape') f.manifest.generated = ['../Foo.js'];
    if (scenario === 'absolute') f.manifest.generated = ['C:/Foo.js'];
    await f.saveManifest();
    for (const [script, args] of [['sync-platforms.mjs', []], ['sync-platforms.mjs', ['--check']], ['verify-platforms.mjs', []]]) {
      const result = f.run(script, args);
      assert.notEqual(result.status, 0, `${scenario}: ${script} ${args}`);
    }
    assert.match(await fs.readFile(path.join(f.root, 'web/js/game/Foo.js'), 'utf8'), /score = 10/);
  }
});

test('sync is idempotent, accepts a single normalized spelling, and detects drift and partial I/O failure', async () => {
  const f = await fixture();
  assert.match(f.run().stdout, /no generated files changed/);
  f.manifest.shared = ['game/./Foo.js'];
  f.manifest.generated = ['game\\Foo.js'];
  await f.saveManifest();
  assert.equal(f.run('sync-platforms.mjs', ['--check']).status, 0);
  assert.equal(f.run('verify-platforms.mjs').status, 0);
  await f.write('web/js/game/Foo.js', 'drift');
  assert.notEqual(f.run('sync-platforms.mjs', ['--check']).status, 0);
  assert.notEqual(f.run('verify-platforms.mjs').status, 0);
  assert.equal(f.run().status, 0);
  await f.write('shared/js/game/Foo.js', 'export const score = 11;\n');
  await fs.unlink(path.join(f.root, 'android/js/game/Foo.js'));
  await fs.mkdir(path.join(f.root, 'android/js/game/Foo.js'));
  assert.notEqual(f.run().status, 0);
  assert.notEqual(f.run('sync-platforms.mjs', ['--check']).status, 0);
  assert.notEqual(f.run('verify-platforms.mjs').status, 0);
});
