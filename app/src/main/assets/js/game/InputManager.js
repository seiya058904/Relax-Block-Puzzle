export default class InputManager {
  constructor(gameState, renderer, dragOverlay, soundManager, applySettings, requestImmediateRender) {
    this.gameState = gameState;
    this.renderer = renderer;
    this.dragOverlay = dragOverlay;
    this.soundManager = soundManager;
    this.applySettings = applySettings;
    this.requestImmediateRender = requestImmediateRender || (() => {});
    this.homeTitleTapCount = 0;
    this.homeTitleTapStartTime = 0;

    wx.onTouchStart(this.handleTouchStart.bind(this));
    wx.onTouchMove(this.handleTouchMove.bind(this));
    wx.onTouchEnd(this.handleTouchEnd.bind(this));
    wx.onTouchCancel(this.handleTouchEnd.bind(this));
    this.bindKeyboard();
  }

  handleTouchStart(event) {
    const touch = event.touches && event.touches[0];
    if (!touch) {
      return;
    }

    const point = { x: touch.clientX, y: touch.clientY };

    if (this.gameState.ui.isMembershipPanelOpen) {
      this.handleMembershipTouch(point);
      return;
    }

    if (this.gameState.ui.isSettingsOpen) {
      this.handleSettingsTouch(point);
      return;
    }

    if (this.gameState.ui.isAdminPanelOpen) {
      this.handleAdminTouch(point);
      return;
    }

    if (this.gameState.ui.isRevivePromptOpen) {
      this.handleReviveTouch(point);
      return;
    }

    if (this.gameState.ui.isPauseOpen) {
      this.handlePauseTouch(point);
      return;
    }

    if (this.gameState.screen === 'help') {
      this.handleHelpTouch(point);
      return;
    }

    if (this.gameState.screen === 'home') {
      this.handleHomeTouch(point);
      return;
    }

    if (this.gameState.screen === 'gameover') {
      this.handleGameOverTouch(point);
      return;
    }

    if (this.gameState.inputLocked) {
      return;
    }

    if (this.isPointInRect(point, this.renderer.settingsButtonRect)) {
      this.soundManager.playClick();
      this.gameState.openSettings();
      return;
    }

    if (this.isPointInRect(point, this.renderer.pauseButtonRect)) {
      this.soundManager.playClick();
      this.gameState.openPause();
      return;
    }

    const toolAction = this.renderer.getToolAction(point.x, point.y);
    if (toolAction) {
      this.handleToolTouch(toolAction);
      return;
    }

    if (this.gameState.toolState.clearMode) {
      const boardCell = this.renderer.getBoardCellAt(point.x, point.y);
      if (boardCell) {
        this.gameState.useClearTool(boardCell.row, boardCell.col);
      } else {
        this.gameState.cancelClearMode();
      }
      return;
    }

    const hitArea = this.renderer.getRackHitArea(point.x, point.y);
    if (hitArea) {
      if (this.gameState.startDrag(hitArea.index, point.x, point.y, hitArea)) {
        const piece = this.gameState.rackPieces[hitArea.index];
        const dragState = this.gameState.dragState;
        this.dragOverlay.show(
          piece,
          dragState.displayCellSize,
          dragState.pointerX,
          dragState.pointerY,
          dragState.dragFingerOffsetY
        );
        this.requestImmediateRender();
      }
    }
  }

  handleTouchMove(event) {
    const touch = event.touches && event.touches[0];
    if (
      !touch ||
      this.gameState.inputLocked ||
      this.gameState.screen !== 'playing' ||
      this.gameState.ui.isSettingsOpen ||
      this.gameState.ui.isAdminPanelOpen ||
      this.gameState.ui.isRevivePromptOpen ||
      this.gameState.ui.isPauseOpen ||
      this.gameState.toolState.clearMode
    ) {
      return;
    }

    this.gameState.moveDrag(touch.clientX, touch.clientY);
    this.dragOverlay.moveTo(
      this.gameState.dragState.pointerX,
      this.gameState.dragState.pointerY,
      this.gameState.dragState.dragFingerOffsetY
    );
  }

  handleTouchEnd(event) {
    if (
      this.gameState.inputLocked ||
      this.gameState.screen !== 'playing' ||
      this.gameState.ui.isSettingsOpen ||
      this.gameState.ui.isAdminPanelOpen ||
      this.gameState.ui.isRevivePromptOpen ||
      this.gameState.ui.isPauseOpen ||
      this.gameState.toolState.clearMode
    ) {
      return;
    }

    const touch =
      (event && event.changedTouches && event.changedTouches[0]) ||
      (event && event.touches && event.touches[0]);

    if (touch && this.gameState.dragState.isDragging) {
      this.gameState.moveDrag(touch.clientX, touch.clientY);
      this.dragOverlay.moveTo(
        this.gameState.dragState.pointerX,
        this.gameState.dragState.pointerY,
        this.gameState.dragState.dragFingerOffsetY
      );
    }

    this.gameState.endDrag();
    this.dragOverlay.hide();
    this.requestImmediateRender();
  }

  handleHomeTouch(point) {
    if (this.isPointInRect(point, this.renderer.homeTitleRect)) {
      this.handleHomeTitleSecretTap();
      return;
    }

    const action = this.renderer.getHomeAction(point.x, point.y);
    if (!action) {
      return;
    }

    this.soundManager.playClick();

    if (action === 'difficulty') {
      const nextDifficulty = this.gameState.cycleDifficulty();
      this.applySettings({
        ...this.gameState.settings,
        difficulty: nextDifficulty
      });
      return;
    }

    if (action === 'start') {
      this.gameState.startNewGame();
      return;
    }

    if (action === 'help') {
      this.gameState.openHelp();
      return;
    }

    if (action === 'settings') {
      this.gameState.openSettings();
    }
  }

  handleHomeTitleSecretTap() {
    const now = Date.now();
    if (!this.homeTitleTapStartTime || now - this.homeTitleTapStartTime > 2200) {
      this.homeTitleTapStartTime = now;
      this.homeTitleTapCount = 0;
    }

    this.homeTitleTapCount += 1;

    if (this.homeTitleTapCount >= 7) {
      this.homeTitleTapCount = 0;
      this.homeTitleTapStartTime = 0;
      if (this.gameState.openAdminPanel()) {
        this.soundManager.playClick();
      }
    }
  }

  handleHelpTouch(point) {
    const action = this.renderer.getHelpAction(point.x, point.y);
    if (action === 'close') {
      this.soundManager.playClick();
      this.gameState.closeHelp();
    }
  }

  handleGameOverTouch(point) {
    if (this.isPointInRect(point, this.renderer.restartButtonRect)) {
      this.soundManager.playClick();
      this.gameState.startNewGame();
    }
  }

  handlePauseTouch(point) {
    const action = this.renderer.getPauseAction(point.x, point.y);
    if (!action) {
      return;
    }

    this.soundManager.playClick();

    if (action === 'continue') {
      if (this.gameState.ui.isPauseConfirmOpen) {
        this.gameState.cancelReturnHome();
      } else {
        this.gameState.closePause();
      }
      return;
    }

    if (action === 'restart') {
      this.gameState.closePause();
      this.gameState.startNewGame();
      return;
    }

    if (action === 'home') {
      this.gameState.requestReturnHome();
      return;
    }

    if (action === 'cancelHome') {
      this.gameState.cancelReturnHome();
      return;
    }

    if (action === 'confirmHome') {
      this.gameState.confirmReturnHome();
    }
  }

  handleReviveTouch(point) {
    const action = this.renderer.getReviveAction(point.x, point.y);
    if (!action) {
      return;
    }

    this.soundManager.playClick();

    if (action === 'use') {
      this.gameState.acceptRevive();
      return;
    }

    if (action === 'giveUp') {
      this.gameState.declineRevive();
    }
  }

  handleAdminTouch(point) {
    const action = this.renderer.getAdminAction(point.x, point.y);
    if (!action) {
      return;
    }

    this.soundManager.playClick();

    if (action === 'cancel') {
      this.gameState.closeAdminPanel();
      return;
    }

    if (action === 'confirm') {
      this.gameState.submitAdminCode();
    }
  }

  handleMembershipTouch(point) {
    const action = this.renderer.getMembershipAction(point.x, point.y);
    if (!action) {
      return;
    }

    if (action === 'input') {
      this.openMembershipKeyboard();
      return;
    }

    this.soundManager.playClick();

    if (action === 'cancel') {
      this.gameState.closeMembershipPanel();
      return;
    }

    if (action === 'confirm') {
      this.gameState.submitMembershipCode();
    }
  }

  handleToolTouch(action) {
    if (action === 'refresh') {
      if (this.gameState.useRefreshTool()) {
        this.soundManager.playClick();
      }
      return;
    }

    if (action === 'clear') {
      const result = this.gameState.toggleClearTool();
      if (result !== 'failed') {
        this.soundManager.playClick();
      }
      return;
    }

    if (action === 'undo' && this.gameState.useUndoTool()) {
      this.soundManager.playClick();
    }
  }

  handleSettingsTouch(point) {
    const action = this.renderer.getSettingsAction(point.x, point.y);
    if (!action) {
      return;
    }

    if (action === 'continue') {
      this.soundManager.playClick();
      this.gameState.closeSettings();
      return;
    }

    if (action === 'reset') {
      this.soundManager.playClick();
      this.gameState.requestResetBestScore();
      return;
    }

    if (action === 'cancelReset') {
      this.soundManager.playClick();
      this.gameState.cancelResetBestScore();
      return;
    }

    if (action === 'confirmReset') {
      this.soundManager.playClick();
      this.gameState.confirmResetBestScore();
      return;
    }

    const nextSettings = { ...this.gameState.settings };

    if (action === 'difficulty') {
      nextSettings.difficulty = this.gameState.cycleDifficulty();
    } else if (action === 'sound') {
      nextSettings.soundEnabled = !nextSettings.soundEnabled;
    } else if (action === 'bgm') {
      nextSettings.bgmEnabled = !nextSettings.bgmEnabled;
    } else if (action === 'bgmTrack') {
      nextSettings.bgmTrack = (Number(nextSettings.bgmTrack) % 4) + 1;
    } else if (action === 'vibration') {
      nextSettings.vibrationEnabled = !nextSettings.vibrationEnabled;
    } else if (action === 'openMembership') {
      this.soundManager.playClick();
      this.gameState.openMembershipPanel();
      return;
    } else if (action === 'disableMembership') {
      this.soundManager.playClick();
      this.gameState.disableLocalMembership();
      this.gameState.showNotice('本地会员已关闭');
      return;
    } else if (action === 'disableAdmin') {
      this.soundManager.playClick();
      this.gameState.disableAdminMode();
      return;
    } else {
      return;
    }

    this.soundManager.playClick();
    this.applySettings(nextSettings);
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

  bindKeyboard() {
    if (!wx.onKeyboardInput || !wx.onKeyboardConfirm) {
      return;
    }

    wx.onKeyboardInput((event) => {
      if (this.gameState.ui.isMembershipPanelOpen) {
        this.gameState.setMembershipInput(event.value || '');
        return;
      }
    });

    wx.onKeyboardConfirm((event) => {
      if (this.gameState.ui.isMembershipPanelOpen) {
        this.gameState.setMembershipInput(event.value || '');
        return;
      }
    });

    if (wx.onKeyboardComplete) {
      wx.onKeyboardComplete((event) => {
        if (this.gameState.ui.isMembershipPanelOpen) {
          this.gameState.setMembershipInput(event.value || '');
          return;
        }
      });
    }
  }

  openMembershipKeyboard() {
    if (!wx.showKeyboard) {
      return;
    }

    try {
      wx.showKeyboard({
        defaultValue: this.gameState.membershipInput || '',
        maxLength: 32,
        confirmHold: true,
        confirmType: 'done'
      });
    } catch (error) {
      // Ignore environments without keyboard support.
    }
  }
}
