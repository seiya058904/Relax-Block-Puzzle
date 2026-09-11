import test from 'node:test';
import assert from 'node:assert/strict';
import { loadVersion } from '../helpers/version-adapter.mjs';
import { createMemoryStorage, installWxStorage } from '../helpers/platform-mocks.mjs';

const touch = (identifier, clientX = 20, clientY = 30) => ({ identifier, clientX, clientY });
for (const version of ['wechat', 'web', 'android']) {
  test(`${version}: complete InputManager owns touch identity and cancels all queued input`, async () => {
    const restore = installWxStorage(createMemoryStorage());
    Object.assign(wx, { onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {} });
    try {
      const { InputManager, GameState } = await loadVersion(version);
      const state = new GameState();
      state.startNewGame();
      const moves = [];
      let ends = 0;
      state.startDrag = () => { state.dragState.isDragging = true; return true; };
      state.moveDrag = (x, y) => moves.push([x, y]);
      state.endDrag = () => { ends++; state.clearDrag(); };
      const input = new InputManager(state, { getToolAction() {}, getRackHitArea: () => ({ index: 0 }) }, {}, () => {});
      const begin = () => input.handleTouchStart({ touches: [touch(0)], changedTouches: [touch(0)] });
      begin();
      assert.equal(input.activeTouchIdentifier, 0);
      input.handleTouchStart({ touches: [touch(1), touch(0)], changedTouches: [touch(1)] });
      input.handleTouchMove({ touches: [touch(1, 900, 900), touch(0, 40, 50)] });
      input.handleTouchEnd({ touches: [touch(0)], changedTouches: [touch(1)] });
      input.handleTouchCancel({ changedTouches: [touch(1)] });
      assert.equal(ends, 0);
      assert.equal(input.activeTouchIdentifier, 0);
      input.handleTouchEnd({ touches: [touch(1, 900, 900)], changedTouches: [touch(0, 60, 70)] });
      assert.deepEqual(moves, [[60, 70]]);
      assert.equal(ends, 1);
      assert.equal(input.activeTouchIdentifier, null);
      input.handleTouchEnd({ changedTouches: [touch(0)] });
      assert.equal(ends, 1);
      for (const cancel of [() => input.cancelInputSession(), () => input.handleTouchCancel({ changedTouches: [touch(0)] }), () => {
        state.openPause();
        input.reconcileInputSession();
      }, () => input.handleTouchEnd({})]) {
        state.closePause();
        begin();
        input.handleTouchMove({ touches: [touch(0, 80, 90)] });
        cancel();
        input.flushPendingInput();
        assert.equal(input.activeTouchIdentifier, null);
        assert.equal(state.dragState.isDragging, false);
        assert.equal(ends, 1);
        assert.deepEqual(moves, [[60, 70]]);
      }
    } finally { restore(); }
  });
}
