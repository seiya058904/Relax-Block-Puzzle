import { createCanvasSizeController } from './render.js';
import GameState from './game/GameState.js';
import Renderer from './game/Renderer.js';
import InputManager from './game/InputManager.js';
import SoundManager from './game/SoundManager.js';
import { advanceUiMotion, hasActiveFeedback, hasActiveUiMotion } from './game/FeedbackState.js';
import { shouldScheduleFrame } from './RenderScheduler.js';
import { loadSettings, saveSettings } from './utils/storage.js';

export default class Main {
  constructor() {
    GameGlobal.canvas = wx.createCanvas();
    const ctx = canvas.getContext('2d');
    this.canvasSize = createCanvasSizeController(canvas, ctx);
    const metrics = this.canvasSize.refresh();
    this.aniId = 0;
    this.lastTimestamp = 0;
    this.appLifecycleBound = false;
    this.isPaused = false;
    this.isRendering = false;
    this.needsRender = true;
    this.gameState = new GameState();
    this.settings = loadSettings();
    this.gameState.setSettings(this.settings);
    this.soundManager = new SoundManager();
    this.soundManager.setSettings(this.settings);
    this.renderer = new Renderer(ctx, metrics.screenInfo, metrics.safeAreaInfo);
    this.inputManager = new InputManager(
      this.gameState,
      this.renderer,
      this.soundManager,
      this.applySettings.bind(this),
      this.requestImmediateRender.bind(this),
      this.ensureFrame.bind(this)
    );

    this.bindAppLifecycle();
    if (wx.onWindowResize) wx.onWindowResize(() => this.handleViewportChange());
    this.start();
  }

  start() {
    if (this.isPaused) {
      return;
    }

    this.ensureFrame();
  }

  applySettings(nextSettings) {
    this.settings = {
      ...this.settings,
      ...nextSettings
    };
    this.gameState.setSettings(this.settings);
    saveSettings(this.settings);
    this.soundManager.setSettings(this.settings);
    this.markDirty();
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

    window.ANDROID_APP_BACKGROUND = () => {
      this.handleAppBackground();
    };
    window.ANDROID_APP_FOREGROUND = () => {
      this.handleAppForeground();
    };
  }

  triggerVibration() {
    if (!this.settings.vibrationEnabled || !wx.vibrateShort) {
      return;
    }

    try {
      wx.vibrateShort({ type: 'light' });
    } catch (error) {
      try {
        wx.vibrateShort();
      } catch (innerError) {
        // Ignore vibration failures on unsupported environments.
      }
    }
  }

  update(deltaTime) {
    if (this.isPaused) {
      return;
    }

    this.gameState.update(deltaTime);
  }

  consumeGameEvents() {
    const events = this.gameState.consumeEvents();
    events.forEach((event) => {
      switch (event.type) {
        case 'pickup':
          this.soundManager.playPickup();
          break;
        case 'place':
          this.soundManager.playPlace();
          this.triggerVibration();
          break;
        case 'invalid':
          this.soundManager.playInvalid();
          this.triggerVibration();
          break;
        case 'clear':
          this.soundManager.playClear();
          this.triggerVibration();
          break;
        case 'combo':
          this.soundManager.playCombo();
          this.triggerVibration();
          break;
        case 'combo3':
          this.soundManager.playCombo3();
          this.triggerVibration();
          break;
        case 'gameOver':
          this.soundManager.playGameOver();
          break;
        default:
          break;
      }
    });
  }

  render() {
    this.inputManager.reconcileInputSession();
    if (this.isRendering) {
      return;
    }

    this.isRendering = true;
    try {
      this.renderer.render(this.gameState);
    } finally {
      this.isRendering = false;
    }
  }

  markDirty() {
    this.needsRender = true;
  }

  hasActiveAnimation() {
    return hasActiveUiMotion(this.gameState.feedbackState) || (
      this.gameState.canAdvanceTime() && !!(
        this.gameState.dragState.isDragging ||
        this.gameState.pendingClear ||
        (this.gameState.placementPulse && this.gameState.placementPulse.length > 0) ||
        (this.gameState.notice && this.gameState.screen === 'playing') ||
        hasActiveFeedback(this.gameState.feedbackState)
      )
    );
  }

  requestImmediateRender() {
    if (this.isPaused) {
      return;
    }

    this.inputManager.reconcileInputSession();
    this.consumeGameEvents();
    this.markDirty();
    this.render();
    this.needsRender = false;

    if (this.hasActiveAnimation()) {
      this.ensureFrame();
    } else {
      this.stopLoop();
    }
  }

  ensureFrame() {
    if (this.isPaused || this.aniId) {
      return;
    }

    this.lastTimestamp = 0;
    this.aniId = requestAnimationFrame(this.loop.bind(this));
  }

  stopLoop() {
    if (this.aniId) {
      cancelAnimationFrame(this.aniId);
      this.aniId = 0;
    }
  }

  handleAppBackground() {
    if (this.isPaused) {
      return;
    }

    this.isPaused = true;
    this.inputManager.cancelInputSession();
    this.needsRender = false;
    this.stopLoop();
    this.soundManager.handleAppHide();
  }

  refreshViewport() {
    const metrics = this.canvasSize.refresh();
    if (metrics.changed) this.inputManager.cancelInputSession();
    this.renderer.setViewport(metrics.screenInfo, metrics.safeAreaInfo);
    this.gameState.setLayout(this.renderer.layout);
  }

  handleViewportChange() {
    this.inputManager.cancelInputSession();
    this.markDirty();
    if (this.isPaused) return;
    this.refreshViewport();
    this.requestImmediateRender();
  }

  handleAppForeground() {
    const wasPaused = this.isPaused;
    this.isPaused = false;
    this.refreshViewport();
    if (wasPaused) this.soundManager.handleAppShow();
    this.requestImmediateRender();
  }

  loop(timestamp) {
    this.aniId = 0;
    if (this.isPaused) {
      return;
    }

    if (!this.lastTimestamp) {
      this.lastTimestamp = timestamp;
    }

    this.inputManager.flushPendingInput();
    const animating = this.hasActiveAnimation();
    const deltaTime = Math.min(32, timestamp - this.lastTimestamp);
    this.lastTimestamp = timestamp;

    // UI motion (button press, modal transitions) advances even while a modal
    // freezes gameplay time; Android scheduling relies on hasActiveAnimation.
    advanceUiMotion(this.gameState.feedbackState, deltaTime);

    if (animating) {
      this.update(deltaTime);
    }

    this.consumeGameEvents();

    if (this.needsRender || animating) {
      this.render();
      this.needsRender = false;
    }

    if (shouldScheduleFrame({
      isPaused: this.isPaused,
      needsRender: this.needsRender,
      hasActiveAnimation: this.hasActiveAnimation()
    })) {
      this.aniId = requestAnimationFrame(this.loop.bind(this));
    }
  }
}
