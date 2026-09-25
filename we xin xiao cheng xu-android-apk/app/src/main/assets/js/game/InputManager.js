import { createFrameInputQueue } from './FrameInputQueue.js';
import { triggerUiPress } from './FeedbackState.js';

export default class InputManager {
  constructor(gameState, renderer, soundManager, applySettings, requestImmediateRender, requestInputFrame) {
    this.gameState = gameState;
    this.renderer = renderer;
    this.soundManager = soundManager;
    this.applySettings = applySettings;
    this.requestImmediateRender = requestImmediateRender || (() => {});
    this.requestInputFrame = requestInputFrame || (() => {});
    this.inputQueue = createFrameInputQueue(this.requestInputFrame);
    this.activeTouchIdentifier = null;
    this.homeTitleTapCount = 0;
    this.homeTitleTapStartTime = 0;

    wx.onTouchStart(this.handleTouchStart.bind(this));
    wx.onTouchMove(this.handleTouchMove.bind(this));
    wx.onTouchEnd(this.handleTouchEnd.bind(this));
    wx.onTouchCancel(this.handleTouchCancel.bind(this));
    this.bindKeyboard();
  }

  handleTouchStart(event) {
    this.reconcileInputSession();
    if (this.activeTouchIdentifier !== null) return;
    const touch = (event.changedTouches && event.changedTouches[0]) || (event.touches && event.touches[0]);
    if (!touch || touch.identifier == null) {
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
      triggerUiPress(this.gameState.feedbackState, 'hud:settings');
      this.soundManager.playClick();
      this.gameState.openSettings();
      this.requestImmediateRender();
      return;
    }

    if (this.isPointInRect(point, this.renderer.pauseButtonRect)) {
      triggerUiPress(this.gameState.feedbackState, 'hud:pause');
      this.soundManager.playClick();
      this.gameState.openPause();
      this.requestImmediateRender();
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
      this.requestImmediateRender();
      return;
    }

    const hitArea = this.renderer.getRackHitArea(point.x, point.y);
    if (hitArea) {
      if (this.gameState.startDrag(hitArea.index, point.x, point.y, hitArea)) {
        this.activeTouchIdentifier = touch.identifier;
        this.requestImmediateRender();
      }
    }
  }

  canContinueInputSession() {
    return this.gameState.dragState.isDragging && !this.gameState.inputLocked &&
      this.gameState.screen === 'playing' &&
      !this.gameState.ui.isSettingsOpen && !this.gameState.ui.isAdminPanelOpen &&
      !this.gameState.ui.isMembershipPanelOpen && !this.gameState.ui.isRevivePromptOpen &&
      !this.gameState.ui.isPauseOpen && !this.gameState.toolState.clearMode;
  }

  reconcileInputSession() {
    if (this.activeTouchIdentifier !== null && !this.canContinueInputSession()) {
      this.cancelInputSession();
    }
  }

  cancelInputSession() {
    const hadSession = this.activeTouchIdentifier !== null || this.gameState.dragState.isDragging;
    this.activeTouchIdentifier = null;
    this.inputQueue.clear();
    if (hadSession) this.gameState.cancelDrag();
  }

  findOwnedTouch(touches) {
    return Array.from(touches || []).find((touch) => touch.identifier === this.activeTouchIdentifier);
  }

  handleTouchMove(event) {
    this.reconcileInputSession();
    if (this.activeTouchIdentifier === null) return;
    const touch = this.findOwnedTouch(event.touches);
    if (touch) this.inputQueue.push({ x: touch.clientX, y: touch.clientY });
  }

  handleTouchEnd(event) {
    this.reconcileInputSession();
    if (this.activeTouchIdentifier === null) return;
    const touch = this.findOwnedTouch(event && event.changedTouches);
    if (!touch) {
      // A known other finger ending must not end this session.
      if (event && event.changedTouches && event.changedTouches.length &&
        Array.from(event.changedTouches).every((item) => item.identifier != null)) return;
      this.cancelInputSession();
      this.requestImmediateRender();
      return;
    }
    this.inputQueue.push({ x: touch.clientX, y: touch.clientY });
    this.flushPendingInput();
    this.activeTouchIdentifier = null;
    this.gameState.endDrag();
    this.requestImmediateRender();
  }

