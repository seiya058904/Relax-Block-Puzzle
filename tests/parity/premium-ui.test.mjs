import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { getVersionPath, loadVersion } from '../helpers/version-adapter.mjs';
import { createMemoryStorage, installWxStorage } from '../helpers/platform-mocks.mjs';
import { THEMES, getPieceInk } from '../../shared/js/game/VisualTheme.js';

function luminance(hex) {
  const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
for (const theme of Object.values(THEMES)) {
  test(`${theme.id}: functional text and action labels retain 4.5:1 contrast`, () => {
    for (const text of [theme.TEXT_PRIMARY, theme.TEXT_SECONDARY, theme.TEXT_MUTED]) {
      for (const surface of [theme.BACKGROUND_TOP, ...Object.values(theme.UI_TOKENS.surface)]) {
        assert.ok(contrast(text, surface) >= 4.5, `${text} on ${surface}`);
      }
    }
    for (const fill of [theme.BUTTON_FILL, theme.dangerFill || theme.UI_TOKENS.accent.danger]) {
      assert.ok(contrast(fill, theme.onAction) >= 4.5);
    }
  });
}
for (const version of ['web', 'android', 'wechat']) {
  test(`${version}: home art and all controls fit narrow, safe and desktop viewports`, async () => {
    const module = await import(pathToFileURL(getVersionPath(version, 'game/LayoutMetrics.js')));
    const calculate = module.calculateAndroidHomeLayout || module.calculateWechatHomeLayout;
    for (const [width, height] of [[320,568],[360,640],[390,844],[768,1024],[1280,900]]) {
      for (const adminVisible of [false,true]) {
        const l = calculate({viewportWidth:width,viewportHeight:height,safeInsets:{top:60,bottom:34},adminVisible});
        for (const key of ['art','title','subtitle','difficultyButton','highScoreCard','startButton','helpButton','settingsButton','themeButton']) {
          const r = l[key];
          assert.ok(r.x >= 0 && r.x+r.width <= width && r.y >= 60 && r.y+r.height <= height-34, `${key} ${width}x${height}`);
        }
        for (const key of ['difficultyButton','startButton','helpButton','settingsButton','themeButton']) assert.ok(l[key].height >= 44);
        if (l.wide) assert.ok(l.art.x+l.art.width < l.title.x);
        else assert.ok(l.art.y+l.art.height < l.title.y);
      }
    }
  });
  test(`${version}: direct difficulty selection is idempotent and gameover can return home`, async () => {
    const restore = installWxStorage(createMemoryStorage());
    Object.assign(wx, {onTouchStart(){},onTouchEnd(){},onTouchMove(){},onTouchCancel(){}});
    try {
      const {GameState,InputManager} = await loadVersion(version);
      const state = new GameState(); state.initializeHomeState();
      const renderer = {homeActionRects:{difficulty:{x:20,y:200,width:300,height:48}},getHomeAction:()=> 'difficulty',gameOverHomeRect:{x:20,y:450,width:280,height:44}};
      const input = new InputManager(state,renderer,{playClick(){}},settings=>state.setSettings(settings),()=>{});
      for (const [x,expected] of [[70,'easy'],[170,'normal'],[270,'master'],[270,'master']]) {
        input.handleHomeTouch({x,y:220}); assert.equal(state.settings.difficulty,expected);
      }
      state.startNewGame(); state.triggerGameOver();
      input.handleGameOverTouch({x:160,y:470});
      assert.equal(state.screen,'home');
      assert.equal(state.ui.isPauseOpen,false);
      assert.equal(state.dragState.isDragging,false);
    } finally { restore(); }
  });
}

test('theme preference accepts old and malformed storage without writing existing keys', async () => {
  const { THEME_KEY, loadThemePreference, saveThemePreference, loadSettings } = await import('../../shared/js/utils/storage.js');
  for (const value of [undefined, '', 'unknown', null, 42, {}, 'classic', 'soft']) {
    const storage = createMemoryStorage({ block_puzzle_settings_v1: { soundEnabled: false, difficulty: 'master' },
      block_puzzle_best_scores_v1: { easy: 3, normal: 12345, master: 789 }, [THEME_KEY]: value });
    const restore = installWxStorage(storage);
    try {
      assert.equal(loadThemePreference(), value === 'classic' ? 'classic' : 'soft');
      assert.equal(loadSettings().soundEnabled, false);
      const before = storage.snapshot();
      for (const id of ['classic', 'soft']) {
        saveThemePreference(id); assert.equal(loadThemePreference(), id);
        const after = storage.snapshot(); delete after[THEME_KEY];
        const other = {...before}; delete other[THEME_KEY]; assert.deepEqual(after, other);
      }
    } finally { restore(); }
  }
  const restore = installWxStorage({getStorageSync(){throw Error('unavailable');},setStorageSync(){throw Error('full');}});
  try { assert.equal(loadThemePreference(), 'soft'); assert.doesNotThrow(() => saveThemePreference('classic')); }
  finally { restore(); }
});

for (const version of ['web', 'android', 'wechat']) {
  test(`${version}: theme switch persists, disposes old pixels and preserves all business fields`, async () => {
    const storage = createMemoryStorage(); const restore = installWxStorage(storage);
    Object.assign(wx, {onTouchStart(){},onTouchEnd(){},onTouchMove(){},onTouchCancel(){}});
    try {
      const {GameState,InputManager} = await loadVersion(version);
      const {default:Renderer} = await import(pathToFileURL(getVersionPath(version,'game/Renderer.js')));
      const state = new GameState(); state.startNewGame(); state.score = 1234; state.openSettings();
      const renderer = new Renderer({}, {screenWidth:390,screenHeight:844}, {menuButton:null,safeArea:null});
      renderer.getSettingsAction = () => 'theme';
      let renders = 0;
      const input = new InputManager(state, renderer, {playClick(){}}, () => assert.fail('theme must not reapply audio/game settings'), () => renders++);
      const before = {...state}; delete before.feedbackState;
      const snapshot = JSON.stringify(before);
      const oldSurface = {width:200,height:200};
      renderer.surfaceCache.set('board',{canvas:oldSurface,pixels:40000}); renderer.surfacePixels=40000;
      renderer.lastScene={screen:'playing'}; renderer.homeActionRects={stale:{x:1}};
      input.handleSettingsTouch({x:10,y:10});
      assert.equal(renderer.theme.id,'classic'); assert.equal(oldSurface.width,0);
      assert.equal(renderer.surfacePixels,0); assert.equal(renderer.lastScene,null);
      assert.deepEqual(renderer.homeActionRects,{}); assert.ok(renders>0);
      const after={...state}; delete after.feedbackState; assert.equal(JSON.stringify(after),snapshot);
      const restored = new Renderer({}, {screenWidth:390,screenHeight:844},{menuButton:null,safeArea:null});
      assert.equal(restored.theme.id,'classic');
      input.handleSettingsTouch({x:10,y:10}); assert.equal(renderer.theme.id,'soft');
      state.dragState.isDragging=true; input.handleSettingsTouch({x:10,y:10}); assert.equal(renderer.theme.id,'soft');
      assert.notEqual(getPieceInk('#2DE2E6','soft'),getPieceInk('#2DE2E6','classic'));
    } finally {restore();}
  });
}

test('paper palette separates amber / clay and teal / blue in hue and lightness', () => {
  const lab = hex => {
    const [r, g, b] = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255)
      .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const f = v => v > 216 / 24389 ? Math.cbrt(v) : v * 841 / 108 + 4 / 29;
    const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
    const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
    const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  for (const [a, b] of [['#FFD60A', '#FF9F1C'], ['#2DE2E6', '#3A86FF']]) {
    const left = lab(getPieceInk(a)), right = lab(getPieceInk(b));
    const delta = Math.hypot(...left.map((v, i) => v - right[i]));
    assert.ok(delta >= 30, `CIELAB separation ${a}/${b}: ${delta.toFixed(1)}`);
  }
});

for (const version of ['web', 'android', 'wechat']) {
  test(`${version}: phone play stack keeps a bounded bottom margin without losing hit geometry`, async () => {
    const {default: Renderer} = await import(pathToFileURL(getVersionPath(version, 'game/Renderer.js')));
    for (const [width, height] of [[320,568], [360,640], [393,806], [390,844], [430,932]]) {
      const r = new Renderer({}, {screenWidth:width, screenHeight:height}, {menuButton:null,safeArea:null});
      const l = r.layout, bottom = height - l.rackRect.y - l.rackRect.height;
      assert.ok(bottom >= l.bottomInset && bottom <= height * 0.12, `${width}x${height}: ${bottom}`);
      assert.equal(l.boardRect.width, l.cellSize * 10);
      assert.ok(l.toolRect.y >= l.boardPanelRect.y + l.boardPanelRect.height + 10);
      assert.ok(l.rackRect.y >= l.toolRect.y + l.toolRect.height + 10);
      for (const slot of l.rackSlots) {
        assert.equal(slot.y, l.rackRect.y);
        assert.equal(slot.height, l.rackRect.height);
      }
    }
  });
}
