export const HUD_SCORE_PULSE_SCALE = 1.08;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function rect(x, y, width, height) {
  return {
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100
  };
}

function right(item) {
  return item.x + item.width;
}

function bottom(item) {
  return item.y + item.height;
}

function centerX(item) {
  return item.x + item.width / 2;
}

function defaultMeasureText(text, size) {
  return String(text).length * size * 0.56;
}

export function fitTextSize({
  text,
  preferredSize,
  minimumSize,
  maxWidth,
  measureText = defaultMeasureText,
  fontFamily = 'sans-serif',
  fontWeight = ''
}) {
  const safeText = String(text ?? '');
  const safeMaxWidth = Math.max(0, finite(maxWidth, 0));
  const preferred = Math.max(1, finite(preferredSize, 1));
  const minimum = clamp(finite(minimumSize, preferred), 1, preferred);

  for (let size = preferred; size >= minimum; size -= 1) {
    const measuredWidth = Number(measureText(safeText, size, fontFamily, fontWeight)) || 0;
    if (measuredWidth <= safeMaxWidth) {
      return {
        fontSize: size,
        measuredWidth,
        maxWidth: safeMaxWidth
      };
    }
  }

  return {
    fontSize: minimum,
    measuredWidth: Number(measureText(safeText, minimum, fontFamily, fontWeight)) || 0,
    maxWidth: safeMaxWidth
  };
}

export function calculateAndroidHomeLayout({
  viewportWidth,
  viewportHeight,
  safeInsets = {},
  adminVisible = false
}) {
  const width = Math.max(320, finite(viewportWidth, 360));
  const height = Math.max(560, finite(viewportHeight, 640));
  const sideMargin = clamp(width * 0.04, 14, 24);
  const topInset = Math.max(44, finite(safeInsets.top, 44));
  const bottomInset = Math.max(12, finite(safeInsets.bottom, 18));
  const panelX = sideMargin + 8;
  const panelY = clamp(height * 0.095, topInset + 8, topInset + 24);
  const panelWidth = width - panelX * 2;
  const panelBottomLimit = height - bottomInset - 12;
  const panelHeight = Math.max(420, panelBottomLimit - panelY);
  const availableHeight = Math.max(360, panelHeight - 40);
  const compactScale = clamp(availableHeight / 490, 0.82, 1);
  const minimumGap = Math.round(clamp(8 * compactScale, 6, 10));
  const innerX = panelX + clamp(30 * compactScale, 24, 34);
  const innerWidth = panelWidth - (innerX - panelX) * 2;
  const buttonWidth = panelWidth - clamp(72 * compactScale, 56, 72);
  const buttonX = panelX + (panelWidth - buttonWidth) / 2;
  const titleHeight = clamp(62 * compactScale, 50, 66);
  const subtitleHeight = clamp(22 * compactScale, 18, 24);
  const adminHeight = adminVisible ? 28 : 0;
  const difficultyHeight = clamp(42 * compactScale, 38, 42);
  const scoreHeight = clamp(56 * compactScale, 46, 58);
  const startHeight = clamp(58 * compactScale, 50, 58);
  const secondaryHeight = clamp(48 * compactScale, 44, 48);

  let cursorY = panelY + clamp(24 * compactScale, 18, 26);
  const title = rect(panelX + 32, cursorY - 6, panelWidth - 64, titleHeight);
  cursorY = bottom(title) + minimumGap;
  const subtitle = rect(panelX + 24, cursorY, panelWidth - 48, subtitleHeight);
  cursorY = bottom(subtitle) + minimumGap;

  const adminButton = adminVisible
    ? rect(panelX + panelWidth / 2 - 54, cursorY, 108, adminHeight)
    : null;
  if (adminButton) {
    cursorY = bottom(adminButton) + minimumGap;
  }

  const difficultyButton = rect(innerX, cursorY, innerWidth, difficultyHeight);
  cursorY = bottom(difficultyButton) + minimumGap;
  const highScoreCard = rect(innerX, cursorY, innerWidth, scoreHeight);
  cursorY = bottom(highScoreCard) + minimumGap + 2;
  const startButton = rect(buttonX, cursorY, buttonWidth, startHeight);
  cursorY = bottom(startButton) + minimumGap;
  const helpButton = rect(buttonX, cursorY, buttonWidth, secondaryHeight);
  cursorY = bottom(helpButton) + minimumGap;
  const settingsButton = rect(buttonX, cursorY, buttonWidth, secondaryHeight);

  const panel = rect(panelX, panelY, panelWidth, Math.max(panelHeight, bottom(settingsButton) - panelY + 22));

  return {
    panel,
    title,
    subtitle,
    adminButton,
    difficultyButton,
    highScoreCard,
    startButton,
    helpButton,
    settingsButton,
    minimumGap,
    titleFontSize: Math.round(clamp(35 * compactScale, 30, 35)),
    subtitleFontSize: Math.round(clamp(16 * compactScale, 14, 16))
  };
}

