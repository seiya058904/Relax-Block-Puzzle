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
    this.layout = this.getLayout(screenInfo, safeAreaInfo);
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
      x: sideMargin,
      y: topInset,
      width: screenWidth - sideMargin * 2,
      height: headerHeight
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
    this.layout = this.getLayout(this.screenInfo, this.safeAreaInfo);
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
    }
  }

  clearCanvas() {
    this.ctx.clearRect(0, 0, this.layout.screenWidth, this.layout.screenHeight);
  }

  drawBackground(isDragging = false) {
    const { ctx, layout } = this;
    const gradient = ctx.createLinearGradient(0, 0, 0, layout.screenHeight);
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
    const panel = layout.homePanelRect;
    const difficultyLabel = getDifficultyLabel(state.settings.difficulty);
    const difficultyBestScore = state.bestScores[state.settings.difficulty] || 0;
    const compact = layout.screenHeight < 820;
    const titleFontSize = compact ? 31 : 35;
    const subtitleFontSize = compact ? 14 : 16;
    const titleWidthPadding = compact ? 30 : 40;
    const difficultyHeight = compact ? 40 : 42;
    const difficultyPaddingX = compact ? 30 : 34;
    const buttonWidth = panel.width - (compact ? 60 : 72);
    const buttonX = panel.x + (panel.width - buttonWidth) / 2;
    const startHeight = compact ? 54 : 58;
    const secondaryHeight = compact ? 46 : 48;
    const buttonGap = compact ? 12 : 14;
    const topPadding = compact ? 22 : 26;
    const bottomPadding = compact ? 22 : 26;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 10;
    roundedRect(ctx, panel.x, panel.y, panel.width, panel.height, 26);
    ctx.fillStyle = 'rgba(10, 28, 53, 0.58)';
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(120, 214, 255, 0.2)';
    roundedRect(ctx, panel.x, panel.y, panel.width, panel.height, 26);
    ctx.stroke();

    this.homeTitleRect = {
      x: panel.x + titleWidthPadding,
      y: panel.y + topPadding - 6,
      width: panel.width - titleWidthPadding * 2,
      height: compact ? 60 : 66
    };

    let cursorY = panel.y + topPadding;

    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = `bold ${titleFontSize}px sans-serif`;
    ctx.fillText('轻松俄罗斯方块', layout.screenWidth / 2, cursorY + titleFontSize);

    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = `${subtitleFontSize}px sans-serif`;
    const subtitleY = cursorY + titleFontSize + (compact ? 24 : 28);
    ctx.fillText('拖动方块，填满整行或整列即可消除', layout.screenWidth / 2, subtitleY);
    cursorY = subtitleY + (compact ? 18 : 20);

    if (state.isAdminModeActive()) {
      const adminRect = {
        x: panel.x + panel.width / 2 - 54,
        y: cursorY,
        width: 108,
        height: 28
      };
      this.drawSecondaryChip(adminRect, '管理员模式');
      cursorY = adminRect.y + adminRect.height + 14;
    }

    const difficultyRect = {
      x: panel.x + difficultyPaddingX,
      y: cursorY,
      width: panel.width - difficultyPaddingX * 2,
      height: difficultyHeight
    };
    this.homeActionRects.difficulty = difficultyRect;
    this.drawSecondaryChip(difficultyRect, `难度：${difficultyLabel}`);
    cursorY = difficultyRect.y + difficultyRect.height + (compact ? 26 : 30);

    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '18px sans-serif';
    ctx.fillText(`${difficultyLabel}最高分：${difficultyBestScore}`, layout.screenWidth / 2, cursorY);

    const buttonBlockHeight = startHeight + secondaryHeight * 2 + buttonGap * 2;
    const desiredButtonTop = cursorY + (compact ? 16 : 18);
    const maxButtonTop = panel.y + panel.height - bottomPadding - buttonBlockHeight;
    const buttonTop = Math.min(desiredButtonTop, maxButtonTop);

    const startRect = { x: buttonX, y: buttonTop, width: buttonWidth, height: startHeight };
    const helpRect = {
      x: buttonX,
      y: startRect.y + startRect.height + buttonGap,
      width: buttonWidth,
      height: secondaryHeight
    };
    const settingsRect = {
      x: buttonX,
      y: helpRect.y + helpRect.height + buttonGap,
      width: buttonWidth,
      height: secondaryHeight
    };

    this.homeActionRects.start = startRect;
    this.homeActionRects.help = helpRect;
    this.homeActionRects.settings = settingsRect;

    this.drawActionButton(startRect, '开始游戏', 'primary');
    this.drawActionButton(helpRect, '怎么玩', 'secondary');
    this.drawActionButton(settingsRect, '设置', 'secondary');
  }

  drawPlayingScene(state) {
    this.settingsButtonRect = this.layout.settingsButtonRect;
    this.pauseButtonRect = this.layout.pauseButtonRect;
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
    const centerX = layout.headerRect.x + layout.headerRect.width / 2;
    const difficultyLabel = getDifficultyLabel(state.activeDifficulty);

    ctx.textAlign = 'center';
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = 'bold 46px sans-serif';
    ctx.fillText(String(state.score), centerX, layout.headerRect.y + 42);

    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '16px sans-serif';
    ctx.fillText(`${difficultyLabel}最高分：${state.bestScore}`, centerX, layout.headerRect.y + 76);

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

    items.forEach((item, index) => {
      const buttonRect = {
        x: rect.x + (width + gap) * index,
        y: rect.y,
        width,
        height: rect.height
      };
      this.toolActionRects[item.key] = buttonRect;

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
      if (!piece || piece.used || !slot) {
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
    const rect = this.settingsButtonRect;
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
    const rect = this.pauseButtonRect;
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
    if (!state.dragState.isDragging || state.toolState.clearMode) {
      return;
    }

    const piece = state.rackPieces[state.dragState.activePieceIndex];
    const { visualX, visualY, displayCellSize } = state.dragState;

    piece.cells.forEach((cell) => {
      this.drawBlockCell(
        visualX + cell.x * displayCellSize,
        visualY + cell.y * displayCellSize,
        displayCellSize,
        piece.color,
        {
          glow: 0,
          borderBoost: 0.02,
          shadowAlpha: 0
        }
      );
    });
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
    ctx.fillText('输入福利码', layout.screenWidth / 2, panelY + 42);

    const inputRect = {
      x: panelX + 24,
      y: panelY + 80,
      width: panelWidth - 48,
      height: 50
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
      ctx.fillText(state.membershipInput, inputRect.x + 16, inputRect.y + 31);
    } else {
      ctx.fillStyle = 'rgba(185, 210, 255, 0.6)';
      ctx.fillText('请输入福利码', inputRect.x + 16, inputRect.y + 31);
    }

    if (state.membershipError) {
      ctx.fillStyle = '#FFB4A4';
      ctx.textAlign = 'left';
      ctx.font = '15px sans-serif';
      ctx.fillText(state.membershipError, inputRect.x + 2, inputRect.y + 74);
    }

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
    this.membershipActionRects.cancel = cancelRect;
    this.membershipActionRects.confirm = confirmRect;
    this.drawActionButton(cancelRect, '取消', 'secondary');
    this.drawActionButton(confirmRect, '确认', 'primary');
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
    const gradient = ctx.createLinearGradient(drawX, drawY, drawX, drawY + drawSize);
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
    for (let index = 0; index < this.rackHitAreas.length; index += 1) {
      const hitArea = this.rackHitAreas[index];
      if (
        x >= hitArea.x &&
        x <= hitArea.x + hitArea.width &&
        y >= hitArea.y &&
        y <= hitArea.y + hitArea.height
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


