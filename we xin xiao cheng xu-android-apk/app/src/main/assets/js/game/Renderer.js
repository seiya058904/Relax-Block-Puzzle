import { getPieceInk, getTheme } from './VisualTheme.js';
import { loadThemePreference, saveThemePreference } from '../utils/storage.js';
import {
  BOARD_PADDING,
  BOARD_SIZE,
  QUALITY_PROFILE,
  HEADER_GAP,
  MAX_SIDE_MARGIN,
  MIN_SIDE_MARGIN,
  SLOT_PADDING,
} from './constants.js';
import { getDifficultyLabel } from './GameState.js';
import {
  getClearFeedbackLabel,
  getDragVisual,
  getLineClearEffectVisual,
  getModalMotion,
  getUiPressVisual
} from './FeedbackState.js';
import {
  calculateAndroidHomeLayout,
  calculateHelpRowsLayout,
  calculateHudLayout,
  calculateModalRowsLayout,
  calculateModalShellLayout,
  calculateSettingsTabsLayout,
  measureModalRowsHeight,
  fitTextSize
} from './LayoutMetrics.js';
import { createSafeHitRect } from './SafeHitArea.js';
import { getQualityProfile } from '../config/quality.js';
import { createRenderPerfStats } from './RenderPerfStats.js';
import { getActionVisual, getClearCellVisual, getDisplayedScore, unionDamageRects } from './Presentation.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundedRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((item) => item + item).join('')
    : normalized;

  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

