export function readCanvasMetrics() {
  const systemInfo = wx.getSystemInfoSync();
  const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : systemInfo;
  const width = windowInfo.screenWidth;
  const height = windowInfo.screenHeight;
  const rawPixelRatio = systemInfo.pixelRatio || window.devicePixelRatio || 1;
  const pixelRatioFromPixels = Math.sqrt(5_000_000 / Math.max(1, width * height));
  const effectiveDpr = Math.max(1, Math.min(rawPixelRatio, 1.5, pixelRatioFromPixels, 1.75));
  return {
    width, height, effectiveDpr,
    screenInfo: { screenWidth: width, screenHeight: height },
    safeAreaInfo: {
      safeArea: systemInfo.safeArea || null,
      menuButton: wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null
    }
  };
}

// The only owner of the Web/WebView canvas bitmap and context scale.
export function createCanvasSizeController(canvas, ctx) {
  let sizeKey = '';
  return {
    refresh() {
      const metrics = readCanvasMetrics();
      const nextKey = `${metrics.width}:${metrics.height}:${metrics.effectiveDpr}`;
      const changed = nextKey !== sizeKey;
      if (changed) {
        canvas.style.width = `${metrics.width}px`;
        canvas.style.height = `${metrics.height}px`;
        canvas.width = Math.round(metrics.width * metrics.effectiveDpr);
        canvas.height = Math.round(metrics.height * metrics.effectiveDpr);
        ctx.setTransform(metrics.effectiveDpr, 0, 0, metrics.effectiveDpr, 0, 0);
        ctx.imageSmoothingEnabled = true;
        sizeKey = nextKey;
      }
      return { ...metrics, changed };
    }
  };
}
