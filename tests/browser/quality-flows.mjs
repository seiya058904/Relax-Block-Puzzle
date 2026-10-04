import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Reused against the original Web Main, actual Android WebView, and a browser
// host for the WeChat adapter. Fixtures set legal starting boards/racks only;
// all actions use real pointer/touch input and the application's scoring path.
export async function runQualityFlows(page, { output, label, touch = false, stressMs = 0, progress = () => {} } = {}) {
  await mkdir(output, { recursive: true });
  await page.waitForFunction(() => window.qaMain?.renderer && window.qaMain.renderer.homeActionRects.start);
  assert.ok(await page.title());
  assert.equal(await page.locator('#gameCanvas').isVisible(), true);
  assert.equal(await page.locator('#bootError').isVisible(), false);
  const session = touch ? await page.context().newCDPSession(page) : null;
  async function pointer(type, x, y) {
    if (session) {
      let timer;
      try {
        await Promise.race([
          session.send('Input.dispatchTouchEvent', {
            type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 3, radiusY: 3, force: 1 }]
          }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}: touch protocol stopped responding`)), 5000); })
        ]);
      } finally { clearTimeout(timer); }
    } else if (type === 'touchStart') { await page.mouse.move(x, y); await page.mouse.down(); }
    else if (type === 'touchEnd') await page.mouse.up();
    else await page.mouse.move(x, y);
  }
  async function click(rectExpression) {
    const rect = await page.evaluate((expression) => {
      const main = window.qaMain;
      const rect = Function('main', `return ${expression}`)(main);
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }, rectExpression);
    await pointer('touchStart', rect.x, rect.y);
    await pointer('touchEnd', rect.x, rect.y);
  }
  const idle = () => page.waitForFunction(() => !qaMain.hasActiveAnimation() && !qaMain.aniId, null, { timeout: 8000 });
  const screenshot = (name) => page.screenshot({ path: resolve(output, `${label}-${name}.png`) });
  await page.evaluate(() => {
    const main = qaMain;
    window.qaEvents = [];
    window.qaSounds = [];
    window.qaVibrations = [];
    const consume = main.gameState.consumeEvents.bind(main.gameState);
    main.gameState.consumeEvents = () => {
      const events = consume();
      qaEvents.push(...structuredClone(events));
      return events;
    };
    for (const name of ['playPickup', 'playPlace', 'playInvalid', 'playClear', 'playCombo', 'playCombo3', 'playClick', 'playGameOver']) {
      const play = main.soundManager[name].bind(main.soundManager);
      main.soundManager[name] = (...args) => { qaSounds.push(name); return play(...args); };
    }
    const vibrate = wx.vibrateShort?.bind(wx);
    wx.vibrateShort = (options) => { qaVibrations.push(options.type); return vibrate?.(options); };
    main.applySettings({ vibrationEnabled: true, difficulty: 'normal' });
  });
  await idle();
  await screenshot('home');
  const difficulties = [];
  for (let i = 0; i < 3; i++) {
    await click('main.renderer.homeActionRects.difficulty');
    difficulties.push(await page.evaluate(() => qaMain.gameState.settings.difficulty));
    await idle();
  }
  assert.deepEqual(difficulties, ['master', 'easy', 'normal']);
  await click('main.renderer.homeActionRects.start');
  await idle();
  await screenshot('playing');
  const metrics = await page.evaluate(() => {
    const main = qaMain;
    const r = main.renderer;
    const layout = r.layout;
    return { width: layout.screenWidth, height: layout.screenHeight, cellSize: layout.cellSize,
      board: layout.boardRect, rack: layout.rackRect, bottom: layout.bottomInset,
      mainPixels: canvas.width * canvas.height, cachePixels: r.surfacePixels,
      budget: r.quality.canvasPixelMax, reducedMotion: r.reducedMotion };
  });
  assert.equal(metrics.board.width / metrics.cellSize, 10);
  assert.ok(metrics.rack.y + metrics.rack.height <= metrics.height - metrics.bottom + 0.01);
  assert.ok(metrics.mainPixels + metrics.cachePixels <= metrics.budget);

  async function fixture(kind, reset = true, settle = true) {
    await page.evaluate(({ kind, reset }) => {
      const state = qaMain.gameState;
      if (reset) state.startNewGame();
      state.board.grid = Array.from({ length: 10 }, () => Array(10).fill(null));
      const block = { color: '#2bcbd2' };
      if (kind === 'single') state.board.grid[4].fill(block, 0, 9);
      if (kind === 'triple') for (let row = 3; row < 6; row++) state.board.grid[row].fill(block, 0, 9);
      if (kind === 'cross') {
        state.board.grid[4].fill(block);
        for (let row = 0; row < 10; row++) state.board.grid[row][4] = block;
        state.board.grid[4][4] = null;
      }
      if (kind === 'dense') for (let row = 0; row < 10; row++) for (let col = 0; col < 10; col++) {
        if ((row + col) % 3 !== 0) state.board.grid[row][col] = block;
      }
      const cells = kind === 'triple' ? [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }] : [{ x: 0, y: 0 }];
      const first = { id: 'qa-legal-piece', color: '#ffd626', cells, used: false,
        bounds: { width: 1, height: cells.length }, baseId: 'single', category: 'rescue', isSnake: false };
      state.rackPieces = [first, ...[1, 2].map((id) => ({ ...first, id: `qa-other-${id}`, cells: [{ x: 0, y: 0 }], bounds: { width: 1, height: 1 } }))];
      qaEvents.length = 0; qaSounds.length = 0; qaVibrations.length = 0;
      qaMain.requestImmediateRender();
    }, { kind, reset });
    if (settle) await idle();
  }
  async function drag(row, col, invalid = false, release = true, steps = 8) {
    const area = await page.evaluate(() => qaMain.renderer.rackHitAreas[0]);
    const start = { x: area.x + area.width / 2, y: area.y + area.height / 2 };
    await pointer('touchStart', start.x, start.y);
    assert.equal(await page.evaluate(() => qaMain.gameState.dragState.isDragging), true, `${label} real pickup`);
    const target = await page.evaluate(({ row, col, invalid }) => {
      const state = qaMain.gameState;
      const drag = state.dragState;
      return invalid ? { x: 4, y: 4 } : {
        x: state.layout.boardRect.x + col * state.layout.cellSize + drag.pieceWidth / 2,
        y: state.layout.boardRect.y + row * state.layout.cellSize + drag.pieceHeight + drag.dragFingerOffsetY
      };
    }, { row, col, invalid });
    for (let i = 1; i <= steps; i++) {
      await pointer('touchMove', start.x + (target.x - start.x) * i / steps, start.y + (target.y - start.y) * i / steps);
      await page.waitForTimeout(16);
    }
    if (release) await pointer('touchEnd', target.x, target.y);
    return target;
  }
  await fixture('empty');
  await drag(0, 0, true);
  await idle();
  assert.deepEqual(await page.evaluate(() => ({ score: qaMain.gameState.score,
    cells: qaMain.gameState.board.grid.flat().filter(Boolean).length,
    invalid: qaSounds.filter((name) => name === 'playInvalid').length })), { score: 0, cells: 0, invalid: 1 });
  await fixture('empty');
  await drag(2, 3);
  await idle();
  assert.deepEqual(await page.evaluate(() => ({ score: qaMain.gameState.score,
    cell: !!qaMain.gameState.board.grid[2][3], sound: qaSounds.filter((name) => name === 'playPlace').length })),
  { score: 10, cell: true, sound: 1 });
  await click('main.renderer.pauseButtonRect');
  await page.waitForFunction(() => qaMain.gameState.ui.isPauseOpen);
  await idle();
  await screenshot('pause');
  await click('main.renderer.pauseActionRects.continue');
  await idle();
  await click('main.renderer.toolActionRects.undo');
  await idle();
  assert.deepEqual(await page.evaluate(() => ({ score: qaMain.gameState.score,
    cells: qaMain.gameState.board.grid.flat().filter(Boolean).length,
    undo: qaEvents.filter((event) => event.type === 'itemUsed' && event.payload.item === 'undo').length })),
  { score: 0, cells: 0, undo: 1 });
  progress('pickup, invalid/valid placement, pause and undo passed');

  for (const [kind, row, col, score, cue] of [
    ['single', 4, 9, 160, 'playClear'], ['cross', 4, 4, 410, 'playCombo'], ['triple', 3, 9, 780, 'playCombo3']
  ]) {
    await fixture(kind);
    await drag(row, col);
    if (kind === 'single') {
      // The existing input lock intentionally blocks the pause button during
      // a clear. Exercise the state/lifecycle freeze gate without changing it.
      await page.evaluate(() => { qaMain.gameState.openPause(); qaMain.requestImmediateRender(); });
      await page.waitForFunction(() => qaMain.gameState.ui.isPauseOpen);
      const pending = await page.evaluate(() => qaMain.gameState.pendingClear?.remainingTime);
      assert.ok(pending > 0, 'pause happens before clear commit');
      await page.waitForTimeout(280);
      assert.equal(await page.evaluate(() => qaMain.gameState.pendingClear.remainingTime), pending);
      await screenshot('paused-clear');
      await click('main.renderer.pauseActionRects.continue');
    }
    await page.waitForFunction(() => !qaMain.gameState.pendingClear);
    await screenshot(`${kind}-feedback`);
    await idle();
    const result = await page.evaluate(() => ({ score: qaMain.gameState.score,
      cells: qaMain.gameState.board.grid.flat().filter(Boolean).length,
      sounds: qaSounds.filter((name) => ['playClear', 'playCombo', 'playCombo3'].includes(name)),
      effects: qaMain.gameState.feedbackState.clearEffects.length }));
    assert.deepEqual(result, { score, cells: 0, sounds: [cue], effects: 0 });
  }
  progress('single/cross/triple clear scoring and one cue per outcome passed');
  // Two successive legal clears use the original wall-clock combo window.
  await fixture('single'); await drag(4, 9);
  await page.waitForFunction(() => !qaMain.gameState.pendingClear);
  const firstClearTime = await page.evaluate(() => qaMain.gameState.comboState.lastClearTime);
  // The next move can begin after the business clear commits. Waiting for the
  // record/score flourish first wastes the real three-second combo window on
  // software-rendered WebViews; use a short, real touch path for this fixture.
  await fixture('single', false, false); await drag(4, 9, false, true, 3);
  await idle();
  assert.equal(await page.evaluate(() => qaMain.gameState.score), 320);
  const combo = await page.evaluate(() => qaMain.gameState.comboState);
  assert.ok(combo.lastClearTime - firstClearTime <= combo.comboWindowMs,
    `${label}: actual clear interval exceeded the combo window (${combo.lastClearTime - firstClearTime}ms)`);
  assert.equal(await page.evaluate(() => qaSounds.filter((name) => name === 'playCombo').length), 1);
  const refreshBefore = await page.evaluate(() => qaMain.gameState.toolState.refreshCount);
  const clicksBefore = await page.evaluate(() => qaSounds.filter((name) => name === 'playClick').length);
  await click('main.renderer.toolActionRects.refresh');
  await idle();
  assert.equal(await page.evaluate(() => qaMain.gameState.toolState.refreshCount), refreshBefore - 1);
  assert.equal(await page.evaluate(() => qaSounds.filter((name) => name === 'playClick').length), clicksBefore + 1);

  await fixture('single');
  await click('main.renderer.toolActionRects.clear');
  assert.equal(await page.evaluate(() => qaMain.gameState.toolState.clearMode), true);
  await click('({x:main.renderer.layout.boardRect.x, y:main.renderer.layout.boardRect.y+4*main.renderer.layout.cellSize, width:main.renderer.layout.cellSize, height:main.renderer.layout.cellSize})');
  await idle();
  assert.equal(await page.evaluate(() => qaMain.gameState.score), 0, 'clear tool never adds score');
  assert.equal(await page.evaluate(() => qaEvents.filter((event) => event.type === 'itemUsed' && event.payload.item === 'clear').length), 1);
  await page.evaluate(() => {
    // Explicit local welfare entitlement fixture, not an authentication test.
    qaMain.gameState.setSettings({ localMembershipEnabled: true });
    qaMain.gameState.applyAuthState({ isMember: true });
    qaMain.gameState.openRevivePrompt(); qaMain.requestImmediateRender();
  });
  await page.waitForFunction(() => qaMain.renderer.reviveActionRects.use);
  const eligibility = await page.evaluate(() => qaMain.gameState.bestScoreEligible);
  await click('main.renderer.reviveActionRects.use');
  await idle();
  assert.equal(await page.evaluate(() => qaMain.gameState.bestScoreEligible), eligibility);
  assert.equal(await page.evaluate(() => qaEvents.filter((event) => event.type === 'reviveCompleted').length), 1);

  await page.evaluate(() => { qaMain.gameState.triggerGameOver(); qaMain.requestImmediateRender(); });
  await idle();
  await screenshot('gameover');
  assert.equal(await page.evaluate(() => qaSounds.filter((name) => name === 'playGameOver').length), 1);
  await click('main.renderer.restartButtonRect');
  await idle();
  assert.equal(await page.evaluate(() => qaMain.gameState.screen), 'playing');
  await fixture('dense');
  await drag(0, 0, false, false);
  await page.waitForTimeout(240);
  await screenshot('drag');
  const pixels = await page.evaluate(() => {
    const r = qaMain.renderer;
    r.render(qaMain.gameState);
    const before = r.ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    r.lastScene = null;
    r.render(qaMain.gameState);
    const after = r.ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let mismatches = 0;
    for (let i = 0; i < before.length; i++) if (Math.abs(before[i] - after[i]) > 1) mismatches++;
    return { mismatches, alpha: r.ctx.globalAlpha };
  });
  assert.equal(pixels.mismatches, 0, `${label}: partial redraw matches full redraw without trails`);
  assert.equal(pixels.alpha, 1, 'canvas state restored');
  progress('combo, tools, revive, gameover, cache and redraw passed');
  let stress = null;
  if (stressMs) {
    progress(`starting ${stressMs}ms continuous drag stress`);
    await page.evaluate(() => {
      const r = qaMain.renderer;
      const draw = r.render.bind(r);
      window.qaRenderTimes = [];
      window.qaPartialFrames = 0;
      const damage = r.getFrameDamage.bind(r);
      r.getFrameDamage = (...args) => { const rect = damage(...args); if (rect) qaPartialFrames++; return rect; };
      r.render = (...args) => { const started = performance.now(); draw(...args); qaRenderTimes.push(performance.now() - started); };
      window.qaStressStart = performance.now();
    });
    const started = Date.now();
    let moves = 0;
    while (Date.now() - started < stressMs) {
      const location = await page.evaluate((index) => {
        const { boardRect, cellSize } = qaMain.renderer.layout;
        const drag = qaMain.gameState.dragState;
        return { x: boardRect.x + (index % 9) * cellSize + drag.pieceWidth / 2,
          y: boardRect.y + (Math.floor(index / 9) % 9) * cellSize + drag.pieceHeight + drag.dragFingerOffsetY };
      }, moves++);
      await pointer('touchMove', location.x, location.y);
      await page.waitForTimeout(32);
    }
    stress = await page.evaluate(() => {
      const times = [...qaRenderTimes].sort((a, b) => a - b);
      return { elapsedMs: performance.now() - qaStressStart, frames: times.length, partialFrames: qaPartialFrames,
        meanMs: times.reduce((sum, value) => sum + value, 0) / times.length,
        p95Ms: times[Math.floor(times.length * 0.95)], maxMs: times.at(-1),
        cachePixels: qaMain.renderer.surfacePixels, mainPixels: canvas.width * canvas.height,
        cacheEntries: qaMain.renderer.surfaceCache.size, focused: document.hasFocus(), hidden: document.hidden };
    });
    assert.ok(stress.elapsedMs >= stressMs && stress.frames > stressMs / 80, 'stress proves actual duration and frames');
    assert.ok(stress.partialFrames > stress.frames * 0.8, 'quiet drag mostly clips damage');
    assert.equal(stress.hidden, false);
    assert.ok(stress.cachePixels + stress.mainPixels <= metrics.budget);
    assert.ok(stress.cacheEntries <= 2);
  }
  await pointer('touchEnd', 4, 4);
  await idle();
  await page.evaluate(() => { qaMain.handleAppBackground(); });
  assert.equal(await page.evaluate(() => qaMain.aniId), 0);
  await page.evaluate(() => { qaMain.handleAppForeground(); });
  await idle();
  if (session) await session.detach();
  return { label, metrics, stress, events: await page.evaluate(() => qaEvents.map((event) => event.type)) };
}
