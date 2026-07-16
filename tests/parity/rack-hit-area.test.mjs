import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve('.');
const rendererPaths = [
  ['wechat', path.join(root, 'we xin xiao cheng xu', 'js', 'game', 'Renderer.js')],
  ['web', path.join(root, 'we xin xiao cheng xu-android-apk', 'docs', 'js', 'game', 'Renderer.js')],
  ['android', path.join(root, 'we xin xiao cheng xu-android-apk', 'app', 'src', 'main', 'assets', 'js', 'game', 'Renderer.js')]
];

function createRenderer(Renderer) {
  const renderer = Object.create(Renderer.prototype);
  renderer.rackHitAreas = [
    {
      index: 0,
      x: 100,
      y: 200,
      width: 28,
      height: 28,
      slotX: 80,
      slotY: 180,
      slotWidth: 68,
      slotHeight: 72
    },
    {
      index: 1,
      x: 168,
      y: 200,
      width: 28,
      height: 28,
      slotX: 148,
      slotY: 180,
      slotWidth: 68,
      slotHeight: 72
    },
    {
      index: 2,
      x: 236,
      y: 200,
      width: 28,
      height: 28,
      slotX: 216,
      slotY: 180,
      slotWidth: 68,
      slotHeight: 72
    }
  ];
  return renderer;
}

for (const [name, rendererPath] of rendererPaths) {
  test(`${name}: rack hit areas include a surrounding touch target without crossing slots`, async () => {
    const Renderer = (await import(pathToFileURL(rendererPath).href)).default;
    const renderer = createRenderer(Renderer);

    assert.equal(renderer.getRackHitArea(114, 214).index, 0, 'center hits');
    assert.equal(renderer.getRackHitArea(100, 200).index, 0, 'edge hits');
    assert.equal(renderer.getRackHitArea(114, 188).index, 0, 'upper extension hits');
    assert.equal(renderer.getRackHitArea(86, 214).index, 0, 'left extension hits');
    assert.equal(renderer.getRackHitArea(142, 214).index, 0, 'right extension hits');
    assert.equal(renderer.getRackHitArea(114, 246).index, 0, 'lower extension hits');
    assert.equal(renderer.getRackHitArea(114, 260), null, 'outside extension misses');
    assert.equal(renderer.getRackHitArea(148, 214), null, 'slot gap does not hit a neighbour');
    assert.equal(renderer.getRackHitArea(182, 239).index, 1, 'second piece lower extension hits');
    assert.equal(renderer.getRackHitArea(250, 239).index, 2, 'third piece lower extension hits');
  });
}
