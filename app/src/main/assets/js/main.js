import './render.js';
import { DEVICE_PIXEL_RATIO, MENU_BUTTON, SCREEN_HEIGHT, SCREEN_WIDTH, SAFE_AREA } from './render.js';
import GameState from './game/GameState.js';
import Renderer from './game/Renderer.js';
import InputManager from './game/InputManager.js';
import SoundManager from './game/SoundManager.js';
import { loadSettings, saveSettings } from './utils/storage.js';

const ctx = canvas.getContext('2d');
ctx.setTransform(DEVICE_PIXEL_RATIO, 0, 0, DEVICE_PIXEL_RATIO, 0, 0);
ctx.imageSmoothingEnabled = true;

export default class Main {
  constructor() {
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
    this.renderer = new Renderer(
      ctx,
      {
        screenWidth: SCREEN_WIDTH,
        screenHeight: SCREEN_HEIGHT
      },
      {
        menuButton: MENU_BUTTON,
        safeArea: SAFE_AREA
      }
    );
    this.inputManager = new InputManager(
      this.gameState,
      this.renderer,
      this.soundManager,
      this.applySettings.bind(this),
      this.requestImmediateRender.bind(this)
    );

    this.bindAppLifecycle();
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
    return !!(
      this.gameState.dragState.isDragging ||
      this.gameState.pendingClear ||
      (this.gameState.placementPulse && this.gameState.placementPulse.length > 0) ||
      (this.gameState.notice && this.gameState.screen === 'playing')
    );
  }

  requestImmediateRender() {
    if (this.isPaused) {
      return;
    }

    this.markDirty();
    this.render();
    this.needsRender = false;

    if (this.hasActiveAnimation()) {
      this.ensureFrame();
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
    this.gameState.clearDrag();
    this.needsRender = false;
    this.stopLoop();
    this.soundManager.handleAppHide();
  }

  handleAppForeground() {
    if (!this.isPaused) {
      this.requestImmediateRender();
      return;
    }

    this.isPaused = false;
    this.soundManager.handleAppShow();
    this.markDirty();
    this.render();
    this.needsRender = false;
    this.start();
  }

  loop(timestamp) {
    this.aniId = 0;
    if (this.isPaused) {
      return;
    }

    if (!this.lastTimestamp) {
      this.lastTimestamp = timestamp;
    }

    const animating = this.hasActiveAnimation();
    const deltaTime = Math.min(32, timestamp - this.lastTimestamp);
    this.lastTimestamp = timestamp;

    if (animating) {
      this.update(deltaTime);
    }

    if (this.needsRender || animating) {
      this.render();
      this.needsRender = false;
    }

    if (!this.isPaused && (this.hasActiveAnimation() || this.needsRender)) {
      this.aniId = requestAnimationFrame(this.loop.bind(this));
    }
  }
}
