import {
  BACKGROUND_BOTTOM,
  BACKGROUND_MID,
  BACKGROUND_TOP,
  BOARD_CELL,
  BOARD_CELL_ALT,
  BOARD_PADDING,
  BOARD_PANEL,
  BOARD_SIZE,
  QUALITY_PROFILE,
  BUTTON_FILL,
  HEADER_GAP,
  MAX_SIDE_MARGIN,
  MIN_SIDE_MARGIN,
  OVERLAY,
  PREVIEW_INVALID,
  PREVIEW_VALID,
  SLOT_PADDING,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  UI_TOKENS
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
  calculateHelpRowsLayout,
  calculateHudLayout,
  calculateModalRowsLayout,
  calculateModalShellLayout,
  calculateSettingsTabsLayout,
  calculateWechatHomeLayout,
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

function createStarPoints(screenWidth, screenHeight) {
  const ratios = [
    { x: 0.08, y: 0.11, size: 2.4, alpha: 0.18 },
    { x: 0.86, y: 0.16, size: 1.8, alpha: 0.14 },
    { x: 0.16, y: 0.28, size: 1.6, alpha: 0.12 },
    { x: 0.78, y: 0.38, size: 2, alpha: 0.12 },
    { x: 0.12, y: 0.72, size: 2.4, alpha: 0.12 },
    { x: 0.84, y: 0.8, size: 1.8, alpha: 0.1 }
  ];

  return ratios.map((point) => ({
    x: screenWidth * point.x,
    y: screenHeight * point.y,
    size: point.size,
    alpha: point.alpha
  }));
}

function drawStarGlyph(ctx, cx, cy, radius) {
  ctx.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const angle = -Math.PI / 2 + (point * Math.PI) / 5;
    const distance = point % 2 === 0 ? radius : radius * 0.45;
    const x = cx + Math.cos(angle) * distance;
    const y = cy + Math.sin(angle) * distance;
    if (point === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
}

const MODAL_PANEL_TOP = 'rgba(19, 46, 86, 0.97)';
const MODAL_PANEL_BOTTOM = 'rgba(11, 26, 52, 0.97)';
const MODAL_BORDER = 'rgba(132, 218, 255, 0.34)';

export default class Renderer {
  constructor(ctx, screenInfo, safeAreaInfo) {
    this.ctx = ctx;
    this.screenInfo = screenInfo;
    this.safeAreaInfo = safeAreaInfo;
    this.quality = getQualityProfile(QUALITY_PROFILE);
    this.perfStats = createRenderPerfStats({
      enabled: globalThis.__RELAX_BLOCK_DEBUG__ === true,
      logger: (report) => console.log('[RelaxBlock][render-perf]', report)
    });
    this.layout = this.getLayout(screenInfo, safeAreaInfo);
    this.layoutKey = JSON.stringify({ screenInfo, safeAreaInfo });
    this.stars = createStarPoints(screenInfo.screenWidth, screenInfo.screenHeight);
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
  }

  setViewport(screenInfo, safeAreaInfo) {
    this.screenInfo = screenInfo;
    this.safeAreaInfo = safeAreaInfo;
    this.layout = this.getLayout(screenInfo, safeAreaInfo);
    this.layoutKey = JSON.stringify({ screenInfo, safeAreaInfo });
    this.stars = createStarPoints(screenInfo.screenWidth, screenInfo.screenHeight);
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
    this.reviveActionRects = {};
    this.restartButtonRect = null;
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
    const boardAvailableHeight =
      screenHeight -
      topInset -
      headerHeight -
      toolHeight -
      rackHeight -
      bottomInset -
      HEADER_GAP -
      toolGap -
      rackGap -
      8;
    const cellSize = Math.floor(
      Math.min(
        (boardOuterWidth - BOARD_PADDING * 2) / BOARD_SIZE,
        (boardAvailableHeight - BOARD_PADDING * 2) / BOARD_SIZE
      )
    );
    const boardSizePx = cellSize * BOARD_SIZE + BOARD_PADDING * 2;
    const boardPanelRect = {
      x: Math.round((screenWidth - boardSizePx) / 2),
      y: topInset + headerHeight + HEADER_GAP,
      width: boardSizePx,
      height: boardSizePx
    };
    const boardRect = {
      x: boardPanelRect.x + BOARD_PADDING,
      y: boardPanelRect.y + BOARD_PADDING,
      width: cellSize * BOARD_SIZE,
      height: cellSize * BOARD_SIZE
    };
    const headerRect = {
      x: contentX,
      y: topInset,
      width: contentWidth,
      height: headerHeight
    };
    const toolRect = {
      x: contentX,
      y: boardPanelRect.y + boardPanelRect.height + toolGap,
      width: contentWidth,
      height: toolHeight
    };
    const rackRect = {
      x: contentX,
      y: toolRect.y + toolRect.height + rackGap,
      width: contentWidth,
      height: rackHeight
    };
    const rackSlots = Array.from({ length: 3 }, (_, index) => ({
      x: rackRect.x + (rackRect.width / 3) * index,
      y: rackRect.y,
      width: rackRect.width / 3,
      height: rackRect.height
    }));
    const settingsButtonRect = {
      x: headerRect.x,
      y: headerRect.y + 8,
      width: 64,
      height: 28
    };
    const pauseButtonRect = {
      x: settingsButtonRect.x + settingsButtonRect.width + 8,
      y: settingsButtonRect.y,
      width: 64,
      height: 28
    };
    const homeLayout = calculateWechatHomeLayout({
      viewportWidth: screenWidth,
      viewportHeight: screenHeight,
      safeInsets: { top: topInset, bottom: bottomInset },
      adminVisible: false
    });

    return {
      screenWidth,
      screenHeight,
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
      homePanelRect: homeLayout.panel,
      homeLayout
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
    const damage = this.getFrameDamage(state);
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
    this.drawBackground(state.screen !== 'playing');

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

  drawModalPanel(panel, radius = UI_TOKENS.radius.large) {
    const { ctx } = this;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;
    roundedRect(ctx, panel.x, panel.y, panel.width, panel.height, radius);
    const gradient = this.createLinearGradient(panel.x, panel.y, panel.x, panel.y + panel.height);
    gradient.addColorStop(0, MODAL_PANEL_TOP);
    gradient.addColorStop(1, MODAL_PANEL_BOTTOM);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = 1;
    ctx.strokeStyle = MODAL_BORDER;
    roundedRect(ctx, panel.x, panel.y, panel.width, panel.height, radius);
    ctx.stroke();
  }

  drawModalTitle(text, shell) {
    const { ctx } = this;
    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_PRIMARY;
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
    const { layout } = this;
    this.drawCachedSurface('background', `${layout.screenWidth}:${layout.screenHeight}:${isHomeScene}`, {
      x: 0, y: 0, width: layout.screenWidth, height: layout.screenHeight
    }, () => {
      const { ctx } = this;
      const gradient = this.createLinearGradient(0, 0, layout.screenWidth * 0.4, layout.screenHeight);
      gradient.addColorStop(0, BACKGROUND_TOP);
      gradient.addColorStop(0.4, BACKGROUND_MID);
      gradient.addColorStop(1, BACKGROUND_BOTTOM);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);
      const light = this.createRadialGradient(layout.screenWidth * 0.35, layout.screenHeight * 0.15, 0,
        layout.screenWidth * 0.35, layout.screenHeight * 0.15, Math.max(layout.screenWidth, layout.screenHeight) * 0.7);
      light.addColorStop(0, 'rgba(142, 221, 255, 0.12)');
      light.addColorStop(1, 'rgba(142, 221, 255, 0)');
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);
      // A few quiet points of light remain fixed throughout a gesture.
      this.stars.forEach((star) => {
        ctx.fillStyle = `rgba(203, 234, 255, ${star.alpha * 0.55})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size * 0.7, 0, Math.PI * 2);
        ctx.fill();
      });
    }, 1);
  }

  drawHome(state) {
    const { ctx, layout } = this;
    const difficultyLabel = getDifficultyLabel(state.settings.difficulty);
    const difficultyBestScore = state.bestScores[state.settings.difficulty] || 0;
    const homeLayout = calculateWechatHomeLayout({
      viewportWidth: layout.screenWidth,
      viewportHeight: layout.screenHeight,
      safeInsets: { top: layout.headerRect.y, bottom: layout.bottomInset },
      adminVisible: state.isAdminModeActive()
    });
    const panel = homeLayout.panel;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 10;
    roundedRect(ctx, panel.x, panel.y, panel.width, panel.height, 26);
    const panelGrad = this.createLinearGradient(panel.x, panel.y, panel.x, panel.y + panel.height);
    panelGrad.addColorStop(0, 'rgba(16, 42, 78, 0.72)');
    panelGrad.addColorStop(1, 'rgba(8, 22, 48, 0.82)');
    ctx.fillStyle = panelGrad;
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = 1;
    ctx.strokeStyle = UI_TOKENS.border.subtle;
    roundedRect(ctx, panel.x, panel.y, panel.width, panel.height, 26);
    ctx.stroke();

    this.homeTitleRect = homeLayout.title;

    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_PRIMARY;
    const titleFit = fitTextSize({ text: '轻松俄罗斯方块', preferredSize: homeLayout.titleFontSize,
      minimumSize: 24, maxWidth: homeLayout.title.width, fontWeight: 'bold', measureText: this.measureCanvasText.bind(this) });
    ctx.font = `bold ${titleFit.fontSize}px sans-serif`;
    ctx.fillText('轻松俄罗斯方块', layout.screenWidth / 2, homeLayout.title.y + homeLayout.title.height - 16);

    const decoLineY = homeLayout.title.y + homeLayout.title.height - 6;
    const decoLineWidth = homeLayout.title.width * 0.32;
    const decoLineX = layout.screenWidth / 2 - decoLineWidth / 2;
    const decoGrad = this.createLinearGradient(decoLineX, 0, decoLineX + decoLineWidth, 0);
    decoGrad.addColorStop(0, 'rgba(120, 214, 255, 0)');
    decoGrad.addColorStop(0.5, 'rgba(120, 214, 255, 0.35)');
    decoGrad.addColorStop(1, 'rgba(120, 214, 255, 0)');
    ctx.strokeStyle = decoGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(decoLineX, decoLineY);
    ctx.lineTo(decoLineX + decoLineWidth, decoLineY);
    ctx.stroke();

    ctx.fillStyle = TEXT_SECONDARY;
    const subtitleFit = fitTextSize({ text: '拖动方块，填满整行或整列即可消除', preferredSize: homeLayout.subtitleFontSize,
      minimumSize: 12, maxWidth: homeLayout.subtitle.width, measureText: this.measureCanvasText.bind(this) });
    ctx.font = `${subtitleFit.fontSize}px sans-serif`;
    ctx.fillText(
      '拖动方块，填满整行或整列即可消除',
      layout.screenWidth / 2,
      homeLayout.subtitle.y + homeLayout.subtitle.height - 5
    );

    if (homeLayout.adminButton) {
      this.drawSecondaryChip(homeLayout.adminButton, '管理员模式');
    }

    this.homeActionRects.difficulty = homeLayout.difficultyButton;
    this.drawSecondaryChip(
      homeLayout.difficultyButton,
      `难度：${difficultyLabel}`,
      'home:difficulty'
    );
    const difficultyIndex = ['easy', 'normal', 'master'].indexOf(state.settings.difficulty);
    for (let index = 0; index < 3; index += 1) {
      ctx.fillStyle = index === difficultyIndex ? '#9EDCFA' : 'rgba(158, 220, 250, 0.25)';
      roundedRect(ctx, layout.screenWidth / 2 - 13 + index * 10,
        homeLayout.difficultyButton.y + homeLayout.difficultyButton.height - 6, 6, 2, 1);
      ctx.fill();
    }

    const scoreCard = homeLayout.highScoreCard;
    roundedRect(ctx, scoreCard.x, scoreCard.y, scoreCard.width, scoreCard.height, UI_TOKENS.radius.medium);
    ctx.fillStyle = 'rgba(10, 25, 48, 0.66)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = UI_TOKENS.border.subtle;
    ctx.stroke();

    const scoreLabel = `${difficultyLabel} · 最高分`;
    const labelWidth = this.measureCanvasText(scoreLabel, 13);
    const labelCenterY = scoreCard.y + scoreCard.height / 2 - 8;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 214, 10, 0.78)';
    drawStarGlyph(ctx, layout.screenWidth / 2 - labelWidth / 2 - 13, labelCenterY - 4, 6);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '13px sans-serif';
    ctx.fillText(scoreLabel, layout.screenWidth / 2, labelCenterY);

    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(String(difficultyBestScore), layout.screenWidth / 2, scoreCard.y + scoreCard.height / 2 + 20);

    const startRect = homeLayout.startButton;
    const helpRect = homeLayout.helpButton;
    const settingsRect = homeLayout.settingsButton;

    this.homeActionRects.start = startRect;
    this.homeActionRects.help = helpRect;
    this.homeActionRects.settings = settingsRect;

    this.drawActionButton(startRect, '开始游戏', 'primary', { pressKey: 'home:start' });
    this.drawActionButton(helpRect, '怎么玩', 'secondary', { pressKey: 'home:help' });
    this.drawActionButton(settingsRect, '设置', 'secondary', { pressKey: 'home:settings' });
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
      platform: 'wechat',
      viewportWidth: layout.screenWidth,
      headerRect: layout.headerRect,
      settingsButtonRect: layout.settingsButtonRect,
      pauseButtonRect: layout.pauseButtonRect,
      menuButton: this.safeAreaInfo.menuButton,
      score: state.score,
      bestScore: state.bestScore,
      measureText: this.measureCanvasText.bind(this)
    });
    const centerX = hudLayout.centerX;

    ctx.save();
    ctx.translate(centerX, hudLayout.scoreBaselineY);
    const scoreScale = this.reducedMotion ? 1 : 1 + scorePulseProgress * 0.06;
    ctx.scale(scoreScale, scoreScale);
    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = `bold ${hudLayout.scoreFontSize}px sans-serif`;
    if (scorePulseProgress > 0) {
      ctx.shadowColor = 'rgba(255, 214, 10, 0.72)';
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
    ctx.fillStyle = clearFeedbackVisible || recordVisible ? '#FFE49A' : TEXT_SECONDARY;
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
        y: layout.headerRect.y + 52,
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
    this.drawCachedSurface('board', `${this.layoutKey}:${key}`, {
      x: panel.x - 12, y: panel.y - 12, width: panel.width + 24, height: panel.height + 24
    }, () => {
      const { ctx } = this;
      ctx.save();
      ctx.shadowColor = 'rgba(2, 9, 19, 0.32)';
      ctx.shadowBlur = 12 * this.quality.shadowBlurScale;
      ctx.shadowOffsetY = 5;
      roundedRect(ctx, panel.x, panel.y, panel.width, panel.height, UI_TOKENS.radius.medium);
      const frame = this.createLinearGradient(panel.x, panel.y, panel.x, panel.y + panel.height);
      frame.addColorStop(0, '#2A4F6E');
      frame.addColorStop(0.025, '#142E48');
      frame.addColorStop(0.98, BOARD_PANEL);
      frame.addColorStop(1, '#31536B');
      ctx.fillStyle = frame;
      ctx.fill();
      ctx.restore();
      roundedRect(ctx, boardRect.x, boardRect.y, boardRect.width, boardRect.height, 9);
      ctx.fillStyle = '#0A1D30';
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
        ctx.fillStyle = parity === 0 ? BOARD_CELL : BOARD_CELL_ALT;
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
        ctx.strokeStyle = edge ? 'rgba(153, 211, 244, 0.07)' : 'rgba(2, 10, 21, 0.28)';
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
      ctx.strokeStyle = '#E1F5FF';
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
      roundedRect(ctx, panel.x, panel.y, panel.width, panel.height, UI_TOKENS.radius.medium);
      ctx.fillStyle = 'rgba(110, 214, 255, 0.06)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(133, 219, 255, 0.7)';
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
        ctx.strokeStyle = `rgba(164, 228, 255, ${visual.strength * 0.8})`;
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
    ctx.strokeStyle = `rgba(255, 239, 177, ${visual.impactAlpha * 0.45})`;
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
        ctx.strokeStyle = `rgba(161, 230, 255, ${visual.laserAlpha * 0.36})`;
        ctx.lineWidth = Math.max(1, cellSize * 0.06);
        ctx.beginPath();
        ctx.moveTo(row ? tail : cross, row ? cross : tail);
        ctx.lineTo(row ? head : cross, row ? cross : head);
        ctx.stroke();
        ctx.fillStyle = `rgba(255, 241, 189, ${visual.laserAlpha * 0.8})`;
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
    const particleLimit = Math.min(this.quality.maxParticles, this.quality.highCostEffects ? 28 : 12);
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
        ctx.strokeStyle = 'rgba(255, 246, 196, 0.92)';
        ctx.lineWidth = Math.max(1, particle.size * 0.45);
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(angle) * length, y - Math.sin(angle) * length);
        ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
        ctx.stroke();
        return;
      }

      ctx.fillStyle = 'rgba(110, 214, 255, 0.82)';
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
      ctx.fillStyle = canPlace ? rgba(piece.color, 0.22) : 'rgba(241, 116, 134, 0.16)';
      ctx.fill();
      ctx.lineWidth = canPlace ? 1.5 : 1;
      ctx.strokeStyle = canPlace ? rgba(tintColor(piece.color, 0.55), 0.82) : PREVIEW_INVALID;
      ctx.stroke();
      // Four short registration edges make the snapped destination unambiguous.
      if (canPlace) {
        const arm = cellSize * 0.18;
        ctx.strokeStyle = PREVIEW_VALID;
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

    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, UI_TOKENS.radius.medium);
    if (active) {
      ctx.save();
      ctx.shadowColor = 'rgba(110, 214, 255, 0.32)';
      ctx.shadowBlur = 10;
    }
    ctx.fillStyle = active ? 'rgba(63, 130, 190, 0.96)' : 'rgba(10, 28, 52, 0.84)';
    ctx.fill();
    if (active) {
      ctx.restore();
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = active ? 'rgba(192, 240, 255, 0.72)' : UI_TOKENS.border.subtle;
    ctx.stroke();

    if (press && press.strength > 0) {
      roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, UI_TOKENS.radius.medium);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.08 * press.strength})`;
      ctx.fill();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = active || !disabled ? TEXT_PRIMARY : TEXT_MUTED;
    ctx.font = rect.height < 40 ? 'bold 14px sans-serif' : 'bold 15px sans-serif';
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 5);
    ctx.restore();
  }

  drawRack(state) {
    const { ctx } = this;

    this.layout.rackSlots.forEach((slot) => {
      roundedRect(ctx, slot.x + 3, slot.y + 4, slot.width - 6, slot.height - 10, UI_TOKENS.radius.medium);
      ctx.fillStyle = 'rgba(9, 24, 47, 0.45)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(130, 205, 255, 0.09)';
      ctx.stroke();
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

    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, UI_TOKENS.radius.small);
    ctx.fillStyle = 'rgba(12, 30, 56, 0.78)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = press && press.strength > 0 ? UI_TOKENS.border.strong : UI_TOKENS.border.subtle;
    ctx.stroke();

    if (press && press.strength > 0) {
      roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, UI_TOKENS.radius.small);
      ctx.fillStyle = `rgba(0, 0, 0, ${0.16 * press.strength})`;
      ctx.fill();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '14px sans-serif';
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + 20);
    ctx.restore();
  }

  drawSettingsButton() {
    this.drawMiniButton(
      this.settingsButtonVisualRect || this.settingsButtonRect,
      '设置',
      'hud:settings'
    );
  }

  drawPauseButton() {
    this.drawMiniButton(
      this.pauseButtonVisualRect || this.pauseButtonRect,
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
      ctx.fillStyle = OVERLAY;
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
        { text: '输入会员码后，每局获得 2 次免死机会。' }
      ];
      const lines = calculateHelpRowsLayout({ contentRect: shell.content, rows: helpRows });

      ctx.textAlign = 'left';
      lines.lineRects.forEach((line) => {
        ctx.fillStyle = line.isSection ? TEXT_PRIMARY : TEXT_SECONDARY;
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
        { type: 'section', label: '账号状态' },
        { key: 'loginStatus', label: '登录状态', value: state.getLoginStatusLabel() },
        { key: 'memberStatus', label: '会员状态', value: state.getMemberStatusLabel() }
      ];

      if (state.settings.localMembershipEnabled) {
        rows.push({ key: 'memberBenefit', label: '会员福利', value: state.getMembershipBenefitLabel() });
      }
      rows.push({ key: 'openMembership', label: '输入会员码', value: '' });
      if (state.settings.localMembershipEnabled) {
        rows.push({ key: 'disableMembership', label: '关闭本地会员', value: '' });
      }
      rows.push({ type: 'section', label: '数据' });
      rows.push({ key: 'reset', label: '重置当前难度最高分', value: '' });

      if (state.isAdminModeActive()) {
        rows.push({ type: 'section', label: '管理员模式' });
        rows.push({ key: 'adminStatus', label: '管理员模式', value: state.getAdminStatusLabel() });
        rows.push({ key: 'disableAdmin', label: '关闭管理员模式', value: '' });
      }
      return rows;
    }

    return [
      { type: 'section', label: '游戏设置' },
      { key: 'sound', label: '音效', value: state.settings.soundEnabled ? '开' : '关' },
      { key: 'bgm', label: '背景音乐', value: state.settings.bgmEnabled ? '开' : '关' },
      { key: 'bgmTrack', label: '背景音乐选择', value: this.getBgmLabel(state) },
      { key: 'vibration', label: '震动反馈', value: state.settings.vibrationEnabled ? '开' : '关' },
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
      preferredContentHeight: confirmOpen ? 130 : null
    });

    this.withPanelMotion(motion, shell.panel, () => {
      this.settingsActionRects = {};
      ctx.fillStyle = OVERLAY;
      ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);
      this.drawModalPanel(shell.panel);
      this.drawModalTitle('设置', shell);

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

        roundedRect(ctx, tabRect.x, tabRect.y, tabRect.width, tabRect.height, UI_TOKENS.radius.small);
        ctx.fillStyle = active ? 'rgba(61, 124, 185, 0.9)' : 'rgba(10, 26, 50, 0.6)';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = active ? 'rgba(192, 240, 255, 0.6)' : UI_TOKENS.border.subtle;
        ctx.stroke();
        if (press && press.strength > 0) {
          roundedRect(ctx, tabRect.x, tabRect.y, tabRect.width, tabRect.height, UI_TOKENS.radius.small);
          ctx.fillStyle = `rgba(255, 255, 255, ${0.08 * press.strength})`;
          ctx.fill();
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = active ? TEXT_PRIMARY : TEXT_SECONDARY;
        ctx.font = `${active ? 'bold ' : ''}15px sans-serif`;
        ctx.fillText(meta.label, tabRect.x + tabRect.width / 2, tabRect.y + tabRect.height / 2 + 5);
      });

      const rows = this.getSettingsRows(state, tab);
      const layoutRows = calculateModalRowsLayout({ contentRect: tabs.contentBelow, rows });
      this.drawSettingGroupSurfaces(layoutRows.rects);
      this.drawSettingsRows(layoutRows.rects);

      const continueRect = shell.footerButton;
      this.settingsActionRects.continue = continueRect;
      this.drawActionButton(continueRect, '继续游戏', 'primary', { pressKey: 'settings:continue' });
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
        UI_TOKENS.radius.small
      );
      ctx.fillStyle = 'rgba(10, 25, 48, 0.5)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(130, 205, 255, 0.1)';
      ctx.stroke();
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
        ctx.strokeStyle = 'rgba(130, 205, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.textAlign = 'left';
      ctx.fillStyle = TEXT_PRIMARY;
      ctx.font = rowRect.label && rowRect.label.length > 10 ? '15px sans-serif' : '16px sans-serif';
      ctx.fillText(rowRect.label, rowRect.x + 16, rowRect.y + rowRect.height / 2 + 6);
      if (rowRect.value) {
        ctx.textAlign = 'right';
        ctx.fillStyle = TEXT_SECONDARY;
        ctx.font = rowRect.value.length > 10 ? '14px sans-serif' : '15px sans-serif';
        ctx.fillText(rowRect.value, rowRect.x + rowRect.width - 16, rowRect.y + rowRect.height / 2 + 5);
      }
    });
  }

  drawResetConfirm(state, shell) {
    const { ctx } = this;
    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_SECONDARY;
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
      preferredContentHeight: confirmOpen ? 116 : 236
    });

    this.withPanelMotion(motion, shell.panel, () => {
      this.pauseActionRects = {};
      ctx.fillStyle = OVERLAY;
      ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);
      this.drawModalPanel(shell.panel);
      this.drawModalTitle('暂停', shell);

      if (confirmOpen) {
        ctx.textAlign = 'center';
        ctx.fillStyle = TEXT_PRIMARY;
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText('确认返回主页？', layout.screenWidth / 2, shell.content.y + 26);
        ctx.fillStyle = TEXT_SECONDARY;
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
      ctx.fillStyle = TEXT_SECONDARY;
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
      preferredContentHeight: 138
    });

    this.withPanelMotion(motion, shell.panel, () => {
      this.adminActionRects = {};
      ctx.fillStyle = OVERLAY;
      ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);
      this.drawModalPanel(shell.panel);
      this.drawModalTitle('管理员验证', shell);

      const inputRect = {
        x: shell.content.x,
        y: shell.content.y + 4,
        width: shell.content.width,
        height: 46
      };
      this.adminActionRects.input = inputRect;

      roundedRect(ctx, inputRect.x, inputRect.y, inputRect.width, inputRect.height, UI_TOKENS.radius.small);
      ctx.fillStyle = UI_TOKENS.surface.input;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = UI_TOKENS.border.strong;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.font = '16px sans-serif';
      if (state.adminInput) {
        ctx.fillStyle = TEXT_PRIMARY;
        ctx.fillText(state.adminInput, inputRect.x + 14, inputRect.y + 29);
      } else {
        ctx.fillStyle = TEXT_MUTED;
        ctx.fillText('请输入管理员码', inputRect.x + 14, inputRect.y + 29);
      }

      if (state.adminError) {
        ctx.fillStyle = '#FFB4A4';
        ctx.font = '14px sans-serif';
        ctx.fillText(state.adminError, inputRect.x + 2, inputRect.y + 66);
      }

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
      this.drawActionButton(confirmRect, '确认', 'primary', { pressKey: 'admin:confirm' });
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
      preferredContentHeight: 138
    });

    this.withPanelMotion(motion, shell.panel, () => {
      this.membershipActionRects = {};
      ctx.fillStyle = OVERLAY;
      ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);
      this.drawModalPanel(shell.panel);
      this.drawModalTitle('输入会员码', shell);

      const inputRect = {
        x: shell.content.x,
        y: shell.content.y + 4,
        width: shell.content.width,
        height: 46
      };
      this.membershipActionRects.input = inputRect;

      roundedRect(ctx, inputRect.x, inputRect.y, inputRect.width, inputRect.height, UI_TOKENS.radius.small);
      ctx.fillStyle = UI_TOKENS.surface.input;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = UI_TOKENS.border.strong;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.font = '16px sans-serif';
      if (state.membershipInput) {
        ctx.fillStyle = TEXT_PRIMARY;
        ctx.fillText(state.membershipInput, inputRect.x + 14, inputRect.y + 29);
      } else {
        ctx.fillStyle = TEXT_MUTED;
        ctx.fillText('请输入会员码', inputRect.x + 14, inputRect.y + 29);
      }

      if (state.membershipError) {
        ctx.fillStyle = '#FFB4A4';
        ctx.font = '14px sans-serif';
        ctx.fillText(state.membershipError, inputRect.x + 2, inputRect.y + 66);
      }

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
      this.membershipActionRects.cancel = cancelRect;
      this.membershipActionRects.confirm = confirmRect;
      this.drawActionButton(cancelRect, '取消', 'secondary', { pressKey: 'membership:cancel' });
      this.drawActionButton(confirmRect, '确认', 'primary', { pressKey: 'membership:confirm' });
    });
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
      preferredContentHeight: 130
    });

    this.withPanelMotion(motion, shell.panel, () => {
      this.reviveActionRects = {};
      ctx.fillStyle = OVERLAY;
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
      ctx.fillStyle = TEXT_SECONDARY;
      ctx.font = '16px sans-serif';
      ctx.fillText(prefix, textStartX, textBaseline);
      ctx.fillStyle = '#FFD60A';
      ctx.font = 'bold 19px sans-serif';
      ctx.fillText(reviveCountLabel, textStartX + prefixWidth, textBaseline);
      ctx.fillStyle = TEXT_SECONDARY;
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
    const difficultyLabel = getDifficultyLabel(state.activeDifficulty);
    const motion = this.getPanelMotion(state, 'gameover');
    const showAdminNote = !state.bestScoreEligible;
    const showRecord = state.bestScoreEligible && state.hasShownNewRecord;
    const shell = calculateModalShellLayout({
      viewportWidth: layout.screenWidth,
      viewportHeight: layout.screenHeight,
      topInset: layout.headerRect.y,
      bottomInset: layout.bottomInset,
      sideInset: layout.sideMargin + 4,
      preferredContentHeight: showAdminNote ? 218 : 188
    });

    this.withPanelMotion(motion, shell.panel, () => {
      ctx.fillStyle = OVERLAY;
      ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);
      this.drawModalPanel(shell.panel);

      const centerX = shell.panel.x + shell.panel.width / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = TEXT_PRIMARY;
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('游戏结束', centerX, shell.panel.y + 44);

      if (showRecord) {
        const badgeWidth = 88;
        const badgeRect = {
          x: centerX - badgeWidth / 2,
          y: shell.panel.y + 58,
          width: badgeWidth,
          height: 22
        };
        roundedRect(ctx, badgeRect.x, badgeRect.y, badgeRect.width, badgeRect.height, 11);
        ctx.fillStyle = 'rgba(92, 70, 18, 0.88)';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 214, 10, 0.72)';
        ctx.stroke();
        ctx.fillStyle = '#FFF1A8';
        ctx.font = '13px sans-serif';
        ctx.fillText('新纪录', centerX, badgeRect.y + 16);
      }

      ctx.fillStyle = TEXT_SECONDARY;
      ctx.font = '13px sans-serif';
      ctx.fillText('本局得分', centerX, shell.panel.y + 106);
      ctx.fillStyle = TEXT_PRIMARY;
      ctx.font = 'bold 34px sans-serif';
      ctx.fillText(String(state.score), centerX, shell.panel.y + 142);

      ctx.fillStyle = TEXT_SECONDARY;
      ctx.font = '15px sans-serif';
      ctx.fillText(`${difficultyLabel}最高分 ${state.bestScore}`, centerX, shell.panel.y + 170);

      const extraText = state.getGameOverExtraText();
      let noteBaseline = shell.panel.y + 192;
      if (extraText) {
        ctx.fillText(extraText, centerX, noteBaseline);
        noteBaseline += 22;
      }

      if (showAdminNote) {
        ctx.fillStyle = 'rgba(241, 178, 164, 0.9)';
        ctx.font = '13px sans-serif';
        ctx.fillText('管理员模式分数不计入正式最高分', centerX, noteBaseline);
      }

      const buttonRect = shell.footerButton;
      this.restartButtonRect = buttonRect;
      this.drawActionButton(buttonRect, '重新开始', 'primary', { pressKey: 'gameover:restart' });
    });
  }

  drawSectionLabel(rect, label) {
    const { ctx } = this;
    ctx.textAlign = 'left';
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(label, rect.x + 6, rect.y + rect.height / 2 + 4);
  }

  drawActionButton(rect, label, variant = 'secondary', options = {}) {
    const { ctx } = this;
    const isPrimary = variant === 'primary' || variant === true;
    const isDanger = variant === 'danger';
    const isDangerOutline = variant === 'dangerOutline';
    const press = this.getPressVisual(options.pressKey);

    ctx.save();
    if (options.disabled) {
      ctx.globalAlpha = 0.55;
    }
    if (press) {
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      ctx.translate(centerX, centerY);
      ctx.scale(press.scale, press.scale);
      ctx.translate(-centerX, -centerY);
    }

    if (isPrimary && !options.disabled) {
      ctx.save();
      ctx.shadowColor = 'rgba(80, 182, 255, 0.28)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 3;
    }
    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, UI_TOKENS.radius.medium);
    if (isPrimary) {
      ctx.fillStyle = BUTTON_FILL;
    } else if (isDanger) {
      ctx.fillStyle = 'rgba(170, 67, 52, 0.92)';
    } else {
      ctx.fillStyle = 'rgba(11, 28, 52, 0.92)';
    }
    ctx.fill();
    if (isPrimary && !options.disabled) {
      ctx.restore();
    }

    ctx.lineWidth = 1.25;
    if (isPrimary) {
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    } else if (isDanger || isDangerOutline) {
      ctx.strokeStyle = 'rgba(237, 133, 113, 0.72)';
    } else {
      ctx.strokeStyle = UI_TOKENS.border.subtle;
    }
    ctx.stroke();

    if (press && press.strength > 0) {
      roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, UI_TOKENS.radius.medium);
      ctx.fillStyle = `rgba(${isPrimary ? '255, 255, 255' : '0, 0, 0'}, ${0.12 * press.strength})`;
      ctx.fill();
    }

    if (isPrimary) {
      const highlightPadding = 16;
      const highlightY = rect.y + 8;
      const highlight = this.createLinearGradient(
        rect.x + highlightPadding,
        highlightY,
        rect.x + rect.width - highlightPadding,
        highlightY
      );
      highlight.addColorStop(0, 'rgba(255,255,255,0)');
      highlight.addColorStop(0.5, 'rgba(255,255,255,0.16)');
      highlight.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = highlight;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rect.x + highlightPadding, highlightY);
      ctx.lineTo(rect.x + rect.width - highlightPadding, highlightY);
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = isDangerOutline ? '#F1B2A4' : '#FFFFFF';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 6);
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

    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, UI_TOKENS.radius.medium);
    ctx.fillStyle = 'rgba(11, 28, 52, 0.78)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = UI_TOKENS.border.subtle;
    ctx.stroke();

    if (press && press.strength > 0) {
      roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, UI_TOKENS.radius.medium);
      ctx.fillStyle = `rgba(0, 0, 0, ${0.16 * press.strength})`;
      ctx.fill();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '16px sans-serif';
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 6);
    ctx.restore();
  }

  drawStatusTag(rect, label, variant = 'secondary') {
    const { ctx } = this;
    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 12);
    ctx.fillStyle = variant === 'danger' ? 'rgba(92, 38, 34, 0.88)' : 'rgba(11, 28, 52, 0.78)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = variant === 'danger'
      ? 'rgba(237, 133, 113, 0.72)'
      : UI_TOKENS.border.subtle;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = variant === 'danger' ? '#F1B2A4' : TEXT_SECONDARY;
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

    roundedRect(ctx, x, y, width, height, UI_TOKENS.radius.small);
    ctx.fillStyle = 'rgba(8, 18, 36, 0.86)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = UI_TOKENS.border.subtle;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = '14px sans-serif';
    ctx.fillText(text, x + width / 2, y + 21);
    ctx.restore();
  }

  drawBlockCell(x, y, size, color, options = {}) {
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
    ctx.strokeStyle = rgba(tintColor(color, 0.58), 0.52);
    roundedRect(ctx, left + 0.5, top + 0.5, drawSize - 1, drawSize - depth - 1, radius);
    ctx.stroke();
    // The inner face is satin; the short top and left edges catch the light.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
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
