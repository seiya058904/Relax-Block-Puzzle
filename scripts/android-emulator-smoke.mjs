import assert from 'node:assert/strict';

const phase = process.argv[2];
assert.ok(phase === 'set' || phase === 'verify');
const score = 731;
const expression = `(async () => {
  const storage = await import('/assets/js/utils/storage.js');
  ${phase === 'set' ? `const saved = await storage.saveBestScore('normal', ${score});` : 'const saved = null;'}
  return ({ ready: document.readyState, title: document.title, canvas: !!document.getElementById('gameCanvas'), href: location.href, saved, score: storage.loadBestScore('normal') });
})()`;

let page;
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    const response = await fetch('http://127.0.0.1:9222/json');
    const pages = await response.json();
    page = pages.find(item => item.url?.startsWith('https://appassets.androidplatform.net/assets/index.html'));
    if (page?.webSocketDebuggerUrl) break;
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 1000));
}
assert.ok(page?.webSocketDebuggerUrl, 'packaged WebView page did not appear');
const ws = new WebSocket(page.webSocketDebuggerUrl);
const result = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('CDP Runtime.evaluate timed out')), 15000);
  ws.addEventListener('open', () => ws.send(JSON.stringify({id: 1, method: 'Runtime.evaluate', params: {expression, returnByValue: true, awaitPromise: true}})), {once: true});
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id !== 1) return;
    clearTimeout(timeout);
    if (message.error || message.result?.exceptionDetails) reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
    else resolve(message.result.result.value);
  });
  ws.addEventListener('error', error => reject(error), {once: true});
});
ws.close();
assert.equal(result.ready, 'complete');
assert.equal(result.canvas, true);
assert.match(result.title, /俄罗斯|方块/);
assert.equal(result.href, 'https://appassets.androidplatform.net/assets/index.html');
if (phase === 'set') assert.equal(result.saved?.score, score);
assert.equal(result.score, score);
console.log(JSON.stringify({phase, result, status: 'PASS'}));
