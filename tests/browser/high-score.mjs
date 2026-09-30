import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

// The browser dependency is installed in CI's temporary directory, not shipped.
const { chromium } = createRequire(import.meta.url)(process.env.QA_PLAYWRIGHT_PACKAGE || 'playwright');
const root = resolve(process.env.QA_DOCS_ROOT || 'we xin xiao cheng xu-android-apk/docs');
const output = resolve(process.env.QA_SCREENSHOTS || 'tmp/browser-evidence');
const entry = await readFile(resolve(root, 'game.js'), 'utf8');
assert.equal(entry.split('new Main();').length - 1, 1, 'expose exactly the original application instance');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const content = file === resolve(root, 'game.js')
      ? entry.replace('new Main();', 'window.qaMain = new Main();')
      : await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }).end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch();
  await mkdir(output, { recursive: true });
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    const errors = [];
    const pages = [await context.newPage(), await context.newPage()];
    for (const page of pages) {
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    }
    const [a, b] = pages;
    await a.goto(origin);
    await a.waitForFunction(() => !!window.qaMain);
    await a.evaluate(() => localStorage.setItem('block_puzzle_best_scores_v1', JSON.stringify({ easy: 123, normal: 5, master: 789 })));
    await a.reload();
    await b.goto(origin);
    for (const page of pages) {
      await page.waitForFunction(() => !!window.qaMain);
      assert.equal(new URL(page.url()).origin, origin);
      assert.ok(await page.title());
      assert.equal(await page.locator('#gameCanvas').isVisible(), true);
      assert.equal(await page.locator('#bootError').isVisible(), false);
      await page.evaluate(() => window.qaMain.gameState.startNewGame());
      assert.equal(await page.evaluate(() => window.qaMain.gameState.bestScore), 5);
    }
    // Controlled legal rack fixture, then the application's real placement path.
    // No second Main/GameState, fake storage, replacement scoring, or canvas-drag claim.
    async function place(page, col) {
      return page.evaluate((column) => {
        const state = window.qaMain.gameState;
        state.rackPieces = [{ id: 'single', cells: [{ x: 0, y: 0 }], color: '#123456', used: false, bounds: { width: 1, height: 1 }, category: 'rescue', baseId: 'single', isSnake: false }];
        state.dragState.activePieceIndex = 0;
        state.previewState = { row: 0, col: column, canPlace: true, visible: true };
        const placed = state.tryPlaceDraggedPiece();
        const result = {
          placed, score: state.score, best: state.bestScore, cache: state.bestScores.normal,
          record: state.hasShownNewRecord,
          recordEvents: state.consumeEvents().filter((event) => event.type === 'highScoreBroken').length,
          stored: JSON.parse(localStorage.getItem('block_puzzle_best_scores_v1'))
        };
        window.qaMain.requestImmediateRender();
        return result;
      }, col);
    }
    assert.equal((await place(a, 0)).placed, true);
    assert.equal((await place(a, 1)).stored.normal, 20);
    const stale = await place(b, 0);
    assert.equal(stale.stored.normal, 20, 'stale B must retain A record');
    assert.deepEqual({ score: stale.score, best: stale.best, cache: stale.cache, record: stale.record, events: stale.recordEvents }, { score: 10, best: 20, cache: 20, record: false, events: 0 });
    await b.screenshot({ path: resolve(output, `stale-${viewport.width}.png`) });
    const equal = await place(b, 1);
    assert.equal(equal.record, false);
    assert.equal(equal.recordEvents, 0);
    const higher = await place(b, 2);
    assert.equal(higher.placed, true);
    assert.deepEqual({ score: higher.score, best: higher.best, cache: higher.cache, record: higher.record, events: higher.recordEvents }, { score: 30, best: 30, cache: 30, record: true, events: 1 });
    assert.deepEqual(higher.stored, { easy: 123, normal: 30, master: 789 });
    await b.screenshot({ path: resolve(output, `record-${viewport.width}.png`) });
    assert.equal(await a.evaluate(() => JSON.parse(localStorage.getItem('block_puzzle_best_scores_v1')).normal), 30);
    const admin = await b.evaluate(() => {
      const state = window.qaMain.gameState;
      // An explicit local auth-state fixture tests score eligibility, not authentication.
      state.applyAuthState({ isAdminAllowed: true });
      state.enableAdminMode();
      return { enabled: state.isAdminModeActive(), eligible: state.bestScoreEligible };
    });
    assert.deepEqual(admin, { enabled: true, eligible: false });
    const excluded = await place(b, 3);
    assert.equal(excluded.score, 40);
    assert.equal(excluded.stored.normal, 30);
    const reset = await b.evaluate(() => {
      const state = window.qaMain.gameState;
      state.disableAdminMode();
      state.requestResetBestScore();
      const opened = state.ui.isResetConfirmOpen;
      state.cancelResetBestScore();
      const cancelled = !state.ui.isResetConfirmOpen;
      const before = JSON.parse(localStorage.getItem('block_puzzle_best_scores_v1')).normal;
      state.requestResetBestScore();
      state.confirmResetBestScore();
      return { opened, cancelled, before, best: state.bestScore, stored: JSON.parse(localStorage.getItem('block_puzzle_best_scores_v1')) };
    });
    assert.deepEqual(reset, { opened: true, cancelled: true, before: 30, best: 0, stored: { easy: 123, normal: 0, master: 789 } });
    await a.reload();
    await a.waitForFunction(() => !!window.qaMain);
    assert.equal(await a.evaluate(() => window.qaMain.gameState.bestScore), 0);
    for (const page of pages) {
      assert.equal(await page.locator('#gameCanvas').isVisible(), true);
      assert.equal(await page.locator('#bootError').isVisible(), false);
    }
    assert.deepEqual(errors, [], 'no browser runtime or console errors');
    console.log(`PASS ${viewport.width}x${viewport.height}: two-page real localStorage, stale/equal/higher record, feedback, admin exclusion, reset/reload, canvas boot`);
    await context.close();
  }
} finally {
  if (browser) await browser.close();
  await new Promise((done) => server.close(done));
}
