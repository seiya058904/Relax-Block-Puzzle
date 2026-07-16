import test from 'node:test';
import assert from 'node:assert/strict';

import { versions } from '../fixtures/core-vectors.mjs';
import { loadVersion } from '../helpers/version-adapter.mjs';

function installTouchWx() {
  const previous = globalThis.wx;
  globalThis.wx = {
    onTouchStart() {},
    onTouchMove() {},
    onTouchEnd() {},
    onTouchCancel() {},
    onKeyboardInput() {},
    onKeyboardConfirm() {},
    onKeyboardComplete() {}
  };
  return () => {
    if (previous === undefined) delete globalThis.wx;
    else globalThis.wx = previous;
  };
}

for (const version of versions) {
  test(`${version}: touch end syncs final coordinates and touch cancel clears drag`, async () => {
    const restore = installTouchWx();
    try {
      const { InputManager } = await loadVersion(version);
      const calls = [];
      const gameState = {
        inputLocked: false,
        screen: 'playing',
        ui: {
          isSettingsOpen: false,
          isAdminPanelOpen: false,
          isRevivePromptOpen: false,
          isPauseOpen: false
        },
        toolState: { clearMode: false },
        dragState: { isDragging: true },
        moveDrag(x, y) { calls.push(['move', x, y]); },
        endDrag() { calls.push(['end']); },
        cancelDrag() { calls.push(['cancel']); }
      };
      const renderer = {};
      const soundManager = {};
      const input = new InputManager(gameState, renderer, soundManager, () => {}, () => {});
      input.handleTouchMove({ touches: [{ clientX: 1, clientY: 2 }] });
      input.handleTouchMove({ touches: [{ clientX: 3, clientY: 4 }] });
      input.handleTouchMove({ touches: [{ clientX: 123, clientY: 456 }] });
      assert.deepEqual(calls, []);
      input.flushPendingInput();
      assert.deepEqual(calls, [['move', 123, 456]]);
      calls.length = 0;
      input.handleTouchEnd({ changedTouches: [{ clientX: 123, clientY: 456 }] });
      assert.deepEqual(calls, [['move', 123, 456], ['end']]);
      calls.length = 0;
      input.handleTouchCancel();
      assert.deepEqual(calls, [['cancel']]);
    } finally {
      restore();
    }
  });
}
