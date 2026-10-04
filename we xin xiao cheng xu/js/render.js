import { getQualityProfile } from './config/quality.js';
import { getCanvasPixelRatio } from './game/Presentation.js';

export function readCanvasMetrics() {
  const systemInfo = wx.getSystemInfoSync();
  const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : systemInfo;
  const width = windowInfo.windowWidth || windowInfo.screenWidth;
  const height = windowInfo.windowHeight || windowInfo.screenHeight;
  return {
    width, height,
    effectiveDpr: getCanvasPixelRatio(width, height, systemInfo.pixelRatio, getQualityProfile('light')),
    systemInfo,
    screenInfo: { screenWidth: width, screenHeight: height },
    safeAreaInfo: {
      safeArea: systemInfo.safeArea || null,
      menuButton: wx.getMenuButtonBoundingClientRect?.() || null
    }
  };
}

export function createCanvasSizeController(surface, ctx) {
  let key = '';
  return {
    refresh() {
      const metrics = readCanvasMetrics();
      const nextKey = `${metrics.width}:${metrics.height}:${metrics.effectiveDpr}`;
      const changed = key !== nextKey;
      if (changed) {
        surface.width = Math.floor(metrics.width * metrics.effectiveDpr);
        surface.height = Math.floor(metrics.height * metrics.effectiveDpr);
        ctx.setTransform(metrics.effectiveDpr, 0, 0, metrics.effectiveDpr, 0, 0);
        ctx.imageSmoothingEnabled = true;
        key = nextKey;
      }
      return { ...metrics, changed };
    }
  };
}

GameGlobal.canvas = wx.createCanvas();
export const canvasSize = createCanvasSizeController(canvas, canvas.getContext('2d'));
const metrics = canvasSize.refresh();
export const SCREEN_WIDTH = metrics.width;
export const SCREEN_HEIGHT = metrics.height;
export const DEVICE_PIXEL_RATIO = metrics.effectiveDpr;
export const SYSTEM_INFO = metrics.systemInfo;
export const SAFE_AREA = metrics.safeAreaInfo.safeArea;
export const MENU_BUTTON = metrics.safeAreaInfo.menuButton;