  handleTouchCancel(event) {
    if (this.activeTouchIdentifier === null) return;
    if (event && event.changedTouches && event.changedTouches.length &&
      !this.findOwnedTouch(event.changedTouches) &&
      Array.from(event.changedTouches).every((item) => item.identifier != null)) return;
    this.cancelInputSession();
    this.requestImmediateRender();
  }

  flushPendingInput() {
    this.reconcileInputSession();
    if (this.activeTouchIdentifier === null) {
      this.inputQueue.clear();
      return;
    }
    this.inputQueue.flush(({ x, y }) => {
      this.gameState.moveDrag(x, y);
    });
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

    triggerUiPress(this.gameState.feedbackState, `home:${action}`);
    this.soundManager.playClick();

    if (action === 'difficulty') {
      const nextDifficulty = this.gameState.cycleDifficulty();
      this.applySettings({
        ...this.gameState.settings,
        difficulty: nextDifficulty
      });
      this.requestImmediateRender();
      return;
    }

    if (action === 'start') {
      this.gameState.startNewGame();
      this.requestImmediateRender();
      return;
    }

    if (action === 'help') {
      this.gameState.openHelp();
      this.requestImmediateRender();
      return;
    }

    if (action === 'settings') {
      this.gameState.openSettings();
      this.requestImmediateRender();
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
        this.requestImmediateRender();
      }
    }
  }

  handleHelpTouch(point) {
    const action = this.renderer.getHelpAction(point.x, point.y);
    if (action === 'close') {
      triggerUiPress(this.gameState.feedbackState, 'help:close');
      this.soundManager.playClick();
      this.gameState.closeHelp();
      this.requestImmediateRender();
    }
  }

  handleGameOverTouch(point) {
    if (this.isPointInRect(point, this.renderer.restartButtonRect)) {
      triggerUiPress(this.gameState.feedbackState, 'gameover:restart');
      this.soundManager.playClick();
      this.gameState.startNewGame();
      this.requestImmediateRender();
    }
  }

  handlePauseTouch(point) {
    const action = this.renderer.getPauseAction(point.x, point.y);
    if (!action) {
      return;
    }

    triggerUiPress(this.gameState.feedbackState, `pause:${action}`);
    this.soundManager.playClick();

    if (action === 'continue') {
      if (this.gameState.ui.isPauseConfirmOpen) {
        this.gameState.cancelReturnHome();
      } else {
        this.gameState.closePause();
      }
      this.requestImmediateRender();
      return;
    }

    if (action === 'restart') {
      this.gameState.closePause();
      this.gameState.startNewGame();
      this.requestImmediateRender();
      return;
    }

    if (action === 'home') {
      this.gameState.requestReturnHome();
      this.requestImmediateRender();
      return;
    }

    if (action === 'cancelHome') {
      this.gameState.cancelReturnHome();
      this.requestImmediateRender();
      return;
    }

    if (action === 'confirmHome') {
      this.gameState.confirmReturnHome();
      this.requestImmediateRender();
    }
  }

  handleReviveTouch(point) {
    const action = this.renderer.getReviveAction(point.x, point.y);
    if (!action) {
      return;
    }

    triggerUiPress(this.gameState.feedbackState, `revive:${action}`);
    this.soundManager.playClick();

    if (action === 'use') {
      this.gameState.acceptRevive();
      this.requestImmediateRender();
      return;
    }

    if (action === 'giveUp') {
      this.gameState.declineRevive();
      this.requestImmediateRender();
    }
  }

  handleAdminTouch(point) {
    const action = this.renderer.getAdminAction(point.x, point.y);
    if (!action) {
      return;
    }

    triggerUiPress(this.gameState.feedbackState, `admin:${action}`);
    this.soundManager.playClick();

    if (action === 'cancel') {
      this.gameState.closeAdminPanel();
      this.requestImmediateRender();
      return;
    }

    if (action === 'confirm') {
      this.gameState.submitAdminCode();
      this.requestImmediateRender();
    }
  }

  handleMembershipTouch(point) {
    const key = this.renderer.getMembershipKeyHit(point.x, point.y);
    if (key) {
      triggerUiPress(this.gameState.feedbackState, `membership:key:${key}`);
      this.handleMembershipKey(key);
      this.requestImmediateRender();
      return;
    }

    const action = this.renderer.getMembershipAction(point.x, point.y);
    if (!action) {
      return;
    }

    if (action === 'input') {
      this.openMembershipKeyboard();
      return;
    }

    triggerUiPress(this.gameState.feedbackState, `membership:${action}`);
    this.soundManager.playClick();

    if (action === 'cancel') {
      this.gameState.closeMembershipPanel();
      if (wx.hideKeyboard) { wx.hideKeyboard(); }
      this.requestImmediateRender();
      return;
    }

    if (action === 'confirm') {
      this.gameState.submitMembershipCode();
      if (wx.hideKeyboard) { wx.hideKeyboard(); }
      this.requestImmediateRender();
    }
  }

  handleMembershipKey(key) {
    this.soundManager.playClick();
    if (key === 'DEL') {
      const v = this.gameState.membershipInput || '';
      this.gameState.setMembershipInput(v.slice(0, -1));
    } else {
      const v = this.gameState.membershipInput || '';
      if (v.length < 32) {
        this.gameState.setMembershipInput(v + key);
      }
    }
  }

  handleToolTouch(action) {
    triggerUiPress(this.gameState.feedbackState, `tool:${action}`);

    if (action === 'refresh') {
      if (this.gameState.useRefreshTool()) {
        this.soundManager.playClick();
      }
      this.requestImmediateRender();
      return;
    }

    if (action === 'clear') {
      const result = this.gameState.toggleClearTool();
      if (result !== 'failed') {
        this.soundManager.playClick();
      }
      this.requestImmediateRender();
      return;
    }

    if (action === 'undo') {
      if (this.gameState.useUndoTool()) {
        this.soundManager.playClick();
      }
      this.requestImmediateRender();
    }
  }

  handleSettingsTouch(point) {
    const action = this.renderer.getSettingsAction(point.x, point.y);
    if (!action) {
      return;
    }

    if (action === 'tab:game' || action === 'tab:account') {
      triggerUiPress(this.gameState.feedbackState, `settings:${action}`);
      this.soundManager.playClick();
      this.gameState.setSettingsTab(action === 'tab:account' ? 'account' : 'game');
      this.requestImmediateRender();
      this.requestImmediateRender();
      return;
    }

    triggerUiPress(this.gameState.feedbackState, `settings:${action}`);

    if (action === 'continue') {
      this.soundManager.playClick();
      this.gameState.closeSettings();
      this.requestImmediateRender();
      return;
    }

    if (action === 'reset') {
      this.soundManager.playClick();
      this.gameState.requestResetBestScore();
      this.requestImmediateRender();
      return;
    }

    if (action === 'cancelReset') {
      this.soundManager.playClick();
      this.gameState.cancelResetBestScore();
      this.requestImmediateRender();
      return;
    }

    if (action === 'confirmReset') {
      this.soundManager.playClick();
      this.gameState.confirmResetBestScore();
      this.requestImmediateRender();
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
      this.requestImmediateRender();
      return;
    } else if (action === 'disableMembership') {
      this.soundManager.playClick();
      this.gameState.disableLocalMembership();
      this.gameState.showNotice('本地会员已关闭');
      this.requestImmediateRender();
      return;
    } else if (action === 'disableAdmin') {
      this.soundManager.playClick();
      this.gameState.disableAdminMode();
      this.requestImmediateRender();
      return;
    } else {
      return;
    }

    this.soundManager.playClick();
    this.applySettings(nextSettings);
    this.requestImmediateRender();
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
      const inputRect = this.renderer.membershipActionRects && this.renderer.membershipActionRects.input;
      wx.showKeyboard({
        defaultValue: this.gameState.membershipInput || '',
        maxLength: 32,
        confirmHold: true,
        confirmType: 'done',
        inputRect: inputRect || undefined
      });
    } catch (error) {
      // Ignore environments without keyboard support.
    }
  }
}
