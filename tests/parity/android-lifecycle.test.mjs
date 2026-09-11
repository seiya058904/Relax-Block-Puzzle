import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const sourcePath = 'we xin xiao cheng xu-android-apk/app/src/main/java/com/blockpuzzle/android/MainActivity.kt';

function createTimerOwner() {
  let timersPaused = false;
  return {
    onStop: () => {
      if (timersPaused) return false;
      timersPaused = true;
      return 'pauseTimers';
    },
    onResume: () => {
      if (!timersPaused) return false;
      timersPaused = false;
      return 'resumeTimers';
    }
  };
}

test('MainActivity keeps WebView timer ownership across Activity instances', async () => {
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /private companion object\s*\{\s*var timersPaused = false\s*\}/s);
  assert.equal((source.match(/private var timersPaused/g) || []).length, 0);
  assert.match(source, /webView\.pauseTimers\(\)/);
  assert.match(source, /webView\.resumeTimers\(\)/);

  const processOwner = createTimerOwner();
  assert.equal(processOwner.onResume(), false, 'cold start must not resume timers');
  assert.equal(processOwner.onStop(), 'pauseTimers');

  const recreatedActivity = processOwner;
  assert.equal(recreatedActivity.onResume(), 'resumeTimers');
  assert.equal(recreatedActivity.onResume(), false);

  assert.equal(processOwner.onStop(), 'pauseTimers');
  assert.equal(processOwner.onResume(), 'resumeTimers');
  assert.equal(processOwner.onStop(), 'pauseTimers');
  assert.equal(processOwner.onStop(), false, 'duplicate stop must not double-pause');
  assert.equal(processOwner.onResume(), 'resumeTimers');
});
