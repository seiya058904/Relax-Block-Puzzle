function right(rect) {
  return rect.x + rect.width;
}

function bottom(rect) {
  return rect.y + rect.height;
}

function midpoint(a, b) {
  return a + (b - a) / 2;
}

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function createSafeHitRect({
  visualRect,
  containerRect,
  previousRect = null,
  nextRect = null,
  lowerBoundary = null,
  expandTop = 0,
  expandBottom = 0,
  expandLeft = 0,
  expandRight = 0,
  minimumTouchHeight = 0,
  slotGap = 0
}) {
  const minHeight = Math.max(0, safeNumber(minimumTouchHeight));
  const verticalMinimumPadding = Math.max(0, minHeight - visualRect.height) / 2;
  const containerRight = right(containerRect);
  const containerBottom = bottom(containerRect);
  const previousBoundary = previousRect
    ? midpoint(right(previousRect), visualRect.x)
    : containerRect.x;
  const nextBoundary = nextRect
    ? midpoint(right(visualRect), nextRect.x)
    : containerRight;
  const left = Math.max(
    containerRect.x,
    previousBoundary + (previousRect ? slotGap : 0),
    visualRect.x - Math.max(safeNumber(expandLeft), verticalMinimumPadding)
  );
  const top = Math.max(
    containerRect.y,
    visualRect.y - Math.max(safeNumber(expandTop), verticalMinimumPadding)
  );
  const rightEdge = Math.min(
    containerRight,
    nextBoundary - (nextRect ? slotGap : 0),
    right(visualRect) + Math.max(safeNumber(expandRight), verticalMinimumPadding)
  );
  const requestedBottom = bottom(visualRect) + Math.max(safeNumber(expandBottom), verticalMinimumPadding);
  const bottomEdge = Math.min(
    containerBottom,
    Number.isFinite(lowerBoundary) ? lowerBoundary : containerBottom,
    requestedBottom
  );

  return {
    x: left,
    y: top,
    width: Math.max(0, rightEdge - left),
    height: Math.max(0, bottomEdge - top)
  };
}
