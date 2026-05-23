import Board from './Board.js';
import ScoreManager from './ScoreManager.js';
import {
  BOARD_SIZE,
  CLEAR_ANIMATION_MS,
  DEBUG_CODE_ENABLED,
  DRAG_FINGER_OFFSET_MAX,
  DRAG_FINGER_OFFSET_MIN,
  DRAG_FINGER_OFFSET_MULTIPLIER,
  MEMBERSHIP_CODES,
  PLACEMENT_PULSE_MS,
  REVIVE_CLEAR_COUNT
} from './constants.js';
import { createRack } from './Piece.js';
import {
  loadBestScores,
  loadBestScore,
  normalizeDifficulty,
  resetBestScore as persistResetBestScore,
  saveSettings as persistSettings
} from '../utils/storage.js';

const DIFFICULTY_TOOL_COUNTS = {
  easy: { refreshCount: 3, clearCount: 1, undoCount: 1 },
  normal: { refreshCount: 2, clearCount: 1, undoCount: 1 },
  master: { refreshCount: 1, clearCount: 0, undoCount: 1 }
};

const DIFFICULTY_LABELS = {
  easy: '简单',
  normal: '普通',
  master: '大师'
};

function createEmptyDragState() {
  return {
    activePieceIndex: -1,
    dragX: 0,
    dragY: 0,
    drawX: 0,
    drawY: 0,
    displayCellSize: 0,
    dragFingerOffsetY: 0,
    isDragging: false
  };
}

function createEmptyPreviewState() {
  return {
    row: -1,
    col: -1,
    canPlace: false,
    visible: false
  };
}

function createUiState() {
  return {
    isSettingsOpen: false,
    isResetConfirmOpen: false,
    isPauseOpen: false,
    isPauseConfirmOpen: false,
    isAdminPanelOpen: false,
    isMembershipPanelOpen: false,
    isRevivePromptOpen: false
  };
}

function createComboState() {
  return {
    comboCount: 0,
    lastClearTime: 0,
    comboWindowMs: 3000
  };
}

function clonePiece(piece) {
  if (!piece) {
    return null;
  }

  return {
    ...piece,
    cells: piece.cells.map((cell) => ({ ...cell })),
    bounds: piece.bounds ? { ...piece.bounds } : null
  };
}

function cloneRackPieces(rackPieces) {
  return rackPieces.map((piece) => clonePiece(piece));
}

function clonePulseList(list) {
  return list.map((item) => ({ ...item }));
}

