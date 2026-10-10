import { getFeedbackCue } from './game/Presentation.js';
import { canvasSize } from './render.js';
import GameState from './game/GameState.js';
import Renderer from './game/Renderer.js';
import InputManager from './game/InputManager.js';
import SoundManager from './game/SoundManager.js';
import { advanceUiMotion, hasActiveFeedback, hasActiveUiMotion } from './game/FeedbackState.js';
import AuthClient, { initCloud } from './api/AuthClient.js';
import { loadSettings, saveSettings } from './utils/storage.js';

const ctx = canvas.getContext('2d');

export default class Main {
  constructor() {
    this.aniId = 0;
    this.lastTimestamp = 0;
    this.appLifecycleBound = false;
    this.isPaused = false;
    this.needsRender = true;
    this.canvasSize = canvasSize;
    initCloud();
    this.gameState = new GameState();
    this.gameState.onBestScoreUpdated = () => this.requestRender();
    this.authClient = new AuthClient();
    this.gameState.setAuthClient(this.authClient);
    this.settings = loadSettings();
    this.gameState.setSettings(this.settings);
    this.soundManager = new SoundManager();
    this.soundManager.setSettings(this.settings);
    const metrics = this.canvasSize.refresh();
    this.renderer = new Renderer(ctx, metrics.screenInfo, metrics.safeAreaInfo);
    this.inputManager = new InputManager(
      this.gameState,
      this.renderer,
      this.soundManager,
      this.applySettings.bind(this),
      this.requestRender.bind(this)
    );

    this.bindAppLifecycle();
    wx.onWindowResize?.(() => this.handleViewportChange());
    this.renderer.render(this.gameState);
    this.start();
    this.initializeAuth().finally(() => this.requestRender());
  }

  start() {
    this.requestRender();
  }

  async initializeAuth() {
    try {
      const result = await this.authClient.healthCheck();
      this.gameState.setBackendHealth(!!(result && result.ok));
    } catch (error) {
      this.gameState.setBackendHealth(false);
      this.gameState.setLoginError((error && (error.safeMessage || error.message)) || 'healthCheck failed');
      // Backend health check failure should not block local gameplay.
    }

    try {
      await this.gameState.trySilentLogin();
    } catch (error) {
      this.gameState.setLoginError((error && (error.safeMessage || error.message)) || 'login failed');
      // Login failure should not block local gameplay.
    }
  }

  applySettings(nextSettings) {
    this.settings = {
      ...this.settings,
      ...nextSettings
    };
    this.gameState.setSettings(this.settings);
    saveSettings(this.settings);
    this.soundManager.setSettings(this.settings);
    this.requestRender();
  }

  bindAppLifecycle() {
    if (this.appLifecycleBound) {
      return;
    }

    this.appLifecycleBound = true;

    if (wx.onHide) {
      wx.onHide(() => {
        this.handleAppBackground();
      });
    }

    if (wx.onShow) {
      wx.onShow(() => {
        this.handleAppForeground();
      });
    }
  }

  triggerVibration(type = 'light') {
    if (!this.settings.vibrationEnabled || !wx.vibrateShort) {
      return;
    }

    try {
      wx.vibrateShort({ type });
    } catch (error) {
      try {
        wx.vibrateShort();
      } catch (innerError) {
        // Ignore vibration failures on unsupported environments.
      }
    }
  }

  update(deltaTime) {
    if (this.isPaused || this.gameState.viewportBlocked) return;
    this.inputManager.flushPendingInput();
    this.gameState.update(deltaTime);
    // UI motion (button press, modal transitions) advances independently of
    // gameplay freeze rules so open modals can still animate.
    advanceUiMotion(this.gameState.feedbackState, deltaTime);
    this.consumeGameEvents();
  }

  consumeGameEvents() {
    const events = this.gameState.consumeEvents();
    events.forEach((event) => {
      const cue = getFeedbackCue(event);
      if (!cue) return;
      this.soundManager[cue.sound]();
      if (cue.vibration) this.triggerVibration(cue.vibration);
    });
  }

  render() {
    this.inputManager.reconcileInputSession();
    this.renderer.render(this.gameState);
  }

  requestRender() {
    this.needsRender = true;
    this.ensureFrame();
  }

  requestImmediateRender() {
    if (this.isPaused) return;
    this.consumeGameEvents();
    this.render();
    this.needsRender = false;
    if (this.hasActiveAnimation()) this.ensureFrame();
    else this.stopLoop();
  }

  hasActiveAnimation() {
    if (this.gameState.viewportBlocked) return false;
    return hasActiveUiMotion(this.gameState.feedbackState) || (this.gameState.canAdvanceTime() && !!(
      this.gameState.dragState.isDragging || this.gameState.pendingClear || this.gameState.placementPulse.length ||
      this.gameState.notice || hasActiveFeedback(this.gameState.feedbackState)
    ));
  }

  ensureFrame() {
    if (this.isPaused || this.aniId) return;
    this.lastTimestamp = 0;
    this.aniId = requestAnimationFrame(this.loop.bind(this));
  }

  stopLoop() {
    if (this.aniId) cancelAnimationFrame(this.aniId);
    this.aniId = 0;
  }

  handleAppBackground() {
    if (this.isPaused) return;
    this.isPaused = true;
    this.gameState.setLifecyclePaused(true);
    this.inputManager.cancelInputSession();
    this.gameState.consumeEvents();
    this.stopLoop();
    this.soundManager.handleAppHide();
  }

  handleViewportChange() {
    this.inputManager.cancelInputSession();
    this.needsRender = true;
    if (this.isPaused) return;
    const metrics = this.canvasSize.refresh();
    this.renderer.setViewport(metrics.screenInfo, metrics.safeAreaInfo);
    this.gameState.setLayout(this.renderer.layout);
    this.requestImmediateRender();
  }

  handleAppForeground() {
    const wasPaused = this.isPaused;
    this.isPaused = false;
    this.gameState.setLifecyclePaused(false);
    this.gameState.retryBestScoreRefresh();
    if (wasPaused) this.soundManager.handleAppShow();
    this.handleViewportChange();
  }

  loop(timestamp) {
    this.aniId = 0;
    if (this.isPaused) return;
    if (!this.lastTimestamp) {
      this.lastTimestamp = timestamp;
    }

    const deltaTime = Math.min(32, timestamp - this.lastTimestamp);
    this.lastTimestamp = timestamp;

    const animating = this.hasActiveAnimation();
    this.update(deltaTime);
    if (this.needsRender || animating) {
      this.render();
      this.needsRender = false;
    }

    if (this.needsRender || this.hasActiveAnimation()) {
      this.aniId = requestAnimationFrame(this.loop.bind(this));
    }
  }
}
