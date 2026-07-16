import test from 'node:test';
import assert from 'node:assert/strict';
import { createSafeHitRect } from '../../shared/js/game/SafeHitArea.js';

const container = { x: 0, y: 100, width: 300, height: 160 };

test('safe hit area expands down without entering the next interaction region', () => {
  const visualRect = { x: 10, y: 110, width: 80, height: 40 };
  const hit = createSafeHitRect({
    visualRect,
    containerRect: container,
    lowerBoundary: 190,
    expandBottom: 40
  });

  assert.equal(hit.x, 10);
  assert.equal(hit.y, 110);
  assert.equal(hit.width, 80);
  assert.equal(hit.height, 80);
  assert.equal(hit.y + hit.height, 190);
});

test('safe hit areas stop at the midpoint between adjacent buttons', () => {
  const previousRect = { x: 0, y: 110, width: 80, height: 40 };
  const visualRect = { x: 100, y: 110, width: 80, height: 40 };
  const nextRect = { x: 200, y: 110, width: 80, height: 40 };

  const hit = createSafeHitRect({
    visualRect,
    containerRect: container,
    previousRect,
    nextRect,
    expandLeft: 30,
    expandRight: 30,
    minimumTouchHeight: 44
  });

  assert.equal(hit.x, 90);
  assert.equal(hit.x + hit.width, 190);
  assert.equal(hit.height, 44);
  assert.equal(hit.y, 108);
});

test('safe hit area clamps to container edges and leaves a gap', () => {
  const first = createSafeHitRect({
    visualRect: { x: 4, y: 110, width: 80, height: 40 },
    containerRect: container,
    expandLeft: 30,
    expandRight: 30,
    slotGap: 2
  });
  const last = createSafeHitRect({
    visualRect: { x: 216, y: 110, width: 80, height: 40 },
    containerRect: container,
    expandLeft: 30,
    expandRight: 30,
    slotGap: 2
  });

  assert.equal(first.x, 0);
  assert.equal(last.x + last.width, 300);
});
