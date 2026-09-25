import {
  BACKGROUND_BOTTOM,
  BACKGROUND_MID,
  BACKGROUND_TOP,
  BOARD_CELL,
  BOARD_CELL_ALT,
  BOARD_GRID,
  BOARD_PADDING,
  BOARD_PANEL,
  BOARD_PANEL_BORDER,
  BOARD_PANEL_GLOW,
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
  calculateAndroidHomeLayout,
  calculateHelpRowsLayout,
  calculateHudLayout,
  calculateModalRowsLayout,
  calculateModalShellLayout,
  calculateSettingsTabsLayout,
  measureModalRowsHeight
} from './LayoutMetrics.js';
import { createSafeHitRect } from './SafeHitArea.js';
import { getQualityProfile } from '../config/quality.js';
import { createRenderPerfStats } from './RenderPerfStats.js';

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
    this.resetHitAreas();
  }

  setViewport(screenInfo, safeAreaInfo) {
    this.screenInfo = screenInfo;
    this.safeAreaInfo = safeAreaInfo;
    this.layout = this.getLayout(screenInfo, safeAreaInfo);
    this.layoutKey = JSON.stringify({ screenInfo, safeAreaInfo });
    this.stars = createStarPoints(screenInfo.screenWidth, screenInfo.screenHeight);
    this.bgGradientKey = '';
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
    this.settingsButtonRect = null;
    this.pauseButtonRect = null;
  }

  getLayout(screenInfo, safeAreaInfo) {
    const screenWidth = screenInfo.screenWidth;
    const screenHeight = screenInfo.screenHeight;
    const menuButton = safeAreaInfo.menuButton;
    const safeArea = safeAreaInfo.safeArea;
    const sideMargin = clamp(screenWidth * 0.04, MIN_SIDE_MARGIN, MAX_SIDE_MARGIN);
    const topInset = menuButton ? menuButton.top + menuButton.height + 8 : 44;
    const bottomInset = safeArea ? Math.max(screenHeight - safeArea.bottom, 16) : 18;
    const headerHeight = clamp(screenHeight * 0.11, 88, 114);
    const toolHeight = clamp(screenHeight * 0.055, 36, 42);
    const rackHeight = clamp(screenHeight * 0.145, 104, 128);
    const toolGap = 10;
    const rackGap = 10;
    const boardOuterWidth = screenWidth - sideMargin * 2;
    const headerRect = {
      x: sideMargin,
      y: topInset,
      width: screenWidth - sideMargin * 2,
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
    const cellSize = Math.floor(
      Math.min(
        (boardOuterWidth - BOARD_PADDING * 2) / BOARD_SIZE,
        (boardAvailableHeight - BOARD_PADDING * 2) / BOARD_SIZE
      )
    );
    const boardSizePx = cellSize * BOARD_SIZE + BOARD_PADDING * 2;
    const boardPanelRect = {
      x: Math.round((screenWidth - boardSizePx) / 2),
      y: boardTop,
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
      x: sideMargin,
      y: boardPanelRect.y + boardPanelRect.height + toolGap,
      width: screenWidth - sideMargin * 2,
      height: toolHeight
    };
    const rackRect = {
      x: sideMargin,
      y: toolRect.y + toolRect.height + rackGap,
      width: screenWidth - sideMargin * 2,
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
    this.perfStats.recordFullRender();
    const nextLayoutKey = JSON.stringify({ screenInfo: this.screenInfo, safeAreaInfo: this.safeAreaInfo });
    if (nextLayoutKey !== this.layoutKey) {
      this.layout = this.getLayout(this.screenInfo, this.safeAreaInfo);
      this.layoutKey = nextLayoutKey;
      this.bgGradientKey = '';
    }
    state.setLayout(this.layout);
    this.resetHitAreas();

    this.clearCanvas();
    this.drawBackground(state.screen !== 'playing', state.dragState.isDragging);

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
    this.perfStats.endFrame(globalThis.performance?.now?.() ?? Date.now());
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

    return getUiPressVisual(this.state.feedbackState, pressKey);
  }

  getPanelMotion(state, kind) {
    if (!state || !state.feedbackState) {
      return null;
    }

    return getModalMotion(state.feedbackState, kind);
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

  drawBackground(isHomeScene, isDragging = false) {
    const { ctx, layout } = this;
    const gradient = this.createLinearGradient(0, 0, 0, layout.screenHeight);
    gradient.addColorStop(0, BACKGROUND_TOP);
    gradient.addColorStop(0.34, BACKGROUND_MID);
    gradient.addColorStop(1, BACKGROUND_BOTTOM);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);

    if (isHomeScene) {
      const bgKey = `${layout.screenWidth}x${layout.screenHeight}`;
      if (this.bgGradientKey !== bgKey) {
        const glow = this.createRadialGradient(
          layout.screenWidth / 2,
          layout.screenHeight * 0.3,
          0,
          layout.screenWidth / 2,
          layout.screenHeight * 0.3,
          Math.max(layout.screenWidth, layout.screenHeight) * 0.75
        );
        glow.addColorStop(0, 'rgba(130, 205, 255, 0.1)');
        glow.addColorStop(0.5, 'rgba(130, 205, 255, 0.04)');
        glow.addColorStop(1, 'rgba(130, 205, 255, 0)');
        const vignette = this.createRadialGradient(
          layout.screenWidth / 2,
          layout.screenHeight / 2,
          Math.min(layout.screenWidth, layout.screenHeight) * 0.45,
          layout.screenWidth / 2,
          layout.screenHeight / 2,
          Math.max(layout.screenWidth, layout.screenHeight) * 0.78
        );
        vignette.addColorStop(0, 'rgba(2, 8, 20, 0)');
        vignette.addColorStop(1, 'rgba(2, 8, 20, 0.32)');
        this.bgGlow = glow;
        this.bgVignette = vignette;
        this.bgGradientKey = bgKey;
      }

      ctx.fillStyle = this.bgGlow;
      ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);
      ctx.fillStyle = this.bgVignette;
      ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);
    }

    const stars = isDragging ? [] : this.stars;
    stars.forEach((star) => {
      ctx.save();
      ctx.globalAlpha = isDragging ? star.alpha * 0.45 : star.alpha;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  drawHome(state) {
    const { ctx, layout } = this;
    const difficultyLabel = getDifficultyLabel(state.settings.difficulty);
    const difficultyBestScore = state.bestScores[state.settings.difficulty] || 0;
    const homeLayout = calculateAndroidHomeLayout({
      viewportWidth: layout.screenWidth,
      viewportHeight: layout.screenHeight,
      safeInsets: {
        top: layout.headerRect.y,
        bottom: layout.bottomInset
      },
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
    ctx.font = `bold ${homeLayout.titleFontSize}px sans-serif`;
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
    ctx.font = `${homeLayout.subtitleFontSize}px sans-serif`;
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
    ctx.scale(1 + scorePulseProgress * 0.08, 1 + scorePulseProgress * 0.08);
    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = `bold ${hudLayout.scoreFontSize}px sans-serif`;
    if (scorePulseProgress > 0) {
      ctx.shadowColor = 'rgba(255, 214, 10, 0.72)';
      ctx.shadowBlur = 12 * scorePulseProgress;
    }
    ctx.fillText(String(state.score), 0, 0);
    ctx.restore();

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
    ctx.fillStyle = clearFeedbackVisible ? '#FFD60A' : TEXT_SECONDARY;
    ctx.font = `${hudLayout.bestScoreFontSize}px sans-serif`;
    ctx.fillText(
      clearFeedbackVisible
        ? `${getClearFeedbackLabel(clearScore.clearedLines)}  +${clearScore.totalAdded}`
        : `${difficultyLabel}最高分：${state.bestScore}`,
      centerX,
      clearFeedbackVisible
        ? hudLayout.bestBaselineY - 6 * (1 - clearFeedbackAlpha) - 3 * clearAge * (1 - clearAge) * 4
        : hudLayout.bestBaselineY
    );
    ctx.restore();

    if (highScore.active && !state.isAdminModeActive()) {
      const recordAlpha = clamp(highScore.remaining / 200, 0, 1);
      const recordPulse = Math.sin(
        clamp((highScore.duration - highScore.remaining) / 300, 0, 1) * Math.PI
      );
      const recordRect = {
        x: Math.min(centerX + 58, layout.headerRect.x + layout.headerRect.width - 88),
        y: layout.headerRect.y + 14,
        width: 88,
        height: 24
      };

      ctx.save();
      ctx.globalAlpha = recordAlpha;
      const badgeCenterX = recordRect.x + recordRect.width / 2;
      const badgeCenterY = recordRect.y + recordRect.height / 2;
      ctx.translate(badgeCenterX, badgeCenterY);
      ctx.scale(1 + recordPulse * 0.05, 1 + recordPulse * 0.05);
      ctx.translate(-badgeCenterX, -badgeCenterY);
      roundedRect(ctx, recordRect.x, recordRect.y, recordRect.width, recordRect.height, 12);
      ctx.fillStyle = 'rgba(92, 70, 18, 0.88)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 214, 10, 0.72)';
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFF1A8';
      ctx.font = '13px sans-serif';
      ctx.fillText('刷新最高分', recordRect.x + recordRect.width / 2, recordRect.y + 17);
      ctx.restore();
    }

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
    const { ctx, layout } = this;
    const { boardPanelRect, boardRect, cellSize } = layout;

    ctx.save();
    ctx.shadowColor = BOARD_PANEL_GLOW;
    ctx.shadowBlur = 22 * this.quality.shadowBlurScale;
    ctx.shadowOffsetY = 5;
    roundedRect(ctx, boardPanelRect.x, boardPanelRect.y, boardPanelRect.width, boardPanelRect.height, UI_TOKENS.radius.medium);
    const panelGrad = this.createLinearGradient(
      boardPanelRect.x,
      boardPanelRect.y,
      boardPanelRect.x,
      boardPanelRect.y + boardPanelRect.height
    );
    panelGrad.addColorStop(0, '#102A47');
    panelGrad.addColorStop(1, BOARD_PANEL);
    ctx.fillStyle = panelGrad;
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = 1;
    ctx.strokeStyle = BOARD_PANEL_BORDER;
    roundedRect(ctx, boardPanelRect.x, boardPanelRect.y, boardPanelRect.width, boardPanelRect.height, UI_TOKENS.radius.medium);
    ctx.stroke();

    // Empty cells are batched into two flat fills with a single grid stroke,
    // so the resting board stays visually quiet and cheap to draw.
    for (let parity = 0; parity < 2; parity += 1) {
      ctx.beginPath();
      for (let row = 0; row < BOARD_SIZE; row += 1) {
        for (let col = 0; col < BOARD_SIZE; col += 1) {
          if ((row + col) % 2 !== parity) {
            continue;
          }
          const x = Math.round(boardRect.x + col * cellSize);
          const y = Math.round(boardRect.y + row * cellSize);
          ctx.rect(x, y, cellSize, cellSize);
        }
      }
      ctx.fillStyle = parity === 0 ? BOARD_CELL : BOARD_CELL_ALT;
      ctx.fill();
    }

    ctx.beginPath();
    for (let line = 0; line <= BOARD_SIZE; line += 1) {
      const gridX = Math.round(boardRect.x + line * cellSize) + 0.5;
      const gridY = Math.round(boardRect.y + line * cellSize) + 0.5;
      ctx.moveTo(gridX, boardRect.y);
      ctx.lineTo(gridX, boardRect.y + boardRect.height);
      ctx.moveTo(boardRect.x, gridY);
      ctx.lineTo(boardRect.x + boardRect.width, gridY);
    }
    ctx.strokeStyle = BOARD_GRID;
    ctx.lineWidth = 1;
    ctx.stroke();

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const tile = state.board.grid[row][col];
        if (tile) {
          const x = Math.round(boardRect.x + col * cellSize);
          const y = Math.round(boardRect.y + row * cellSize);
          this.drawBlockCell(x + 0.5, y + 0.5, cellSize - 1, tile.color, {
            pulse: this.getPulseAlpha(state, row, col),
            clearing: this.isClearingCell(state, row, col)
          });
        }
      }
    }

    this.drawLineClearEffects(state);

    if (state.toolState.clearMode) {
      ctx.save();
      roundedRect(ctx, boardPanelRect.x, boardPanelRect.y, boardPanelRect.width, boardPanelRect.height, UI_TOKENS.radius.medium);
      ctx.fillStyle = 'rgba(110, 214, 255, 0.08)';
      ctx.fill();
      ctx.restore();

      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(219, 244, 255, 0.88)';
      ctx.font = '15px sans-serif';
      ctx.fillText('点击棋盘位置，清除附近 3×3 区域', boardPanelRect.x + boardPanelRect.width / 2, boardPanelRect.y - 8);
    }
  }

  drawLineClearEffects(state) {
    const effects = state.feedbackState && state.feedbackState.clearEffects;
    this.perfStats.setActiveEffects(effects ? effects.length : 0);
    if (!effects || effects.length === 0) {
      return;
    }

    const { ctx, layout } = this;
    const { boardRect, cellSize } = layout;
    effects.forEach((effect) => {
      const visual = getLineClearEffectVisual(effect);
      if (!visual) {
        return;
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(boardRect.x, boardRect.y, boardRect.width, boardRect.height);
      ctx.clip();
      const boardCenterX = boardRect.x + boardRect.width / 2;
      const boardCenterY = boardRect.y + boardRect.height / 2;
      ctx.translate(boardCenterX + visual.shakeX, boardCenterY + visual.shakeY);
      ctx.scale(visual.boardScale, visual.boardScale);
      ctx.translate(-boardCenterX, -boardCenterY);

      this.drawLineClearLasers(effect, visual);
      this.drawLineClearImpact(effect, visual);
      effect.cells.forEach((cell) => {
        const centerX = boardRect.x + cell.col * cellSize + cellSize / 2;
        const centerY = boardRect.y + cell.row * cellSize + cellSize / 2;
        const size = (cellSize - 3) * visual.cellScale;
        ctx.save();
        ctx.globalAlpha = Math.max(visual.cellFlashAlpha, visual.fadeAlpha * 0.16);
        ctx.shadowColor = 'rgba(255, 214, 10, 0.42)';
        ctx.shadowBlur = 7 * visual.highlightAlpha;
        roundedRect(ctx, centerX - size / 2, centerY - size / 2, size, size, 4);
        ctx.fillStyle = visual.impactAlpha > 0.05
          ? 'rgba(255, 246, 196, 0.68)'
          : 'rgba(255, 246, 196, 0.42)';
        ctx.fill();
        if (visual.residualAlpha > 0) {
          ctx.globalAlpha = visual.residualAlpha * 0.3;
          ctx.strokeStyle = 'rgba(110, 214, 255, 0.9)';
          ctx.lineWidth = Math.max(1, cellSize * 0.06);
          ctx.stroke();
        }
        ctx.restore();
      });
      this.drawLineClearParticles(effect, visual);

      ctx.restore();
    });
  }

  drawLineClearImpact(effect, visual) {
    if (visual.impactAlpha <= 0 || !effect.cells || effect.cells.length === 0) {
      return;
    }

    const { ctx, layout } = this;
    const { boardRect, cellSize } = layout;
    const lineBoost = Math.min(0.3, Math.max(0, effect.lineCount - 1) * 0.15);
    const impactAlpha = Math.min(1, visual.impactAlpha * (1 + lineBoost));
    const center = effect.cells.reduce((sum, cell) => ({
      row: sum.row + cell.row / effect.cells.length,
      col: sum.col + cell.col / effect.cells.length
    }), { row: 0, col: 0 });
    const x = boardRect.x + (center.col + 0.5) * cellSize;
    const y = boardRect.y + (center.row + 0.5) * cellSize;
    const radius = cellSize * (1.3 + visual.impactProgress * 2.4 + Math.min(4, effect.lineCount) * 0.28);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = impactAlpha * (effect.crossCells.length > 0 ? 0.72 : 0.54);
    const bloom = this.createRadialGradient(x, y, 0, x, y, radius);
    bloom.addColorStop(0, 'rgba(255, 246, 196, 0.92)');
    bloom.addColorStop(0.32, 'rgba(255, 224, 92, 0.44)');
    bloom.addColorStop(1, 'rgba(110, 214, 255, 0)');
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = impactAlpha * 0.72;
    ctx.strokeStyle = 'rgba(255, 246, 196, 0.82)';
    ctx.lineWidth = Math.max(1, cellSize * 0.08);
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.52, 0, Math.PI * 2);
    ctx.stroke();

    if (effect.crossCells.length > 0) {
      const cross = effect.crossCells[0];
      const crossX = boardRect.x + (cross.col + 0.5) * cellSize;
      const crossY = boardRect.y + (cross.row + 0.5) * cellSize;
      ctx.globalAlpha = impactAlpha * 0.9;
      ctx.lineWidth = Math.max(1, cellSize * 0.1);
      ctx.beginPath();
      ctx.moveTo(crossX - cellSize * 1.25, crossY);
      ctx.lineTo(crossX + cellSize * 1.25, crossY);
      ctx.moveTo(crossX, crossY - cellSize * 1.25);
      ctx.lineTo(crossX, crossY + cellSize * 1.25);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawLineClearLasers(effect, visual) {
    if (!effect.lasers || effect.lasers.length === 0 || visual.laserProgress <= 0) {
      return;
    }

    const { ctx, layout } = this;
    const { boardRect, cellSize } = layout;
    const lineBoost = Math.min(0.25, Math.max(0, effect.lineCount - 1) * 0.12);
    const alpha = Math.min(0.95, Math.max(0, visual.laserAlpha * (1 + lineBoost)));
    const beamWidth = Math.max(3, cellSize * 0.16);
    const glowWidth = Math.max(cellSize * 0.85, beamWidth * 3.4);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    effect.lasers.slice(0, this.quality.maxLaserDraws).forEach((laser) => {
      this.perfStats.recordLaser();
      if (laser.kind === 'row') {
        const y = boardRect.y + (laser.index + 0.5) * cellSize;
        const origin = Number.isFinite(laser.origin) ? laser.origin : 0.5;
        const centerX = boardRect.x + boardRect.width * origin;
        const extent = boardRect.width * 0.5 * visual.laserProgress;
        [-1, 1].forEach((side) => {
          if (extent <= 1) {
            return;
          }
          const headX = centerX + side * extent;
          const trailLength = Math.min(extent, boardRect.width * 0.32);
          const trailStart = headX - side * trailLength;
          const trail = this.createLinearGradient(trailStart, y, headX, y);
          trail.addColorStop(0, 'rgba(110, 214, 255, 0)');
          trail.addColorStop(0.72, `rgba(110, 214, 255, ${alpha * 0.2})`);
          trail.addColorStop(1, `rgba(255, 246, 196, ${alpha * 0.46})`);
          ctx.fillStyle = trail;
          ctx.fillRect(
            Math.min(trailStart, headX),
            y - glowWidth / 2,
            Math.abs(headX - trailStart),
            glowWidth
          );
          ctx.fillStyle = `rgba(255, 246, 196, ${alpha})`;
          ctx.fillRect(headX - beamWidth, y - cellSize * 0.55, beamWidth * 2, cellSize * 1.1);
          ctx.strokeStyle = `rgba(255, 246, 196, ${alpha * 0.92})`;
          ctx.lineWidth = Math.max(1.5, cellSize * 0.07);
          ctx.beginPath();
          ctx.moveTo(trailStart, y);
          ctx.lineTo(headX, y);
          ctx.stroke();
        });
        return;
      }

      const x = boardRect.x + (laser.index + 0.5) * cellSize;
      const origin = Number.isFinite(laser.origin) ? laser.origin : 0.5;
      const centerY = boardRect.y + boardRect.height * origin;
      const extent = boardRect.height * 0.5 * visual.laserProgress;
      [-1, 1].forEach((side) => {
        if (extent <= 1) {
          return;
        }
        const headY = centerY + side * extent;
        const trailLength = Math.min(extent, boardRect.height * 0.32);
        const trailStart = headY - side * trailLength;
        const trail = this.createLinearGradient(x, trailStart, x, headY);
        trail.addColorStop(0, 'rgba(110, 214, 255, 0)');
        trail.addColorStop(0.72, `rgba(110, 214, 255, ${alpha * 0.2})`);
        trail.addColorStop(1, `rgba(255, 246, 196, ${alpha * 0.46})`);
        ctx.fillStyle = trail;
        ctx.fillRect(
          x - glowWidth / 2,
          Math.min(trailStart, headY),
          glowWidth,
          Math.abs(headY - trailStart)
        );
        ctx.fillStyle = `rgba(255, 246, 196, ${alpha})`;
        ctx.fillRect(x - cellSize * 0.55, headY - beamWidth, cellSize * 1.1, beamWidth * 2);
        ctx.strokeStyle = `rgba(255, 246, 196, ${alpha * 0.92})`;
        ctx.lineWidth = Math.max(1.5, cellSize * 0.07);
        ctx.beginPath();
        ctx.moveTo(x, trailStart);
        ctx.lineTo(x, headY);
        ctx.stroke();
      });
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
    if (!state.dragState.isDragging || !state.previewState.visible || state.toolState.clearMode) {
      return;
    }

    const piece = state.rackPieces[state.dragState.activePieceIndex];
    const { row, col, canPlace } = state.previewState;
    const { boardRect, cellSize } = this.layout;

    piece.cells.forEach((cell) => {
      const drawX = boardRect.x + (col + cell.x) * cellSize + 0.5;
      const drawY = boardRect.y + (row + cell.y) * cellSize + 0.5;

      this.drawBlockCell(drawX, drawY, cellSize - 1, piece.color, {
        alpha: canPlace ? 0.62 : 0.24,
        glow: canPlace ? 0.14 : 0,
        shadowAlpha: 0,
        borderBoost: canPlace ? 0.1 : 0,
        flatten: true
      });

      const inset = canPlace ? 1 : 3;
      roundedRect(this.ctx, drawX + inset, drawY + inset, cellSize - inset * 2 - 1, cellSize - inset * 2 - 1, 3);
      this.ctx.strokeStyle = canPlace ? PREVIEW_VALID : PREVIEW_INVALID;
      this.ctx.lineWidth = 1.2;
      this.ctx.stroke();
    });
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
      if (!piece || piece.used || !slot || (activeDrag && activeDrag.active && index === activeDrag.pieceIndex)) {
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

      piece.cells.forEach((cell) => {
        this.drawBlockCell(x + cell.x * cellSize, y + cell.y * cellSize, cellSize, piece.color, {
          shadowAlpha: 0.14
        });
      });
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
    const drag = state.feedbackState && state.feedbackState.drag;
    if (!drag || !drag.active || state.toolState.clearMode) {
      return;
    }

    const piece = drag.piece;
    const visual = getDragVisual(drag);
    if (!piece || !visual) {
      return;
    }

    const { ctx } = this;
    const displayCellSize = drag.displayCellSize;
    const pieceWidth = piece.bounds.width * displayCellSize;
    const pieceHeight = piece.bounds.height * displayCellSize;
    const cx = visual.x + pieceWidth / 2;
    const cy = visual.y + pieceHeight / 2;

    ctx.save();
    ctx.globalAlpha = visual.alpha;
    ctx.translate(cx, cy);
    ctx.scale(visual.scale, visual.scale);
    ctx.translate(-cx, -cy);

    piece.cells.forEach((cell) => {
      const invalid = drag.phase === 'invalid';
      this.drawBlockCell(
        visual.x + cell.x * displayCellSize,
        visual.y + cell.y * displayCellSize,
        displayCellSize,
        invalid ? '#FF6B86' : piece.color,
        {
          alpha: invalid ? 0.82 : 1,
          glow: 0,
          borderBoost: invalid ? 0.04 : 0.02,
          shadowAlpha: 0,
          flatten: true
        }
      );
    });
    ctx.restore();
  }

  drawHelpModal(state) {
    const { ctx, layout } = this;
    const motion = this.getPanelMotion(state, 'help');
    const shell = calculateModalShellLayout({
      viewportWidth: layout.screenWidth,
      viewportHeight: layout.screenHeight,
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
        { text: '输入福利码后，每局获得 2 次免死机会。' }
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
      { type: 'section', label: '游戏设置' },
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
      bottomInset: layout.bottomInset,
      sideInset: layout.sideMargin + 3,
      preferredContentHeight: confirmOpen ? 130 : null
    });

    this.withPanelMotion(motion, shell.panel, () => {
      this.settingsActionRects = {};
      ctx.fillStyle = OVERLAY;
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
      bottomInset: layout.bottomInset,
      sideInset: layout.sideMargin + 12,
      preferredContentHeight: 118
    });

    this.withPanelMotion(motion, shell.panel, () => {
      this.adminActionRects = {};
      ctx.fillStyle = OVERLAY;
      ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);
      this.drawModalPanel(shell.panel);
      this.drawModalTitle('管理员模式', shell);

      ctx.textAlign = 'center';
      ctx.fillStyle = TEXT_SECONDARY;
      ctx.font = '15px sans-serif';
      ctx.fillText('此入口仅用于本机测试。', shell.panel.x + shell.panel.width / 2, shell.content.y + 22);
      ctx.fillText('开启后本局分数不会写入正式最高分。', shell.panel.x + shell.panel.width / 2, shell.content.y + 48);

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
      bottomInset: layout.bottomInset,
      sideInset: layout.sideMargin + 12,
      preferredContentHeight: 226
    });

    this.withPanelMotion(motion, shell.panel, () => {
      this.membershipActionRects = {};
      ctx.fillStyle = OVERLAY;
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
        ctx.fillText('请输入福利码', inputRect.x + 14, inputRect.y + 29);
      }

      if (state.membershipError) {
        ctx.fillStyle = '#FFB4A4';
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
        ctx.fillStyle = isDel ? 'rgba(120, 52, 48, 0.55)' : 'rgba(24, 50, 92, 0.72)';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = isDel
          ? 'rgba(255, 140, 130, 0.4)'
          : press && press.strength > 0 ? 'rgba(140, 215, 255, 0.6)' : 'rgba(120, 200, 255, 0.2)';
        ctx.stroke();

        if (press && press.strength > 0) {
          roundedRect(ctx, x, y, keyW, keyH, 8);
          ctx.fillStyle = `rgba(255, 255, 255, ${0.1 * press.strength})`;
          ctx.fill();
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isDel ? '#FFB0B0' : TEXT_PRIMARY;
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
      bottomInset: layout.bottomInset,
      sideInset: layout.sideMargin + 9,
      preferredContentHeight: 152
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
      const hlPadX = 16;
      const hlY = rect.y + 8;
      const hlGrad = this.createLinearGradient(rect.x + hlPadX, hlY, rect.x + rect.width - hlPadX, hlY);
      hlGrad.addColorStop(0, 'rgba(255,255,255,0)');
      hlGrad.addColorStop(0.5, 'rgba(255,255,255,0.16)');
      hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = hlGrad;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rect.x + hlPadX, hlY);
      ctx.lineTo(rect.x + rect.width - hlPadX, hlY);
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
    const y = layout.toolRect.y - 38;

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
  }

  drawBlockCell(x, y, size, color, options = {}) {
    const { ctx } = this;
    const inset = clamp(size * 0.02, 1, 2);
    const drawSize = size - inset * 2;
    const drawX = x + inset;
    const drawY = y + inset;
    const radius = clamp(size * 0.1, 2, 5);
    const alpha = options.alpha == null ? 1 : options.alpha;
    const pulse = options.pulse || 0;
    const glow = options.glow || 0;
    const borderBoost = options.borderBoost || 0;
    const shadowAlpha = options.shadowAlpha == null ? 0 : options.shadowAlpha;
    const flatten = !!options.flatten;
    const clearing = !!options.clearing;
    const pulseSquash = pulse > 0 ? 1 - 0.05 * Math.sin(pulse * Math.PI) : 1;

    const topColor = tintColor(color, flatten ? 0.14 : 0.16 + pulse * 0.1);
    const midColor = clearing ? tintColor(color, 0.1) : color;
    const bottomColor = shadeColor(color, flatten ? 0.14 : 0.24);

    ctx.save();
    ctx.globalAlpha = alpha;
    if (shadowAlpha > 0 || glow > 0) {
      ctx.shadowColor = rgba(tintColor(color, 0.2), glow > 0 ? 0.16 : shadowAlpha);
      ctx.shadowBlur = glow > 0 ? 4 : 3;
      ctx.shadowOffsetY = glow > 0 ? 1 : 2;
    }
    roundedRect(
      ctx,
      drawX + (drawSize * (1 - pulseSquash)) / 2,
      drawY + (drawSize * (1 - pulseSquash)) / 2,
      drawSize * pulseSquash,
      drawSize * pulseSquash,
      radius
    );
    const gradient = this.createLinearGradient(drawX, drawY, drawX, drawY + drawSize);
    gradient.addColorStop(0, topColor);
    gradient.addColorStop(0.45, midColor);
    gradient.addColorStop(1, bottomColor);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(tintColor(color, 0.4 + borderBoost), 0.6);
    roundedRect(
      ctx,
      drawX + (drawSize * (1 - pulseSquash)) / 2 + 0.5,
      drawY + (drawSize * (1 - pulseSquash)) / 2 + 0.5,
      drawSize * pulseSquash - 1,
      drawSize * pulseSquash - 1,
      radius
    );
    ctx.stroke();

    // Thin specular edge instead of a plastic shine bar.
    ctx.strokeStyle = rgba('#FFFFFF', flatten ? 0.16 : 0.26 + pulse * 0.08);
    ctx.beginPath();
    ctx.moveTo(drawX + radius - 1, drawY + 1.5);
    ctx.lineTo(drawX + drawSize - radius + 1, drawY + 1.5);
    ctx.stroke();

    ctx.strokeStyle = rgba(shadeColor(color, 0.45), 0.42);
    ctx.beginPath();
    ctx.moveTo(drawX + radius - 1, drawY + drawSize - 1.5);
    ctx.lineTo(drawX + drawSize - radius + 1, drawY + drawSize - 1.5);
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