function rgbToHex(r, g, b) {
  const toHex = (value) => value.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function tintColor(hex, amount) {
  const rgb = hexToRgb(hex);
  const adjust = (channel) => clamp(Math.round(channel + (255 - channel) * amount), 0, 255);
  return rgbToHex(adjust(rgb.r), adjust(rgb.g), adjust(rgb.b));
}

function shadeColor(hex, amount) {
  const rgb = hexToRgb(hex);
  const adjust = (channel) => clamp(Math.round(channel * (1 - amount)), 0, 255);
  return rgbToHex(adjust(rgb.r), adjust(rgb.g), adjust(rgb.b));
}

function rgba(hex, alpha) {
  const rgb = hexToRgb(hex);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export default class Renderer {
  constructor(ctx, screenInfo, safeAreaInfo) {
    this.ctx = ctx;
    this.theme = getTheme(loadThemePreference());
    this.screenInfo = screenInfo;
    this.safeAreaInfo = safeAreaInfo;
    this.quality = getQualityProfile(QUALITY_PROFILE);
    this.perfStats = createRenderPerfStats({
      enabled: globalThis.__RELAX_BLOCK_DEBUG__ === true,
      logger: (report) => console.log('[RelaxBlock][render-perf]', report)
    });
    this.layout = this.getLayout(screenInfo, safeAreaInfo);
    this.layoutKey = JSON.stringify({ screenInfo, safeAreaInfo });
    this.bgGradientKey = '';
    this.bgGlow = null;
    this.bgVignette = null;
    this.state = null;
    this.surfaceCache = new Map();
    this.surfacePixels = 0;
    this.lastDragBounds = null;
    this.lastScene = null;
    this.reducedMotion = false;
    this.resetHitAreas();
    this.syncThemeBackground();
  }

  syncThemeBackground() {
    globalThis.document?.documentElement?.style?.setProperty('--game-background', this.theme.BACKGROUND_BOTTOM);
  }

  setTheme(id) {
    const next = getTheme(id);
    if (next === this.theme) return false;
    this.theme = next;
    this.syncThemeBackground();
    saveThemePreference(next.id);
    this.bgGradientKey = '';
    this.clearSurfaceCache();
    this.lastScene = null;
    this.lastDragBounds = null;
    this.resetHitAreas();
    return true;
  }

  setViewport(screenInfo, safeAreaInfo) {
    this.screenInfo = screenInfo;
    this.safeAreaInfo = safeAreaInfo;
    this.layout = this.getLayout(screenInfo, safeAreaInfo);
    this.layoutKey = JSON.stringify({ screenInfo, safeAreaInfo });
    this.bgGradientKey = '';
    this.clearSurfaceCache();
    this.resetHitAreas();
  }

  resetHitAreas() {
    this.rackHitAreas = [];
    this.homeActionRects = {};
    this.homeTitleRect = null;
    this.helpActionRects = {};
    this.toolActionRects = {};
    this.settingsActionRects = {};
    this.pauseActionRects = {};
    this.adminActionRects = {};
    this.membershipActionRects = {};
    this.membershipKeyboardKeyRects = {};
    this.reviveActionRects = {};
    this.restartButtonRect = null;
    this.gameOverHomeRect = null;
    this.settingsButtonRect = null;
    this.pauseButtonRect = null;
  }

  getLayout(screenInfo, safeAreaInfo) {
    const screenWidth = screenInfo.screenWidth;
    const screenHeight = screenInfo.screenHeight;
    const menuButton = safeAreaInfo.menuButton;
    const safeArea = safeAreaInfo.safeArea;
    const sideMargin = Math.max(clamp(screenWidth * 0.04, MIN_SIDE_MARGIN, MAX_SIDE_MARGIN),
      safeArea?.left || 0, screenWidth - (safeArea?.right || screenWidth));
    const contentWidth = Math.min(560, screenWidth - sideMargin * 2);
    const contentX = (screenWidth - contentWidth) / 2;
    const topInset = Math.max(menuButton ? menuButton.top + menuButton.height + 8 : 44, (safeArea?.top || 0) + 8);
    const bottomInset = safeArea ? Math.max(screenHeight - safeArea.bottom, 16) : 18;
    const headerHeight = clamp(screenHeight * 0.11, 88, 114);
    const toolHeight = clamp(screenHeight * 0.055, 36, 42);
    const rackHeight = clamp(screenHeight * 0.145, screenHeight < 600 ? 80 : 104, 128);
    const toolGap = 10;
    const rackGap = 10;
    const boardOuterWidth = contentWidth;
    const headerRect = {
      x: contentX,
      y: topInset,
      width: contentWidth,
      height: headerHeight
    };
    const settingsButtonRect = {
      x: headerRect.x,
      y: headerRect.y + 4,
      width: 64,
      height: 28
    };
    const pauseButtonRect = {
      x: headerRect.x + headerRect.width - 64,
      y: settingsButtonRect.y,
      width: 64,
      height: 28
    };
    const preliminaryBoardSize = Math.min(boardOuterWidth, screenHeight);
    const preliminaryBoardPanelRect = {
      x: Math.round((screenWidth - preliminaryBoardSize) / 2),
      y: topInset,
      width: preliminaryBoardSize,
      height: preliminaryBoardSize
    };
    const hudLayout = calculateHudLayout({
      platform: 'android',
      viewportWidth: screenWidth,
      headerRect,
      settingsButtonRect,
      pauseButtonRect,
      boardPanelRect: preliminaryBoardPanelRect,
      score: 2147483647,
      bestScore: 2147483647
    });
    const boardTop = Math.max(topInset + headerHeight + HEADER_GAP, hudLayout.hudBottom + 8);
    const boardAvailableHeight =
      screenHeight -
      boardTop -
      toolHeight -
      rackHeight -
      bottomInset -
      toolGap -
      rackGap -
      8;
    const availableCellSize = Math.floor(
      Math.min(
        (boardOuterWidth - BOARD_PADDING * 2) / BOARD_SIZE,
        (boardAvailableHeight - BOARD_PADDING * 2) / BOARD_SIZE
      )
    );
    const cellSize = Math.max(1, availableCellSize);
    const viewportBlocked = screenWidth < 320 || screenHeight < 560 || availableCellSize <= 4;
    const boardSizePx = cellSize * BOARD_SIZE + BOARD_PADDING * 2;
    // Distribute height left after width-limited sizing within the play stack.
    // Compact screens keep their gaps; the cell size and touch geometry stay linked.
    const breathingRoom = Math.min(120, Math.max(0, boardAvailableHeight - boardSizePx));
    const boardPanelRect = {
      x: Math.round((screenWidth - boardSizePx) / 2),
      y: boardTop + breathingRoom * 0.24,
      width: boardSizePx,
      height: boardSizePx
    };
    const boardRect = {
      x: boardPanelRect.x + BOARD_PADDING,
      y: boardPanelRect.y + BOARD_PADDING,
      width: cellSize * BOARD_SIZE,
      height: cellSize * BOARD_SIZE
    };
    const toolRect = {
      x: contentX,
      y: boardPanelRect.y + boardPanelRect.height + toolGap + breathingRoom * 0.16,
      width: contentWidth,
      height: toolHeight
    };
    const rackRect = {
      x: contentX,
      y: toolRect.y + toolRect.height + rackGap + breathingRoom * 0.34,
      width: contentWidth,
      height: rackHeight
    };
    const rackSlots = Array.from({ length: 3 }, (_, index) => ({
      x: rackRect.x + (rackRect.width / 3) * index,
      y: rackRect.y,
      width: rackRect.width / 3,
      height: rackRect.height
    }));
    const homePanelRect = {
      x: sideMargin + 8,
      y: clamp(screenHeight * 0.112, topInset + 6, topInset + 24),
      width: screenWidth - (sideMargin + 8) * 2,
      height: clamp(screenHeight * 0.53, 360, 438)
    };

    return {
      screenWidth,
      screenHeight,
      viewportBlocked,
      sideMargin,
      cellSize,
      bottomInset,
      headerRect,
      boardRect,
      boardPanelRect,
      toolRect,
      rackRect,
      rackSlots,
      settingsButtonRect,
      pauseButtonRect,
      homePanelRect
    };
  }

  render(state) {
    this.state = state;
    this.perfStats.beginFrame(globalThis.performance?.now?.() ?? Date.now());
    const nextLayoutKey = JSON.stringify({ screenInfo: this.screenInfo, safeAreaInfo: this.safeAreaInfo });
    if (nextLayoutKey !== this.layoutKey) {
      this.layout = this.getLayout(this.screenInfo, this.safeAreaInfo);
      this.layoutKey = nextLayoutKey;
      this.bgGradientKey = '';
      this.clearSurfaceCache();
    }
    state.setLayout(this.layout);
    const damage = this.layout.viewportBlocked ? null : this.getFrameDamage(state);
    this.ctx.save();
    if (damage) {
      // Clip on physical pixel boundaries; fractional DPR clips otherwise
      // blend old and new background pixels into a faint persistent seam.
      const dpr = Math.abs(this.ctx.getTransform?.().a) || 1;
      const left = Math.floor(damage.x * dpr) / dpr;
      const top = Math.floor(damage.y * dpr) / dpr;
      const right = Math.ceil((damage.x + damage.width) * dpr) / dpr;
      const bottom = Math.ceil((damage.y + damage.height) * dpr) / dpr;
      this.ctx.beginPath();
      this.ctx.rect(left, top, right - left, bottom - top);
      this.ctx.clip();
      this.perfStats.recordPartialRender();
    } else {
      this.perfStats.recordFullRender();
    }
    this.resetHitAreas();

    this.clearCanvas();
    this.drawBackground(state.screen !== 'playing', state.dragState.isDragging);

    if (this.layout.viewportBlocked) {
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillStyle = this.theme.TEXT_PRIMARY;
      this.ctx.font = 'bold 20px sans-serif';
      this.ctx.fillText('轻松俄罗斯方块', this.layout.screenWidth / 2, this.layout.screenHeight / 2 - 18);
      this.ctx.fillStyle = this.theme.TEXT_SECONDARY;
      this.ctx.font = '16px sans-serif';
      this.ctx.fillText('请转为竖屏或增大窗口', this.layout.screenWidth / 2, this.layout.screenHeight / 2 + 18);
      globalThis.__syncKeyboardInputPosition?.(null);
      this.lastScene = null;
      this.ctx.restore();
      this.perfStats.endFrame(globalThis.performance?.now?.() ?? Date.now());
      return;
    }

    if (state.screen === 'home' || state.screen === 'help') {
      this.drawHome(state);
    } else {
      this.drawPlayingScene(state);
    }

    if (state.notice && state.screen === 'playing') {
      this.drawNotice(state.notice.text);
    }

    if (state.screen === 'help') {
      this.drawHelpModal(state);
    }

    if (state.screen === 'gameover') {
      this.drawGameOver(state);
    }

    if (state.ui.isPauseOpen) {
      this.drawPausePanel(state);
    }

    if (state.ui.isRevivePromptOpen) {
      this.drawRevivePrompt(state);
    }

    if (state.ui.isSettingsOpen) {
      this.drawSettingsPanel(state);
    }

    if (state.ui.isAdminPanelOpen) {
      this.drawAdminPanel(state);
    }

    if (state.ui.isMembershipPanelOpen) {
      this.drawMembershipPanel(state);
    } else if (typeof globalThis.__syncKeyboardInputPosition === 'function') {
      globalThis.__syncKeyboardInputPosition(null);
    }

    this.drawClosingModal(state);
    this.ctx.restore();
    this.perfStats.endFrame(globalThis.performance?.now?.() ?? Date.now());
  }

  clearSurfaceCache() {
    this.surfaceCache.forEach((entry) => { entry.canvas.width = 0; entry.canvas.height = 0; });
    this.surfaceCache.clear();
    this.surfacePixels = 0;
    this.lastDragBounds = null;
  }

  drawCachedSurface(name, key, rect, draw, maxDpr = this.quality.maxDpr) {
    const transform = this.ctx.getTransform?.();
    const budget = this.quality.surfaceCachePixelMax * (name === 'background' ? 0.25 : 0.75);
    const dpr = Math.min(maxDpr, Math.abs(transform?.a) || 1, Math.sqrt(budget / Math.max(1, rect.width * rect.height)));
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    const pixels = width * height;
    const cacheKey = `${key}:${width}:${height}`;
    const old = this.surfaceCache.get(name);
    if (old?.key === cacheKey) {
      this.ctx.drawImage(old.canvas, rect.x, rect.y, rect.width, rect.height);
      return;
    }
    if (old) {
      this.surfacePixels -= old.pixels;
      old.canvas.width = 0;
      old.canvas.height = 0;
      this.surfaceCache.delete(name);
    }
    if (pixels > this.quality.surfaceCachePixelMax) { draw(); return; }
    let surface;
    try {
      surface = typeof document !== 'undefined' && document.createElement
        ? document.createElement('canvas')
        : globalThis.wx?.createOffscreenCanvas?.({ type: '2d', width, height });
    } catch { /* Older WeChat versions can draw directly. */ }
    if (!surface) { draw(); return; }
    while (this.surfacePixels + pixels > this.quality.surfaceCachePixelMax && this.surfaceCache.size) {
      const [oldName, entry] = this.surfaceCache.entries().next().value;
      this.surfacePixels -= entry.pixels;
      entry.canvas.width = 0;
      entry.canvas.height = 0;
      this.surfaceCache.delete(oldName);
    }
    surface.width = width;
    surface.height = height;
    const context = surface.getContext('2d');
    if (!context) { surface.width = 0; surface.height = 0; draw(); return; }
    context.setTransform(dpr, 0, 0, dpr, -rect.x * dpr, -rect.y * dpr);
    const original = this.ctx;
    this.ctx = context;
    try { draw(); } finally { this.ctx = original; }
    this.surfaceCache.set(name, { key: cacheKey, canvas: surface, pixels });
    this.surfacePixels += pixels;
    original.drawImage(surface, rect.x, rect.y, rect.width, rect.height);
  }

  getDragBounds(state) {
    const drag = state.feedbackState.drag;
    const pose = getDragVisual(drag, this.reducedMotion);
    if (!pose || !drag.piece?.bounds) return null;
    return {
      x: pose.x - 24, y: pose.y - 24,
      width: drag.piece.bounds.width * drag.displayCellSize * pose.scale + 48,
      height: drag.piece.bounds.height * drag.displayCellSize * pose.scale + 48
    };
  }

  getFrameDamage(state) {
    const feedback = state.feedbackState;
    const quiet = state.screen === 'playing' && !Object.values(state.ui).some((value) => value === true) &&
      !state.pendingClear && !state.notice && !feedback.clearEffects.length && !feedback.clearScore.active &&
      !feedback.scorePulse.active && !feedback.highScore.active && !feedback.gain.active && !feedback.action.active &&
      !feedback.uiMotion.modal.active && !Object.keys(feedback.uiMotion.press).length;
    const current = this.getDragBounds(state);
    const previous = this.lastDragBounds;
    const stable = this.lastScene?.screen === state.screen && this.lastScene?.score === state.score &&
      this.lastScene?.rack === state.rackPieces && this.lastScene?.ui === JSON.stringify(state.ui) &&
      this.lastScene?.clearMode === state.toolState.clearMode;
    this.lastDragBounds = current;
    this.lastScene = { screen: state.screen, score: state.score, rack: state.rackPieces,
      ui: JSON.stringify(state.ui), clearMode: state.toolState.clearMode };
    if (!quiet || !stable || (!current && !previous)) return null;
    const panel = this.layout.boardPanelRect;
    const rack = this.layout.rackRect;
    return unionDamageRects([
      { x: panel.x - 16, y: panel.y - 16, width: panel.width + 32, height: panel.height + 32 },
      { x: rack.x - 8, y: rack.y - 8, width: rack.width + 16, height: rack.height + 16 },
      current, previous
    ], this.layout);
  }

  clearCanvas() {
    this.ctx.clearRect(0, 0, this.layout.screenWidth, this.layout.screenHeight);
  }

  createLinearGradient(...args) {
    this.perfStats.recordGradient();
    return this.ctx.createLinearGradient(...args);
  }

  createRadialGradient(...args) {
    this.perfStats.recordGradient();
    return this.ctx.createRadialGradient(...args);
  }

  measureCanvasText(text, size, fontFamily = 'sans-serif', fontWeight = '') {
    const previousFont = this.ctx.font;
    this.ctx.font = `${fontWeight ? `${fontWeight} ` : ''}${size}px ${fontFamily}`;
    const width = this.ctx.measureText(String(text)).width;
    this.ctx.font = previousFont;
    return width;
  }

  getPressVisual(pressKey) {
    if (!pressKey || !this.state || !this.state.feedbackState) {
      return null;
    }

    const press = getUiPressVisual(this.state.feedbackState, pressKey);
    return this.reducedMotion ? { ...press, scale: 1 } : press;
  }

  getPanelMotion(state, kind) {
    if (!state || !state.feedbackState) {
      return null;
    }

    const motion = getModalMotion(state.feedbackState, kind);
    return motion && this.reducedMotion ? { ...motion, scale: 1, offsetY: 0 } : motion;
  }

  // Wraps a modal panel draw with the shared open/close motion (alpha,
  // scale, vertical offset). Hit rects stay registered at final coordinates.
  withPanelMotion(motion, panel, drawFn) {
    const { ctx } = this;
    if (!motion || (motion.alpha >= 1 && motion.scale === 1 && !motion.offsetY)) {
      drawFn();
      return;
    }

    ctx.save();
    ctx.globalAlpha = clamp(motion.alpha, 0, 1);
    const centerX = panel.x + panel.width / 2;
    const centerY = panel.y + panel.height / 2;
    ctx.translate(centerX, centerY + motion.offsetY);
    ctx.scale(motion.scale, motion.scale);
    ctx.translate(-centerX, -centerY);
    drawFn();
    ctx.restore();
  }

  drawModalPanel(panel, radius = this.theme.UI_TOKENS.radius.large) {
    const { ctx } = this;
    ctx.save();
    ctx.shadowColor = this.theme.shadow;
    ctx.shadowBlur = 20; ctx.shadowOffsetY = 8;
    roundedRect(ctx, panel.x, panel.y, panel.width, panel.height, radius);
    ctx.fillStyle = this.theme.UI_TOKENS.surface.modal; ctx.fill();
    if (this.theme.id === 'classic') {
      ctx.lineWidth = 1; ctx.strokeStyle = this.theme.PANEL_BORDER; ctx.stroke();
    }
    ctx.restore();
  }

  drawModalTitle(text, shell) {
    const { ctx } = this;
    ctx.textAlign = 'center';
    ctx.fillStyle = this.theme.TEXT_PRIMARY;
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(text, shell.panel.x + shell.panel.width / 2, shell.titleBaselineY);
  }

  drawClosingModal(state) {
    const modal = state.feedbackState && state.feedbackState.uiMotion
      ? state.feedbackState.uiMotion.modal
      : null;
    if (!modal || !modal.active || modal.phase !== 'close' || modal.kind === 'gameover') {
      return;
    }

    if (modal.kind === 'settings') {
      this.drawSettingsPanel(state);
    } else if (modal.kind === 'pause') {
      this.drawPausePanel(state);
    } else if (modal.kind === 'help') {
      this.drawHelpModal(state);
    } else if (modal.kind === 'revive') {
      this.drawRevivePrompt(state);
    } else if (modal.kind === 'membership') {
      this.drawMembershipPanel(state);
    } else if (modal.kind === 'admin') {
      this.drawAdminPanel(state);
    }
  }

  drawBackground(isHomeScene) {
    const { ctx, layout } = this;
    if (this.theme.id === 'soft') {
      ctx.fillStyle = this.theme.BACKGROUND_TOP;
      ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);
      if (isHomeScene) {
        const wash = this.createRadialGradient(layout.screenWidth * 0.5, layout.screenHeight * 0.28, 0,
          layout.screenWidth * 0.5, layout.screenHeight * 0.28, Math.min(layout.screenWidth, layout.screenHeight) * 0.7);
        wash.addColorStop(0, 'rgba(255, 252, 245, 0.9)');
        wash.addColorStop(1, 'rgba(255, 252, 245, 0)');
        ctx.fillStyle = wash; ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);
      }
      return;
    }
    const key = `${this.theme.id}:${layout.screenWidth}:${layout.screenHeight}`;
    if (this.bgGradientKey !== key) {
      this.bgGradientKey = key;
      this.bgGradient = this.createLinearGradient(0, 0, layout.screenWidth * 0.4, layout.screenHeight);
      this.bgGradient.addColorStop(0, this.theme.BACKGROUND_TOP);
      this.bgGradient.addColorStop(0.4, this.theme.BACKGROUND_MID);
      this.bgGradient.addColorStop(1, this.theme.BACKGROUND_BOTTOM);
      this.bgGlow = this.createRadialGradient(layout.screenWidth * 0.3, 0, 0,
        layout.screenWidth * 0.3, 0, Math.max(layout.screenWidth, layout.screenHeight) * 0.7);
      this.bgGlow.addColorStop(0, 'rgba(142, 221, 255, 0.06)');
      this.bgGlow.addColorStop(1, 'rgba(142, 221, 255, 0)');
    }
    ctx.fillStyle = this.bgGradient;
    ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);
    ctx.fillStyle = this.bgGlow;
    ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);
    // Fixed lights preserve the original atmosphere without a permanent frame loop.
    ctx.fillStyle = 'rgba(203, 234, 255, 0.26)';
    for (let i = 0; i < 16; i++) {
      const x = ((i * 73 + 19) % 101) / 101 * layout.screenWidth;
      const y = ((i * 47 + 11) % 103) / 103 * layout.screenHeight;
      ctx.fillRect(x, y, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
    }
  }

  drawHome(state) {
    const { ctx, layout } = this;
    const h = calculateAndroidHomeLayout({ viewportWidth: layout.screenWidth, viewportHeight: layout.screenHeight,
      safeInsets: { top: layout.headerRect.y, bottom: layout.bottomInset }, adminVisible: state.isAdminModeActive() });
    const center = h.title.x + h.title.width / 2;
    this.homeTitleRect = h.title;
    // The same geometric pieces introduce the material before the first move.
    const unit = Math.min(h.art.width / 7, h.art.height / (this.theme.id === 'soft' ? 4.4 : 4));
    const ox = h.art.x + (h.art.width - unit * 6) / 2;
    const oy = h.art.y + (h.art.height - unit * 4) / 2;
    const mosaic = [
      [0, 0, '#47E56B'], [1, 0, '#47E56B'], [0, 1, '#47E56B'],
      [3, 0, '#FFD60A'], [4, 0, '#FFD60A'], [5, 0, '#FFD60A'], [4, 1, '#FFD60A'],
      [1, 2, '#2DE2E6'], [1, 3, '#2DE2E6'], [2, 3, '#2DE2E6'],
      [3, 2, '#FF4D6D'], [4, 2, '#FF4D6D'], [5, 2, '#FF4D6D'], [5, 3, '#FF4D6D']
    ];
    if (this.theme.id === 'soft') {
      // Four softly turned paper pieces form B's mark; A retains its crisp grid.
      const groups = [
        { color: '#47E56B', x: 1, y: 1, angle: -0.045 },
        { color: '#FFD60A', x: 4.5, y: 1, angle: 0.035 },
        { color: '#2DE2E6', x: 2, y: 3, angle: -0.035 },
        { color: '#FF4D6D', x: 4.5, y: 3, angle: 0.045 }
      ];
      groups.forEach(group => {
        const cx = ox + group.x * unit, cy = oy + group.y * unit;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(group.angle); ctx.translate(-cx, -cy);
        mosaic.filter(cell => cell[2] === group.color).forEach(([x, y, color]) =>
          this.drawBlockCell(ox + x * unit, oy + y * unit, unit, color, { hero: true }));
        ctx.restore();
      });
    } else mosaic.forEach(([x, y, color]) => this.drawBlockCell(ox + x * unit, oy + y * unit, unit, color));
    ctx.textAlign = 'center';
    ctx.fillStyle = this.theme.TEXT_PRIMARY;
    if (this.theme.id === 'classic') {
      ctx.font = '12px sans-serif'; ctx.fillStyle = this.theme.TEXT_SECONDARY;
      ctx.fillText('经 典 · 流 光', center, h.title.y + 14);
      ctx.font = 'bold 28px sans-serif'; ctx.fillStyle = this.theme.TEXT_PRIMARY;
      ctx.fillText('轻松俄罗斯方块', center, h.title.y + 47, h.title.width);
    } else {
      ctx.font = '36px serif';
      ctx.fillText('轻 松', center, h.title.y + 30);
      ctx.font = '17px sans-serif';
      ctx.fillText('俄罗斯方块', center, h.title.y + 53);
    }
    ctx.fillStyle = this.theme.TEXT_SECONDARY;
    ctx.font = '13px sans-serif';
    ctx.fillText('拖动方块，填满整行或整列即可消除', center, h.subtitle.y + 15, h.subtitle.width);
    if (h.adminButton) this.drawSecondaryChip(h.adminButton, '管理员模式');
    this.homeActionRects.difficulty = h.difficultyButton;
    const choices = ['简单', '普通', '大师'];
    const selected = ['easy', 'normal', 'master'].indexOf(state.settings.difficulty);
    const d = h.difficultyButton;
    roundedRect(ctx, d.x, d.y, d.width, d.height, this.theme.UI_TOKENS.radius.small);
    ctx.fillStyle = this.theme.UI_TOKENS.surface.sunken; ctx.fill();
    for (let i = 0; i < 3; i++) {
      const x = d.x + d.width * i / 3;
      if (i === selected) {
        roundedRect(ctx, x + 3, d.y + 3, d.width / 3 - 6, d.height - 6, 6);
        ctx.fillStyle = this.theme.BUTTON_FILL; ctx.fill();
      }
      ctx.fillStyle = i === selected ? this.theme.onAction : this.theme.TEXT_SECONDARY;
      ctx.font = `${i === selected ? 'bold ' : ''}14px sans-serif`;
      ctx.fillText(choices[i], x + d.width / 6, d.y + 29);
    }
    const score = h.highScoreCard;
    if (this.theme.id === 'classic') {
      roundedRect(ctx, score.x, score.y, score.width, score.height, 10);
      ctx.fillStyle = this.theme.UI_TOKENS.surface.sunken; ctx.fill();
    }
    ctx.textAlign = 'left'; ctx.fillStyle = this.theme.TEXT_SECONDARY; ctx.font = '13px sans-serif';
    ctx.fillText(`${getDifficultyLabel(state.settings.difficulty)} · 最高分`, score.x + 8, score.y + 32);
    ctx.textAlign = 'right'; ctx.fillStyle = this.theme.TEXT_PRIMARY; ctx.font = `24px ${this.theme.titleFont}`;
    ctx.fillText(String(state.bestScores[state.settings.difficulty] || 0), score.x + score.width - 8, score.y + 34, score.width * 0.52);
    for (const action of ['start', 'help', 'settings']) this.homeActionRects[action] = h[`${action}Button`];
    this.drawActionButton(h.startButton, '开始游戏', 'primary', { pressKey: 'home:start' });
    this.drawActionButton(h.helpButton, '怎么玩', 'quiet', { pressKey: 'home:help' });
    this.drawActionButton(h.settingsButton, '设置', 'quiet', { pressKey: 'home:settings' });
    this.homeActionRects.theme = h.themeButton;
    this.drawActionButton(h.themeButton, `当前：${this.theme.name} · 点击切换`, 'secondary', { pressKey: 'home:theme' });
  }

  drawPlayingScene(state) {
    const headerHitContainer = this.layout.headerRect;
    this.settingsButtonVisualRect = this.layout.settingsButtonRect;
    this.pauseButtonVisualRect = this.layout.pauseButtonRect;
    this.settingsButtonRect = createSafeHitRect({
      visualRect: this.settingsButtonVisualRect,
      containerRect: headerHitContainer,
      nextRect: this.pauseButtonVisualRect,
      expandTop: 8,
      expandBottom: 8,
      minimumTouchHeight: 44,
      slotGap: 1
    });
    this.pauseButtonRect = createSafeHitRect({
      visualRect: this.pauseButtonVisualRect,
      containerRect: headerHitContainer,
      previousRect: this.settingsButtonVisualRect,
      expandTop: 8,
      expandBottom: 8,
      minimumTouchHeight: 44,
      slotGap: 1
    });
    this.drawHeader(state);
    this.drawBoard(state);
    this.drawPreview(state);
    this.drawToolBar(state);
    this.drawRack(state);
    this.drawSettingsButton();
    this.drawPauseButton();
    this.drawDraggingPiece(state);
  }

  drawHeader(state) {
    const { ctx, layout } = this;
    const difficultyLabel = getDifficultyLabel(state.activeDifficulty);
    const feedback = state.feedbackState || {};
    const scorePulse = feedback.scorePulse || {};
    const clearScore = feedback.clearScore || {};
    const highScore = feedback.highScore || {};
    const scorePulseProgress = scorePulse.duration
      ? clamp(scorePulse.remaining / scorePulse.duration, 0, 1)
      : 0;
    const hudLayout = calculateHudLayout({
      platform: 'android',
      viewportWidth: layout.screenWidth,
      headerRect: layout.headerRect,
      settingsButtonRect: layout.settingsButtonRect,
      pauseButtonRect: layout.pauseButtonRect,
      score: state.score,
      bestScore: state.bestScore,
      boardPanelRect: layout.boardPanelRect,
      measureText: this.measureCanvasText.bind(this)
    });
    const centerX = hudLayout.centerX;

    ctx.save();
    ctx.translate(centerX, hudLayout.scoreBaselineY);
    const scoreScale = this.reducedMotion ? 1 : 1 + scorePulseProgress * 0.06;
    ctx.scale(scoreScale, scoreScale);
    ctx.textAlign = 'center';
    ctx.fillStyle = this.theme.TEXT_PRIMARY;
    ctx.font = `bold ${hudLayout.scoreFontSize}px sans-serif`;
    if (scorePulseProgress > 0) {
      ctx.shadowColor = this.theme.UI_TOKENS.accent.warning;
      ctx.shadowBlur = 12 * scorePulseProgress;
    }
    ctx.fillText(String(getDisplayedScore(state.score, feedback.gain)), 0, 0);
    ctx.restore();

    const combo = state.comboState.comboCount;
    const recordVisible = highScore.active && state.bestScoreEligible && !state.isAdminModeActive();
    const clearFeedbackVisible = clearScore.active && clearScore.clearedLines > 0;
    const clearFeedbackAlpha = clearFeedbackVisible
      ? clamp(clearScore.remaining / 200, 0, 1)
      : 0;
    const clearAge = clearFeedbackVisible
      ? clamp((clearScore.duration - clearScore.remaining) / 180, 0, 1)
      : 0;

    ctx.save();
    ctx.globalAlpha = clearFeedbackVisible ? clearFeedbackAlpha : 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = clearFeedbackVisible || recordVisible ? this.theme.UI_TOKENS.accent.warning : this.theme.TEXT_SECONDARY;
    ctx.font = `${hudLayout.bestScoreFontSize}px sans-serif`;
    ctx.fillText(
      clearFeedbackVisible
        ? `${getClearFeedbackLabel(clearScore.clearedLines)}${combo > 1 ? ` · 连击 ×${combo}` : ''}  +${clearScore.totalAdded}`
        : recordVisible ? `新纪录 · ${state.bestScore}` : `${difficultyLabel}最高分：${state.bestScore}`,
      centerX,
      clearFeedbackVisible
        ? hudLayout.bestBaselineY - 6 * (1 - clearFeedbackAlpha) - 3 * clearAge * (1 - clearAge) * 4
        : hudLayout.bestBaselineY,
      Math.max(80, hudLayout.scoreArea.width)
    );
    ctx.restore();

    if (state.isAdminModeActive()) {
      const tagRect = {
        x: layout.headerRect.x + layout.headerRect.width - 96,
        y: layout.headerRect.y + 56,
        width: 88,
        height: 24
      };
      this.drawStatusTag(tagRect, '管理员模式', 'danger');
    }
  }

  drawBoard(state) {
    const { layout } = this;
    const { boardPanelRect: panel, boardRect, cellSize } = layout;
    const drag = state.feedbackState.drag;
    const settling = drag.active && drag.phase === 'settling';
    const pending = state.pendingClear;
    const omitted = (row, col) => (pending && (pending.rows.includes(row) || pending.cols.includes(col))) ||
      (settling && drag.piece.cells.some((cell) => row === drag.targetRow + cell.y && col === drag.targetCol + cell.x));
    const key = state.board.grid.map((line, row) => line.map((tile, col) =>
      tile && !omitted(row, col) ? tile.color : '-').join(',')).join(';');
    this.drawCachedSurface('board', `${this.theme.id}:${this.layoutKey}:${key}`, {
      x: panel.x - 12, y: panel.y - 12, width: panel.width + 24, height: panel.height + 24
    }, () => {
      const { ctx } = this;
      ctx.save();
      ctx.shadowColor = this.theme.BOARD_PANEL_GLOW;
      ctx.shadowBlur = 12 * this.quality.shadowBlurScale;
      ctx.shadowOffsetY = 5;
      roundedRect(ctx, panel.x, panel.y, panel.width, panel.height, this.theme.UI_TOKENS.radius.medium);
      const frame = this.createLinearGradient(panel.x, panel.y, panel.x, panel.y + panel.height);
      frame.addColorStop(0, this.theme.BOARD_PANEL);
      frame.addColorStop(0.025, this.theme.BOARD_PANEL);
      frame.addColorStop(0.98, this.theme.BOARD_PANEL);
      frame.addColorStop(1, this.theme.BOARD_PANEL);
      ctx.fillStyle = frame;
      ctx.fill();
      ctx.restore();
      roundedRect(ctx, boardRect.x, boardRect.y, boardRect.width, boardRect.height, 9);
      ctx.fillStyle = this.theme.BOARD_PANEL;
      ctx.fill();
      ctx.save();
      ctx.clip();
      for (let parity = 0; parity < 2; parity += 1) {
        ctx.beginPath();
        for (let row = 0; row < BOARD_SIZE; row += 1) {
          for (let col = 0; col < BOARD_SIZE; col += 1) {
            if ((row + col) % 2 !== parity) continue;
            ctx.rect(boardRect.x + col * cellSize + 1, boardRect.y + row * cellSize + 1, cellSize - 2, cellSize - 2);
          }
        }
        ctx.fillStyle = parity === 0 ? this.theme.BOARD_CELL : this.theme.BOARD_CELL_ALT;
        ctx.fill();
      }
      // Inset wells: one batched highlight and one shadow, no per-cell gradients.
      for (let edge = 0; edge < 2; edge += 1) {
        ctx.beginPath();
        for (let row = 0; row < BOARD_SIZE; row += 1) {
          for (let col = 0; col < BOARD_SIZE; col += 1) {
            const x = boardRect.x + col * cellSize + 1.5;
            const y = boardRect.y + row * cellSize + (edge ? cellSize - 1.5 : 1.5);
            ctx.moveTo(x, y);
            ctx.lineTo(x + cellSize - 3, y);
          }
        }
        ctx.strokeStyle = edge ? this.theme.wellLight : this.theme.wellShade;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      for (let row = 0; row < BOARD_SIZE; row += 1) {
        for (let col = 0; col < BOARD_SIZE; col += 1) {
          const tile = state.board.grid[row][col];
          if (!tile || omitted(row, col)) continue;
          this.drawBlockCell(boardRect.x + col * cellSize + 0.5, boardRect.y + row * cellSize + 0.5,
            cellSize - 1, tile.color);
        }
      }
      ctx.restore();
    });
    const { ctx } = this;
    // Contact glints acknowledge the exact placed cells, with no board shake.
    state.placementPulse.forEach((pulse) => {
      if (!state.board.grid[pulse.row]?.[pulse.col]) return;
      const strength = Math.sin(Math.PI * clamp(pulse.remainingTime / 140, 0, 1));
      ctx.save();
      ctx.globalAlpha *= strength * 0.6;
      ctx.strokeStyle = this.theme.UI_TOKENS.surface.modal;
      ctx.lineWidth = 1.5;
      roundedRect(ctx, boardRect.x + pulse.col * cellSize + 2, boardRect.y + pulse.row * cellSize + 2,
        cellSize - 4, cellSize - 4, 4);
      ctx.stroke();
      ctx.restore();
    });
    this.drawLineClearEffects(state);
    this.drawActionFeedback(state);
    if (state.toolState.clearMode) {
      ctx.save();
      roundedRect(ctx, panel.x, panel.y, panel.width, panel.height, this.theme.UI_TOKENS.radius.medium);
      ctx.fillStyle = rgba(this.theme.UI_TOKENS.accent.primary, 0.08);
      ctx.fill();
      ctx.strokeStyle = this.theme.UI_TOKENS.accent.primary;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawActionFeedback(state) {
    const action = state.feedbackState.action;
    if (!action.active || !action.cells.length) return;
    const { ctx, layout: { boardRect, cellSize } } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(boardRect.x, boardRect.y, boardRect.width, boardRect.height);
    ctx.clip();
    action.cells.forEach((cell) => {
      const visual = getActionVisual(action.kind === 'revive' ? { ...action, kind: 'clear' } : action, 0, this.reducedMotion);
      const x = boardRect.x + cell.col * cellSize;
      const y = boardRect.y + cell.row * cellSize;
      if ((action.kind === 'clear' || action.kind === 'revive') && !state.board.grid[cell.row][cell.col]) {
        ctx.save();
        ctx.globalAlpha *= visual.alpha * 0.75;
        ctx.translate(x + cellSize / 2, y + cellSize / 2);
        ctx.scale(visual.scale, visual.scale);
        this.drawBlockCell(-cellSize / 2, -cellSize / 2, cellSize, cell.color || '#79B9DF');
        ctx.restore();
      } else {
        ctx.strokeStyle = rgba(this.theme.UI_TOKENS.accent.primary, visual.strength * 0.8);
        ctx.lineWidth = 1.5;
        roundedRect(ctx, x + 2, y + 2, cellSize - 4, cellSize - 4, 4);
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  drawLineClearEffects(state) {
    const effects = state.feedbackState.clearEffects;
    this.perfStats.setActiveEffects(effects.length);
    const { ctx, layout: { boardRect, cellSize } } = this;
    if (!effects.length) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(boardRect.x, boardRect.y, boardRect.width, boardRect.height);
    ctx.clip();
    effects.forEach((effect) => {
      const visual = getLineClearEffectVisual(effect);
      const pendingMatches = state.pendingClear &&
        state.pendingClear.rows.join(',') === effect.clearedRows.join(',') &&
        state.pendingClear.cols.join(',') === effect.clearedCols.join(',');
      effect.cells.forEach((cell) => {
        if (!pendingMatches && state.board.grid[cell.row]?.[cell.col]) return;
        const drag = state.feedbackState.drag;
        if (drag.active && drag.phase === 'settling' && drag.piece.cells.some((part) =>
          cell.row === drag.targetRow + part.y && cell.col === drag.targetCol + part.x)) return;
        const pose = getClearCellVisual(effect, cell, this.reducedMotion);
        if (pose.alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha *= pose.alpha;
        const x = boardRect.x + (cell.col + 0.5 + pose.offsetX) * cellSize;
        const y = boardRect.y + (cell.row + 0.5 + pose.offsetY) * cellSize;
        ctx.translate(x, y);
        ctx.scale(pose.scale, pose.scale);
        this.drawBlockCell(-cellSize / 2 + 0.5, -cellSize / 2 + 0.5, cellSize - 1, cell.color || '#8BD6F3', { pulse: pose.highlight });
        ctx.restore();
      });
      if (!this.reducedMotion) {
        this.drawLineClearLasers(effect, visual);
        this.drawLineClearImpact(effect, visual);
        this.drawLineClearParticles(effect, visual);
      }
    });
    ctx.restore();
  }

  drawLineClearImpact(effect, visual) {
    if (!effect.crossCells.length || visual.impactAlpha <= 0) return;
    const { ctx, layout: { boardRect, cellSize } } = this;
    const cross = effect.crossCells[0];
    const x = boardRect.x + (cross.col + 0.5) * cellSize;
    const y = boardRect.y + (cross.row + 0.5) * cellSize;
    ctx.save();
    ctx.strokeStyle = rgba(this.theme.UI_TOKENS.accent.warning, visual.impactAlpha * 0.4);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, cellSize * (0.25 + visual.impactProgress * 0.6), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawLineClearLasers(effect, visual) {
    if (visual.laserAlpha <= 0 || visual.laserProgress <= 0) return;
    const { ctx, layout: { boardRect, cellSize } } = this;
    ctx.save();
    effect.lasers.slice(0, this.quality.maxLaserDraws).forEach((laser) => {
      this.perfStats.recordLaser();
      const row = laser.kind === 'row';
      const start = row ? boardRect.x : boardRect.y;
      const length = row ? boardRect.width : boardRect.height;
      const origin = start + length * laser.origin;
      const cross = (row ? boardRect.y : boardRect.x) + (laser.index + 0.5) * cellSize;
      for (const direction of [-1, 1]) {
        const edge = start + (direction > 0 ? length : 0);
        const head = origin + (edge - origin) * visual.laserProgress;
        const tail = head - direction * Math.min(Math.abs(head - origin), cellSize * 1.5);
        ctx.strokeStyle = rgba(this.theme.UI_TOKENS.accent.primary, visual.laserAlpha * 0.28);
        ctx.lineWidth = Math.max(1, cellSize * 0.06);
        ctx.beginPath();
        ctx.moveTo(row ? tail : cross, row ? cross : tail);
        ctx.lineTo(row ? head : cross, row ? cross : head);
        ctx.stroke();
        ctx.fillStyle = rgba(this.theme.UI_TOKENS.accent.warning, visual.laserAlpha * 0.6);
        ctx.fillRect(row ? head - 1 : cross - cellSize * 0.25,
          row ? cross - cellSize * 0.25 : head - 1, row ? 2 : cellSize * 0.5, row ? cellSize * 0.5 : 2);
      }
    });
    ctx.restore();
  }

  drawLineClearParticles(effect, visual) {
    if (visual.particleAlpha <= 0) {
      return;
    }

    const { ctx, layout } = this;
    const { boardRect, cellSize } = layout;
    const elapsed = effect.duration - effect.remaining;
    ctx.save();
    const particleLimit = Math.min(this.quality.maxParticles, this.quality.highCostEffects ? 12 : 6);
    effect.particles.slice(0, particleLimit).forEach((particle) => {
      this.perfStats.recordParticles();
      const lifeProgress = Math.min(1, elapsed / particle.life);
      if (lifeProgress >= 1) {
        return;
      }
      const x = boardRect.x + (particle.col + 0.5 + particle.offsetX * 0.35 + particle.velocityX * lifeProgress) * cellSize;
      const y = boardRect.y + (particle.row + 0.5 + particle.offsetY * 0.35 + particle.velocityY * lifeProgress) * cellSize;
      ctx.globalAlpha = (1 - lifeProgress) * visual.particleAlpha;
      if (particle.shape === 'spark') {
        const length = particle.size * 2.6;
        const angle = Math.atan2(particle.velocityY, particle.velocityX);
        ctx.strokeStyle = rgba(this.theme.UI_TOKENS.accent.warning, 0.65);
        ctx.lineWidth = Math.max(1, particle.size * 0.45);
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(angle) * length, y - Math.sin(angle) * length);
        ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
        ctx.stroke();
        return;
      }

      ctx.fillStyle = rgba(this.theme.UI_TOKENS.accent.primary, 0.5);
      ctx.beginPath();
      ctx.arc(x, y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  drawPreview(state) {
    if (!state.dragState.isDragging || !state.previewState.visible || state.toolState.clearMode) return;
    const piece = state.rackPieces[state.dragState.activePieceIndex];
    if (!piece) return;
    const { row, col, canPlace } = state.previewState;
    const { ctx, layout: { boardRect, cellSize } } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(boardRect.x, boardRect.y, boardRect.width, boardRect.height);
    ctx.clip();
    piece.cells.forEach((cell) => {
      const x = boardRect.x + (col + cell.x) * cellSize + 2;
      const y = boardRect.y + (row + cell.y) * cellSize + 2;
      roundedRect(ctx, x, y, cellSize - 4, cellSize - 4, 4);
      ctx.fillStyle = canPlace ? rgba(getPieceInk(piece.color, this.theme.id), 0.22) : 'rgba(241, 116, 134, 0.16)';
      ctx.fill();
      ctx.lineWidth = canPlace ? 1.5 : 1;
      ctx.strokeStyle = canPlace ? rgba(getPieceInk(piece.color, this.theme.id), 0.82) : this.theme.PREVIEW_INVALID;
      ctx.stroke();
      // Four short registration edges make the snapped destination unambiguous.
      if (canPlace) {
        const arm = cellSize * 0.18;
        ctx.strokeStyle = this.theme.PREVIEW_VALID;
        ctx.beginPath();
        ctx.moveTo(x, y + arm); ctx.lineTo(x, y); ctx.lineTo(x + arm, y);
        ctx.moveTo(x + cellSize - 4 - arm, y + cellSize - 4);
        ctx.lineTo(x + cellSize - 4, y + cellSize - 4); ctx.lineTo(x + cellSize - 4, y + cellSize - 4 - arm);
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  drawToolBar(state) {
    const { ctx, layout } = this;
    const rect = layout.toolRect;
    const gap = 8;
    const width = (rect.width - gap * 2) / 3;
    const items = [
      {
        key: 'refresh',
        label: `刷新 ×${state.getToolCountLabel(state.toolState.refreshCount)}`,
        active: false,
        disabled: !state.isAdminModeActive() && state.toolState.refreshCount <= 0
      },
      {
        key: 'clear',
        label: `清除 ×${state.getToolCountLabel(state.toolState.clearCount)}`,
        active: state.toolState.clearMode,
        disabled: !state.isAdminModeActive() && state.toolState.clearCount <= 0
      },
      {
        key: 'undo',
        label: `撤回 ×${state.getToolCountLabel(state.toolState.undoCount)}`,
        active: false,
        disabled: !state.isAdminModeActive() && state.toolState.undoCount <= 0
      }
    ];

    const visualRects = items.map((item, index) => ({
      key: item.key,
      rect: {
        x: rect.x + (width + gap) * index,
        y: rect.y,
        width,
        height: rect.height
      }
    }));
    const hitContainer = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: Math.max(0, this.layout.rackRect.y - rect.y - 1)
    };

    items.forEach((item, index) => {
      const buttonRect = visualRects[index].rect;
      this.toolActionRects[item.key] = createSafeHitRect({
        visualRect: buttonRect,
        containerRect: hitContainer,
        previousRect: index > 0 ? visualRects[index - 1].rect : null,
        nextRect: index + 1 < visualRects.length ? visualRects[index + 1].rect : null,
        lowerBoundary: this.layout.rackRect.y - 1,
        expandBottom: 24,
        expandLeft: 8,
        expandRight: 8,
        minimumTouchHeight: 44,
        slotGap: 1
      });

      this.drawToolButton(buttonRect, item.label, {
        active: item.active,
        disabled: item.disabled,
        pressKey: `tool:${item.key}`
      });
    });
  }

  drawToolButton(rect, label, { active, disabled, pressKey }) {
    const { ctx } = this;
    const press = this.getPressVisual(pressKey);

    ctx.save();
    if (press) {
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      ctx.translate(centerX, centerY);
      ctx.scale(press.scale, press.scale);
      ctx.translate(-centerX, -centerY);
    }
    if (disabled) {
      ctx.globalAlpha = 0.55;
    }

    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, this.theme.UI_TOKENS.radius.medium);
    if (active) {
      ctx.save();
      ctx.shadowColor = rgba(this.theme.UI_TOKENS.accent.primary, 0.1);
      ctx.shadowBlur = 10;
    }
    ctx.fillStyle = active ? this.theme.UI_TOKENS.surface.sunken : this.theme.UI_TOKENS.surface.elevated;
    ctx.fill();
    if (active) {
      ctx.restore();
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = active ? this.theme.UI_TOKENS.border.strong : this.theme.UI_TOKENS.border.subtle;
    if (active || this.theme.id === 'soft') ctx.stroke();

    if (press && press.strength > 0) {
      roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, this.theme.UI_TOKENS.radius.medium);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.08 * press.strength})`;
      ctx.fill();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = active || !disabled ? this.theme.TEXT_PRIMARY : this.theme.TEXT_MUTED;
    ctx.font = rect.height < 40 ? 'bold 14px sans-serif' : 'bold 15px sans-serif';
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 5);
    ctx.restore();
  }

  drawRack(state) {
    const { ctx } = this;

    this.layout.rackSlots.forEach((slot) => {
      roundedRect(ctx, slot.x + 3, slot.y + 4, slot.width - 6, slot.height - 10, this.theme.UI_TOKENS.radius.medium);
      ctx.fillStyle = this.theme.UI_TOKENS.surface.elevated;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = this.theme.UI_TOKENS.border.subtle;
      if (this.theme.id === 'soft') ctx.stroke();
    });

    for (let index = 0; index < state.rackPieces.length; index += 1) {
      const piece = state.rackPieces[index];
      const slot = this.layout.rackSlots[index];
      const activeDrag = state.feedbackState && state.feedbackState.drag;
      if (!piece || piece.used || !slot || (activeDrag && activeDrag.active && activeDrag.phase !== 'settling' && index === activeDrag.pieceIndex)) {
        continue;
      }

      const maxWidth = slot.width - SLOT_PADDING * 2;
      const maxHeight = slot.height - SLOT_PADDING * 2;
      const cellSize = Math.min(
        maxWidth / piece.bounds.width,
        maxHeight / piece.bounds.height,
        this.layout.cellSize * 0.94
      );
      const width = piece.bounds.width * cellSize;
      const height = piece.bounds.height * cellSize;
      const x = slot.x + (slot.width - width) / 2;
      const y = slot.y + (slot.height - height) / 2;

      this.rackHitAreas.push({
        index,
        x,
        y,
        width,
        height,
        slotX: slot.x,
        slotY: slot.y,
        slotWidth: slot.width,
        slotHeight: slot.height,
        cellSize
      });

      const action = state.feedbackState.action;
      const arrival = action.active && action.rack ? getActionVisual(action, index, this.reducedMotion) : null;
      ctx.save();
      if (arrival) {
        ctx.globalAlpha *= arrival.alpha;
        ctx.translate(x + width / 2, y + height / 2 + arrival.offsetY);
        ctx.scale(arrival.scale, arrival.scale);
        ctx.translate(-x - width / 2, -y - height / 2);
      }
      piece.cells.forEach((cell) => {
        this.drawBlockCell(x + cell.x * cellSize, y + cell.y * cellSize, cellSize, piece.color);
      });
      ctx.restore();
    }
  }

  drawMiniButton(rect, label, pressKey) {
    const { ctx } = this;
    const press = this.getPressVisual(pressKey);

    ctx.save();
    if (press) {
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      ctx.translate(centerX, centerY);
      ctx.scale(press.scale, press.scale);
      ctx.translate(-centerX, -centerY);
    }

    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, this.theme.UI_TOKENS.radius.small);
    ctx.fillStyle = this.theme.UI_TOKENS.surface.elevated;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = press && press.strength > 0 ? this.theme.UI_TOKENS.border.strong : this.theme.UI_TOKENS.border.subtle;
    if (this.theme.id === 'soft') ctx.stroke();

    if (press && press.strength > 0) {
      roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, this.theme.UI_TOKENS.radius.small);
      ctx.fillStyle = `rgba(0, 0, 0, ${0.16 * press.strength})`;
      ctx.fill();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = this.theme.TEXT_SECONDARY;
    ctx.font = '14px sans-serif';
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 5);
    ctx.restore();
  }

  drawSettingsButton() {
    this.drawMiniButton(
      this.settingsButtonRect,
      '设置',
      'hud:settings'
    );
  }

  drawPauseButton() {
    this.drawMiniButton(
      this.pauseButtonRect || this.pauseButtonRect,
      '暂停',
      'hud:pause'
    );
  }

  drawDraggingPiece(state) {
    const drag = state.feedbackState.drag;
    if (!drag.active || state.toolState.clearMode || !drag.piece) return;
    const visual = getDragVisual(drag, this.reducedMotion);
    const { ctx } = this;
    const size = drag.displayCellSize;
    ctx.save();
    ctx.translate(visual.x, visual.y);
    ctx.scale(visual.scale, visual.scale);
    // A directional contact shadow, kept separate from the tile's material.
    ctx.fillStyle = `rgba(2, 10, 21, ${0.16 + visual.elevation * 0.16})`;
    drag.piece.cells.forEach((cell) => {
      roundedRect(ctx, cell.x * size + 1 + visual.elevation * 2, cell.y * size + 3 + visual.elevation * 4,
        size - 2, size - 2, clamp(size * 0.12, 2, 5));
      ctx.fill();
    });
    drag.piece.cells.forEach((cell) => {
      this.drawBlockCell(cell.x * size, cell.y * size, size, drag.piece.color, {
        pulse: drag.phase === 'invalid' ? 0 : visual.elevation * 0.14
      });
      if (drag.phase === 'invalid') {
        ctx.strokeStyle = `rgba(255, 166, 171, ${Math.min(0.75, visual.elevation)})`;
        ctx.lineWidth = 1.5;
        roundedRect(ctx, cell.x * size + 1.5, cell.y * size + 1.5, size - 3, size - 3, 4);
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  drawHelpModal(state) {
    const { ctx, layout } = this;
    const motion = this.getPanelMotion(state, 'help');
    const shell = calculateModalShellLayout({
      viewportWidth: layout.screenWidth,
      viewportHeight: layout.screenHeight,
      topInset: layout.headerRect.y,
      bottomInset: layout.bottomInset,
      sideInset: layout.sideMargin,
      preferredContentHeight: null
    });

    this.withPanelMotion(motion, shell.panel, () => {
      ctx.fillStyle = this.theme.OVERLAY;
      ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);
      this.drawModalPanel(shell.panel, 24);
      this.drawModalTitle('怎么玩', shell);

      const helpRows = [
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
        { text: '输入福利码后，每局获得 2 次免死机会。' }
      ];
      const lines = calculateHelpRowsLayout({ contentRect: shell.content, rows: helpRows });

      ctx.textAlign = 'left';
      lines.lineRects.forEach((line) => {
        ctx.fillStyle = line.isSection ? this.theme.TEXT_PRIMARY : this.theme.TEXT_SECONDARY;
        ctx.font = line.isSection
          ? `bold ${line.fontSize}px sans-serif`
          : `${line.fontSize}px sans-serif`;
        ctx.fillText(line.text, line.x + 4, line.y + line.height - 7);
      });

      const closeRect = shell.footerButton;
      this.helpActionRects.close = closeRect;
      this.drawActionButton(closeRect, '关闭', 'primary', { pressKey: 'help:close' });
    });
  }

  getSettingsRows(state, tab) {
    if (tab === 'account') {
      const rows = [
        { type: 'section', label: '福利状态' },
        { key: 'memberStatus', label: '福利状态', value: state.getMemberStatusLabel() }
      ];

      if (state.settings.localMembershipEnabled) {
        rows.push({ key: 'memberBenefit', label: '会员福利', value: state.getMembershipBenefitLabel() });
      }
      rows.push({ key: 'openMembership', label: '输入福利码', value: '' });
      if (state.settings.localMembershipEnabled) {
        rows.push({ key: 'disableMembership', label: '关闭福利', value: '' });
      }
      rows.push({ type: 'section', label: '数据' });
      rows.push({ key: 'reset', label: '重置当前难度最高分', value: '' });

      if (state.isAdminModeActive()) {
        rows.push({ type: 'section', label: '管理员模式' });
        rows.push({ key: 'adminStatus', label: '管理员状态', value: state.getAdminStatusLabel() });
        rows.push({ key: 'disableAdmin', label: '关闭管理员模式', value: '' });
      }
      return rows;
    }

    return [
      { key: 'theme', label: '当前外观', value: `${this.theme.name} · 切换` },
      { key: 'sound', label: '音效', value: state.settings.soundEnabled ? '开启' : '关闭' },
      { key: 'bgm', label: '背景音乐', value: state.settings.bgmEnabled ? '开启' : '关闭' },
      { key: 'bgmTrack', label: '背景音乐选择', value: this.getBgmLabel(state) },
      { key: 'vibration', label: '震动反馈', value: state.settings.vibrationEnabled ? '开启' : '关闭' },
      { key: 'difficulty', label: '难度', value: getDifficultyLabel(state.settings.difficulty) }
    ];
  }

  drawSettingsPanel(state) {
    const { ctx, layout } = this;
    const motion = this.getPanelMotion(state, 'settings');
    const confirmOpen = state.ui.isResetConfirmOpen;
    const shell = calculateModalShellLayout({
      viewportWidth: layout.screenWidth,
      viewportHeight: layout.screenHeight,
      topInset: layout.headerRect.y,
      bottomInset: layout.bottomInset,
      sideInset: layout.sideMargin + 3,
      preferredContentHeight: confirmOpen ? 130 : measureModalRowsHeight(this.getSettingsRows(state, state.ui.settingsTab === 'account' ? 'account' : 'game')) + 56
    });

    this.withPanelMotion(motion, shell.panel, () => {
      this.settingsActionRects = {};
      ctx.fillStyle = this.theme.OVERLAY;
      ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);
      this.drawModalPanel(shell.panel);
      this.drawModalTitle('游戏设置', shell);

      if (confirmOpen) {
        this.drawResetConfirm(state, shell);
        return;
      }

      const tab = state.ui.settingsTab === 'account' ? 'account' : 'game';
      const tabs = calculateSettingsTabsLayout({
        contentRect: shell.content,
        tabs: ['game', 'account']
      });
      const tabsMeta = [
        { key: 'game', label: '游戏' },
        { key: 'account', label: '账号与数据' }
      ];
      tabsMeta.forEach((meta, index) => {
        const tabRect = tabs.tabRects[index];
        this.settingsActionRects[`tab:${meta.key}`] = tabRect;
        const active = tab === meta.key;
        const press = this.getPressVisual(`settings:tab:${meta.key}`);

        roundedRect(ctx, tabRect.x, tabRect.y, tabRect.width, tabRect.height, this.theme.UI_TOKENS.radius.small);
        ctx.fillStyle = active ? this.theme.UI_TOKENS.surface.sunken : this.theme.UI_TOKENS.surface.elevated;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = active ? this.theme.UI_TOKENS.border.strong : this.theme.UI_TOKENS.border.subtle;
        if (active || this.theme.id === 'soft') ctx.stroke();
        if (press && press.strength > 0) {
          roundedRect(ctx, tabRect.x, tabRect.y, tabRect.width, tabRect.height, this.theme.UI_TOKENS.radius.small);
          ctx.fillStyle = `rgba(255, 255, 255, ${0.08 * press.strength})`;
          ctx.fill();
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = active ? this.theme.TEXT_PRIMARY : this.theme.TEXT_SECONDARY;
        ctx.font = `${active ? 'bold ' : ''}15px sans-serif`;
        ctx.fillText(meta.label, tabRect.x + tabRect.width / 2, tabRect.y + tabRect.height / 2 + 5);
      });

      const rows = this.getSettingsRows(state, tab);
      const layoutRows = calculateModalRowsLayout({ contentRect: tabs.contentBelow, rows });
      this.drawSettingGroupSurfaces(layoutRows.rects);
      this.drawSettingsRows(layoutRows.rects);

      const continueRect = shell.footerButton;
      this.settingsActionRects.continue = continueRect;
      this.drawActionButton(continueRect, state.screen === 'home' ? '完成' : '继续游戏', 'primary', { pressKey: 'settings:continue' });
    });
  }

  drawSettingGroupSurfaces(rects) {
    const { ctx } = this;
    let group = [];

    const flushGroup = () => {
      if (group.length === 0) {
        return;
      }
      const firstRect = group[0];
      const lastRect = group[group.length - 1];
      roundedRect(
        ctx,
        firstRect.x - 6,
        firstRect.y - 4,
        firstRect.width + 12,
        lastRect.y + lastRect.height - firstRect.y + 8,
        this.theme.UI_TOKENS.radius.small
      );
      ctx.fillStyle = this.theme.UI_TOKENS.surface.elevated;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = this.theme.UI_TOKENS.border.subtle;
      if (this.theme.id === 'soft') ctx.stroke();
      group = [];
    };

    rects.forEach((rowRect) => {
      if (rowRect.type === 'section') {
        flushGroup();
        return;
      }
      group.push(rowRect);
    });
    flushGroup();
  }

  drawSettingsRows(rects) {
    const { ctx } = this;
    rects.forEach((rowRect, index) => {
      if (rowRect.type === 'section') {
        this.drawSectionLabel(rowRect, rowRect.label);
        return;
      }

      this.settingsActionRects[rowRect.key] = rowRect;

      if (index > 0 && rects[index - 1].type !== 'section') {
        ctx.beginPath();
        ctx.moveTo(rowRect.x + 12, rowRect.y + 0.5);
        ctx.lineTo(rowRect.x + rowRect.width - 12, rowRect.y + 0.5);
        ctx.strokeStyle = this.theme.UI_TOKENS.border.subtle;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.textAlign = 'left';
      ctx.fillStyle = this.theme.TEXT_PRIMARY;
      const labelWidth = rowRect.value ? (rowRect.width - 40) * 0.52 : rowRect.width - 32;
      const labelFit = fitTextSize({ text: rowRect.label, preferredSize: 16, minimumSize: 12,
        maxWidth: labelWidth, measureText: this.measureCanvasText.bind(this) });
      ctx.font = `${labelFit.fontSize}px sans-serif`;
      ctx.fillText(rowRect.label, rowRect.x + 16, rowRect.y + rowRect.height / 2 + 5, labelWidth);
      if (rowRect.value) {
        ctx.textAlign = 'right';
        ctx.fillStyle = this.theme.TEXT_SECONDARY;
        const valueWidth = (rowRect.width - 40) * 0.48;
        const valueFit = fitTextSize({ text: rowRect.value, preferredSize: 15, minimumSize: 12,
          maxWidth: valueWidth, measureText: this.measureCanvasText.bind(this) });
        ctx.font = `${valueFit.fontSize}px sans-serif`;
        ctx.fillText(rowRect.value, rowRect.x + rowRect.width - 16, rowRect.y + rowRect.height / 2 + 5, valueWidth);
      }
    });
  }

  drawResetConfirm(state, shell) {
    const { ctx } = this;
    ctx.textAlign = 'center';
    ctx.fillStyle = this.theme.TEXT_SECONDARY;
    ctx.font = '17px sans-serif';
    ctx.fillText('确认重置当前难度最高分？', shell.panel.x + shell.panel.width / 2, shell.content.y + 34);

    const buttonWidth = (shell.content.width - 16) / 2;
    const cancelRect = {
      x: shell.content.x,
      y: shell.content.y + 62,
      width: buttonWidth,
      height: 46
    };
    const confirmRect = {
      x: cancelRect.x + cancelRect.width + 16,
      y: cancelRect.y,
      width: cancelRect.width,
      height: cancelRect.height
    };

    this.settingsActionRects.cancelReset = cancelRect;
    this.settingsActionRects.confirmReset = confirmRect;
    this.settingsActionRects.continue = shell.footerButton;

    this.drawActionButton(cancelRect, '取消', 'secondary', { pressKey: 'settings:cancelReset' });
    this.drawActionButton(confirmRect, '确认重置', 'danger', { pressKey: 'settings:confirmReset' });
    this.drawActionButton(shell.footerButton, '继续游戏', 'primary', { pressKey: 'settings:continue' });
  }

  drawPausePanel(state) {
    const { ctx, layout } = this;
    const motion = this.getPanelMotion(state, 'pause');
    const confirmOpen = state.ui.isPauseConfirmOpen;
    const shell = calculateModalShellLayout({
      viewportWidth: layout.screenWidth,
      viewportHeight: layout.screenHeight,
      topInset: layout.headerRect.y,
      bottomInset: layout.bottomInset,
      sideInset: layout.sideMargin + 5,
      preferredContentHeight: confirmOpen ? 140 : 200,
      footerHeight: 24
    });

    this.withPanelMotion(motion, shell.panel, () => {
      this.pauseActionRects = {};
      ctx.fillStyle = this.theme.OVERLAY;
      ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);
      this.drawModalPanel(shell.panel);
      this.drawModalTitle('暂停', shell);

      if (confirmOpen) {
        ctx.textAlign = 'center';
        ctx.fillStyle = this.theme.TEXT_PRIMARY;
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText('确认返回主页？', layout.screenWidth / 2, shell.content.y + 26);
        ctx.fillStyle = this.theme.TEXT_SECONDARY;
        ctx.font = '15px sans-serif';
        ctx.fillText('当前这一局将结束。', layout.screenWidth / 2, shell.content.y + 58);

        const buttonWidth = (shell.content.width - 16) / 2;
        const cancelRect = {
          x: shell.content.x,
          y: shell.content.y + 92,
          width: buttonWidth,
          height: 46
        };
        const confirmRect = {
          x: cancelRect.x + cancelRect.width + 16,
          y: cancelRect.y,
          width: cancelRect.width,
          height: cancelRect.height
        };

        this.pauseActionRects.cancelHome = cancelRect;
        this.pauseActionRects.confirmHome = confirmRect;
        this.drawActionButton(cancelRect, '取消', 'secondary', { pressKey: 'pause:cancelHome' });
        this.drawActionButton(confirmRect, '确认返回', 'danger', { pressKey: 'pause:confirmHome' });
        return;
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = this.theme.TEXT_SECONDARY;
      ctx.font = '15px sans-serif';
      ctx.fillText('当前游戏已暂停', layout.screenWidth / 2, shell.content.y + 16);

      const continueRect = {
        x: shell.content.x,
        y: shell.content.y + 36,
        width: shell.content.width,
        height: 48
      };
      const restartRect = {
        x: continueRect.x,
        y: continueRect.y + 60,
        width: continueRect.width,
        height: 48
      };
      const homeRect = {
        x: continueRect.x,
        y: restartRect.y + 60,
        width: continueRect.width,
        height: 44
      };

      this.pauseActionRects.continue = continueRect;
      this.pauseActionRects.restart = restartRect;
      this.pauseActionRects.home = homeRect;

      this.drawActionButton(continueRect, '继续游戏', 'primary', { pressKey: 'pause:continue' });
      this.drawActionButton(restartRect, '重新开始', 'secondary', { pressKey: 'pause:restart' });
      this.drawActionButton(homeRect, '返回主页', 'dangerOutline', { pressKey: 'pause:home' });
    });
  }

  drawAdminPanel(state) {
    const { ctx, layout } = this;
    const motion = this.getPanelMotion(state, 'admin');
    const shell = calculateModalShellLayout({
      viewportWidth: layout.screenWidth,
      viewportHeight: layout.screenHeight,
      topInset: layout.headerRect.y,
      bottomInset: layout.bottomInset,
      sideInset: layout.sideMargin + 12,
      preferredContentHeight: 118
    });

    this.withPanelMotion(motion, shell.panel, () => {
      this.adminActionRects = {};
      ctx.fillStyle = this.theme.OVERLAY;
      ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);
      this.drawModalPanel(shell.panel);
      this.drawModalTitle('管理员模式', shell);

      ctx.textAlign = 'center';
      ctx.fillStyle = this.theme.TEXT_SECONDARY;
      ctx.font = '15px sans-serif';
      ctx.fillText('此入口仅用于本机测试。', shell.panel.x + shell.panel.width / 2, shell.content.y + 22);
      ctx.fillText('开启后本局分数不会写入正式最高分。', shell.panel.x + shell.panel.width / 2, shell.content.y + 48, shell.content.width);

      const buttonWidth = (shell.content.width - 16) / 2;
      const cancelRect = {
        x: shell.content.x,
        y: shell.content.y + shell.content.height - 50,
        width: buttonWidth,
        height: 46
      };
      const confirmRect = {
        x: cancelRect.x + cancelRect.width + 16,
        y: cancelRect.y,
        width: cancelRect.width,
        height: cancelRect.height
      };
      this.adminActionRects.cancel = cancelRect;
      this.adminActionRects.confirm = confirmRect;
      this.drawActionButton(cancelRect, '取消', 'secondary', { pressKey: 'admin:cancel' });
      this.drawActionButton(confirmRect, '开启', 'primary', { pressKey: 'admin:confirm' });
    });
  }

  drawMembershipPanel(state) {
    const { ctx, layout } = this;
    const motion = this.getPanelMotion(state, 'membership');
    const shell = calculateModalShellLayout({
      viewportWidth: layout.screenWidth,
      viewportHeight: layout.screenHeight,
      topInset: layout.headerRect.y,
      bottomInset: layout.bottomInset,
      sideInset: layout.sideMargin + 12,
      preferredContentHeight: 226
    });

    this.withPanelMotion(motion, shell.panel, () => {
      this.membershipActionRects = {};
      ctx.fillStyle = this.theme.OVERLAY;
      ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);
      this.drawModalPanel(shell.panel);
      this.drawModalTitle('输入福利码', shell);

      const inputRect = {
        x: shell.content.x,
        y: shell.content.y,
        width: shell.content.width,
        height: 46
      };
      this.membershipActionRects.input = inputRect;

      roundedRect(ctx, inputRect.x, inputRect.y, inputRect.width, inputRect.height, this.theme.UI_TOKENS.radius.small);
      ctx.fillStyle = this.theme.UI_TOKENS.surface.input;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = this.theme.UI_TOKENS.border.strong;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.font = '16px sans-serif';
      if (state.membershipInput) {
        ctx.fillStyle = this.theme.TEXT_PRIMARY;
        let visibleInput = state.membershipInput;
        while (visibleInput.length > 1 && this.measureCanvasText(visibleInput, 16) > inputRect.width - 28) visibleInput = visibleInput.slice(1);
        ctx.fillText(visibleInput, inputRect.x + 14, inputRect.y + 29, inputRect.width - 28);
      } else {
        ctx.fillStyle = this.theme.TEXT_MUTED;
        ctx.fillText('请输入福利码', inputRect.x + 14, inputRect.y + 29);
      }

      if (state.membershipError) {
        ctx.fillStyle = this.theme.UI_TOKENS.accent.danger;
        ctx.font = '14px sans-serif';
        ctx.fillText(state.membershipError, inputRect.x + 2, inputRect.y + 66);
      }

      this.drawMembershipKeyboard(
        shell.content.x - 4,
        shell.content.y,
        shell.content.width + 8,
        shell.content.y + (state.membershipError ? 72 : 56)
      );

      const buttonWidth = (shell.content.width - 16) / 2;
      const cancelRect = {
        x: shell.content.x,
        y: shell.footerButton.y,
        width: buttonWidth,
        height: shell.footerButton.height
      };
      const confirmRect = {
        x: cancelRect.x + cancelRect.width + 16,
        y: cancelRect.y,
        width: cancelRect.width,
        height: cancelRect.height
      };
      this.membershipActionRects.cancel = cancelRect;
      this.membershipActionRects.confirm = confirmRect;
      this.drawActionButton(cancelRect, '取消', 'secondary', { pressKey: 'membership:cancel' });
      this.drawActionButton(confirmRect, '确认', 'primary', { pressKey: 'membership:confirm' });
    });
  }

  drawMembershipKeyboard(keyboardX, keyboardY, keyboardWidth, keyboardTopY) {
    const { ctx } = this;
    this.membershipKeyboardKeyRects = {};

    const rows = [
      ['1','2','3','4','5','6','7','8','9','0'],
      ['Q','W','E','R','T','Y','U','I','O','P'],
      ['A','S','D','F','G','H','J','K','L'],
      ['Z','X','C','V','B','N','M','DEL']
    ];

    const keyH = 36;
    const gap = 3;
    const contentX = keyboardX + 8;
    const contentW = keyboardWidth - 16;

    rows.forEach((row, rowIdx) => {
      const n = row.length;
      const totalGap = (n - 1) * gap;
      const keyW = (contentW - totalGap) / n;
      const y = keyboardTopY + rowIdx * (keyH + gap);

      row.forEach((label, colIdx) => {
        const x = contentX + colIdx * (keyW + gap);
        const isDel = label === 'DEL';
        const press = this.getPressVisual(`membership:key:${label}`);

        ctx.save();
        if (press) {
          const centerX = x + keyW / 2;
          const centerY = y + keyH / 2;
          ctx.translate(centerX, centerY);
          ctx.scale(press.scale, press.scale);
          ctx.translate(-centerX, -centerY);
        }

        roundedRect(ctx, x, y, keyW, keyH, 8);
        ctx.fillStyle = this.theme.UI_TOKENS.surface.elevated;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = isDel
          ? this.theme.UI_TOKENS.accent.danger
          : press && press.strength > 0 ? this.theme.UI_TOKENS.border.strong : this.theme.UI_TOKENS.border.subtle;
        ctx.stroke();

        if (press && press.strength > 0) {
          roundedRect(ctx, x, y, keyW, keyH, 8);
          ctx.fillStyle = `rgba(255, 255, 255, ${0.1 * press.strength})`;
          ctx.fill();
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isDel ? this.theme.UI_TOKENS.accent.danger : this.theme.TEXT_PRIMARY;
        ctx.font = isDel ? 'bold 13px sans-serif' : 'bold 16px sans-serif';
        ctx.fillText(label, x + keyW / 2, y + keyH / 2 + 1);
        ctx.restore();

        this.membershipKeyboardKeyRects[label + '_' + rowIdx + '_' + colIdx] = {
          x, y, width: keyW, height: keyH, key: label
        };
      });
    });

    ctx.textBaseline = 'alphabetic';
  }

  getMembershipKeyHit(x, y) {
    const keys = this.membershipKeyboardKeyRects;
    for (const id in keys) {
      const k = keys[id];
      if (x >= k.x && x <= k.x + k.width && y >= k.y && y <= k.y + k.height) {
        return k.key;
      }
    }
    return null;
  }

  drawRevivePrompt(state) {
    const { ctx, layout } = this;
    const motion = this.getPanelMotion(state, 'revive');
    const shell = calculateModalShellLayout({
      viewportWidth: layout.screenWidth,
      viewportHeight: layout.screenHeight,
      topInset: layout.headerRect.y,
      bottomInset: layout.bottomInset,
      sideInset: layout.sideMargin + 9,
      preferredContentHeight: 152
    });

    this.withPanelMotion(motion, shell.panel, () => {
      this.reviveActionRects = {};
      ctx.fillStyle = this.theme.OVERLAY;
      ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);
      this.drawModalPanel(shell.panel);
      this.drawModalTitle('使用免死金牌？', shell);

      const reviveCountLabel = state.getReviveCountLabel();
      const prefix = '本局还可免死 ';
      const suffix = ' 次';
      const prefixWidth = this.measureCanvasText(prefix, 16);
      const countWidth = this.measureCanvasText(reviveCountLabel, 19, 'sans-serif', 'bold');
      const suffixWidth = this.measureCanvasText(suffix, 16);
      const totalWidth = prefixWidth + countWidth + suffixWidth;
      const textStartX = shell.panel.x + shell.panel.width / 2 - totalWidth / 2;
      const textBaseline = shell.content.y + 30;

      ctx.textAlign = 'left';
      ctx.fillStyle = this.theme.TEXT_SECONDARY;
      ctx.font = '16px sans-serif';
      ctx.fillText(prefix, textStartX, textBaseline);
      ctx.fillStyle = this.theme.UI_TOKENS.accent.warning;
      ctx.font = 'bold 19px sans-serif';
      ctx.fillText(reviveCountLabel, textStartX + prefixWidth, textBaseline);
      ctx.fillStyle = this.theme.TEXT_SECONDARY;
      ctx.font = '16px sans-serif';
      ctx.fillText(suffix, textStartX + prefixWidth + countWidth, textBaseline);

      const useRect = {
        x: shell.content.x,
        y: shell.content.y + 48,
        width: shell.content.width,
        height: 48
      };
      const giveUpRect = {
        x: shell.content.x,
        y: useRect.y + 58,
        width: shell.content.width,
        height: 42
      };

      this.reviveActionRects.use = useRect;
      this.reviveActionRects.giveUp = giveUpRect;
      this.drawActionButton(useRect, '使用', 'primary', { pressKey: 'revive:use' });
      this.drawActionButton(giveUpRect, '放弃', 'dangerOutline', { pressKey: 'revive:giveUp' });
    });
  }

  drawGameOver(state) {
    const { ctx, layout } = this;
    const eligible = state.bestScoreEligible;
    const record = eligible && state.hasShownNewRecord;
    const shell = calculateModalShellLayout({ viewportWidth: layout.screenWidth, viewportHeight: layout.screenHeight,
      topInset: layout.headerRect.y, bottomInset: layout.bottomInset, sideInset: layout.sideMargin + 4,
      preferredContentHeight: 260 });
    this.withPanelMotion(this.getPanelMotion(state, 'gameover'), shell.panel, () => {
      ctx.fillStyle = this.theme.OVERLAY; ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);
      this.drawModalPanel(shell.panel);
      const cx = shell.panel.x + shell.panel.width / 2;
      const y = shell.panel.y;
      ctx.textAlign = 'center'; ctx.fillStyle = this.theme.TEXT_PRIMARY; ctx.font = `24px ${this.theme.titleFont}`;
      ctx.fillText('游戏结束', cx, y + 40);
      // A small finished arrangement echoes the home mark without blocking input.
      ['#47E56B', '#FFD60A', '#FF4D6D'].forEach((color, i) => this.drawBlockCell(cx - 33 + i * 22, y + 56, 20, color));
      ctx.fillStyle = record ? this.theme.UI_TOKENS.accent.warning : this.theme.TEXT_SECONDARY; ctx.font = '13px sans-serif';
      ctx.fillText(record ? '新纪录 · 本局得分' : '本局得分', cx, y + 102);
      const scoreFit = fitTextSize({ text: String(state.score), preferredSize: 52, minimumSize: 24,
        maxWidth: shell.content.width, fontFamily: this.theme.titleFont, measureText: this.measureCanvasText.bind(this) });
      ctx.fillStyle = this.theme.TEXT_PRIMARY; ctx.font = `${scoreFit.fontSize}px ${this.theme.titleFont}`;
      ctx.fillText(String(state.score), cx, y + 156, shell.content.width);
      ctx.strokeStyle = this.theme.UI_TOKENS.border.subtle; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(shell.content.x, y + 178); ctx.lineTo(shell.content.x + shell.content.width, y + 178); ctx.stroke();
      ctx.fillStyle = this.theme.TEXT_SECONDARY; ctx.font = '14px sans-serif';
      ctx.fillText(`${getDifficultyLabel(state.activeDifficulty)} · 最高分 ${state.bestScore}`, cx, y + 204, shell.content.width);
      ctx.font = '12px sans-serif';
      ctx.fillText(state.getGameOverExtraText() || '', cx, y + 226, shell.content.width);
      if (!eligible) {
        ctx.fillStyle = this.theme.UI_TOKENS.accent.danger;
        ctx.fillText('管理员模式分数不计入正式最高分', cx, y + 248, shell.content.width);
      }
      const primary = { ...shell.footerButton, y: shell.footerButton.y - 44 };
      this.restartButtonRect = primary;
      this.gameOverHomeRect = { ...shell.footerButton, y: primary.y + primary.height + 2, height: 44 };
      this.drawActionButton(primary, '再玩一局', 'primary', { pressKey: 'gameover:restart' });
      this.drawActionButton(this.gameOverHomeRect, '返回主页', 'quiet', { pressKey: 'gameover:home' });
    });
  }

  drawSectionLabel(rect, label) {
    const { ctx } = this;
    ctx.textAlign = 'left';
    ctx.fillStyle = this.theme.TEXT_MUTED;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(label, rect.x + 6, rect.y + rect.height / 2 + 4);
  }

  drawActionButton(rect, label, variant = 'secondary', options = {}) {
    const { ctx } = this;
    const primary = variant === 'primary' || variant === true;
    const danger = variant === 'danger';
    const press = this.getPressVisual(options.pressKey);
    ctx.save();
    if (press) {
      ctx.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
      ctx.scale(press.scale, press.scale);
      ctx.translate(-rect.x - rect.width / 2, -rect.y - rect.height / 2);
    }
    if (options.disabled) ctx.globalAlpha *= 0.55;
    if (variant !== 'quiet') {
      roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, this.theme.UI_TOKENS.radius.small);
      ctx.fillStyle = primary ? this.theme.BUTTON_FILL : danger ? (this.theme.dangerFill || this.theme.UI_TOKENS.accent.danger) : this.theme.UI_TOKENS.surface.elevated;
      if (this.theme.id === 'classic' && primary) {
        const fill = this.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height);
        fill.addColorStop(0, '#2A638C'); fill.addColorStop(1, '#245679');
        ctx.fillStyle = fill;
        ctx.shadowColor = this.theme.BUTTON_GLOW; ctx.shadowBlur = 8 * this.quality.shadowBlurScale;
      }
      ctx.fill();
    }
    if (press?.strength > 0) {
      roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, this.theme.UI_TOKENS.radius.small);
      ctx.fillStyle = rgba(this.theme.TEXT_PRIMARY, press.strength * 0.12); ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.textAlign = 'center';
    ctx.fillStyle = primary || danger ? this.theme.onAction
      : variant === 'dangerOutline' ? this.theme.UI_TOKENS.accent.danger : this.theme.TEXT_PRIMARY;
    ctx.font = `${primary ? 'bold ' : ''}16px sans-serif`;
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 5, rect.width - 20);
    ctx.restore();
  }

  drawSecondaryChip(rect, label, pressKey) {
    const { ctx } = this;
    const press = this.getPressVisual(pressKey);

    ctx.save();
    if (press) {
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      ctx.translate(centerX, centerY);
      ctx.scale(press.scale, press.scale);
      ctx.translate(-centerX, -centerY);
    }

    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, this.theme.UI_TOKENS.radius.medium);
    ctx.fillStyle = this.theme.UI_TOKENS.surface.elevated;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = this.theme.UI_TOKENS.border.subtle;
    ctx.stroke();

    if (press && press.strength > 0) {
      roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, this.theme.UI_TOKENS.radius.medium);
      ctx.fillStyle = `rgba(0, 0, 0, ${0.16 * press.strength})`;
      ctx.fill();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = this.theme.TEXT_SECONDARY;
    ctx.font = '16px sans-serif';
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 6);
    ctx.restore();
  }

  drawStatusTag(rect, label, variant = 'secondary') {
    const { ctx } = this;
    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 12);
    ctx.fillStyle = variant === 'danger' ? this.theme.UI_TOKENS.surface.elevated : this.theme.UI_TOKENS.surface.elevated;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = variant === 'danger'
      ? this.theme.UI_TOKENS.accent.danger
      : this.theme.UI_TOKENS.border.subtle;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = variant === 'danger' ? this.theme.UI_TOKENS.accent.danger : this.theme.TEXT_SECONDARY;
    ctx.font = '13px sans-serif';
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + 17);
  }

  drawNotice(text) {
    const { ctx, layout } = this;
    const width = Math.min(layout.screenWidth - layout.sideMargin * 4, 280);
    const height = 32;
    const x = (layout.screenWidth - width) / 2;
    const belowRack = layout.rackRect.y + layout.rackRect.height + 10;
    const y = belowRack + height <= layout.screenHeight - layout.bottomInset
      ? belowRack : layout.boardPanelRect.y - height - 6;
    ctx.save();
    ctx.globalAlpha *= Math.min(1, (this.state.notice?.remainingTime || 160) / 160);

    roundedRect(ctx, x, y, width, height, this.theme.UI_TOKENS.radius.small);
    ctx.fillStyle = this.theme.UI_TOKENS.surface.modal;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = this.theme.UI_TOKENS.border.subtle;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = this.theme.TEXT_PRIMARY;
    ctx.font = '14px sans-serif';
    ctx.fillText(text, x + width / 2, y + 21);
    ctx.restore();
  }

  drawClassicBlockCell(x, y, size, color, options = {}) {
    if (size < 4) return;
    const { ctx } = this;
    const inset = clamp(size * 0.035, 1, 2);
    const drawSize = size - inset * 2;
    const depth = clamp(size * 0.075, 1.5, 3.5);
    const radius = clamp(size * 0.12, 2.5, 5);
    const left = x + inset;
    const top = y + inset;
    const pulse = options.pulse || 0;
    ctx.save();
    ctx.globalAlpha *= options.alpha == null ? 1 : options.alpha;
    // A dark foot below a softly bevelled face gives every piece the same material.
    roundedRect(ctx, left, top, drawSize, drawSize, radius);
    ctx.fillStyle = shadeColor(color, 0.42);
    ctx.fill();
    roundedRect(ctx, left, top, drawSize, drawSize - depth, radius);
    const face = this.createLinearGradient(left, top, left + drawSize * 0.3, top + drawSize - depth);
    face.addColorStop(0, tintColor(color, 0.24 + pulse * 0.12));
    face.addColorStop(0.3, tintColor(color, 0.06));
    face.addColorStop(1, shadeColor(color, 0.12));
    ctx.fillStyle = face;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(tintColor(color, 0.58), 0.24);
    roundedRect(ctx, left + 0.5, top + 0.5, drawSize - 1, drawSize - depth - 1, radius);
    ctx.stroke();
    // The inner face is satin; the short top and left edges catch the light.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.beginPath();
    ctx.moveTo(left + radius, top + 2);
    ctx.lineTo(left + drawSize - radius, top + 2);
    ctx.moveTo(left + 2, top + radius);
    ctx.lineTo(left + 2, top + drawSize * 0.5);
    ctx.stroke();
    ctx.strokeStyle = rgba(shadeColor(color, 0.48), 0.52);
    ctx.beginPath();
    ctx.moveTo(left + radius, top + drawSize - 1);
    ctx.lineTo(left + drawSize - radius, top + drawSize - 1);
    ctx.stroke();
    ctx.restore();
  }

  drawBlockCell(x, y, size, color, options = {}) {
    if (this.theme.id === 'classic') return this.drawClassicBlockCell(x, y, size, color, options);
    if (size < 4) return;
    const { ctx } = this;
    const ink = getPieceInk(color, this.theme.id);
    const inset = clamp(size * 0.045, 1, 2.5);
    const edge = size - inset * 2;
    const radius = clamp(size * 0.1, 2, 5);
    const depth = clamp(size * 0.045, 1, 2);
    ctx.save();
    ctx.globalAlpha *= options.alpha == null ? 1 : options.alpha;
    roundedRect(ctx, x + inset, y + inset, edge, edge, radius);
    if (options.hero) {
      ctx.shadowColor = 'rgba(50, 48, 32, 0.13)';
      ctx.shadowBlur = size * 0.1; ctx.shadowOffsetY = size * 0.055;
    }
    ctx.fillStyle = shadeColor(ink, 0.2); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    roundedRect(ctx, x + inset, y + inset, edge, edge - depth, radius);
    if (options.hero) {
      const paper = this.createLinearGradient(x, y, x + size, y + size);
      paper.addColorStop(0, tintColor(ink, 0.13)); paper.addColorStop(1, shadeColor(ink, 0.04));
      ctx.fillStyle = paper;
    } else ctx.fillStyle = options.pulse ? tintColor(ink, options.pulse * 0.2) : ink;
    ctx.fill();
    ctx.strokeStyle = rgba(tintColor(ink, 0.55), 0.55); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + inset + radius, y + inset + 1);
    ctx.lineTo(x + size - inset - radius, y + inset + 1); ctx.stroke();
    ctx.restore();
  }

  getBgmLabel(state) {
    return {
      1: '音乐一 · 高亢',
      2: '音乐二 · 电子',
      3: '音乐三 · 兴奋',
      4: '音乐四 · 活跃'
    }[Number(state.settings.bgmTrack)] || '音乐二 · 电子';
  }

  getPulseAlpha(state, row, col) {
    const pulse = state.placementPulse.find(
      (item) => item.row === row && item.col === col
    );

    if (!pulse) {
      return 0;
    }

    return pulse.remainingTime / 140;
  }

  isClearingCell(state, row, col) {
    if (!state.pendingClear) {
      return false;
    }

    return (
      state.pendingClear.rows.indexOf(row) >= 0 ||
      state.pendingClear.cols.indexOf(col) >= 0
    );
  }

  getRackHitArea(x, y) {
    const touchPadding = 24;
    const slotInset = 4;
    for (let index = 0; index < this.rackHitAreas.length; index += 1) {
      const hitArea = this.rackHitAreas[index];
      const left = Math.max(hitArea.x - touchPadding, hitArea.slotX + slotInset);
      const top = Math.max(hitArea.y - touchPadding, hitArea.slotY + slotInset);
      const right = Math.min(
        hitArea.x + hitArea.width + touchPadding,
        hitArea.slotX + hitArea.slotWidth - slotInset
      );
      const bottom = Math.min(
        hitArea.y + hitArea.height + touchPadding,
        hitArea.slotY + hitArea.slotHeight - slotInset
      );
      if (
        x >= left &&
        x <= right &&
        y >= top &&
        y <= bottom
      ) {
        return hitArea;
      }
    }

    return null;
  }

  getSettingsAction(x, y) {
    return this.findActionByRect(this.settingsActionRects, x, y);
  }

  getPauseAction(x, y) {
    return this.findActionByRect(this.pauseActionRects, x, y);
  }

  getHomeAction(x, y) {
    return this.findActionByRect(this.homeActionRects, x, y);
  }

  getHelpAction(x, y) {
    return this.findActionByRect(this.helpActionRects, x, y);
  }

  getToolAction(x, y) {
    return this.findActionByRect(this.toolActionRects, x, y);
  }

  getAdminAction(x, y) {
    return this.findActionByRect(this.adminActionRects, x, y);
  }

  getMembershipAction(x, y) {
    return this.findActionByRect(this.membershipActionRects, x, y);
  }

  getReviveAction(x, y) {
    return this.findActionByRect(this.reviveActionRects, x, y);
  }

  getBoardCellAt(x, y) {
    const { boardRect, cellSize } = this.layout;
    if (
      x < boardRect.x ||
      y < boardRect.y ||
      x > boardRect.x + boardRect.width ||
      y > boardRect.y + boardRect.height
    ) {
      return null;
    }

    return {
      row: clamp(Math.floor((y - boardRect.y) / cellSize), 0, BOARD_SIZE - 1),
      col: clamp(Math.floor((x - boardRect.x) / cellSize), 0, BOARD_SIZE - 1)
    };
  }

  findActionByRect(rects, x, y) {
    const keys = Object.keys(rects);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const rect = rects[key];
      if (this.isPointInRect({ x, y }, rect)) {
        return key;
      }
    }

    return null;
  }

  isPointInRect(point, rect) {
    if (!rect) {
      return false;
    }

    return (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    );
  }
}
