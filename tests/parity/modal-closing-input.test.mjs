import test from 'node:test';
import assert from 'node:assert/strict';
import { loadVersion } from '../helpers/version-adapter.mjs';
import { createMemoryStorage, installWxStorage } from '../helpers/platform-mocks.mjs';

const touch = (identifier, clientX = 20, clientY = 30) => ({ identifier, clientX, clientY });

function createHarness(InputManager, state, renderer, immediateRenders) {
  const sound = { playClick() {} };
  const applySettings = () => {};
  const input = immediateRenders
    ? new InputManager(state, renderer, sound, applySettings, () => immediateRenders.push(1), () => {})
    : new InputManager(state, renderer, sound, applySettings);
  return input;
}

for (const version of ['wechat', 'web', 'android']) {
  test(`${version}: InputManager swallows new touches while a modal close motion is visible`, async () => {
    const restore = installWxStorage(createMemoryStorage());
    Object.assign(wx, { onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {} });
    try {
      const { InputManager, GameState, feedback } = await loadVersion(version);
      const state = new GameState();
      state.startNewGame();

      let refreshCalls = 0;
      let startDragCalls = 0;
      let openSettingsCalls = 0;
      state.useRefreshTool = () => { refreshCalls += 1; return true; };
      state.startDrag = () => { startDragCalls += 1; return true; };
      state.openSettings = () => { openSettingsCalls += 1; };

      const renderer = {
        settingsButtonRect: { x: 0, y: 0, width: 60, height: 30 },
        pauseButtonRect: null,
        getToolAction: () => 'refresh',
        getRackHitArea: () => ({ index: 0 }),
        getBoardCellAt: () => null
      };
      const input = createHarness(InputManager, state, renderer, null);

      // Tap point sits outside the stubbed settings button rect so the tap
      // lands on the tool action in normal routing.
      const tap = () => input.handleTouchStart({
        touches: [touch(0, 90, 60)],
        changedTouches: [touch(0, 90, 60)]
      });

      // Real close flow: the business flag flips immediately, the closing
      // motion lingers as a visual afterimage.
      state.openPause();
      state.closePause();
      assert.equal(state.ui.isPauseOpen, false, 'business state closes immediately');
      assert.equal(state.feedbackState.uiMotion.modal.active, true);
      assert.equal(state.feedbackState.uiMotion.modal.phase, 'close');

      // Closing window: tool, rack drag and HUD taps must not reach the page.
      tap();
      assert.equal(refreshCalls, 0, 'tool action must be blocked during closing');
      assert.equal(startDragCalls, 0, 'rack drag must be blocked during closing');
      assert.equal(openSettingsCalls, 0, 'HUD action must be blocked during closing');
      assert.equal(input.activeTouchIdentifier, null, 'no drag session may start during closing');

      // Same taps must work again once the close motion finished. The tool
      // hit consumes the tap before rack/HUD, matching normal routing.
      feedback.advanceUiMotion(state.feedbackState, 140);
      assert.equal(feedback.hasActiveUiMotion(state.feedbackState), false);
      tap();
      assert.equal(refreshCalls, 1, 'tool action resumes after the closing motion');
      assert.equal(startDragCalls, 0, 'tool hit consumes the tap before rack as in normal routing');
      assert.equal(openSettingsCalls, 0, 'HUD is never reached behind the tool hit');
    } finally { restore(); }
  });

  test(`${version}: settings closing gate also blocks rack input during the afterimage`, async () => {
    const restore = installWxStorage(createMemoryStorage());
    Object.assign(wx, { onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {} });
    try {
      const { InputManager, GameState, feedback } = await loadVersion(version);
      const state = new GameState();
      state.startNewGame();

      let startDragCalls = 0;
      state.startDrag = () => { startDragCalls += 1; return true; };

      const renderer = {
        settingsButtonRect: null,
        pauseButtonRect: null,
        getToolAction: () => null,
        getRackHitArea: () => ({ index: 0 }),
        getBoardCellAt: () => null
      };
      const input = createHarness(InputManager, state, renderer, null);

      state.openSettings();
      state.closeSettings();
      assert.equal(state.ui.isSettingsOpen, false);
      assert.equal(state.feedbackState.uiMotion.modal.phase, 'close');

      input.handleTouchStart({ touches: [touch(0)], changedTouches: [touch(0)] });
      assert.equal(startDragCalls, 0, 'rack drag must be blocked while settings close motion plays');

      feedback.advanceUiMotion(state.feedbackState, 140);
      input.handleTouchStart({ touches: [touch(0)], changedTouches: [touch(0)] });
      assert.equal(startDragCalls, 1, 'rack drag resumes after settings closing finished');
    } finally { restore(); }
  });

  if (version !== 'wechat') {
    test(`${version}: one settings tab tap requests exactly one immediate render`, async () => {
      const restore = installWxStorage(createMemoryStorage());
      Object.assign(wx, { onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {} });
      try {
        const { InputManager, GameState } = await loadVersion(version);
        const state = new GameState();
        state.startNewGame();

        const immediateRenders = [];
        const renderer = {
          getSettingsAction: () => 'tab:game',
          getMembershipKeyHit: () => null
        };
        const input = createHarness(InputManager, state, renderer, immediateRenders);

        input.handleSettingsTouch({ x: 10, y: 10 });
        assert.equal(state.ui.settingsTab, 'game');
        assert.equal(immediateRenders.length, 1, 'tab switch must request exactly one render');
      } finally { restore(); }
    });
  }
}
