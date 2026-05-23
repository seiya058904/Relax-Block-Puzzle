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
      this.applySettings.bind(this)
    );

    this.bindAppLifecycle();
    this.renderer.render(this.gameState);
    this.start();
  }

  start() {
    cancelAnimationFrame(this.aniId);
    this.lastTimestamp = 0;
    this.aniId = requestAnimationFrame(this.loop.bind(this));
  }

  applySettings(nextSettings) {
    this.settings = {
      ...this.settings,
      ...nextSettings
    };
    this.gameState.setSettings(this.settings);
    saveSettings(this.settings);
    this.soundManager.setSettings(this.settings);
  }

  bindAppLifecycle() {
    if (this.appLifecycleBound) {
      return;
    }

    this.appLifecycleBound = true;

    if (wx.onHide) {
      wx.onHide(() => {
        this.soundManager.handleAppHide();
      });
    }

    if (wx.onShow) {
      wx.onShow(() => {
        this.soundManager.handleAppShow();
      });
    }
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
    this.renderer.render(this.gameState);
  }

  loop(timestamp) {
    if (!this.lastTimestamp) {
      this.lastTimestamp = timestamp;
    }

    const deltaTime = Math.min(32, timestamp - this.lastTimestamp);
    this.lastTimestamp = timestamp;

    this.update(deltaTime);
    this.render();

    this.aniId = requestAnimationFrame(this.loop.bind(this));
  }
}
