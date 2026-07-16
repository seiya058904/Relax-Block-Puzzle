import test from 'node:test';
import assert from 'node:assert/strict';

import { createFrameInputQueue } from '../../shared/js/game/FrameInputQueue.js';

test('frame input queue keeps only the latest point and requests one frame', () => {
  let requests = 0;
  const received = [];
  const queue = createFrameInputQueue(() => { requests += 1; });

  queue.push({ x: 1, y: 2 });
  queue.push({ x: 3, y: 4 });
  assert.equal(requests, 1);
  assert.equal(queue.flush((point) => received.push(point)), true);
  assert.deepEqual(received, [{ x: 3, y: 4 }]);
  assert.equal(queue.flush(() => {}), false);
});

test('frame input queue can clear a pending point on cancellation', () => {
  let requests = 0;
  const queue = createFrameInputQueue(() => { requests += 1; });

  queue.push({ x: 1, y: 2 });
  queue.clear();
  assert.equal(queue.flush(() => {}), false);
  queue.push({ x: 5, y: 6 });
  assert.equal(requests, 2);
});
