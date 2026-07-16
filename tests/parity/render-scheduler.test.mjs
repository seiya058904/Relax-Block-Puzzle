import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const schedulerUrl = pathToFileURL(path.resolve(
  'we xin xiao cheng xu-android-apk',
  'app',
  'src',
  'main',
  'assets',
  'js',
  'RenderScheduler.js'
)).href;

test('Android scheduler stays idle, wakes for work, and stops while paused', async () => {
  const { shouldScheduleFrame } = await import(schedulerUrl);
  assert.equal(shouldScheduleFrame({ isPaused: false, needsRender: false, hasActiveAnimation: false }), false);
  assert.equal(shouldScheduleFrame({ isPaused: false, needsRender: true, hasActiveAnimation: false }), true);
  assert.equal(shouldScheduleFrame({ isPaused: false, needsRender: false, hasActiveAnimation: true }), true);
  assert.equal(shouldScheduleFrame({ isPaused: true, needsRender: true, hasActiveAnimation: true }), false);
});
