import { auditModuleUrl } from '../source-path.mjs';
import assert from 'node:assert/strict';
const { loadVersion } = await import(auditModuleUrl('tests/helpers/version-adapter.mjs'));
const { createMemoryStorage, installWxStorage } = await import(auditModuleUrl('tests/helpers/platform-mocks.mjs'));

const restoreStorage = installWxStorage(createMemoryStorage());
const originalNow = Date.now;
let now = 1000;
Date.now = () => now;
const results = [];
try {
  for (const platform of ['wechat', 'web', 'android']) {
    const {GameState} = await loadVersion(platform);
    for (const modal of ['pause', 'settings']) {
      const state = new GameState();
      state.setScreen('playing');
      now = 1000;
      state.handleLineClear(1);
      now = 1500;
      if (modal === 'pause') state.openPause(); else state.openSettings();
      assert.equal(state.canAdvanceTime(), false);
      now = 11500;
      state.update(10000);
      if (modal === 'pause') state.closePause(); else state.closeSettings();
      now = 12000;
      state.handleLineClear(1);
      results.push({platform, modal, activeElapsedMs: 1000, pausedElapsedMs: 10000,
        expectedComboCount: 2, actualComboCount: state.comboState.comboCount});
    }
    const control = new GameState();
    control.setScreen('playing');
    now = 20000;
    control.handleLineClear(1);
    now = 24000;
    control.handleLineClear(1);
    assert.equal(control.comboState.comboCount, 1, 'Unpaused wall time must expire even if there are no animation frames');
  }
  console.log(JSON.stringify(results, null, 2));
  assert.ok(results.every(result => result.actualComboCount === result.expectedComboCount),
    'UNIFIED_SPEC L133/L300 requires the three-second combo window to freeze while paused');
} finally {
  Date.now = originalNow;
  restoreStorage();
}
