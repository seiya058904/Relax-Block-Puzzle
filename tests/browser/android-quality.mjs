import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runThemeChecks } from './theme-flows.mjs';
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
const adb = (...args) => execFileSync(adbPath, ['-s', device, ...args], {
  encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024
}).trim();
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
  if (port) {
    try { adb('forward', '--remove', `tcp:${port}`); }
    catch { console.warn('ADB device unavailable during forwarding cleanup'); }
    port = null;
  }
}
const reports = [];
try {
  for (const themeId of ['soft', 'classic']) {
  const page = await connect();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`); });
  page.on('requestfailed', (request) => console.log(`WebView request failed: ${request.url()} ${request.failure()?.errorText}`));
  const rendererSource = await page.evaluate(() => fetch('./js/game/Renderer.js').then((response) => response.text()));
  const localRenderer = await readFile('we xin xiao cheng xu-android-apk/app/src/main/assets/js/game/Renderer.js', 'utf8');
  assert.equal(rendererSource, localRenderer, 'installed WebView executes the exact local renderer');
  console.log(`Connected exact installed renderer on ${device}`);
  console.log(`Android ${themeId}: starting real theme switching checks`);
  const captureScreenshot = path => writeFile(path, execFileSync(adbPath,
    ['-s', device, 'exec-out', 'screencap', '-p'], { windowsHide: true, timeout: 15000, maxBuffer: 16 * 1024 * 1024 }));
  const themeChecks = await runThemeChecks(page, { themeId, touch: true,
    progress: message => console.log(`Android ${themeId}: ${message}`),
    captureComparison: target => captureScreenshot(resolve(output, `android-${themeId}-same-round-${target}.png`)) });
  const report = await runQualityFlows(page, { output, label: `android-webview-${themeId}`, touch: true, stressMs: 30000,
    progress: (message) => console.log(`Android: ${message}`),
    // Native compositor pixels: CDP screenshots can be black on software-rendered WebViews.
    captureScreenshot });
  await writeFile(resolve(output, `android-partial-${themeId}.json`), JSON.stringify({ ...report, errors, nativeLifecycleCycles: 0 }, null, 2));
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
  const nativeForegroundWaitMs = [];
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
  async function waitForForeground() {
    // Observe the WebView from Node timers. A page RAF waiter can miss the
    // native resume transition when the renderer's frame clock is suspended.
    const started = Date.now();
    let lastState;
    while (Date.now() - started < 5000) {
      let timer;
      const observed = await Promise.race([
        page.evaluate(() => ({
          paused: qaMain.isPaused,
          frame: qaMain.aniId,
          hidden: document.hidden,
          lifecyclePaused: qaMain.gameState.lifecyclePaused
        })).then((state) => ({ state })).catch((error) => ({ evaluationError: error.message })),
        new Promise((resolve) => { timer = setTimeout(() => resolve({ evaluationTimedOut: true }), 1000); })
      ]);
      clearTimeout(timer);
      if (observed.evaluationTimedOut || observed.evaluationError) {
        lastState = observed.evaluationError
          ? { pageEvaluationError: observed.evaluationError }
          : { pageEvaluationTimedOut: true };
        break;
      }
      lastState = observed.state;
      if (!lastState.paused && lastState.lifecyclePaused === false && lastState.frame === 0 && !lastState.hidden) {
        nativeForegroundWaitMs.push(Date.now() - started);
        return;
      }
      await pause(50);
    }

    const readAdb = (args) => {
      try { return adb(...args); }
      catch (error) { return `unavailable: ${error.message}`; }
    };
    const activity = readAdb(['shell', 'dumpsys', 'activity', 'activities'])
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /topResumedActivity=|mResumedActivity|ResumedActivity:/.test(line))
      .slice(0, 4);
    const logcat = readAdb(['logcat', '-d', '-t', '200', '-v', 'time'])
      .split(/\r?\n/)
      .filter((line) => /ActivityTaskManager|ActivityManager|com\.blockpuzzle\.android|chromium|FATAL EXCEPTION/.test(line))
      .slice(-30);
    throw new Error(`native foreground did not settle within 5 seconds: ${JSON.stringify({
      webView: lastState,
      pid: readAdb(['shell', 'pidof', app]),
      activity,
      logcat
    })}`);
  }
  adb('shell', 'input', 'keyevent', '3');
  await waitForBackground();
  assert.deepEqual(await page.evaluate(() => ({ paused: qaMain.isPaused, dragging: qaMain.gameState.dragState.isDragging,
    touch: qaMain.inputManager.activeTouchIdentifier, frame: qaMain.aniId })),
  { paused: true, dragging: false, touch: null, frame: 0 });
  adb('shell', 'am', 'start', '-n', `${app}/.MainActivity`);
  await waitForForeground();
  assert.deepEqual(await page.evaluate(() => qaMain.gameState.board.getSnapshot()), boardBefore);
  await touchSession.detach();
  for (let i = 0; i < 5; i++) {
    adb('shell', 'input', 'keyevent', '3');
    await waitForBackground();
    assert.equal(await page.evaluate(() => qaMain.isPaused && !qaMain.aniId), true);
    adb('shell', 'am', 'start', '-n', `${app}/.MainActivity`);
    await waitForForeground();
  }
  const stored = await page.evaluate(() => ({
    best: localStorage.getItem('block_puzzle_best_scores_v1'), settings: qaMain.settings,
    persistedSettings: wx.getStorageSync('block_puzzle_settings_v1')
  }));
  assert.deepEqual(stored.persistedSettings, stored.settings, 'restart compares committed settings, not a state-only fixture');
  await writeFile(resolve(output, `before-restart-${themeId}.json`), JSON.stringify(stored, null, 2));
  await writeFile(resolve(output, `android-native-${themeId}.png`), execFileSync(adbPath, ['-s', device, 'exec-out', 'screencap', '-p'], { windowsHide: true, timeout: 15000, maxBuffer: 16 * 1024 * 1024 }));
  await disconnect();
  adb('shell', 'am', 'force-stop', app);
  adb('shell', 'am', 'start', '-n', `${app}/.MainActivity`);
  const restarted = await connect();
  assert.equal(await restarted.evaluate(() => localStorage.getItem('block_puzzle_best_scores_v1')), stored.best);
  assert.deepEqual(await restarted.evaluate(() => qaMain.settings), stored.settings);
  assert.equal(await restarted.locator('#bootError').isVisible(), false);
  assert.equal(await restarted.evaluate(() => qaMain.renderer.theme.id), themeId, 'theme survives actual process restart');
  report.themeId = themeId; report.themeChecks = themeChecks;
  report.nativeLifecycleCycles = 6;
  report.nativeBackgroundWaitMs = nativeBackgroundWaitMs;
  report.nativeForegroundWaitMs = nativeForegroundWaitMs;
  report.processRestartPersistence = true;
  report.rendererSha256 = createHash('sha256').update(rendererSource).digest('hex');
  reports.push(report);
  await writeFile(resolve(output, 'android-results.json'), JSON.stringify(reports, null, 2));
  console.log(`PASS installed Android WebView: touch quality flows, exact renderer hash, 6 native hide/show cycles, force-stop/relaunch settings and best scores; stress ${Math.round(report.stress.elapsedMs)}ms/${report.stress.frames} frames, Canvas render p95 ${report.stress.p95Ms.toFixed(2)}ms`);
  await disconnect();
  }
} finally {
  await disconnect();
}
