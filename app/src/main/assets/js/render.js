GameGlobal.canvas = wx.createCanvas();

const systemInfo = wx.getSystemInfoSync();
const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : systemInfo;
const menuButton = wx.getMenuButtonBoundingClientRect
  ? wx.getMenuButtonBoundingClientRect()
  : null;
const rawPixelRatio = systemInfo.pixelRatio || window.devicePixelRatio || 1;
const maxCanvasPixels = 5_000_000;
const pixelRatioFromPixels = Math.sqrt(
  maxCanvasPixels / Math.max(1, windowInfo.screenWidth * windowInfo.screenHeight)
);
// Cap DPR on Android WebView to keep canvas size and background transitions stable.
const pixelRatio = Math.max(1, Math.min(rawPixelRatio, 1.5, pixelRatioFromPixels, 1.75));

canvas.width = Math.round(windowInfo.screenWidth * pixelRatio);
canvas.height = Math.round(windowInfo.screenHeight * pixelRatio);

export const SCREEN_WIDTH = windowInfo.screenWidth;
export const SCREEN_HEIGHT = windowInfo.screenHeight;
export const DEVICE_PIXEL_RATIO = pixelRatio;
export const RAW_DEVICE_PIXEL_RATIO = rawPixelRatio;
export const SYSTEM_INFO = systemInfo;
export const SAFE_AREA = systemInfo.safeArea || null;
export const MENU_BUTTON = menuButton;
