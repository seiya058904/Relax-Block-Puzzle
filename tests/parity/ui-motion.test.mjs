import test from 'node:test';
import assert from 'node:assert/strict';

import { versions } from '../fixtures/core-vectors.mjs';
import { loadVersion } from '../helpers/version-adapter.mjs';

for (const version of versions) {
  test(`${version}: ui press feedback is created, decays and is cleaned up automatically`, async () => {
    const { feedback } = await loadVersion(version);
    const state = feedback.createFeedbackState();

    assert.equal(feedback.hasActiveUiMotion(state), false);
    assert.equal(feedback.getUiPressVisual(state, 'tool:refresh'), null);

    feedback.triggerUiPress(state, 'tool:refresh');
    assert.equal(feedback.hasActiveUiMotion(state), true);
    assert.equal(state.uiMotion.press['tool:refresh'].duration, 90);
    assert.equal(state.uiMotion.press['tool:refresh'].remaining, 90);

    const fresh = feedback.getUiPressVisual(state, 'tool:refresh');
    assert.equal(fresh.strength, 1);
    assert.ok(fresh.scale < 1 && fresh.scale >= 0.96, 'press scale stays subtle');

    feedback.advanceUiMotion(state, 45);
    const mid = feedback.getUiPressVisual(state, 'tool:refresh');
    assert.ok(mid.strength > 0 && mid.strength < 1, 'press strength decays over time');

    feedback.advanceUiMotion(state, 45);
    assert.equal(state.uiMotion.press['tool:refresh'], undefined, 'expired press is deleted');
    assert.equal(feedback.getUiPressVisual(state, 'tool:refresh'), null);
    assert.equal(feedback.hasActiveUiMotion(state), false);
  });

  test(`${version}: multiple presses live independently and large advances purge all of them`, async () => {
    const { feedback } = await loadVersion(version);
    const state = feedback.createFeedbackState();

    feedback.triggerUiPress(state, 'home:start');
    feedback.advanceUiMotion(state, 30);
    feedback.triggerUiPress(state, 'tool:clear');

    assert.ok(state.uiMotion.press['home:start'].remaining < 90);
    assert.equal(state.uiMotion.press['tool:clear'].remaining, 90);

    feedback.advanceUiMotion(state, 90);
    assert.deepEqual(state.uiMotion.press, {});
    assert.equal(feedback.hasActiveUiMotion(state), false);
  });

  test(`${version}: modal open motion progresses from dimmed to identity and finishes cleanly`, async () => {
    const { feedback } = await loadVersion(version);
    const state = feedback.createFeedbackState();

    feedback.triggerModalOpen(state, 'settings');
    assert.equal(feedback.hasActiveUiMotion(state), true);

    const start = feedback.getModalMotion(state, 'settings');
    assert.equal(start.phase, 'open');
    assert.ok(start.alpha <= 0.01, 'open starts transparent');
    assert.ok(start.scale >= 0.97 && start.scale < 1, 'open starts slightly scaled down');
    assert.ok(start.offsetY > 0, 'open starts with a small vertical offset');

    feedback.advanceUiMotion(state, 90);
    const mid = feedback.getModalMotion(state, 'settings');
    assert.equal(mid.phase, 'open');
    assert.ok(mid.alpha > 0.4 && mid.alpha < 1, 'open mid alpha is between');
    assert.ok(mid.offsetY < 8, 'vertical offset shrinks');

    feedback.advanceUiMotion(state, 90);
    assert.equal(state.uiMotion.modal.active, false, 'open motion resets after finishing');
    assert.equal(feedback.getModalMotion(state, 'settings'), null);
    assert.equal(feedback.hasActiveUiMotion(state), false);
  });

  test(`${version}: modal close motion fades out faster than it opens`, async () => {
    const { feedback } = await loadVersion(version);
    const state = feedback.createFeedbackState();

    feedback.triggerModalClose(state, 'pause');
    assert.equal(feedback.getModalMotion(state, 'pause').phase, 'close');
    assert.equal(feedback.getModalMotion(state, 'pause').alpha, 1);

    feedback.advanceUiMotion(state, 70);
    const mid = feedback.getModalMotion(state, 'pause');
    assert.equal(mid.phase, 'close');
    assert.ok(mid.alpha > 0 && mid.alpha < 1, 'close fades out');
    assert.ok(mid.scale <= 1, 'close scales down slightly');

    feedback.advanceUiMotion(state, 70);
    assert.equal(state.uiMotion.modal.active, false, 'close motion finishes within 140ms');
  });

  test(`${version}: modal motion is keyed per modal kind and rejects unknown kinds`, async () => {
    const { feedback } = await loadVersion(version);
    const state = feedback.createFeedbackState();

    feedback.triggerModalOpen(state, 'settings');
    assert.equal(feedback.getModalMotion(state, 'pause'), null, 'other kinds see no motion');
    assert.equal(feedback.getModalMotion(state, 'settings').phase, 'open');

    feedback.triggerModalClose(state, 'settings');
    feedback.triggerModalOpen(state, 'not-a-modal');
    feedback.triggerModalClose(state, 42);
    assert.equal(state.uiMotion.modal.kind, 'settings', 'unknown kinds must not take over the transition');

    feedback.advanceUiMotion(state, 140);
    assert.equal(feedback.hasActiveUiMotion(state), false);
  });

  test(`${version}: ui motion advances independently from gameplay feedback freezing`, async () => {
    const { feedback } = await loadVersion(version);
    const state = feedback.createFeedbackState();

    feedback.triggerClearScore(state, {
      placementScore: 0,
      lineClearScore: 200,
      bonusScore: 200,
      totalAdded: 400,
      clearedLines: 2
    });
    feedback.triggerModalOpen(state, 'help');

    feedback.advanceUiMotion(state, 180);
    assert.equal(state.uiMotion.modal.active, false, 'ui motion advances while gameplay is frozen');
    assert.equal(state.clearScore.remaining, 900, 'gameplay feedback does not advance with ui motion');

    feedback.advanceFeedbackState(state, 300);
    assert.equal(state.clearScore.remaining, 600, 'gameplay feedback advances through its own path');
    assert.equal(state.uiMotion.modal.active, false);
  });

  test(`${version}: ui motion state resets with the rest of the feedback state`, async () => {
    const { feedback } = await loadVersion(version);
    const state = feedback.createFeedbackState();

    feedback.triggerUiPress(state, 'settings:continue');
    feedback.triggerModalOpen(state, 'membership');
    feedback.clearFeedbackState(state);

    assert.deepEqual(state.uiMotion.press, {});
    assert.equal(state.uiMotion.modal.active, false);
    assert.equal(feedback.hasActiveUiMotion(state), false);
  });
}
