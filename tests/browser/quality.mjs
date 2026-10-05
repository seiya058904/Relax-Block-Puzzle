import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
import { runQualityFlows } from './quality-flows.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.QA_PLAYWRIGHT_PACKAGE || 'playwright');
const root = resolve(process.env.QA_DOCS_ROOT || 'we xin xiao cheng xu-android-apk/docs');
const wxRoot = resolve('we xin xiao cheng xu');
const output = resolve(process.env.QA_SCREENSHOTS || 'tmp/browser-evidence');
const entry = await readFile(resolve(root, 'game.js'), 'utf8');
assert.equal(entry.split('new Main();').length - 1, 1);
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
    if (pathname === '/wechat.html') {
      // This hosts the actual WeChat adapter in Chromium. It is explicitly not
      // WeChat Developer Tools or a native wx API/audio/vibration acceptance.
      const source = html.replace('import "./game.js";', `
        wx.getWindowInfo = wx.getSystemInfoSync;
        wx.getMenuButtonBoundingClientRect = () => ({ top: 48, height: 32, left: innerWidth - 104, width: 88 });
        const { default: Main } = await import('./wechat/js/main.js');
        Main.prototype.initializeAuth = async () => {};
        window.qaMain = new Main();`);
      res.writeHead(200, { 'Content-Type': 'text/html' }).end(source);
      return;
    }
    const isWx = pathname.startsWith('/wechat/');
    const base = isWx ? wxRoot : root;
    const file = resolve(base, `.${isWx ? pathname.slice('/wechat'.length) : pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(base + sep)) { res.writeHead(403).end(); return; }
    const content = file === resolve(root, 'game.js') ? entry.replace('new Main();', 'window.qaMain = new Main();') : await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }).end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
const reports = [];
try {
  browser = await chromium.launch();
  await mkdir(output, { recursive: true });
  const cases = [
    { width: 1280, height: 900, dpr: 1.25 },
    { width: 390, height: 844, dpr: 3, touch: true, stressMs: 30000 },
    { width: 320, height: 568, dpr: 3, touch: true },
    { width: 768, height: 1024, dpr: 2 },
    { width: 360, height: 640, dpr: 2.5, touch: true, reducedMotion: 'reduce', safeArea: true },
    { width: 390, height: 844, dpr: 3, touch: true, wechat: true, stressMs: 10000 }
  ];
  for (const item of cases) {
    const label = `${item.wechat ? 'wechat-host' : 'web'}-${item.width}${item.reducedMotion ? '-reduced' : ''}`;
    const context = await browser.newContext({ viewport: { width: item.width, height: item.height },
      deviceScaleFactor: item.dpr, hasTouch: !!item.touch, reducedMotion: item.reducedMotion || 'no-preference' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/${item.wechat ? 'wechat.html' : ''}`);
    await page.waitForFunction(() => window.qaMain);
    if (item.safeArea) await page.evaluate(() => {
      const read = wx.getSystemInfoSync;
      wx.getSystemInfoSync = () => ({ ...read(), safeArea: { top: 59, left: 0, right: innerWidth, bottom: innerHeight - 34 } });
      qaMain.handleViewportChange();
    });
    const report = await runQualityFlows(page, { output, label, touch: item.touch, stressMs: item.stressMs });
    if (item.wechat) {
      for (const outcome of ['success', 'failure', 'exception', 'hidden']) {
        await page.evaluate(result => {
          const state = qaMain.gameState;
          state.initializeHomeState(); state.openAdminPanel(); state.adminInput = 'local-test-code';
          state.setAuthClient({ verifyAdmin: () => new Promise((resolve, reject) => { window.qaAuthComplete = () => result === 'exception' ? reject(new Error('offline')) : resolve({ adminMode: result === 'success' }); }) });
          qaMain.renderer.getAdminAction = () => 'confirm';
          window.qaAuthRenders = 0;
          if (!window.qaObserveAuthRender) { const render = qaMain.renderer.render.bind(qaMain.renderer); qaMain.renderer.render = current => { window.qaAuthRenders++; return render(current); }; window.qaObserveAuthRender = true; }
          qaMain.inputManager.handleAdminTouch({ x: 0, y: 0 }); qaMain.requestRender();
        }, outcome);
        await page.waitForFunction(() => qaMain.aniId === 0);
        const renders = await page.evaluate(() => window.qaAuthRenders);
        if (outcome === 'hidden') await page.evaluate(() => qaMain.handleAppBackground());
        await page.evaluate(() => window.qaAuthComplete());
        if (outcome === 'hidden') {
          await page.waitForTimeout(100);
          assert.equal(await page.evaluate(() => qaMain.aniId), 0);
          assert.equal(await page.evaluate(() => window.qaAuthRenders), renders);
          await page.evaluate(() => qaMain.handleAppForeground());
        }
        await page.waitForFunction(previous => window.qaAuthRenders > previous, renders);
        await page.waitForFunction(() => qaMain.aniId === 0);
        if (outcome === 'success') { assert.equal(await page.evaluate(() => qaMain.gameState.ui.isAdminPanelOpen), false); await page.evaluate(() => qaMain.gameState.disableAdminMode()); }
        else assert.equal(await page.evaluate(() => qaMain.gameState.adminError), '验证失败');
      }
      console.log('PASS wechat-host delayed admin success/failure/exception after idle; hidden scheduling preserved');
    }
    if (item.reducedMotion) assert.equal(report.metrics.reducedMotion, true);
    assert.deepEqual(errors, [], `${label}: no runtime or console errors`);
    reports.push(report);
    console.log(`PASS ${label}: actual ${item.touch ? 'touch' : 'mouse'} drag, invalid/valid, undo, 1/2/3-line clears, combo, tools, pause, revive, gameover, cache and redraw${report.stress ? `; stress ${Math.round(report.stress.elapsedMs)}ms/${report.stress.frames} frames, render p95 ${report.stress.p95Ms.toFixed(2)}ms` : ''}`);
    await context.close();
  }
  await writeFile(resolve(output, 'quality-results.json'), JSON.stringify(reports, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise((done) => server.close(done));
}
