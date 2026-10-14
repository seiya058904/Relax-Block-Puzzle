import assert from 'node:assert/strict';

// Real control gestures. Fixtures only establish a nonempty, nontrivial round.
export async function runThemeChecks(page, { themeId, touch = false, progress = () => {}, captureComparison }) {
  const session = touch ? await page.context().newCDPSession(page) : null;
  const idle = () => page.waitForFunction(() => !qaMain.hasActiveAnimation() && !qaMain.aniId);
  const current = () => page.evaluate(() => qaMain.renderer.theme.id);
  async function click(key, settle = true) {
    const previousTheme = await current();
    const point = await page.evaluate(key => {
      const r = qaMain.renderer;
      const rect = key === 'openSettings' ? r.settingsButtonRect
        : qaMain.gameState.ui.isSettingsOpen ? r.settingsActionRects[key] : r.homeActionRects[key];
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }, key);
    if (session) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else await page.mouse.click(point.x, point.y);
    if (settle) await idle();
    else await page.waitForFunction(previous => qaMain.renderer.theme.id !== previous && !!qaMain.renderer.homeActionRects.theme, previousTheme, { polling: 20, timeout: 5000 });
  }
  await page.waitForFunction(() => qaMain?.renderer.homeActionRects.theme);
  await page.waitForFunction(() => !document.hidden, null, { polling: 100, timeout: 8000 });
  await idle();
  const initial = await current();
  for (let i = 0; i < 12; i++) await click('theme', false);
  assert.equal(await current(), initial, 'all twelve rapid control gestures switch exactly once');
  await idle();
  progress('12 rapid theme switches passed');
  await click('start');
  await page.evaluate(() => {
    const s = qaMain.gameState;
    const colors = ['#2DE2E6', '#3A86FF', '#FF9F1C', '#FFD60A', '#47E56B', '#9B5DE5', '#FF4D6D'];
    for (let row = 6; row < 10; row++) for (let col = 0; col < 8; col++) {
      if ((row + col) % 4 !== 0) s.board.grid[row][col] = { color: colors[(col + row) % colors.length] };
    }
    s.score = 370;
    s.toolState.refreshCount = 1; s.reviveUsedCount = 1;
    qaMain.requestImmediateRender();
  });
  await idle();
  await click('openSettings');
  const snapshot = () => page.evaluate(() => {
    const s = qaMain.gameState;
    return { board: s.board.getSnapshot(), rack: s.rackPieces, score: s.score,
      difficulty: s.activeDifficulty, settings: s.settings, toolState: s.toolState,
      toolUsage: s.toolUsage, reviveCount: s.reviveCount, reviveUsedCount: s.reviveUsedCount,
      pendingRevive: s.pendingRevive, combo: s.comboState, best: s.bestScores,
      eligible: s.bestScoreEligible, generation: s.bestScoreGeneration, auth: s.authState,
      admin: s.adminModeEnabled, undo: s.undoSnapshot, ui: s.ui };
  });
  const before = await snapshot();
  const audioBefore = await page.evaluate(() => ({ settings: qaMain.soundManager.settings,
    bgm: qaMain.settings.bgmEnabled, settingsStorage: wx.getStorageSync('block_puzzle_settings_v1') }));
  const originalPixels = await page.evaluate(() => canvas.toDataURL());
  await click('theme');
  assert.notEqual(await page.evaluate(() => canvas.toDataURL()), originalPixels, 'real pixels change');
  assert.deepEqual(await snapshot(), before, 'theme preserves every gameplay field while settings are open');
  assert.deepEqual(await page.evaluate(() => ({ settings: qaMain.soundManager.settings,
    bgm: qaMain.settings.bgmEnabled, settingsStorage: wx.getStorageSync('block_puzzle_settings_v1') })), audioBefore);
  assert.equal(await page.evaluate(() => qaMain.gameState.dragState.isDragging), false);
  assert.equal(await page.evaluate(() => qaMain.inputManager.activeTouchIdentifier), null);
  assert.ok(await page.evaluate(() => [...qaMain.renderer.surfaceCache.values()].every(e => e.key.includes(qaMain.renderer.theme.id))), 'cache belongs to current theme');
  await click('theme');
  assert.deepEqual(await snapshot(), before);
  await click('continue');
  assert.equal(await page.evaluate(() => qaMain.gameState.screen), 'playing', 'closing switch panel never clicks through');
  if (captureComparison) {
    const sameRound = await snapshot();
    for (const target of ['classic', 'soft']) {
      await click('openSettings');
      if (await current() !== target) await click('theme');
      await click('continue');
      assert.deepEqual(await snapshot(), sameRound, 'comparison uses the exact same board, rack, score and tools');
      await captureComparison(target);
    }
  }
  await page.evaluate(() => { qaMain.gameState.confirmReturnHome(); qaMain.requestImmediateRender(); });
  await idle();
  if (await current() !== themeId) await click('theme');
  assert.equal(await page.evaluate(() => wx.getStorageSync('block_puzzle_theme_v1')), themeId);
  // Lifecycle changes must retain appearance without creating an idle RAF.
  await page.evaluate(() => qaMain.handleAppBackground());
  assert.equal(await page.evaluate(() => qaMain.aniId), 0);
  await page.evaluate(() => qaMain.handleAppForeground());
  await idle();
  assert.equal(await current(), themeId);
  if (session) await session.detach();
  progress('round state, pixels, persistence and lifecycle checks passed');
  return { rapidSwitches: 12, statePreserved: true, pixelsChanged: true, storedTheme: themeId };
}
