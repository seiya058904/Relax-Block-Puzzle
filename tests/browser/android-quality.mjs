import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runQualityFlows } from './quality-flows.mjs';

// Requires a running QA emulator/device and an installed fresh debug APK.
// No production entry edits or second Main instance: a non-pausing conditional
// debugger breakpoint exposes the original constructor's `this` after reload.
const { chromium } = createRequire(import.meta.url)(process.env.QA_PLAYWRIGHT_PACKAGE || 'playwright');
const adbPath = process.env.QA_ADB || resolve(process.env.ANDROID_HOME, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const device = process.env.QA_ANDROID_SERIAL;
assert.ok(device, 'QA_ANDROID_SERIAL must identify an isolated QA device');
const output = resolve(process.env.QA_SCREENSHOTS || 'tmp/android-evidence');
const app = 'com.blockpuzzle.android';
const adb = (...args) => execFileSync(adbPath, ['-s', device, ...args], { encoding: 'utf8', windowsHide: true }).trim();
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const mainSource = await readFile('we xin xiao cheng xu-android-apk/app/src/main/assets/js/main.js', 'utf8');
const constructorLine = mainSource.split('\n').findIndex((line) => line.includes('this.bindAppLifecycle();'));
assert.ok(constructorLine >= 0);
await mkdir(output, { recursive: true });
let browser;
let port;
async function connect() {
  let pid = '';
  for (let i = 0; i < 30; i++) {
    try { pid = adb('shell', 'pidof', app); } catch { /* am start may precede process creation */ }
    if (pid) break;
    await pause(200);
  }
  assert.match(pid, /^\d+$/);
  for (let i = 0; i < 20; i++) {
    if (adb('shell', 'cat', '/proc/net/unix').includes(`webview_devtools_remote_${pid}`)) break;
    await pause(200);
  }
  port = adb('forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true, timeout: 10000 });
  const page = browser.contexts()[0].pages().find((page) => page.url().startsWith('https://appassets.androidplatform.net/assets/'));
  assert.ok(page, 'actual bundled WebView page');
  const session = await page.context().newCDPSession(page);
  await session.send('Debugger.enable');
  await session.send('Debugger.setBreakpointByUrl', {
    url: 'https://appassets.androidplatform.net/assets/js/main.js', lineNumber: constructorLine,
    condition: '(window.qaMain = this, false)'
  });
  await page.reload();
  await page.waitForFunction(() => !!window.qaMain?.renderer);
  await session.send('Debugger.disable');
  await session.detach();
  return page;
}
async function disconnect() {
  if (browser) { await browser.close(); browser = null; }
  if (port) { adb('forward', '--remove', `tcp:${port}`); port = null; }
}
try {
  const page = await connect();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`); });
  page.on('requestfailed', (request) => console.log(`WebView request failed: ${request.url()} ${request.failure()?.errorText}`));
  const rendererSource = await page.evaluate(() => fetch('./js/game/Renderer.js').then((response) => response.text()));
  const localRenderer = await readFile('we xin xiao cheng xu-android-apk/app/src/main/assets/js/game/Renderer.js', 'utf8');
  assert.equal(rendererSource, localRenderer, 'installed WebView executes the exact local renderer');
  console.log(`Connected exact installed renderer on ${device}`);
  const report = await runQualityFlows(page, { output, label: 'android-webview', touch: true, stressMs: 30000,
    progress: (message) => console.log(`Android: ${message}`) });
  await writeFile(resolve(output, 'android-results.json'), JSON.stringify({ ...report, errors, nativeLifecycleCycles: 0 }, null, 2));
  assert.deepEqual(errors, [], 'no actual WebView runtime/console errors');

  await page.evaluate(() => { qaMain.gameState.startNewGame(); qaMain.requestImmediateRender(); });
  await page.waitForFunction(() => !qaMain.hasActiveAnimation() && !qaMain.aniId);
  const touchSession = await page.context().newCDPSession(page);
  const area = await page.evaluate(() => qaMain.renderer.rackHitAreas[0]);
  await touchSession.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: area.x + area.width / 2, y: area.y + area.height / 2, id: 1 }]
  });
  assert.equal(await page.evaluate(() => qaMain.gameState.dragState.isDragging), true);
  const boardBefore = await page.evaluate(() => qaMain.gameState.board.getSnapshot());
  const nativeBackgroundWaitMs = [];
  async function waitForBackground() {
    // ADB returns before the Activity transition completes. Poll from Node:
    // WebView timers and RAF can stop while the app is in the background.
    const started = Date.now();
    while (!await page.evaluate(() => qaMain.isPaused && qaMain.aniId === 0)) {
      assert.ok(Date.now() - started < 5000, 'native background callback stops RAF within 5 seconds');
      await pause(50);
    }
    nativeBackgroundWaitMs.push(Date.now() - started);
  }
  adb('shell', 'input', 'keyevent', '3');
  await waitForBackground();
  assert.deepEqual(await page.evaluate(() => ({ paused: qaMain.isPaused, dragging: qaMain.gameState.dragState.isDragging,
    touch: qaMain.inputManager.activeTouchIdentifier, frame: qaMain.aniId })),
  { paused: true, dragging: false, touch: null, frame: 0 });
  adb('shell', 'am', 'start', '-n', `${app}/.MainActivity`);
  await page.waitForFunction(() => !qaMain.isPaused && !qaMain.aniId);
  assert.deepEqual(await page.evaluate(() => qaMain.gameState.board.getSnapshot()), boardBefore);
  await touchSession.detach();
  for (let i = 0; i < 5; i++) {
    adb('shell', 'input', 'keyevent', '3');
    await waitForBackground();
    assert.equal(await page.evaluate(() => qaMain.isPaused && !qaMain.aniId), true);
    adb('shell', 'am', 'start', '-n', `${app}/.MainActivity`);
    await page.waitForFunction(() => !qaMain.isPaused && !qaMain.aniId);
  }
  const stored = await page.evaluate(() => ({
    best: localStorage.getItem('block_puzzle_best_scores_v1'), settings: qaMain.settings
  }));
  await writeFile(resolve(output, 'android-native.png'), execFileSync(adbPath, ['-s', device, 'exec-out', 'screencap', '-p'], { windowsHide: true }));
  await disconnect();
  adb('shell', 'am', 'force-stop', app);
  adb('shell', 'am', 'start', '-n', `${app}/.MainActivity`);
  const restarted = await connect();
  assert.equal(await restarted.evaluate(() => localStorage.getItem('block_puzzle_best_scores_v1')), stored.best);
  assert.deepEqual(await restarted.evaluate(() => qaMain.settings), stored.settings);
  assert.equal(await restarted.locator('#bootError').isVisible(), false);
  report.nativeLifecycleCycles = 6;
  report.nativeBackgroundWaitMs = nativeBackgroundWaitMs;
  report.processRestartPersistence = true;
  report.rendererSha256 = createHash('sha256').update(rendererSource).digest('hex');
  await writeFile(resolve(output, 'android-results.json'), JSON.stringify(report, null, 2));
  console.log(`PASS installed Android WebView: touch quality flows, exact renderer hash, 6 native hide/show cycles, force-stop/relaunch settings and best scores; stress ${Math.round(report.stress.elapsedMs)}ms/${report.stress.frames} frames, Canvas render p95 ${report.stress.p95Ms.toFixed(2)}ms`);
} finally {
  await disconnect();
}
