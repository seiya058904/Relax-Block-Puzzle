import assert from 'node:assert/strict';
import { resolve } from 'node:path';

// Extra presentation states use explicit fixtures; navigation and controls use real input.
export async function runSurfaceChecks(page, { output, label, touch, captureScreenshot }) {
  const touchSession = touch ? await page.context().newCDPSession(page) : null;
  const idle = () => page.waitForFunction(() => !qaMain.hasActiveAnimation() && !qaMain.aniId);
  const shot = (name) => {
    const path = resolve(output, `${label}-${name}.png`);
    return captureScreenshot ? captureScreenshot(path) : page.screenshot({ path });
  };
  async function click(expression) {
    const point = await page.evaluate(expression => {
      const rect = Function('r', `return ${expression}`)(qaMain.renderer);
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }, expression);
    if (touchSession) {
      await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
      await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else await page.mouse.click(point.x, point.y);
    await idle();
  }
  await page.evaluate(() => { qaMain.gameState.confirmReturnHome(); qaMain.requestImmediateRender(); });
  await idle();
  await click('r.homeActionRects.help');
  assert.equal(await page.evaluate(() => qaMain.gameState.screen), 'help');
  await shot('help');
  await click('r.helpActionRects.close');
  await click('r.homeActionRects.settings');
  await shot('settings');
  const sound = await page.evaluate(() => qaMain.gameState.settings.soundEnabled);
  await click('r.settingsActionRects.sound');
  assert.equal(await page.evaluate(() => qaMain.gameState.settings.soundEnabled), !sound);
  await click('r.settingsActionRects.sound');
  await click('r.settingsActionRects["tab:account"]');
  await shot('account');
  await click('r.settingsActionRects.reset');
  await shot('reset-confirm');
  await click('r.settingsActionRects.cancelReset');
  await click('r.settingsActionRects.openMembership');
  await shot('membership');
  const customKeyboard = await page.evaluate(() => Object.values(qaMain.renderer.membershipKeyboardKeyRects || {}).some(key => key.key === 'A'));
  if (customKeyboard) {
    await click('Object.values(r.membershipKeyboardKeyRects).find(key => key.key === "A")');
    assert.equal(await page.evaluate(() => qaMain.gameState.membershipInput), 'A');
    await click('Object.values(r.membershipKeyboardKeyRects).find(key => key.key === "DEL")');
    assert.equal(await page.evaluate(() => qaMain.gameState.membershipInput), '');
  }
  await page.evaluate(() => { qaMain.gameState.setMembershipInput('ABCDEFGHIJKLMNOPQRSTUVWXYZ123456'); qaMain.requestImmediateRender(); });
  await idle(); await shot('membership-long');
  await click('r.membershipActionRects.cancel');
  assert.equal(await page.evaluate(() => qaMain.gameState.ui.isMembershipPanelOpen), false);
  await click('r.settingsActionRects.continue');
  // The existing seven-tap special entry must still use its visible title.
  for (let i = 0; i < 7; i++) await click('r.homeTitleRect');
  assert.equal(await page.evaluate(() => qaMain.gameState.ui.isAdminPanelOpen), true);
  await shot('admin');
  await click('r.adminActionRects.cancel');
  await click('r.homeActionRects.start');
  await page.evaluate(() => {
    const s = qaMain.gameState;
    const colors = ['#2DE2E6', '#3A86FF', '#FF9F1C', '#FFD60A', '#47E56B', '#9B5DE5', '#FF4D6D'];
    s.board.grid = Array.from({length: 10}, (_, row) => Array.from({length: 10}, (_, col) =>
      row > 4 && (row + col) % 5 < 3 ? { color: colors[Math.floor(col / 2)] } : null));
    s.score = 1280; qaMain.requestImmediateRender();
  });
  await idle(); await shot('populated');
  // Both a real contact cancellation and a second-finger event leave board/score intact.
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    const target = await page.evaluate(() => { const r = qaMain.renderer.rackHitAreas[0]; return {x:r.x+r.width/2,y:r.y+r.height/2}; });
    const before = await page.evaluate(() => ({ board: qaMain.gameState.board.getSnapshot(), score: qaMain.gameState.score }));
    await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{...target,id:1}]});
    assert.equal(await page.evaluate(() => qaMain.gameState.dragState.isDragging), true);
    await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{...target,id:1},{x:5,y:5,id:2}]});
    await cdp.send('Input.dispatchTouchEvent', {type:'touchCancel',touchPoints:[]});
    await idle();
    assert.equal(await page.evaluate(() => qaMain.gameState.dragState.isDragging), false);
    assert.deepEqual(await page.evaluate(() => ({board:qaMain.gameState.board.getSnapshot(),score:qaMain.gameState.score})), before);
    await cdp.detach();
  }
  await page.evaluate(() => { qaMain.gameState.toolState.refreshCount = 0; qaMain.gameState.toolState.clearCount = 0; qaMain.gameState.toolState.undoCount = 0; qaMain.requestImmediateRender(); });
  await idle(); await shot('tools-exhausted');
  await click('r.toolActionRects.refresh');
  assert.equal(await page.evaluate(() => qaMain.gameState.toolState.refreshCount), 0);
  for (const kind of ['record', 'admin']) {
    await page.evaluate(kind => {
      const s = qaMain.gameState;
      s.score = 2147483647; s.bestScore = 2147483647;
      s.hasShownNewRecord = kind === 'record'; s.bestScoreEligible = kind !== 'admin';
      s.triggerGameOver(); qaMain.requestImmediateRender();
    }, kind);
    await idle(); await shot(`gameover-${kind}`);
    const rects = await page.evaluate(() => ({a:qaMain.renderer.restartButtonRect,b:qaMain.renderer.gameOverHomeRect,h:innerHeight}));
    assert.ok(rects.a.y + rects.a.height <= rects.b.y && rects.b.y + rects.b.height <= rects.h);
    await click('r.gameOverHomeRect');
    assert.equal(await page.evaluate(() => qaMain.gameState.screen), 'home');
    await click('r.homeActionRects.start');
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), false, 'no page scrolling');
  const viewport = page.viewportSize();
  if (viewport && !page.url().includes('appassets.androidplatform.net')) {
    const board = await page.evaluate(() => qaMain.gameState.board.getSnapshot());
    await page.setViewportSize({ width: 900, height: 600 });
    await page.waitForFunction(() => qaMain.renderer.layout.screenWidth === 900);
    await idle();
    assert.deepEqual(await page.evaluate(() => qaMain.gameState.board.getSnapshot()), board, 'resize preserves the board');
    await shot('resized');
    await page.setViewportSize(viewport);
    await page.waitForFunction(width => qaMain.renderer.layout.screenWidth === width, viewport.width);
    await idle();
  }
  if (touchSession) await touchSession.detach();
  return { label, metrics: await page.evaluate(() => ({ reducedMotion:qaMain.renderer.reducedMotion })) };
}
