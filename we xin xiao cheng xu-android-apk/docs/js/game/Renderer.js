import {
  BACKGROUND_BOTTOM,
  BACKGROUND_MID,
  BACKGROUND_TOP,
  BOARD_CELL,
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
  PANEL,
  PANEL_BORDER,
  PREVIEW_INVALID,
  PREVIEW_VALID,
  SLOT_PADDING,
  TEXT_PRIMARY,
  TEXT_SECONDARY
} from './constants.js';
import { getDifficultyLabel } from './GameState.js';
import { getClearFeedbackLabel, getDragVisual, getLineClearEffectVisual } from './FeedbackState.js';
import { calculateAndroidHomeLayout, calculateHudLayout } from './LayoutMetrics.js';
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
    this.perfStats.beginFrame(globalThis.performance?.now?.() ?? Date.now());
    this.perfStats.recordFullRender();
    const nextLayoutKey = JSON.stringify({ screenInfo: this.screenInfo, safeAreaInfo: this.safeAreaInfo });
    if (nextLayoutKey !== this.layoutKey) {
      this.layout = this.getLayout(this.screenInfo, this.safeAreaInfo);
      this.layoutKey = nextLayoutKey;
    }
    state.setLayout(this.layout);
    this.resetHitAreas();

    this.clearCanvas();
    this.drawBackground(state.dragState.isDragging);

    if (state.screen === 'home' || state.screen === 'help') {
      this.drawHome(state);
    } else {
      this.drawPlayingScene(state);
    }

    if (state.notice && state.screen === 'playing') {
      this.drawNotice(state.notice.text);
    }

    if (state.screen === 'help') {
      this.drawHelpModal();
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

  drawBackground(isDragging = false) {
    const { ctx, layout } = this;
    const gradient = this.createLinearGradient(0, 0, 0, layout.screenHeight);
    gradient.addColorStop(0, BACKGROUND_TOP);
    gradient.addColorStop(0.34, BACKGROUND_MID);
    gradient.addColorStop(1, BACKGROUND_BOTTOM);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);

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

    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(120, 214, 255, 0.2)';
    roundedRect(ctx, panel.x, panel.y, panel.width, panel.height, 26);
    ctx.stroke();

    this.homeTitleRect = homeLayout.title;

    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = `bold ${homeLayout.titleFontSize}px sans-serif`;
    ctx.fillText('轻松俄罗斯方块', layout.screenWidth / 2, homeLayout.title.y + homeLayout.title.height - 16);

    const decoLineY = homeLayout.title.y + homeLayout.title.height - 6;
    const decoLineWidth = homeLayout.title.width * 0.4;
    const decoLineX = layout.screenWidth / 2 - decoLineWidth / 2;
    const decoGrad = this.createLinearGradient(decoLineX, 0, decoLineX + decoLineWidth, 0);
    decoGrad.addColorStop(0, 'rgba(120, 214, 255, 0)');
    decoGrad.addColorStop(0.5, 'rgba(120, 214, 255, 0.5)');
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
    this.drawSecondaryChip(homeLayout.difficultyButton, `难度：${difficultyLabel}`);

    const scoreCard = homeLayout.highScoreCard;
    roundedRect(ctx, scoreCard.x, scoreCard.y, scoreCard.width, scoreCard.height, 14);
    ctx.fillStyle = 'rgba(11, 28, 52, 0.65)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(120, 202, 255, 0.18)';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '16px sans-serif';
    ctx.fillText(`★ ${difficultyLabel}最高分`, layout.screenWidth / 2, scoreCard.y + scoreCard.height / 2 - 4);
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(String(difficultyBestScore), layout.screenWidth / 2, scoreCard.y + scoreCard.height / 2 + 18);

    const startRect = homeLayout.startButton;
    const helpRect = homeLayout.helpButton;
    const settingsRect = homeLayout.settingsButton;

    this.homeActionRects.start = startRect;
    this.homeActionRects.help = helpRect;
    this.homeActionRects.settings = settingsRect;
    this.drawActionButton(startRect, '开始游戏', 'primary');
    this.drawActionButton(helpRect, '怎么玩', 'secondary');
    this.drawActionButton(settingsRect, '设置', 'secondary');
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
    ctx.save();
    ctx.globalAlpha = clearFeedbackVisible ? clamp(clearScore.remaining / 200, 0, 1) : 1;
    ctx.fillStyle = clearFeedbackVisible ? '#FFD60A' : TEXT_SECONDARY;
    ctx.font = `${hudLayout.bestScoreFontSize}px sans-serif`;
    ctx.fillText(
      clearFeedbackVisible
        ? `${getClearFeedbackLabel(clearScore.clearedLines)}  +${clearScore.totalAdded}`
        : `${difficultyLabel}最高分：${state.bestScore}`,
      centerX,
      hudLayout.bestBaselineY
    );
    ctx.restore();

    if (highScore.active && !state.isAdminModeActive()) {
      const recordRect = {
        x: Math.min(centerX + 58, layout.headerRect.x + layout.headerRect.width - 88),
        y: layout.headerRect.y + 14,
        width: 88,
        height: 24
      };
      ctx.save();
      ctx.globalAlpha = clamp(highScore.remaining / 200, 0, 1);
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
    ctx.shadowBlur = 8;
    roundedRect(ctx, boardPanelRect.x, boardPanelRect.y, boardPanelRect.width, boardPanelRect.height, 14);
    ctx.fillStyle = BOARD_PANEL;
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = 1;
    ctx.strokeStyle = BOARD_PANEL_BORDER;
    roundedRect(ctx, boardPanelRect.x, boardPanelRect.y, boardPanelRect.width, boardPanelRect.height, 14);
    ctx.stroke();

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const x = Math.round(boardRect.x + col * cellSize);
        const y = Math.round(boardRect.y + row * cellSize);
        roundedRect(ctx, x + 0.5, y + 0.5, cellSize - 1, cellSize - 1, 2.5);
        ctx.fillStyle = BOARD_CELL;
        ctx.fill();
        ctx.strokeStyle = BOARD_GRID;
        ctx.lineWidth = 1;
        ctx.stroke();

        const tile = state.board.grid[row][col];
        if (tile) {
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
      roundedRect(ctx, boardPanelRect.x, boardPanelRect.y, boardPanelRect.width, boardPanelRect.height, 14);
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
      effect.cells.forEach((cell) => {
        const centerX = boardRect.x + cell.col * cellSize + cellSize / 2;
        const centerY = boardRect.y + cell.row * cellSize + cellSize / 2;
        const size = (cellSize - 3) * visual.cellScale;
        ctx.save();
        ctx.globalAlpha = Math.max(visual.highlightAlpha, visual.fadeAlpha * 0.2);
        ctx.shadowColor = 'rgba(255, 214, 10, 0.45)';
        ctx.shadowBlur = 10 * visual.highlightAlpha;
        roundedRect(ctx, centerX - size / 2, centerY - size / 2, size, size, 4);
        ctx.fillStyle = 'rgba(255, 246, 196, 0.34)';
        ctx.fill();
        ctx.restore();
      });

      this.drawLineClearParticles(effect, visual);
      ctx.restore();
    });
  }

  drawLineClearLasers(effect, visual) {
    if (!effect.lasers || effect.lasers.length === 0 || visual.laserProgress <= 0) {
      return;
    }

    const { ctx, layout } = this;
    const { boardRect, cellSize } = layout;
    const centerX = boardRect.x + boardRect.width / 2;
    const centerY = boardRect.y + boardRect.height / 2;
    const alpha = Math.min(0.95, Math.max(0, visual.laserAlpha));
    const spanX = boardRect.width * visual.laserProgress / 2;
    const spanY = boardRect.height * visual.laserProgress / 2;
    const beamWidth = Math.max(8, cellSize * 0.48);
    const glowWidth = Math.max(cellSize * 1.15, beamWidth * 2.4);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    effect.lasers.slice(0, this.quality.maxLaserDraws).forEach((laser) => {
      this.perfStats.recordLaser();
      if (laser.kind === 'row') {
        const y = boardRect.y + (laser.index + 0.5) * cellSize;
        const left = centerX - spanX;
        const width = spanX * 2;
        const trail = this.createLinearGradient(left, y, left + width, y);
        trail.addColorStop(0, 'rgba(110, 214, 255, 0)');
        trail.addColorStop(0.5, `rgba(110, 214, 255, ${alpha * 0.18})`);
        trail.addColorStop(1, 'rgba(110, 214, 255, 0)');
        ctx.fillStyle = trail;
        ctx.fillRect(left, y - glowWidth / 2, width, glowWidth);

        [-1, 1].forEach((side) => {
          const edgeX = centerX + side * spanX;
          const beam = this.createLinearGradient(edgeX - beamWidth, y, edgeX + beamWidth, y);
          beam.addColorStop(0, 'rgba(255, 246, 196, 0)');
          beam.addColorStop(0.5, `rgba(255, 246, 196, ${alpha})`);
          beam.addColorStop(1, 'rgba(110, 214, 255, 0)');
          ctx.fillStyle = beam;
          ctx.fillRect(edgeX - beamWidth, y - cellSize * 0.55, beamWidth * 2, cellSize * 1.1);
        });

        ctx.strokeStyle = `rgba(255, 246, 196, ${alpha * 0.9})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(left + width, y);
        ctx.stroke();
        return;
      }

      const x = boardRect.x + (laser.index + 0.5) * cellSize;
      const top = centerY - spanY;
      const height = spanY * 2;
      const trail = this.createLinearGradient(x, top, x, top + height);
      trail.addColorStop(0, 'rgba(110, 214, 255, 0)');
      trail.addColorStop(0.5, `rgba(110, 214, 255, ${alpha * 0.18})`);
      trail.addColorStop(1, 'rgba(110, 214, 255, 0)');
      ctx.fillStyle = trail;
      ctx.fillRect(x - glowWidth / 2, top, glowWidth, height);

      [-1, 1].forEach((side) => {
        const edgeY = centerY + side * spanY;
        const beam = this.createLinearGradient(x, edgeY - beamWidth, x, edgeY + beamWidth);
        beam.addColorStop(0, 'rgba(255, 246, 196, 0)');
        beam.addColorStop(0.5, `rgba(255, 246, 196, ${alpha})`);
        beam.addColorStop(1, 'rgba(110, 214, 255, 0)');
        ctx.fillStyle = beam;
        ctx.fillRect(x - cellSize * 0.55, edgeY - beamWidth, cellSize * 1.1, beamWidth * 2);
      });

      ctx.strokeStyle = `rgba(255, 246, 196, ${alpha * 0.9})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + height);
      ctx.stroke();
    });
    ctx.restore();
  }

  drawLineClearParticles(effect, visual) {
    const { ctx, layout } = this;
    const { boardRect, cellSize } = layout;
    const elapsed = effect.duration - effect.remaining;
    ctx.save();
    effect.particles.slice(0, this.quality.maxParticles).forEach((particle) => {
      this.perfStats.recordParticles();
      const lifeProgress = Math.min(1, elapsed / particle.life);
      if (lifeProgress >= 1) {
        return;
      }
      const x = boardRect.x + (particle.col + 0.5 + particle.offsetX * 0.35 + particle.velocityX * lifeProgress) * cellSize;
      const y = boardRect.y + (particle.row + 0.5 + particle.offsetY * 0.35 + particle.velocityY * lifeProgress) * cellSize;
      ctx.globalAlpha = (1 - lifeProgress) * visual.fadeAlpha;
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
        alpha: canPlace ? 0.58 : 0.22,
        glow: canPlace ? 0.14 : 0,
        shadowAlpha: 0,
        borderBoost: canPlace ? 0.1 : 0,
        flatten: true
      });

      roundedRect(this.ctx, drawX + 1, drawY + 1, cellSize - 3, cellSize - 3, 2.5);
      this.ctx.strokeStyle = canPlace ? PREVIEW_VALID : PREVIEW_INVALID;
      this.ctx.lineWidth = 1.1;
      this.ctx.stroke();
    });
  }

  drawToolBar(state) {
    const { ctx, layout } = this;
    const rect = layout.toolRect;
    const gap = 8;
    const width = (rect.width - gap * 2) / 3;
    const items = [
      { key: 'refresh', label: `刷新 ×${state.getToolCountLabel(state.toolState.refreshCount)}`, active: false },
      { key: 'clear', label: `清除 ×${state.getToolCountLabel(state.toolState.clearCount)}`, active: state.toolState.clearMode },
      { key: 'undo', label: `撤回 ×${state.getToolCountLabel(state.toolState.undoCount)}`, active: false }
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

      roundedRect(ctx, buttonRect.x, buttonRect.y, buttonRect.width, buttonRect.height, 14);
      ctx.fillStyle = item.active ? 'rgba(61, 124, 185, 0.96)' : 'rgba(9, 29, 55, 0.82)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = item.active ? 'rgba(192, 240, 255, 0.72)' : 'rgba(125, 200, 255, 0.28)';
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = TEXT_PRIMARY;
      ctx.font = rect.height < 40 ? 'bold 14px sans-serif' : 'bold 15px sans-serif';
      ctx.fillText(item.label, buttonRect.x + buttonRect.width / 2, buttonRect.y + buttonRect.height / 2 + 5);
    });
  }

  drawRack(state) {
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
          shadowAlpha: 0.05
        });
      });
    }
  }

  drawSettingsButton() {
    const rect = this.settingsButtonVisualRect || this.settingsButtonRect;
    const { ctx } = this;

    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 14);
    ctx.fillStyle = 'rgba(10, 24, 44, 0.74)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(135, 216, 255, 0.32)';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '14px sans-serif';
    ctx.fillText('设置', rect.x + rect.width / 2, rect.y + 20);
  }

  drawPauseButton() {
    const rect = this.pauseButtonVisualRect || this.pauseButtonRect;
    const { ctx } = this;

    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 14);
    ctx.fillStyle = 'rgba(10, 24, 44, 0.74)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(135, 216, 255, 0.32)';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '14px sans-serif';
    ctx.fillText('暂停', rect.x + rect.width / 2, rect.y + 20);
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
      this.drawBlockCell(
        visual.x + cell.x * displayCellSize,
        visual.y + cell.y * displayCellSize,
        displayCellSize,
        piece.color,
        {
          glow: 0,
          borderBoost: 0.02,
          shadowAlpha: 0,
          flatten: true
        }
      );
    });

    ctx.restore();
  }

  drawHelpModal() {
    const { ctx, layout } = this;
    ctx.fillStyle = OVERLAY;
    ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);

    const panelWidth = layout.screenWidth - layout.sideMargin * 2;
    const panelHeight = clamp(layout.screenHeight * 0.64, 436, 520);
    const panelX = (layout.screenWidth - panelWidth) / 2;
    const panelY = (layout.screenHeight - panelHeight) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 10;
    roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 24);
    ctx.fillStyle = PANEL;
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = PANEL_BORDER;
    roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 24);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('怎么玩', layout.screenWidth / 2, panelY + 40);

    const lines = [
      '基础玩法',
      '拖动方块放入棋盘。',
      '填满整行或整列即可消除。',
      '无处可放时游戏结束。',
      '',
      '道具说明',
      '刷新：更换当前候选方块。',
      '清除：清掉局部区域。',
      '撤回：回到上一步。',
      '',
      '难度说明',
      '简单：小块更多，适合轻松游玩。',
      '普通：形状更丰富，默认推荐。',
      '大师：复杂方块更多，挑战更高。',
      '',
      '输入会员码后，每局获得 2 次免死机会。'
    ];

    ctx.textAlign = 'left';
    lines.forEach((line, index) => {
      if (!line) {
        return;
      }

      const isSection = line === '基础玩法' || line === '道具说明' || line === '难度说明';
      ctx.fillStyle = isSection ? TEXT_PRIMARY : TEXT_SECONDARY;
      ctx.font = isSection ? 'bold 17px sans-serif' : '16px sans-serif';
      ctx.fillText(line, panelX + 28, panelY + 84 + index * 24);
    });

    const closeRect = {
      x: panelX + 28,
      y: panelY + panelHeight - 62,
      width: panelWidth - 56,
      height: 46
    };
    this.helpActionRects.close = closeRect;
    this.drawActionButton(closeRect, '关闭', 'primary');
  }

  drawSettingsPanel(state) {
    const { ctx, layout } = this;
    ctx.fillStyle = OVERLAY;
    ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);

    const smallScreen = layout.screenHeight < 760;
    const rowHeight = smallScreen ? 38 : 42;
    const rowGap = smallScreen ? 8 : 10;
    const panelWidth = layout.screenWidth - layout.sideMargin * 2 - 6;
    const topGap = smallScreen ? 18 : 22;
    const panelMaxHeight = layout.screenHeight - topGap * 2 - layout.bottomInset;

    this.settingsActionRects = {};

    if (state.ui.isResetConfirmOpen) {
      const panelHeight = Math.min(panelMaxHeight, smallScreen ? 250 : 274);
      const panelX = (layout.screenWidth - panelWidth) / 2;
      const panelY = Math.max(topGap, (layout.screenHeight - panelHeight - layout.bottomInset) / 2);

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.26)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 8;
      roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 22);
      ctx.fillStyle = PANEL;
      ctx.fill();
      ctx.restore();

      ctx.lineWidth = 1.5;
      ctx.strokeStyle = PANEL_BORDER;
      roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 22);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = TEXT_PRIMARY;
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('游戏设置', layout.screenWidth / 2, panelY + 38);

      ctx.fillStyle = TEXT_SECONDARY;
      ctx.font = '18px sans-serif';
      ctx.fillText('确认重置当前难度最高分？', layout.screenWidth / 2, panelY + 84);

      const cancelRect = {
        x: panelX + 24,
        y: panelY + 128,
        width: (panelWidth - 64) / 2,
        height: smallScreen ? 46 : 50
      };
      const confirmRect = {
        x: cancelRect.x + cancelRect.width + 16,
        y: cancelRect.y,
        width: cancelRect.width,
        height: cancelRect.height
      };
      const continueRect = {
        x: panelX + 24,
        y: panelY + panelHeight - 64,
        width: panelWidth - 48,
        height: smallScreen ? 46 : 48
      };

      this.settingsActionRects.cancelReset = cancelRect;
      this.settingsActionRects.confirmReset = confirmRect;
      this.settingsActionRects.continue = continueRect;

      this.drawActionButton(cancelRect, '取消', 'secondary');
      this.drawActionButton(confirmRect, '确认重置', 'primary');
      this.drawActionButton(continueRect, '继续游戏', 'primary');
      return;
    }

    const rows = [
      { type: 'section', label: '游戏设置' },
      { key: 'sound', label: '音效', value: state.settings.soundEnabled ? '开启' : '关闭' },
      { key: 'bgm', label: '背景音乐', value: state.settings.bgmEnabled ? '开启' : '关闭' },
      { key: 'bgmTrack', label: '背景音乐选择', value: this.getBgmLabel(state) },
      { key: 'vibration', label: '震动反馈', value: state.settings.vibrationEnabled ? '开启' : '关闭' },
      { key: 'difficulty', label: '难度', value: getDifficultyLabel(state.settings.difficulty) },
      { type: 'section', label: '福利状态' },
      { key: 'memberStatus', label: '福利状态', value: state.getMemberStatusLabel() },
      { key: 'openMembership', label: '输入福利码', value: '' },
      { type: 'section', label: '数据' },
      { key: 'reset', label: '重置当前难度最高分', value: '' }
    ];
    if (state.settings.localMembershipEnabled) {
      rows.splice(8, 0, { key: 'memberBenefit', label: '会员福利', value: state.getMembershipBenefitLabel() });
      rows.splice(9, 0, { key: 'disableMembership', label: '关闭福利', value: '' });
    }
    if (state.isAdminModeActive()) {
      rows.push({ type: 'section', label: '管理员模式' });
      rows.push({ key: 'adminStatus', label: '管理员状态', value: state.getAdminStatusLabel() });
      rows.push({ key: 'disableAdmin', label: '关闭管理员模式', value: '' });
    }
    const panelHeight = Math.min(
      panelMaxHeight,
      86 + rows.length * rowHeight + (rows.length - 1) * rowGap + 72
    );
    const panelX = (layout.screenWidth - panelWidth) / 2;
    const panelY = Math.max(topGap, (layout.screenHeight - panelHeight - layout.bottomInset) / 2);
    const startY = panelY + 64;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.26)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 22);
    ctx.fillStyle = PANEL;
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = PANEL_BORDER;
    roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 22);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('游戏设置', layout.screenWidth / 2, panelY + 38);

    rows.forEach((row, index) => {
      const rect = {
        x: panelX + 20,
        y: startY + index * (rowHeight + rowGap),
        width: panelWidth - 40,
        height: rowHeight
      };

      if (row.type === 'section') {
        this.drawSectionLabel(rect, row.label);
        return;
      }

      this.settingsActionRects[row.key] = rect;
      this.drawSettingRow(rect, row.label, row.value);
    });

    const continueRect = {
      x: panelX + 20,
      y: panelY + panelHeight - (smallScreen ? 58 : 62),
      width: panelWidth - 40,
      height: smallScreen ? 44 : 46
    };
    this.settingsActionRects.continue = continueRect;
    this.drawActionButton(continueRect, '继续游戏', 'primary');
  }

  drawPausePanel(state) {
    const { ctx, layout } = this;
    ctx.fillStyle = OVERLAY;
    ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);

    const panelWidth = layout.screenWidth - layout.sideMargin * 2 - 10;
    const panelHeight = state.ui.isPauseConfirmOpen ? 260 : 292;
    const panelX = (layout.screenWidth - panelWidth) / 2;
    const panelY = (layout.screenHeight - panelHeight) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 10;
    roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 22);
    ctx.fillStyle = PANEL;
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = PANEL_BORDER;
    roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 22);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('暂停', layout.screenWidth / 2, panelY + 40);

    this.pauseActionRects = {};

    if (state.ui.isPauseConfirmOpen) {
      ctx.fillStyle = TEXT_PRIMARY;
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('确认返回主页？', layout.screenWidth / 2, panelY + 86);
      ctx.fillStyle = TEXT_SECONDARY;
      ctx.font = '16px sans-serif';
      ctx.fillText('当前这一局将结束。', layout.screenWidth / 2, panelY + 116);

      const cancelRect = {
        x: panelX + 24,
        y: panelY + 146,
        width: (panelWidth - 64) / 2,
        height: 48
      };
      const confirmRect = {
        x: cancelRect.x + cancelRect.width + 16,
        y: cancelRect.y,
        width: cancelRect.width,
        height: cancelRect.height
      };

      this.pauseActionRects.cancelHome = cancelRect;
      this.pauseActionRects.confirmHome = confirmRect;
      this.drawActionButton(cancelRect, '取消', 'secondary');
      this.drawActionButton(confirmRect, '确认返回', 'danger');
      return;
    }

    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '16px sans-serif';
    ctx.fillText('当前游戏已暂停', layout.screenWidth / 2, panelY + 70);

    const continueRect = {
      x: panelX + 28,
      y: panelY + 90,
      width: panelWidth - 56,
      height: 48
    };
    const restartRect = {
      x: continueRect.x,
      y: continueRect.y + 62,
      width: continueRect.width,
      height: 48
    };
    const homeRect = {
      x: continueRect.x,
      y: restartRect.y + 62,
      width: continueRect.width,
      height: 48
    };

    this.pauseActionRects.continue = continueRect;
    this.pauseActionRects.restart = restartRect;
    this.pauseActionRects.home = homeRect;

    this.drawActionButton(continueRect, '继续游戏', 'primary');
    this.drawActionButton(restartRect, '重新开始', 'secondary');
    this.drawActionButton(homeRect, '返回主页', 'dangerOutline');
  }

  drawAdminPanel(state) {
    const { ctx, layout } = this;
    ctx.fillStyle = OVERLAY;
    ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);

    const panelWidth = layout.screenWidth - layout.sideMargin * 2 - 24;
    const panelHeight = 256;
    const panelX = (layout.screenWidth - panelWidth) / 2;
    const panelY = (layout.screenHeight - panelHeight) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 10;
    roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 22);
    ctx.fillStyle = PANEL;
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = PANEL_BORDER;
    roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 22);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('管理员模式', layout.screenWidth / 2, panelY + 42);
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '16px sans-serif';
    ctx.fillText('此入口仅用于本机测试。', layout.screenWidth / 2, panelY + 88);
    ctx.fillText('开启后本局分数不会写入正式最高分。', layout.screenWidth / 2, panelY + 116);
    const cancelRect = {
      x: panelX + 24,
      y: panelY + panelHeight - 72,
      width: (panelWidth - 64) / 2,
      height: 48
    };
    const confirmRect = {
      x: cancelRect.x + cancelRect.width + 16,
      y: cancelRect.y,
      width: cancelRect.width,
      height: cancelRect.height
    };
    this.adminActionRects.cancel = cancelRect;
    this.adminActionRects.confirm = confirmRect;
    this.drawActionButton(cancelRect, '取消', 'secondary');
    this.drawActionButton(confirmRect, '开启', 'primary');
  }

  drawMembershipPanel(state) {
    const { ctx, layout } = this;
    ctx.fillStyle = OVERLAY;
    ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);

    const panelWidth = layout.screenWidth - layout.sideMargin * 2 - 24;
    const panelHeight = 370;
    const panelX = (layout.screenWidth - panelWidth) / 2;
    const panelY = Math.max(20, (layout.screenHeight - panelHeight) / 2);

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 10;
    roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 22);
    ctx.fillStyle = PANEL;
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = PANEL_BORDER;
    roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 22);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('输入福利码', layout.screenWidth / 2, panelY + 42);

    const inputRect = {
      x: panelX + 24,
      y: panelY + 58,
      width: panelWidth - 48,
      height: 46
    };
    this.membershipActionRects.input = inputRect;

    roundedRect(ctx, inputRect.x, inputRect.y, inputRect.width, inputRect.height, 14);
    ctx.fillStyle = 'rgba(11, 28, 52, 0.92)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(120,202,255,0.28)';
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.font = '17px sans-serif';
    if (state.membershipInput) {
      ctx.fillStyle = TEXT_PRIMARY;
      ctx.fillText(state.membershipInput, inputRect.x + 16, inputRect.y + 30);
    } else {
      ctx.fillStyle = 'rgba(185, 210, 255, 0.6)';
      ctx.fillText('请输入福利码', inputRect.x + 16, inputRect.y + 30);
    }

    if (state.membershipError) {
      ctx.fillStyle = '#FFB4A4';
      ctx.textAlign = 'left';
      ctx.font = '15px sans-serif';
      ctx.fillText(state.membershipError, inputRect.x + 2, inputRect.y + 62);
    }

    this.drawMembershipKeyboard(panelX, panelY, panelWidth, panelY + 118);

    const cancelRect = {
      x: panelX + 24,
      y: panelY + panelHeight - 58,
      width: (panelWidth - 64) / 2,
      height: 44
    };
    const confirmRect = {
      x: cancelRect.x + cancelRect.width + 16,
      y: cancelRect.y,
      width: cancelRect.width,
      height: cancelRect.height
    };
    this.membershipActionRects.cancel = cancelRect;
    this.membershipActionRects.confirm = confirmRect;
    this.drawActionButton(cancelRect, '取消', 'secondary');
    this.drawActionButton(confirmRect, '确认', 'primary');
  }

  drawMembershipKeyboard(panelX, panelY, panelWidth, keyboardTopY) {
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
    const contentX = panelX + 24;
    const contentW = panelWidth - 48;

    rows.forEach((row, rowIdx) => {
      const n = row.length;
      const totalGap = (n - 1) * gap;
      const keyW = (contentW - totalGap) / n;
      const y = keyboardTopY + rowIdx * (keyH + gap);

      row.forEach((label, colIdx) => {
        const x = contentX + colIdx * (keyW + gap);
        const isDel = label === 'DEL';

        roundedRect(ctx, x, y, keyW, keyH, 8);
        ctx.fillStyle = isDel ? 'rgba(180,60,60,0.35)' : 'rgba(30,60,110,0.65)';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = isDel ? 'rgba(255,120,120,0.35)' : 'rgba(120,200,255,0.2)';
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isDel ? '#FFB0B0' : TEXT_PRIMARY;
        ctx.font = isDel ? 'bold 13px sans-serif' : 'bold 16px sans-serif';
        ctx.fillText(label, x + keyW / 2, y + keyH / 2 + 1);

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
    ctx.fillStyle = OVERLAY;
    ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);

    const panelWidth = layout.screenWidth - layout.sideMargin * 2 - 18;
    const panelHeight = 248;
    const panelX = (layout.screenWidth - panelWidth) / 2;
    const panelY = (layout.screenHeight - panelHeight) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 10;
    roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 22);
    ctx.fillStyle = PANEL;
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = PANEL_BORDER;
    roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 22);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('使用免死金牌？', layout.screenWidth / 2, panelY + 44);

    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '17px sans-serif';
    ctx.fillText(`本局还可免死 ${state.getReviveCountLabel()} 次`, layout.screenWidth / 2, panelY + 94);

    const useRect = {
      x: panelX + 24,
      y: panelY + 132,
      width: panelWidth - 48,
      height: 48
    };
    const giveUpRect = {
      x: panelX + 24,
      y: useRect.y + 58,
      width: panelWidth - 48,
      height: 42
    };

    this.reviveActionRects.use = useRect;
    this.reviveActionRects.giveUp = giveUpRect;
    this.drawActionButton(useRect, '使用', 'primary');
    this.drawActionButton(giveUpRect, '放弃', 'dangerOutline');
  }

  drawGameOver(state) {
    const { ctx, layout } = this;
    const difficultyLabel = getDifficultyLabel(state.activeDifficulty);

    ctx.fillStyle = OVERLAY;
    ctx.fillRect(0, 0, layout.screenWidth, layout.screenHeight);

    const panelWidth = layout.screenWidth - layout.sideMargin * 2 - 8;
    const panelHeight = state.bestScoreEligible ? 256 : 286;
    const panelX = (layout.screenWidth - panelWidth) / 2;
    const panelY = layout.screenHeight * 0.25;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 8;
    roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 22);
    ctx.fillStyle = PANEL;
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = PANEL_BORDER;
    roundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 22);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('游戏结束', layout.screenWidth / 2, panelY + 48);

    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '18px sans-serif';
    ctx.fillText(`本局得分 ${state.score}`, layout.screenWidth / 2, panelY + 96);
    ctx.fillText(`${difficultyLabel}最高分 ${state.bestScore}`, layout.screenWidth / 2, panelY + 130);

    const extraText = state.getGameOverExtraText();
    if (extraText) {
      ctx.fillText(extraText, layout.screenWidth / 2, panelY + 164);
    }

    if (!state.bestScoreEligible) {
      ctx.fillStyle = '#F1B2A4';
      ctx.font = '15px sans-serif';
      ctx.fillText('管理员模式分数不计入正式最高分', layout.screenWidth / 2, panelY + (extraText ? 194 : 164));
    }

    const buttonRect = {
      x: panelX + 36,
      y: panelY + panelHeight - 76,
      width: panelWidth - 72,
      height: 52
    };
    this.restartButtonRect = buttonRect;
    this.drawActionButton(buttonRect, '重新开始', 'primary');
  }

  drawSettingRow(rect, label, value) {
    const { ctx } = this;
    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 14);
    ctx.fillStyle = 'rgba(11, 28, 52, 0.92)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(120, 202, 255, 0.24)';
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = value && value.length > 10 ? '15px sans-serif' : '17px sans-serif';
    ctx.fillText(label, rect.x + 16, rect.y + rect.height / 2 + 6);

    if (value) {
      ctx.textAlign = 'right';
      ctx.fillStyle = TEXT_SECONDARY;
      ctx.font = value.length > 10 ? '14px sans-serif' : '16px sans-serif';
      ctx.fillText(value, rect.x + rect.width - 16, rect.y + rect.height / 2 + 5);
    }
  }

  drawSectionLabel(rect, label) {
    const { ctx } = this;
    ctx.textAlign = 'left';
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(label, rect.x + 4, rect.y + rect.height / 2 + 6);
  }

  drawActionButton(rect, label, variant = 'secondary') {
    const { ctx } = this;
    const isPrimary = variant === 'primary' || variant === true;
    const isDanger = variant === 'danger';
    const isDangerOutline = variant === 'dangerOutline';

    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 16);
    if (isPrimary) {
      ctx.fillStyle = BUTTON_FILL;
    } else if (isDanger) {
      ctx.fillStyle = 'rgba(170, 67, 52, 0.92)';
    } else {
      ctx.fillStyle = 'rgba(11, 28, 52, 0.92)';
    }
    ctx.fill();
    ctx.lineWidth = 1.25;
    if (isPrimary) {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    } else if (isDanger || isDangerOutline) {
      ctx.strokeStyle = 'rgba(237, 133, 113, 0.72)';
    } else {
      ctx.strokeStyle = 'rgba(120,202,255,0.28)';
    }
    ctx.stroke();

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
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 6);
  }

  drawSecondaryChip(rect, label) {
    const { ctx } = this;
    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 16);
    ctx.fillStyle = 'rgba(11, 28, 52, 0.78)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(120,202,255,0.28)';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '16px sans-serif';
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 6);
  }

  drawStatusTag(rect, label, variant = 'secondary') {
    const { ctx } = this;
    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 12);
    ctx.fillStyle = variant === 'danger' ? 'rgba(92, 38, 34, 0.88)' : 'rgba(11, 28, 52, 0.78)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = variant === 'danger'
      ? 'rgba(237, 133, 113, 0.72)'
      : 'rgba(120,202,255,0.28)';
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

    roundedRect(ctx, x, y, width, height, 16);
    ctx.fillStyle = 'rgba(8, 18, 36, 0.8)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(151, 226, 255, 0.28)';
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
    const radius = clamp(size * 0.08, 2, 4);
    const alpha = options.alpha == null ? 1 : options.alpha;
    const pulse = options.pulse || 0;
    const glow = options.glow || 0;
    const borderBoost = options.borderBoost || 0;
    const shadowAlpha = options.shadowAlpha == null ? 0.08 : options.shadowAlpha;
    const flatten = !!options.flatten;
    const clearing = !!options.clearing;

    const topColor = tintColor(color, flatten ? 0.16 : 0.22 + pulse * 0.08);
    const midColor = clearing ? tintColor(color, 0.1) : color;
    const bottomColor = shadeColor(color, flatten ? 0.14 : 0.28);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = rgba(tintColor(color, 0.2), glow > 0 ? 0.14 : shadowAlpha);
    ctx.shadowBlur = glow > 0 ? 3 : 0.8;
    ctx.shadowOffsetY = glow > 0 ? 1 : 0.5;
    roundedRect(ctx, drawX, drawY, drawSize, drawSize, radius);
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
    ctx.strokeStyle = rgba(tintColor(color, 0.38 + borderBoost), 0.78);
    roundedRect(ctx, drawX + 0.5, drawY + 0.5, drawSize - 1, drawSize - 1, radius);
    ctx.stroke();

    ctx.strokeStyle = rgba('#FFFFFF', flatten ? 0.12 : 0.24 + pulse * 0.08);
    ctx.beginPath();
    ctx.moveTo(drawX + 2, drawY + drawSize - 2);
    ctx.lineTo(drawX + 2, drawY + 2);
    ctx.lineTo(drawX + drawSize - 2, drawY + 2);
    ctx.stroke();

    ctx.strokeStyle = rgba(shadeColor(color, 0.48), 0.5);
    ctx.beginPath();
    ctx.moveTo(drawX + drawSize - 1, drawY + 3);
    ctx.lineTo(drawX + drawSize - 1, drawY + drawSize - 1);
    ctx.lineTo(drawX + 3, drawY + drawSize - 1);
    ctx.stroke();

    if (!flatten) {
      const shineHeight = Math.max(2, Math.floor(drawSize * 0.16));
      const shineWidth = Math.max(8, drawSize - 6);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      roundedRect(ctx, drawX + 2, drawY + 2, shineWidth, shineHeight, 2);
      ctx.fill();
    }
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


