import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const server = readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
const readme = readFileSync(process.env.QA_README_SOURCE || new URL('../server/README.md', import.meta.url), 'utf8');
function listenPort(env) {
  let port;
  vm.runInNewContext(server, { process: { env }, console: { log() {} },
    require: () => ({ buildApp: () => ({ listen(value) { port = value; } }) }) });
  return port;
}
test('documented default matches the actual server entry and example URLs', () => {
  assert.equal(listenPort({}), 80);
  assert.match(readme, /默认端口：\s*```text\s*80\s*```/);
  assert.ok(!readme.includes('localhost:3000'));
  for (const route of ['/api/health', '/api/login', '/api/admin/verify']) {
    assert.ok(readme.includes('http://localhost' + route));
  }
});
test('explicit PORT still overrides the unchanged production entry', () => {
  assert.equal(listenPort({ PORT: '3000' }), 3000);
  assert.ok(readme.includes('`PORT`'));
});
