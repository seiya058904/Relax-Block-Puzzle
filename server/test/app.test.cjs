const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { createRequire } = require('node:module');
const { gzipSync, deflateSync } = require('node:zlib');
const { buildApp } = require('../app');

const originalFetch = global.fetch;
const keys = ['WECHAT_APPID', 'WECHAT_SECRET', 'MEMBER_OPENIDS', 'ADMIN_OPENIDS', 'ADMIN_CODES'];
const originalEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
let server;
let port;
let upstreamCalls = 0;

before(async () => {
  Object.assign(process.env, {
    WECHAT_APPID: 'synthetic-app',
    WECHAT_SECRET: 'synthetic-secret',
    MEMBER_OPENIDS: 'synthetic-admin',
    ADMIN_OPENIDS: 'synthetic-admin',
    ADMIN_CODES: 'synthetic-admin-code'
  });
  global.fetch = async (input) => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://api.weixin.qq.com');
    assert.equal(url.pathname, '/sns/jscode2session');
    upstreamCalls += 1;
    return Response.json({
      openid: url.searchParams.get('js_code') === 'admin' ? 'synthetic-admin' : 'synthetic-user',
      session_key: 'synthetic-session-key'
    });
  };
  server = buildApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  port = server.address().port;
});

after(async () => {
  global.fetch = originalFetch;
  for (const key of keys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function request(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const bytes = body === undefined ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(body);
    const req = http.request({
      hostname: '127.0.0.1', port, path,
      method: bytes ? 'POST' : 'GET',
      headers: bytes ? { 'Content-Type': 'application/json', 'Content-Length': bytes.length, ...headers } : headers
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(text) }));
    });
    req.setTimeout(5000, () => req.destroy(new Error('local request timed out')));
    req.on('error', reject);
    req.end(bytes);
  });
}

test('Express resolves the patched parser while retaining its major version', () => {
  assert.match(require('express/package.json').version, /^4\./);
  const fromExpress = createRequire(require.resolve('express'));
  assert.equal(fromExpress('body-parser/package.json').version, '1.20.9');
});

test('health and login contracts remain compatible and omit private session data', async () => {
  const health = await request('/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { ok: true });
  assert.equal(health.headers['x-powered-by'], undefined);
  const login = await request('/api/login', JSON.stringify({ code: 'admin' }));
  assert.equal(login.status, 200);
  assert.equal(login.body.loggedIn, true);
  assert.equal(login.body.isMember, true);
  assert.equal(login.body.isAdminAllowed, true);
  assert.match(login.body.userId, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(login.body).includes('synthetic-'), false);
});

test('ordinary gzip and deflate JSON requests remain supported', async () => {
  for (const [encoding, compress] of [['gzip', gzipSync], ['deflate', deflateSync]]) {
    const result = await request('/api/login', compress('{"code":"user"}'), { 'Content-Encoding': encoding });
    assert.equal(result.status, 200);
    assert.equal(result.body.loggedIn, true);
    assert.equal(result.body.isAdminAllowed, false);
  }
});

test('invalid JSON and bodies over 64kb fail before calling WeChat', async () => {
  const beforeCalls = upstreamCalls;
  assert.equal((await request('/api/login', '{')).status, 400);
  const oversized = JSON.stringify({ code: 'user', padding: 'x'.repeat(65536) });
  assert.equal((await request('/api/login', oversized)).status, 413);
  assert.equal((await request('/api/login', gzipSync(oversized), { 'Content-Encoding': 'gzip' })).status, 413);
  assert.equal((await request('/api/login', '{"code":"user"}', { 'Content-Encoding': 'unsupported' })).status, 415);
  assert.equal(upstreamCalls, beforeCalls);
  assert.equal((await request('/api/health')).status, 200);
});

test('administrator access still requires both the allowlist and the code', async () => {
  for (const [code, adminCode, expected] of [
    ['admin', 'synthetic-admin-code', true],
    ['admin', 'wrong', false],
    ['user', 'synthetic-admin-code', false]
  ]) {
    const result = await request('/api/admin/verify', JSON.stringify({ code, adminCode }));
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { adminMode: expected });
  }
  const beforeCalls = upstreamCalls;
  assert.equal((await request('/api/admin/verify', '{"code":"admin"}')).status, 400);
  assert.equal((await request('/api/login', '{}')).status, 400);
  assert.equal(upstreamCalls, beforeCalls);
});
