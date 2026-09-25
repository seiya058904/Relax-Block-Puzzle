import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const versions = [
  {
    name: 'wechat',
    layoutUrl: pathToFileURL(path.resolve('we xin xiao cheng xu', 'js', 'game', 'LayoutMetrics.js')).href
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
    )).href
  },
  {
    name: 'web',
    layoutUrl: pathToFileURL(path.resolve(
      'we xin xiao cheng xu-android-apk',
      'docs',
      'js',
      'game',
      'LayoutMetrics.js'
    )).href
  }
];

// Small-screen coverage required by the UI polish round plus a tall viewport.
const viewports = [
  { width: 320, height: 560 },
  { width: 360, height: 640 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 412, height: 915 }
];

function rectBottom(rect) {
  return rect.y + rect.height;
}

function rectRight(rect) {
  return rect.x + rect.width;
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

function gameRows() {
  return [
    { type: 'section', label: '游戏设置' },
    { key: 'sound', label: '音效', value: '开' },
    { key: 'bgm', label: '背景音乐', value: '开' },
    { key: 'bgmTrack', label: '背景音乐选择', value: '音乐二 · 电子' },
    { key: 'vibration', label: '震动反馈', value: '开' },
    { key: 'difficulty', label: '难度', value: '普通' }
  ];
}

// Worst-case account page: membership enabled plus admin rows active.
function accountRowsWorstCase() {
  return [
    { type: 'section', label: '账号状态' },
    { key: 'loginStatus', label: '登录状态', value: '未登录' },
    { key: 'memberStatus', label: '会员状态', value: '已开启' },
    { key: 'memberBenefit', label: '会员福利', value: '每局 2 次免死' },
    { key: 'openMembership', label: '输入会员码', value: '' },
    { key: 'disableMembership', label: '关闭本地会员', value: '' },
    { type: 'section', label: '数据' },
    { key: 'reset', label: '重置当前难度最高分', value: '' },
    { type: 'section', label: '管理员模式' },
    { key: 'adminStatus', label: '管理员模式', value: '已开启' },
    { key: 'disableAdmin', label: '关闭管理员模式', value: '' }
  ];
}

function helpRows() {
  return [
    { text: '基础玩法', isSection: true },
    { text: '拖动方块放入棋盘，填满整行或整列即可消除。' },
    { text: '棋盘放不下任何候选方块时，本局结束。' },
    { text: '道具', isSection: true },
    { text: '刷新：更换当前三个候选方块。' },
    { text: '清除：点选棋盘位置，清除附近 3×3 区域。' },
    { text: '撤回：撤销上一次成功放置。' },
    { text: '难度', isSection: true },
    { text: '简单：小块更多，适合轻松游玩。' },
    { text: '普通：形状更丰富，默认推荐。' },
    { text: '大师：复杂方块更多，挑战更高。' },
    { text: '输入会员码后，每局获得 2 次免死机会。' }
  ];
}

for (const version of versions) {
  test(`${version.name}: settings modal shell keeps header, content and footer inside the viewport`, async () => {
    const { calculateModalShellLayout } = await import(version.layoutUrl);

    for (const viewport of viewports) {
      const shell = calculateModalShellLayout({
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        bottomInset: 18
      });

      assertFiniteRect(shell.panel, `${version.name} panel`);
      assertFiniteRect(shell.content, `${version.name} content`);
      assertFiniteRect(shell.footerButton, `${version.name} footerButton`);

      assert.ok(shell.panel.y >= 16, `panel should start below the top gap on ${viewport.width}x${viewport.height}`);
      assert.ok(
        rectBottom(shell.panel) <= viewport.height - 12,
        `panel should not run into the bottom inset on ${viewport.width}x${viewport.height}`
      );
      assert.ok(rectRight(shell.panel) <= viewport.width, 'panel should not exceed the viewport width');

      assert.ok(
        shell.content.y >= shell.panel.y,
        'content should start below the panel top'
      );
      assert.ok(
        rectBottom(shell.content) <= shell.footerButton.y + 0.01,
        `content must never overlap the footer button on ${viewport.width}x${viewport.height}`
      );
      assert.ok(
        rectBottom(shell.footerButton) <= rectBottom(shell.panel) - 6,
        `footer button should stay visible inside the panel on ${viewport.width}x${viewport.height}`
      );
    }
  });

  test(`${version.name}: settings rows fit their content area on small screens for both tabs`, async () => {
    const { calculateModalShellLayout, calculateModalRowsLayout, calculateSettingsTabsLayout } = await import(version.layoutUrl);

    for (const viewport of viewports) {
      const shell = calculateModalShellLayout({
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        bottomInset: 18
      });
      const tabs = calculateSettingsTabsLayout({
        contentRect: shell.content,
        tabs: ['game', 'account']
      });

      assert.equal(tabs.tabRects.length, 2);
      assert.equal(overlaps(tabs.tabRects[0], tabs.tabRects[1]), false, 'tabs must not overlap');
      for (const tabRect of tabs.tabRects) {
        assert.ok(
          rectBottom(tabRect) <= tabs.contentBelow.y + 0.01,
          'tabs should sit above the row content area'
        );
      }

      for (const rows of [gameRows(), accountRowsWorstCase()]) {
        const layout = calculateModalRowsLayout({ contentRect: tabs.contentBelow, rows });
        const rowRects = layout.rects.filter((rowRect) => rowRect.type !== 'section');

        assert.ok(rowRects.length > 0, 'row rects should be produced');
        for (const rowRect of layout.rects) {
          assert.ok(
            rowRect.y >= tabs.contentBelow.y - 0.01,
            `row should start inside the content area on ${viewport.width}x${viewport.height}`
          );
          assert.ok(
            rectBottom(rowRect) <= rectBottom(tabs.contentBelow) + 14,
            `row must stay above the footer padding on ${viewport.width}x${viewport.height} (${rowRect.key || rowRect.label})`
          );
          assert.ok(rowRect.height >= 18, 'rows should keep a minimum tappable height');
        }
        for (let index = 1; index < layout.rects.length; index += 1) {
          assert.equal(
            overlaps(layout.rects[index - 1], layout.rects[index]),
            false,
            'consecutive rows must not overlap'
          );
        }
        for (const rowRect of rowRects) {
          assert.ok(
            rectBottom(rowRect) <= shell.footerButton.y,
            `rows must not reach the continue button on ${viewport.width}x${viewport.height}`
          );
        }
      }
    }
  });

  test(`${version.name}: help rows fit the modal content area on small screens`, async () => {
    const { calculateModalShellLayout, calculateHelpRowsLayout } = await import(version.layoutUrl);

    for (const viewport of viewports) {
      const shell = calculateModalShellLayout({
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        bottomInset: 18
      });
      const layout = calculateHelpRowsLayout({ contentRect: shell.content, rows: helpRows() });

      assert.equal(layout.lineRects.length, helpRows().length, 'every help line must be laid out');
      for (const line of layout.lineRects) {
        assert.ok(
          line.y >= shell.content.y - 0.01 && rectBottom(line) <= rectBottom(shell.content) + 0.01,
          `help line must stay inside the content area on ${viewport.width}x${viewport.height}`
        );
      }
      for (let index = 1; index < layout.lineRects.length; index += 1) {
        assert.equal(
          overlaps(layout.lineRects[index - 1], layout.lineRects[index]),
          false,
          'help lines must not overlap'
        );
      }
      assert.ok(
        rectBottom(layout.lineRects[layout.lineRects.length - 1]) <= shell.footerButton.y,
        `help text must not reach the close button on ${viewport.width}x${viewport.height}`
      );
    }
  });

  test(`${version.name}: compact modals keep their action buttons above the footer boundary`, async () => {
    const { calculateModalShellLayout } = await import(version.layoutUrl);

    for (const viewport of viewports) {
      for (const preferredContentHeight of [116, 130, 138, 152, 226]) {
        const shell = calculateModalShellLayout({
          viewportWidth: viewport.width,
          viewportHeight: viewport.height,
          bottomInset: 18,
          preferredContentHeight
        });

        assert.ok(
          rectBottom(shell.panel) <= viewport.height - 12,
          `panel with content ${preferredContentHeight} must fit on ${viewport.width}x${viewport.height}`
        );
        assert.ok(
          shell.footerButton.y >= shell.content.y,
          'footer must stay below content top'
        );
      }
    }
  });
}