function clonePendingClear(pendingClear) {
  if (!pendingClear) {
    return null;
  }

  return {
    rows: pendingClear.rows.slice(),
    cols: pendingClear.cols.slice(),
    lineCount: pendingClear.lineCount,
    remainingTime: pendingClear.remainingTime
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createToolUsage() {
  return {
    refresh: 0,
    clear: 0,
    undo: 0
  };
}

function normalizeAdminCode(value) {
  return String(value || '').trim();
}

function normalizeMembershipCode(value) {
  return String(value || '').trim().toUpperCase();
}

function createDefaultAuthState() {
  return {
    loggedIn: false,
    userId: '',
    isMember: false,
    isAdminAllowed: true,
    backendHealthy: false,
    loginError: ''
  };
}

export function getDifficultyLabel(difficulty) {
  return DIFFICULTY_LABELS[normalizeDifficulty(difficulty)] || DIFFICULTY_LABELS.normal;
}

export default class GameState {
  constructor() {
    this.board = new Board(BOARD_SIZE);
    this.scoreManager = new ScoreManager();
    this.layout = null;
    this.settings = {
      soundEnabled: true,
      bgmEnabled: false,
      vibrationEnabled: true,
      bgmTrack: 2,
      difficulty: 'normal',
      localMembershipEnabled: false
    };
    this.ui = createUiState();
    this.events = [];
    this.bestScores = loadBestScores();
    this.activeDifficulty = normalizeDifficulty(this.settings.difficulty);
    this.bestScore = loadBestScore(this.activeDifficulty);
    this.authClient = null;
    this.authState = createDefaultAuthState();
    this.isAuthenticating = false;
    this.adminModeEnabled = false;
    this.adminInput = '';
    this.adminError = '';
    this.membershipInput = '';
    this.membershipError = '';
    this.initializeHomeState();
  }

  initializeHomeState() {
    this.board.reset();
    this.score = 0;
    this.bestScores = loadBestScores();
    this.activeDifficulty = normalizeDifficulty(this.settings.difficulty);
    this.bestScore = this.bestScores[this.activeDifficulty] || 0;
    this.rackPieces = [];
    this.dragState = createEmptyDragState();
    this.previewState = createEmptyPreviewState();
    this.pendingClear = null;
    this.placementPulse = [];
    this.inputLocked = false;
    this.screen = 'home';
    this.isGameOver = false;
    this.toolUsage = createToolUsage();
    this.toolState = this.buildCurrentToolState(false);
    this.undoSnapshot = null;
    this.notice = null;
    this.comboState = createComboState();
    this.lastRackHadSnake = false;
    this.ui = createUiState();
    this.bestScoreEligible = !this.adminModeEnabled;
    this.reviveCount = this.adminModeEnabled ? Infinity : 0;
    this.reviveUsedCount = 0;
    this.pendingRevive = null;
  }

  setLayout(layout) {
    this.layout = layout;
  }

  setSettings(settings) {
    const previousDifficulty = normalizeDifficulty(this.settings.difficulty);

    this.settings = {
      ...this.settings,
      ...settings,
      difficulty: normalizeDifficulty(settings.difficulty || this.settings.difficulty)
    };

    const nextDifficulty = normalizeDifficulty(this.settings.difficulty);
    this.bestScores = loadBestScores();

    if (this.screen === 'home' || this.screen === 'help') {
      this.bestScore = this.bestScores[nextDifficulty] || 0;
      this.activeDifficulty = nextDifficulty;
      this.toolState = this.buildCurrentToolState(false);
    } else {
      if (nextDifficulty !== previousDifficulty) {
        this.showNotice('难度切换将在下局生效');
      }

      if (
        this.screen === 'playing' &&
        settings &&
        Object.prototype.hasOwnProperty.call(settings, 'localMembershipEnabled')
      ) {
        this.syncRoundRuntimeState();
        this.showNotice('会员状态已更新');
      }
    }
  }

  setScreen(screen) {
    this.screen = screen;
    this.isGameOver = screen === 'gameover';
  }

  cycleDifficulty() {
    const order = ['easy', 'normal', 'master'];
    const current = normalizeDifficulty(this.settings.difficulty);
    const next = order[(order.indexOf(current) + 1) % order.length];
    this.setSettings({ difficulty: next });
    return next;
  }

  setAuthClient(authClient) {
    this.authClient = authClient || null;
  }

  applyAuthState(authState) {
    const nextState = {
      ...createDefaultAuthState(),
      ...(authState || {})
    };

    this.authState = nextState;

    if (!nextState.isAdminAllowed && this.adminModeEnabled) {
      this.disableAdminMode();
    }

    if (this.screen === 'playing') {
      this.syncRoundRuntimeState();
    } else {
      this.reviveCount = this.adminModeEnabled ? Infinity : this.getRoundReviveAllowance();
    }

  }

  setBackendHealth(ok) {
    this.authState = {
      ...this.authState,
      backendHealthy: !!ok
    };
  }

  setLoginError(message) {
    this.authState = {
      ...this.authState,
      loginError: String(message || '').trim()
    };
  }

  async trySilentLogin() {
    this.applyAuthState(createDefaultAuthState());
    return this.authState;
  }

  reset() {
    const selectedDifficulty = normalizeDifficulty(this.settings.difficulty);

    this.board.reset();
    this.score = 0;
    this.bestScores = loadBestScores();
    this.activeDifficulty = selectedDifficulty;
    this.bestScore = this.bestScores[this.activeDifficulty] || 0;
    this.rackPieces = [];
    this.dragState = createEmptyDragState();
    this.previewState = createEmptyPreviewState();
    this.pendingClear = null;
    this.placementPulse = [];
    this.inputLocked = false;
    this.toolUsage = createToolUsage();
    this.toolState = this.buildCurrentToolState(false);
    this.undoSnapshot = null;
    this.notice = null;
    this.comboState = createComboState();
    this.lastRackHadSnake = false;
    this.bestScoreEligible = !this.adminModeEnabled;
    this.reviveUsedCount = 0;
    this.reviveCount = this.getRoundReviveAllowance();
    this.pendingRevive = null;
    this.ui.isPauseOpen = false;
    this.ui.isPauseConfirmOpen = false;
    this.ui.isRevivePromptOpen = false;
    this.setScreen('playing');
    this.generateRackForPlay(true);
  }

  update(deltaTime) {
    if (
      this.screen !== 'playing' ||
      this.ui.isSettingsOpen ||
      this.ui.isPauseOpen ||
      this.ui.isAdminPanelOpen ||
      this.ui.isRevivePromptOpen
    ) {
      return;
    }

    if (this.notice) {
      this.notice.remainingTime -= deltaTime;
      if (this.notice.remainingTime <= 0) {
        this.notice = null;
      }
    }

    if (this.placementPulse.length > 0) {
      this.placementPulse = this.placementPulse
        .map((pulse) => ({
          ...pulse,
          remainingTime: pulse.remainingTime - deltaTime
        }))
        .filter((pulse) => pulse.remainingTime > 0);
    }

    if (this.pendingClear) {
      this.pendingClear.remainingTime -= deltaTime;
      if (this.pendingClear.remainingTime <= 0) {
        this.finishPendingClear();
      }
    }
  }

  startNewGame() {
    this.reset();
  }

  openHelp() {
    this.clearDrag();
    this.setScreen('help');
  }

  closeHelp() {
    this.setScreen('home');
  }

  openSettings() {
    this.clearDrag();
    this.ui.isSettingsOpen = true;
    this.ui.isResetConfirmOpen = false;
  }

  closeSettings() {
    this.ui.isSettingsOpen = false;
    this.ui.isResetConfirmOpen = false;
    this.ui.isMembershipPanelOpen = false;
  }

  openMembershipPanel() {
    if (!this.ui.isSettingsOpen) {
      return false;
    }

    this.membershipInput = '';
    this.membershipError = '';
    this.ui.isMembershipPanelOpen = true;
    return true;
  }

  closeMembershipPanel() {
    this.membershipInput = '';
    this.membershipError = '';
    this.ui.isMembershipPanelOpen = false;
  }

  openPause() {
    if (
      this.screen !== 'playing' ||
      this.ui.isSettingsOpen ||
      this.ui.isAdminPanelOpen ||
      this.ui.isRevivePromptOpen
    ) {
      return;
    }

    this.clearDrag();
    this.ui.isPauseOpen = true;
    this.ui.isPauseConfirmOpen = false;
  }

  closePause() {
    this.ui.isPauseOpen = false;
    this.ui.isPauseConfirmOpen = false;
  }

  requestReturnHome() {
    this.ui.isPauseConfirmOpen = true;
  }

  cancelReturnHome() {
    this.ui.isPauseConfirmOpen = false;
  }

  confirmReturnHome() {
    this.closePause();
    this.initializeHomeState();
  }

  requestResetBestScore() {
    this.ui.isResetConfirmOpen = true;
  }

  cancelResetBestScore() {
    this.ui.isResetConfirmOpen = false;
  }

  confirmResetBestScore() {
    const difficulty = normalizeDifficulty(this.settings.difficulty);
    persistResetBestScore(difficulty);
    this.bestScores = {
      ...this.bestScores,
      [difficulty]: 0
    };

    if (
      this.screen === 'home' ||
      this.screen === 'help' ||
      this.activeDifficulty === difficulty
    ) {
      this.bestScore = 0;
    }

    this.ui.isResetConfirmOpen = false;
  }

  openAdminPanel() {
    if (!DEBUG_CODE_ENABLED || this.screen !== 'home' || this.ui.isSettingsOpen) {
      return false;
    }

    this.clearDrag();
    this.adminInput = '';
    this.adminError = '';
    this.ui.isAdminPanelOpen = true;
    return true;
  }

  closeAdminPanel() {
    this.adminInput = '';
    this.adminError = '';
    this.ui.isAdminPanelOpen = false;
  }

  setAdminInput(value) {
    this.adminInput = String(value || '').slice(0, 32);
    this.adminError = '';
  }

  setMembershipInput(value) {
    this.membershipInput = String(value || '').slice(0, 32);
    this.membershipError = '';
  }

  enableLocalMembership() {
    if (this.settings.localMembershipEnabled) {
      return false;
    }

    const nextSettings = {
      ...this.settings,
      localMembershipEnabled: true
    };
    this.setSettings(nextSettings);
    persistSettings(nextSettings);
    return true;
  }

  disableLocalMembership() {
    if (!this.settings.localMembershipEnabled) {
      return false;
    }

    const nextSettings = {
      ...this.settings,
      localMembershipEnabled: false
    };
    this.setSettings(nextSettings);
    persistSettings(nextSettings);
    return true;
  }

  disableAdminMode() {
    if (!this.adminModeEnabled) {
      return;
    }

    this.adminModeEnabled = false;

    if (this.screen === 'playing') {
      this.syncRoundRuntimeState();
      this.showNotice('管理员模式已关闭');
    }
  }

  openRevivePrompt() {
    this.clearDrag();
    this.toolState.clearMode = false;
    this.pendingRevive = {
      remainingCount: this.isAdminModeActive() ? Infinity : this.reviveCount
    };
    this.ui.isRevivePromptOpen = true;
  }

  closeRevivePrompt() {
    this.pendingRevive = null;
    this.ui.isRevivePromptOpen = false;
  }

  acceptRevive() {
    const success = this.consumeRevive();
    if (!success) {
      this.closeRevivePrompt();
      this.triggerGameOver();
      return false;
    }

    this.closeRevivePrompt();
    return true;
  }

  declineRevive() {
    this.closeRevivePrompt();
    this.triggerGameOver();
  }

  startDrag(pieceIndex, touchX, touchY, hitArea) {
    if (!this.canDragPieces()) {
      return false;
    }

    const piece = this.rackPieces[pieceIndex];
    if (!piece || piece.used) {
      return false;
    }

    const displayCellSize = this.layout ? this.layout.cellSize * 0.96 : hitArea.cellSize;
    const dragFingerOffsetY = this.getDragFingerOffsetY();
    const visualPosition = this.getDraggedPieceVisualPosition(touchX, touchY, piece, displayCellSize, dragFingerOffsetY);

    this.dragState = {
      activePieceIndex: pieceIndex,
      dragX: touchX,
      dragY: touchY,
      drawX: visualPosition.x,
      drawY: visualPosition.y,
      displayCellSize,
      dragFingerOffsetY,
      isDragging: true
    };

    this.moveDrag(touchX, touchY);
    this.emitEvent('pickup');
    return true;
  }

  moveDrag(touchX, touchY) {
    if (!this.dragState.isDragging || !this.layout || this.screen !== 'playing') {
      return;
    }

    const piece = this.rackPieces[this.dragState.activePieceIndex];
    if (!piece) {
      return;
    }

    const visualPosition = this.getDraggedPieceVisualPosition(
      touchX,
      touchY,
      piece,
      this.dragState.displayCellSize,
      this.dragState.dragFingerOffsetY
    );
    const placement = this.getDraggedPieceBoardPlacement(visualPosition.x, visualPosition.y, piece);

    this.dragState.dragX = touchX;
    this.dragState.dragY = touchY;
    this.dragState.drawX = visualPosition.x;
    this.dragState.drawY = visualPosition.y;

    this.previewState = {
      row: placement.row,
      col: placement.col,
      canPlace: placement.canPlace,
      visible: true
    };
  }

  endDrag() {
    if (!this.dragState.isDragging) {
      return false;
    }

    if (this.previewState.visible && this.previewState.canPlace) {
      return this.tryPlaceDraggedPiece();
    }

    this.emitEvent('invalid');
    this.clearDrag();
    return false;
  }

  tryPlaceDraggedPiece() {
    const piece = this.rackPieces[this.dragState.activePieceIndex];
    const { row, col } = this.previewState;

    if (!piece || !this.board.canPlace(piece.cells, row, col)) {
      this.clearDrag();
      return false;
    }

    this.undoSnapshot = this.createUndoSnapshot();

    const placedCount = this.board.place(piece, row, col);
    this.scoreManager.applyPlacement(this, placedCount);
    this.emitEvent('place');
    piece.used = true;
    this.toolState.clearMode = false;
    this.placementPulse = piece.cells.map((cell) => ({
      row: row + cell.y,
      col: col + cell.x,
      remainingTime: PLACEMENT_PULSE_MS
    }));

    const completed = this.board.findCompletedLines();
    const lineCount = completed.rows.length + completed.cols.length;

    this.clearDrag();

    if (lineCount > 0) {
      this.pendingClear = {
        rows: completed.rows,
        cols: completed.cols,
        lineCount,
        remainingTime: CLEAR_ANIMATION_MS
      };
      this.inputLocked = true;
    } else {
      this.refillRackIfNeeded();
      this.checkGameOver();
    }

    return true;
  }

  finishPendingClear() {
    if (!this.pendingClear) {
      return;
    }

    const lineCount = this.pendingClear.lineCount;
    this.board.clearLines(this.pendingClear.rows, this.pendingClear.cols);
    this.scoreManager.applyLineClear(this, lineCount);
    this.pendingClear = null;
    this.inputLocked = false;
    this.handleLineClear(lineCount);

    this.refillRackIfNeeded();
    this.checkGameOver();
  }

  handleLineClear(lineCount) {
    if (lineCount <= 0) {
      return;
    }

    const now = Date.now();
    const comboState = this.comboState || createComboState();

    if (
      !comboState.lastClearTime ||
      now - comboState.lastClearTime > comboState.comboWindowMs
    ) {
      comboState.comboCount = 0;
    }

    comboState.comboCount += Math.max(1, lineCount);
    comboState.lastClearTime = now;
    this.comboState = comboState;

    if (comboState.comboCount >= 3) {
      this.emitEvent('combo3');
    } else if (comboState.comboCount >= 2) {
      this.emitEvent('combo');
    } else {
      this.emitEvent('clear');
    }
  }

  useRefreshTool() {
    if (!this.canUseTool()) {
      this.emitEvent('invalid');
      return false;
    }

    if (!this.isAdminModeActive() && this.toolState.refreshCount <= 0) {
      this.showNotice('刷新次数已用完');
      this.emitEvent('invalid');
      return false;
    }

    const result = createRack(this.board, this.activeDifficulty, {
      previousHadSnake: this.lastRackHadSnake
    });

    if (!result.success) {
      this.showNotice('暂无可刷新组合');
      this.emitEvent('invalid');
      return false;
    }

    this.toolUsage.refresh += 1;
    this.syncRoundRuntimeState();
    this.toolState.clearMode = false;
    this.rackPieces = result.pieces;
    this.lastRackHadSnake = !!(result.meta && result.meta.hasSnake);
    this.undoSnapshot = null;
    this.clearDrag();
    this.showNotice('已刷新候选方块');
    return true;
  }

  toggleClearTool() {
    if (!this.canUseTool()) {
      this.emitEvent('invalid');
      return 'failed';
    }

    if (!this.isAdminModeActive() && this.toolState.clearCount <= 0) {
      this.showNotice('清除次数已用完');
      this.emitEvent('invalid');
      return 'failed';
    }

    this.clearDrag();
    this.toolState.clearMode = !this.toolState.clearMode;

    if (this.toolState.clearMode) {
      this.showNotice('请选择棋盘上的一个位置');
    } else {
      this.notice = null;
    }

    return this.toolState.clearMode ? 'enabled' : 'disabled';
  }

  cancelClearMode() {
    if (!this.toolState.clearMode) {
      return;
    }

    this.toolState.clearMode = false;
    this.notice = null;
  }

  useClearTool(row, col) {
    if (!this.canUseTool() || !this.toolState.clearMode) {
      this.emitEvent('invalid');
      return false;
    }

    const removedCells = this.board.clearArea(row, col, 1);
    if (removedCells.length === 0) {
      this.showNotice('这里没有可清除的方块');
      this.emitEvent('invalid');
      return false;
    }

    this.toolUsage.clear += 1;
    this.syncRoundRuntimeState();
    this.toolState.clearMode = false;
    this.undoSnapshot = null;
    this.placementPulse = removedCells.map((cell) => ({
      row: cell.row,
      col: cell.col,
      remainingTime: PLACEMENT_PULSE_MS
    }));
    this.emitEvent('clear');
    this.showNotice('已清除附近方块');
    this.checkGameOver();
    return true;
  }

  useUndoTool() {
    if (!this.canUseTool()) {
      this.emitEvent('invalid');
      return false;
    }

    if (!this.isAdminModeActive() && this.toolState.undoCount <= 0) {
      this.showNotice('撤回次数已用完');
      this.emitEvent('invalid');
      return false;
    }

    if (!this.undoSnapshot) {
      this.showNotice('当前没有可撤回的操作');
      this.emitEvent('invalid');
      return false;
    }

    const snapshot = this.undoSnapshot;
    this.toolUsage.undo += 1;

    this.board.restoreSnapshot(snapshot.boardGrid);
    this.score = snapshot.score;
    this.rackPieces = cloneRackPieces(snapshot.rackPieces);
    this.pendingClear = clonePendingClear(snapshot.pendingClear);
    this.placementPulse = clonePulseList(snapshot.placementPulse);
    this.dragState = { ...snapshot.dragState };
    this.previewState = { ...snapshot.previewState };
    this.inputLocked = snapshot.inputLocked;
    this.activeDifficulty = snapshot.activeDifficulty;
    this.lastRackHadSnake = !!snapshot.lastRackHadSnake;
    this.toolState = {
      ...snapshot.toolState,
      clearMode: false
    };
    this.toolUsage = {
      ...snapshot.toolUsage
    };
    this.reviveCount = snapshot.reviveCount;
    this.reviveUsedCount = snapshot.reviveUsedCount;
    this.bestScoreEligible = snapshot.bestScoreEligible;
    this.pendingRevive = null;
    this.comboState = snapshot.comboState
      ? {
          comboCount: snapshot.comboState.comboCount,
          lastClearTime: snapshot.comboState.lastClearTime,
          comboWindowMs: snapshot.comboState.comboWindowMs
        }
      : createComboState();
    this.notice = null;
    this.undoSnapshot = null;
    this.ui.isPauseOpen = false;
    this.ui.isPauseConfirmOpen = false;
    this.ui.isRevivePromptOpen = false;
    this.setScreen('playing');
    this.syncRoundRuntimeState();
    return true;
  }

  refillRackIfNeeded() {
    if (this.rackPieces.length > 0 && this.rackPieces.every((piece) => piece.used)) {
      this.generateRackForPlay(true);
    }
  }

  generateRackForPlay(allowGameOverOnFailure) {
    const result = createRack(this.board, this.activeDifficulty, {
      previousHadSnake: this.lastRackHadSnake
    });
    if (result.success) {
      this.rackPieces = result.pieces;
      this.lastRackHadSnake = !!(result.meta && result.meta.hasSnake);
      return true;
    }

    if (allowGameOverOnFailure) {
      this.rackPieces = [];
      this.handleNoMoves();
    }

    return false;
  }

  checkGameOver() {
    if (
      this.screen !== 'playing' ||
      this.pendingClear ||
      this.inputLocked ||
      this.toolState.clearMode ||
      this.ui.isPauseOpen ||
      this.ui.isSettingsOpen ||
      this.ui.isAdminPanelOpen ||
      this.ui.isRevivePromptOpen
    ) {
      return false;
    }

    const hasMove = this.board.hasAnyValidMove(this.rackPieces);
    if (!hasMove) {
      return this.handleNoMoves();
    }

    return false;
  }

  handleNoMoves() {
    if (this.isAdminModeActive()) {
      const saved = this.consumeRevive();
      if (!saved) {
        this.triggerGameOver();
      }
      return true;
    }

    if (this.reviveCount > 0) {
      this.openRevivePrompt();
      return true;
    }

    this.triggerGameOver();
    return true;
  }

  consumeRevive() {
    const isAdmin = this.isAdminModeActive();

    if (!isAdmin && this.reviveCount <= 0) {
      return false;
    }

    this.clearDrag();
    this.toolState.clearMode = false;
    this.pendingClear = null;
    this.inputLocked = false;
    this.comboState = createComboState();

    this.reviveUsedCount += 1;
    this.syncRoundRuntimeState();

    const result = createRack(this.board, this.activeDifficulty, {
      previousHadSnake: this.lastRackHadSnake
    });

    if (result.success) {
      this.rackPieces = result.pieces;
      this.lastRackHadSnake = !!(result.meta && result.meta.hasSnake);
      this.showNotice(isAdmin ? '管理员模式已继续当前局' : '已使用免死金牌');
      this.closeRevivePrompt();
      this.setScreen('playing');
      return true;
    }

    const removedCells = this.board.clearRandomFilled(REVIVE_CLEAR_COUNT);
    if (removedCells.length > 0) {
      this.placementPulse = removedCells.map((cell) => ({
        row: cell.row,
        col: cell.col,
        remainingTime: PLACEMENT_PULSE_MS
      }));
    }

    const retry = createRack(this.board, this.activeDifficulty, {
      previousHadSnake: this.lastRackHadSnake
    });

    if (!retry.success) {
      return false;
    }

    this.rackPieces = retry.pieces;
    this.lastRackHadSnake = !!(retry.meta && retry.meta.hasSnake);
    this.showNotice(isAdmin ? '管理员模式已继续当前局' : '已使用免死金牌');
    this.closeRevivePrompt();
    this.setScreen('playing');
    return true;
  }

  triggerGameOver() {
    const wasGameOver = this.isGameOver;
    this.clearDrag();
    this.toolState.clearMode = false;
    this.inputLocked = false;
    this.bestScore = this.bestScores[this.activeDifficulty] || this.bestScore;
    this.ui.isPauseOpen = false;
    this.ui.isPauseConfirmOpen = false;
    this.ui.isRevivePromptOpen = false;
    this.pendingRevive = null;
    this.setScreen('gameover');
    if (!wasGameOver) {
      this.emitEvent('gameOver');
    }
  }

  canDragPieces() {
    return (
      this.screen === 'playing' &&
      !this.inputLocked &&
      !this.pendingClear &&
      !this.ui.isSettingsOpen &&
      !this.ui.isPauseOpen &&
      !this.ui.isAdminPanelOpen &&
      !this.ui.isRevivePromptOpen &&
      !this.toolState.clearMode
    );
  }

  canUseTool() {
    return (
      this.screen === 'playing' &&
      !this.inputLocked &&
      !this.pendingClear &&
      !this.ui.isSettingsOpen &&
      !this.ui.isPauseOpen &&
      !this.ui.isAdminPanelOpen &&
      !this.ui.isRevivePromptOpen
    );
  }

  createUndoSnapshot() {
    return {
      boardGrid: this.board.getSnapshot(),
      score: this.score,
      rackPieces: cloneRackPieces(this.rackPieces),
      pendingClear: clonePendingClear(this.pendingClear),
      dragState: { ...this.dragState },
      previewState: { ...this.previewState },
      placementPulse: clonePulseList(this.placementPulse),
      toolState: { ...this.toolState },
      toolUsage: { ...this.toolUsage },
      inputLocked: this.inputLocked,
      activeDifficulty: this.activeDifficulty,
      lastRackHadSnake: this.lastRackHadSnake,
      reviveCount: this.reviveCount,
      reviveUsedCount: this.reviveUsedCount,
      bestScoreEligible: this.bestScoreEligible,
      comboState: this.comboState
        ? {
            comboCount: this.comboState.comboCount,
            lastClearTime: this.comboState.lastClearTime,
            comboWindowMs: this.comboState.comboWindowMs
          }
        : createComboState()
    };
  }

  showNotice(text, duration = 1200) {
    this.notice = {
      text,
      remainingTime: duration
    };
  }

  emitEvent(type, payload = {}) {
    this.events.push({
      type,
      ...payload
    });
  }

  consumeEvents() {
    const items = this.events.slice();
    this.events.length = 0;
    return items;
  }

  clearDrag() {
    this.dragState = createEmptyDragState();
    this.previewState = createEmptyPreviewState();
  }

  getDragFingerOffsetY() {
    const cellSize = this.layout ? this.layout.cellSize : 0;
    return clamp(
      Math.round(cellSize * DRAG_FINGER_OFFSET_MULTIPLIER),
      DRAG_FINGER_OFFSET_MIN,
      DRAG_FINGER_OFFSET_MAX
    );
  }

  getDraggedPieceVisualPosition(pointerX, pointerY, piece, displayCellSize, dragFingerOffsetY) {
    const pieceWidth = (piece && piece.bounds ? piece.bounds.width : 0) * displayCellSize;
    const pieceHeight = (piece && piece.bounds ? piece.bounds.height : 0) * displayCellSize;

    return {
      x: pointerX - pieceWidth / 2,
      y: pointerY - pieceHeight - dragFingerOffsetY
    };
  }

  getDraggedPieceBoardPlacement(visualX, visualY, piece) {
    const boardRect = this.layout.boardRect;
    const cellSize = this.layout.cellSize;
    const row = Math.round((visualY - boardRect.y) / cellSize);
    const col = Math.round((visualX - boardRect.x) / cellSize);

    return {
      row,
      col,
      canPlace: this.board.canPlace(piece.cells, row, col)
    };
  }

  buildCurrentToolState(preserveClearMode) {
    const difficulty = normalizeDifficulty(this.activeDifficulty || this.settings.difficulty);
    const base = DIFFICULTY_TOOL_COUNTS[difficulty] || DIFFICULTY_TOOL_COUNTS.normal;
    const clearMode = preserveClearMode && this.toolState ? this.toolState.clearMode : false;

    if (this.adminModeEnabled) {
      return {
        refreshCount: Infinity,
        clearCount: Infinity,
        undoCount: Infinity,
        clearMode
      };
    }

    return {
      refreshCount: Math.max(0, base.refreshCount - this.toolUsage.refresh),
      clearCount: Math.max(0, base.clearCount - this.toolUsage.clear),
      undoCount: Math.max(0, base.undoCount - this.toolUsage.undo),
      clearMode
    };
  }

  getRoundReviveAllowance() {
    if (this.adminModeEnabled) {
      return Infinity;
    }

    const base = this.settings.localMembershipEnabled ? 2 : 0;
    return Math.max(0, base - this.reviveUsedCount);
  }

  syncRoundRuntimeState() {
    this.toolState = this.buildCurrentToolState(true);
    this.reviveCount = this.getRoundReviveAllowance();
  }

  async submitAdminCode() {
    if (!DEBUG_CODE_ENABLED) {
      this.adminError = '当前版本不可用';
      return false;
    }

    this.enableAdminMode();
    this.closeAdminPanel();
    this.showNotice('管理员模式已开启');
    return true;
  }

  submitMembershipCode() {
    const normalizedInput = normalizeMembershipCode(this.membershipInput);
    const hasMatch = MEMBERSHIP_CODES.some((code) => normalizeMembershipCode(code) === normalizedInput);

    if (!normalizedInput || !hasMatch) {
      this.membershipError = '会员码无效';
      return false;
    }

    this.enableLocalMembership();
    this.closeMembershipPanel();
    this.showNotice('会员已开启');
    return true;
  }

  verifyAdminCode(value) {
    return DEBUG_CODE_ENABLED && !!this.authState.isAdminAllowed;
  }

  enableAdminMode() {
    if (this.adminModeEnabled || !this.authState.isAdminAllowed) {
      if (!this.authState.isAdminAllowed) {
        this.adminError = '验证失败';
      }
      return;
    }

    this.adminModeEnabled = true;
    if (this.screen === 'playing') {
      this.bestScoreEligible = false;
      this.syncRoundRuntimeState();
    }
  }

  isAdminModeActive() {
    return !!this.adminModeEnabled;
  }

  getAdminStatusLabel() {
    return this.adminModeEnabled ? '已开启' : '未开启';
  }

  getLoginStatusLabel() {
    return this.authState.loggedIn ? '已登录' : '未登录';
  }

  getMemberStatusLabel() {
    return this.settings.localMembershipEnabled ? '已开启' : '未开启';
  }

  getMembershipBenefitLabel() {
    if (!this.settings.localMembershipEnabled) {
      return '';
    }

    return '每局 2 次免死';
  }

  getAdminAllowedStatusLabel() {
    return this.authState.isAdminAllowed ? '可用' : '不可用';
  }

  getBackendStatusLabel() {
    return this.authState.backendHealthy ? '正常' : '异常';
  }

  getLoginErrorLabel() {
    return this.authState.loginError ? this.authState.loginError : '无';
  }

  getReviveCountLabel() {
    return this.reviveCount === Infinity ? '无限' : String(this.reviveCount);
  }

  getToolCountLabel(value) {
    return value === Infinity ? '∞' : String(value);
  }

  getGameOverExtraText() {
    if (this.reviveUsedCount <= 0) {
      return '';
    }

    return `已使用免死：${this.reviveUsedCount} 次`;
  }
}
