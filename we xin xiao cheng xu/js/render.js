GameGlobal.canvas = wx.createCanvas();

const systemInfo = wx.getSystemInfoSync();
const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : systemInfo;
const menuButton = wx.getMenuButtonBoundingClientRect
  ? wx.getMenuButtonBoundingClientRect()
  : null;
const pixelRatio = systemInfo.pixelRatio || 1;

canvas.width = Math.round(windowInfo.screenWidth * pixelRatio);
canvas.height = Math.round(windowInfo.screenHeight * pixelRatio);

export const SCREEN_WIDTH = windowInfo.screenWidth;
export const SCREEN_HEIGHT = windowInfo.screenHeight;
export const DEVICE_PIXEL_RATIO = pixelRatio;
export const SYSTEM_INFO = systemInfo;
export const SAFE_AREA = systemInfo.safeArea || null;
export const MENU_BUTTON = menuButton;