export function calculateHudLayout({
  platform = 'android',
  viewportWidth,
  headerRect,
  settingsButtonRect,
  pauseButtonRect,
  boardPanelRect = null,
  menuButton = null,
  score = 0,
  bestScore = 0,
  measureText = defaultMeasureText,
  pulseScale = HUD_SCORE_PULSE_SCALE
}) {
  const width = Math.max(320, finite(viewportWidth, 360));
  const header = headerRect || { x: 14, y: 44, width: width - 28, height: 96 };
  const pause = pauseButtonRect || { x: header.x + 72, y: header.y + 8, width: 64, height: 28 };
  const isAndroid = platform === 'android';
  const scoreArea = isAndroid && boardPanelRect
    ? rect(boardPanelRect.x + 8, header.y, Math.max(80, boardPanelRect.width - 16), header.height)
    : (() => {
        const leftSafe = right(pause) + 12;
        const rightSafe = platform === 'wechat' && menuButton
          ? Math.max(leftSafe + 60, menuButton.left - 12)
          : header.x + header.width;
        return rect(leftSafe, header.y, Math.max(60, rightSafe - leftSafe), header.height);
      })();
  const scoreCenterX = isAndroid && boardPanelRect ? centerX(boardPanelRect) : centerX(scoreArea);
  const preferredScoreFontSize = 46;
  const minimumScoreFontSize = platform === 'wechat' ? 16 : 22;
  const preferredBestScoreFontSize = 16;
  const minimumBestScoreFontSize = 12;
  const scoreFit = fitTextSize({
    text: String(score),
    preferredSize: preferredScoreFontSize,
    minimumSize: minimumScoreFontSize,
    maxWidth: scoreArea.width / pulseScale,
    measureText,
    fontWeight: 'bold'
  });
  const bestText = `最高分：${bestScore}`;
  const bestFit = fitTextSize({
    text: bestText,
    preferredSize: preferredBestScoreFontSize,
    minimumSize: minimumBestScoreFontSize,
    maxWidth: scoreArea.width,
    measureText
  });
  const controlBottom = Math.max(
    settingsButtonRect ? bottom(settingsButtonRect) : header.y,
    pauseButtonRect ? bottom(pauseButtonRect) : header.y
  );
  const scoreBaselineY = isAndroid ? controlBottom + 54 : header.y + 42;
  const bestBaselineY = isAndroid ? scoreBaselineY + 32 : header.y + 76;
  const scoreRect = rect(
    scoreCenterX - scoreFit.measuredWidth / 2,
    scoreBaselineY - scoreFit.fontSize,
    scoreFit.measuredWidth,
    scoreFit.fontSize * 1.18
  );
  const maxPulseScoreRect = rect(
    scoreCenterX - (scoreFit.measuredWidth * pulseScale) / 2,
    scoreBaselineY - scoreFit.fontSize * pulseScale,
    scoreFit.measuredWidth * pulseScale,
    scoreFit.fontSize * pulseScale * 1.18
  );
  const bestScoreRect = rect(
    scoreCenterX - bestFit.measuredWidth / 2,
    bestBaselineY - bestFit.fontSize,
    bestFit.measuredWidth,
    bestFit.fontSize * 1.18
  );

  return {
    scoreArea,
    centerX: scoreCenterX,
    scoreBaselineY,
    bestBaselineY,
    scoreRect,
    maxPulseScoreRect,
    bestScoreRect,
    scoreFontSize: scoreFit.fontSize,
    bestScoreFontSize: bestFit.fontSize,
    preferredScoreFontSize,
    minimumScoreFontSize,
    preferredBestScoreFontSize,
    minimumBestScoreFontSize,
    hudBottom: Math.max(bottom(maxPulseScoreRect), bottom(bestScoreRect))
  };
}
