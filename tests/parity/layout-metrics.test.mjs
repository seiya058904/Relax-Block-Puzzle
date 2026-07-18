import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const versions = [
  {
    name: 'wechat',
    layoutUrl: pathToFileURL(path.resolve('we xin xiao cheng xu', 'js', 'game', 'LayoutMetrics.js')).href,
    rendererUrl: pathToFileURL(path.resolve('we xin xiao cheng xu', 'js', 'game', 'Renderer.js')).href
  },
  {
    name: 'android',
    layoutUrl: pathToFileURL(path.resolve(
      'we xin xiao cheng xu-android-apk',
      'app',
      'src',
      'main',
      'assets',
      'js',
      'game',
      'LayoutMetrics.js'
    )).href,
    rendererUrl: pathToFileURL(path.resolve(
      'we xin xiao cheng xu-android-apk',
      'app',
      'src',
      'main',
      'assets',
      'js',
      'game',
      'Renderer.js'
    )).href
  }
];

const viewports = [
  { width: 360, height: 640 },
  { width: 360, height: 780 },
  { width: 375, height: 667 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 393, height: 873 },
  { width: 412, height: 915 },
  { width: 430, height: 932 },
  { width: 480, height: 800 }
];

const scores = [0, 9, 99, 220, 999, 9999, 99999, 999999, 1000000, 2147483647];
const androidHudScores = [0, 100, 9999, 999999, 2147483647];

function measureText(text, size) {
  return String(text).length * size * 0.56;
}

function rectBottom(rect) {
  return rect.y + rect.height;
}

function rectRight(rect) {
  return rect.x + rect.width;
}

function rectCenterX(rect) {
  return rect.x + rect.width / 2;
}

function overlaps(a, b) {
  return !(
    rectRight(a) <= b.x ||
    rectRight(b) <= a.x ||
    rectBottom(a) <= b.y ||
    rectBottom(b) <= a.y
  );
}

function assertFiniteRect(rect, label) {
  for (const key of ['x', 'y', 'width', 'height']) {
    assert.equal(Number.isFinite(rect[key]), true, `${label}.${key} should be finite`);
  }
  assert.ok(rect.width > 0, `${label}.width should be positive`);
  assert.ok(rect.height > 0, `${label}.height should be positive`);
}

