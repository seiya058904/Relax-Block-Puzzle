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

export function calculateWechatHomeLayout({
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
  menuButton = null,
  score = 0,
  bestScore = 0,
  measureText = defaultMeasureText,
  pulseScale = HUD_SCORE_PULSE_SCALE
}) {
  const width = Math.max(320, finite(viewportWidth, 360));
  const header = headerRect || { x: 14, y: 44, width: width - 28, height: 96 };
  const pause = pauseButtonRect || { x: header.x + 72, y: header.y + 8, width: 64, height: 28 };
  const leftSafe = right(pause) + 12;
  const rightSafe = platform === 'wechat' && menuButton
    ? Math.max(leftSafe + 60, menuButton.left - 12)
    : header.x + header.width;
  const centerX = width / 2;
  const leftSpace = Math.max(0, centerX - leftSafe);
  const rightSpace = Math.max(0, rightSafe - centerX);
  const maxCenteredWidth = Math.max(1, Math.min(leftSpace, rightSpace) * 2);
  const scoreArea = rect(centerX - maxCenteredWidth / 2, header.y, maxCenteredWidth, header.height);
  const preferredScoreFontSize = 46;
  const minimumScoreFontSize = platform === 'wechat' ? 16 : 26;
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
  const scoreBaselineY = header.y + (platform === 'android' ? 46 : 42);
  const bestBaselineY = header.y + (platform === 'android' ? 80 : 76);
  const scoreRect = rect(
    centerX - scoreFit.measuredWidth / 2,
    scoreBaselineY - scoreFit.fontSize,
    scoreFit.measuredWidth,
    scoreFit.fontSize * 1.18
  );
  const maxPulseScoreRect = rect(
    centerX - (scoreFit.measuredWidth * pulseScale) / 2,
    scoreBaselineY - scoreFit.fontSize * pulseScale,
    scoreFit.measuredWidth * pulseScale,
    scoreFit.fontSize * pulseScale * 1.18
  );
  const bestScoreRect = rect(
    centerX - bestFit.measuredWidth / 2,
    bestBaselineY - bestFit.fontSize,
    bestFit.measuredWidth,
    bestFit.fontSize * 1.18
  );

  return {
    scoreArea,
    centerX,
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

export function calculateModalShellLayout({
  viewportWidth,
  viewportHeight,
  bottomInset = 18,
  topGap = 16,
  sideInset = 17,
  headerHeight = 46,
  footerHeight = 64,
  contentSidePadding = 20,
  contentTopPadding = 10,
  contentBottomPadding = 14,
  preferredContentHeight = null,
  minContentHeight = 96
}) {
  const width = Math.max(320, finite(viewportWidth, 360));
  const height = Math.max(560, finite(viewportHeight, 640));
  const safeBottom = Math.max(12, finite(bottomInset, 18));
  const panelWidth = width - Math.max(0, sideInset) * 2;
  const maxPanelHeight = height - topGap * 2 - safeBottom;
  const availableContentHeight = Math.max(
    minContentHeight,
    maxPanelHeight - headerHeight - footerHeight - contentTopPadding - contentBottomPadding
  );
  const requestedContentHeight = preferredContentHeight == null
    ? availableContentHeight
    : Math.max(minContentHeight, preferredContentHeight);
  const contentHeight = Math.min(availableContentHeight, requestedContentHeight);
  const panelHeight = headerHeight + footerHeight + contentHeight + contentTopPadding + contentBottomPadding;
  const panelX = (width - panelWidth) / 2;
  const panelY = Math.max(topGap, (height - panelHeight - safeBottom) / 2);
  const footerButtonHeight = Math.min(48, footerHeight - 10);

  return {
    panel: rect(panelX, panelY, panelWidth, panelHeight),
    header: rect(panelX, panelY, panelWidth, headerHeight),
    content: rect(
      panelX + contentSidePadding,
      panelY + headerHeight + contentTopPadding,
      Math.max(0, panelWidth - contentSidePadding * 2),
      contentHeight
    ),
    footerButton: rect(
      panelX + contentSidePadding,
      panelY + panelHeight - footerHeight + (footerHeight - footerButtonHeight) / 2,
      Math.max(0, panelWidth - contentSidePadding * 2),
      footerButtonHeight
    ),
    titleBaselineY: panelY + 32
  };
}

const MODAL_ROW_MEASURES = [
  { rowHeight: 42, rowGap: 9, sectionHeight: 26, sectionGap: 6 },
  { rowHeight: 38, rowGap: 7, sectionHeight: 24, sectionGap: 5 },
  { rowHeight: 35, rowGap: 5, sectionHeight: 22, sectionGap: 4 },
  { rowHeight: 32, rowGap: 4, sectionHeight: 20, sectionGap: 3 }
];

function measureRowsTotal(rows, measure) {
  let total = 0;
  rows.forEach((row, index) => {
    if (index > 0) {
      total += measure.rowGap;
    }
    total += row.type === 'section' ? measure.sectionHeight : measure.rowHeight;
    if (row.type === 'section' && index > 0) {
      total += measure.sectionGap;
    }
  });
  return total;
}

export function measureModalRowsHeight(rows) {
  return measureRowsTotal(Array.isArray(rows) ? rows : [], MODAL_ROW_MEASURES[0]);
}

export function calculateModalRowsLayout({ contentRect, rows }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  let fitted = false;
  let measure = MODAL_ROW_MEASURES[MODAL_ROW_MEASURES.length - 1];

  for (const candidate of MODAL_ROW_MEASURES) {
    if (measureRowsTotal(safeRows, candidate) <= contentRect.height) {
      measure = candidate;
      fitted = true;
      break;
    }
  }

  // When even the tightest measure overflows, distribute the available
  // height evenly so the rows always stay inside the content area.
  let squeezedPerItem = 0;
  if (!fitted && safeRows.length > 0) {
    let gapsTotal = 0;
    safeRows.forEach((row, index) => {
      if (index > 0) {
        gapsTotal += measure.rowGap;
      }
      if (row.type === 'section' && index > 0) {
        gapsTotal += measure.sectionGap;
      }
    });
    squeezedPerItem = Math.max(
      16,
      Math.floor(Math.max(contentRect.height - gapsTotal, safeRows.length * 16) / safeRows.length)
    );
  }

  const rects = [];
  let cursorY = contentRect.y;
  const bottomLimit = contentRect.y + contentRect.height;
  safeRows.forEach((row, index) => {
    if (index > 0) {
      cursorY += measure.rowGap;
    }
    if (row.type === 'section' && index > 0) {
      cursorY += measure.sectionGap;
    }
    let height = row.type === 'section' ? measure.sectionHeight : measure.rowHeight;
    if (!fitted) {
      height = row.type === 'section'
        ? Math.min(measure.sectionHeight, squeezedPerItem)
        : squeezedPerItem;
    }
    rects.push({
      ...rect(contentRect.x, cursorY, contentRect.width, height),
      type: row.type || 'row',
      key: row.key || null,
      label: row.label || '',
      value: row.value || ''
    });
    cursorY += height;
  });

  return { rects, measure, fitted };
}

export function calculateSettingsTabsLayout({ contentRect, tabs }) {
  const safeTabs = Array.isArray(tabs) ? tabs : [];
  const tabHeight = 34;
  const gap = 8;
  const tabWidth = safeTabs.length > 0
    ? (contentRect.width - gap * (safeTabs.length - 1)) / safeTabs.length
    : 0;
  const tabRects = safeTabs.map((key, index) => ({
    ...rect(contentRect.x + (tabWidth + gap) * index, contentRect.y, tabWidth, tabHeight),
    key
  }));
  const contentBelow = rect(
    contentRect.x,
    contentRect.y + tabHeight + 10,
    contentRect.width,
    Math.max(0, contentRect.height - tabHeight - 10)
  );
  return { tabRects, contentBelow };
}

const HELP_ROW_MEASURES = [
  { sectionSize: 17, bodySize: 15, sectionHeight: 27, bodyHeight: 24, sectionGap: 10 },
  { sectionSize: 16, bodySize: 14, sectionHeight: 25, bodyHeight: 22, sectionGap: 8 },
  { sectionSize: 15, bodySize: 13, sectionHeight: 23, bodyHeight: 20, sectionGap: 7 }
];

export function calculateHelpRowsLayout({ contentRect, rows }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  let fitted = false;
  let measure = HELP_ROW_MEASURES[HELP_ROW_MEASURES.length - 1];

  for (const candidate of HELP_ROW_MEASURES) {
    let total = 0;
    safeRows.forEach((row, index) => {
      if (index > 0) total += 4;
      if (row.isSection && index > 0) total += candidate.sectionGap;
      total += row.isSection ? candidate.sectionHeight : candidate.bodyHeight;
    });
    if (total <= contentRect.height) {
      measure = candidate;
      fitted = true;
      break;
    }
  }

  const lineRects = [];
  let cursorY = contentRect.y;
  const bottomLimit = contentRect.y + contentRect.height;
  safeRows.forEach((row, index) => {
    if (index > 0) cursorY += 4;
    if (row.isSection && index > 0) cursorY += measure.sectionGap;
    const height = row.isSection ? measure.sectionHeight : measure.bodyHeight;
    if (cursorY + height <= bottomLimit) {
      lineRects.push({
        ...rect(contentRect.x, cursorY, contentRect.width, height),
        text: row.text,
        isSection: !!row.isSection,
        fontSize: row.isSection ? measure.sectionSize : measure.bodySize
      });
    }
    cursorY += height;
  });

  return { lineRects, measure, fitted };
}