function assertAlmostEqual(actual, expected, message, tolerance = 0.02) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, got ${actual}`
  );
}

test('Android home layout keeps modules in a vertical chain with and without admin mode', async () => {
  const { calculateAndroidHomeLayout } = await import(versions.find((item) => item.name === 'android').layoutUrl);

  for (const viewport of viewports) {
    for (const adminVisible of [false, true]) {
      const layout = calculateAndroidHomeLayout({
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        safeInsets: { top: 44, bottom: 18 },
        adminVisible
      });
      const keys = [
        'title',
        'subtitle',
        ...(adminVisible ? ['adminButton'] : []),
        'difficultyButton',
        'highScoreCard',
        'startButton',
        'helpButton',
        'settingsButton'
      ];

      assertFiniteRect(layout.panel, 'panel');
      for (const key of keys) {
        assertFiniteRect(layout[key], key);
        assert.ok(layout[key].x >= layout.panel.x, `${key} should stay inside panel horizontally`);
        assert.ok(rectRight(layout[key]) <= rectRight(layout.panel), `${key} should not exceed panel width`);
        assert.ok(layout[key].y >= layout.panel.y, `${key} should stay inside panel vertically`);
        assert.ok(rectBottom(layout[key]) <= rectBottom(layout.panel), `${key} should not exceed panel height`);
      }

      for (let index = 1; index < keys.length; index += 1) {
        const previous = layout[keys[index - 1]];
        const current = layout[keys[index]];
        assert.ok(
          current.y >= rectBottom(previous) + layout.minimumGap,
          `${keys[index]} should be after ${keys[index - 1]} on ${viewport.width}x${viewport.height}`
        );
        assert.equal(overlaps(previous, current), false, `${keys[index]} should not overlap ${keys[index - 1]}`);
      }
    }
  }
});

test('wechat: home layout exposes a safe vertical information hierarchy', async () => {
  const version = versions.find((item) => item.name === 'wechat');
  const { calculateWechatHomeLayout } = await import(version.layoutUrl);

  for (const viewport of viewports) {
    for (const adminVisible of [false, true]) {
      const layout = calculateWechatHomeLayout({
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        safeInsets: { top: 52, bottom: 18 },
        adminVisible
      });
      const keys = [
        'title',
        'subtitle',
        ...(adminVisible ? ['adminButton'] : []),
        'difficultyButton',
        'highScoreCard',
        'startButton',
        'helpButton',
        'settingsButton'
      ];

      assertFiniteRect(layout.panel, 'wechat panel');
      for (const key of keys) {
        assertFiniteRect(layout[key], `wechat ${key}`);
        assert.ok(layout[key].x >= layout.panel.x, `${key} should stay inside panel horizontally`);
        assert.ok(rectRight(layout[key]) <= rectRight(layout.panel), `${key} should not exceed panel width`);
        assert.ok(layout[key].y >= layout.panel.y, `${key} should stay inside panel vertically`);
        assert.ok(rectBottom(layout[key]) <= rectBottom(layout.panel), `${key} should not exceed panel height`);
      }

      for (let index = 1; index < keys.length; index += 1) {
        const previous = layout[keys[index - 1]];
        const current = layout[keys[index]];
        assert.ok(
          current.y >= rectBottom(previous) + layout.minimumGap,
          `${keys[index]} should follow ${keys[index - 1]} on ${viewport.width}x${viewport.height}`
        );
        assert.equal(overlaps(previous, current), false, `${keys[index]} should not overlap ${keys[index - 1]}`);
      }
    }
  }
});

test('wechat: HUD score text fits between left controls and right safe area', async () => {
  const version = versions.find((item) => item.name === 'wechat');
  const { calculateHudLayout } = await import(version.layoutUrl);

  for (const viewport of viewports) {
    const menuButton = { left: viewport.width - 86, top: 12, width: 78, height: 32 };
    const headerRect = {
      x: Math.max(14, viewport.width * 0.04),
      y: 52,
      width: viewport.width - Math.max(14, viewport.width * 0.04) * 2,
      height: 96
    };
    const settingsButtonRect = { x: headerRect.x, y: headerRect.y + 8, width: 64, height: 28 };
    const pauseButtonRect = {
      x: settingsButtonRect.x + settingsButtonRect.width + 8,
      y: settingsButtonRect.y,
      width: 64,
      height: 28
    };

    for (const score of scores) {
      const layout = calculateHudLayout({
        platform: 'wechat',
        viewportWidth: viewport.width,
        headerRect,
        settingsButtonRect,
        pauseButtonRect,
        menuButton,
        score,
        bestScore: score,
        measureText
      });

      assertFiniteRect(layout.scoreRect, 'scoreRect');
      assertFiniteRect(layout.bestScoreRect, 'bestScoreRect');
      assertAlmostEqual(layout.centerX, viewport.width / 2, 'wechat score center should match viewport center');
      assertAlmostEqual(rectCenterX(layout.scoreRect), viewport.width / 2, 'wechat score should stay visually centered');
      assertAlmostEqual(rectCenterX(layout.bestScoreRect), viewport.width / 2, 'wechat best score should stay visually centered');
      assert.equal(overlaps(settingsButtonRect, pauseButtonRect), false, 'control buttons should not overlap');
      if (layout.maxPulseScoreRect.width <= layout.scoreArea.width + 0.01) {
        assert.equal(overlaps(pauseButtonRect, layout.maxPulseScoreRect), false, 'score pulse should not hit pause');
      }
      if (layout.maxPulseScoreRect.width <= layout.scoreArea.width + 0.01) {
        assert.ok(layout.maxPulseScoreRect.x >= layout.scoreArea.x, 'pulse score should stay inside left score area');
        assert.ok(
          rectRight(layout.maxPulseScoreRect) <= rectRight(layout.scoreArea),
          'pulse score should stay inside right score area'
        );
      }
      assert.equal(overlaps(layout.scoreRect, layout.bestScoreRect), false, 'score and best score should not overlap');
      assert.ok(layout.scoreFontSize >= layout.minimumScoreFontSize, 'score font should respect minimum');
      assert.ok(layout.bestScoreFontSize >= layout.minimumBestScoreFontSize, 'best font should respect minimum');

      if (score <= 999 && layout.scoreArea.width / 1.08 >= measureText(String(score), layout.preferredScoreFontSize)) {
        assert.equal(layout.scoreFontSize, layout.preferredScoreFontSize, 'low scores should keep preferred size');
      }
    }
  }
});

test('android: HUD uses a centered score column below a symmetric control bar', async () => {
  const version = versions.find((item) => item.name === 'android');
  const { calculateHudLayout } = await import(version.layoutUrl);

  for (const viewport of viewports) {
    const side = Math.max(14, viewport.width * 0.04);
    const boardPanelRect = {
      x: side,
      y: 150,
      width: viewport.width - side * 2,
      height: viewport.width - side * 2
    };
    const headerRect = {
      x: side,
      y: 44,
      width: viewport.width - side * 2,
      height: 98
    };
    const settingsButtonRect = { x: headerRect.x, y: headerRect.y + 4, width: 64, height: 28 };
    const pauseButtonRect = {
      x: headerRect.x + headerRect.width - 64,
      y: settingsButtonRect.y,
      width: 64,
      height: 28
    };
    const boardCenterX = rectCenterX(boardPanelRect);

    assert.ok(settingsButtonRect.x < boardCenterX, 'settings should be on the left');
    assert.ok(pauseButtonRect.x > boardCenterX, 'pause should be on the right');
    assert.equal(settingsButtonRect.y, pauseButtonRect.y, 'control buttons should align vertically');
    assert.equal(settingsButtonRect.width, pauseButtonRect.width, 'control buttons should have equal width');
    assert.equal(settingsButtonRect.height, pauseButtonRect.height, 'control buttons should have equal height');
    assert.equal(overlaps(settingsButtonRect, pauseButtonRect), false, 'control buttons should not overlap');

    for (const score of androidHudScores) {
      const layout = calculateHudLayout({
        platform: 'android',
        viewportWidth: viewport.width,
        headerRect,
        settingsButtonRect,
        pauseButtonRect,
        boardPanelRect,
        score,
        bestScore: score,
        measureText
      });

      assertAlmostEqual(layout.centerX, boardCenterX, 'score center should match board center');
      assertAlmostEqual(rectCenterX(layout.scoreRect), boardCenterX, 'score rect should stay visually centered');
      assertAlmostEqual(rectCenterX(layout.bestScoreRect), boardCenterX, 'best score rect should stay visually centered');
      assertAlmostEqual(rectCenterX(layout.maxPulseScoreRect), boardCenterX, 'pulse rect should stay centered');
      assert.equal(overlaps(settingsButtonRect, layout.maxPulseScoreRect), false, 'score should not overlap settings');
      assert.equal(overlaps(pauseButtonRect, layout.maxPulseScoreRect), false, 'score should not overlap pause');
      assert.ok(layout.scoreRect.y > rectBottom(settingsButtonRect), 'score should be on the second row');
      assert.ok(layout.bestScoreRect.y > rectBottom(layout.scoreRect), 'best score should be below score');
      assert.ok(layout.maxPulseScoreRect.x >= layout.scoreArea.x, 'pulse score should stay inside safe width');
      assert.ok(
        rectRight(layout.maxPulseScoreRect) <= rectRight(layout.scoreArea),
        'pulse score should not exceed safe width'
      );
      assert.ok(layout.scoreFontSize >= layout.minimumScoreFontSize, 'score font should respect minimum');

      if (score <= 100) {
        assert.equal(layout.scoreFontSize, layout.preferredScoreFontSize, 'low scores should keep preferred size');
      }
    }
  }
});

for (const version of versions) {
  test(`${version.name}: Renderer board starts below the fitted HUD`, async () => {
    const [{ calculateHudLayout }, rendererModule] = await Promise.all([
      import(version.layoutUrl),
      import(version.rendererUrl)
    ]);
    const Renderer = rendererModule.default;
    const ctx = {};

    for (const viewport of viewports) {
      const menuButton = version.name === 'wechat'
        ? { left: viewport.width - 86, top: 12, width: 78, height: 32 }
        : null;
      const safeArea = { bottom: viewport.height - 18 };
      const renderer = new Renderer(
        ctx,
        { screenWidth: viewport.width, screenHeight: viewport.height },
        { menuButton, safeArea }
      );
      const layout = renderer.getLayout(
        { screenWidth: viewport.width, screenHeight: viewport.height },
        { menuButton, safeArea }
      );
      const hud = calculateHudLayout({
        platform: version.name,
        viewportWidth: viewport.width,
        headerRect: layout.headerRect,
        settingsButtonRect: layout.settingsButtonRect,
        pauseButtonRect: layout.pauseButtonRect,
        menuButton,
        boardPanelRect: layout.boardPanelRect,
        score: 2147483647,
        bestScore: 2147483647,
        measureText
      });

      assert.ok(
        layout.boardPanelRect.y >= hud.hudBottom + 8,
        `board should stay below HUD on ${version.name} ${viewport.width}x${viewport.height}`
      );
    }
  });
}
