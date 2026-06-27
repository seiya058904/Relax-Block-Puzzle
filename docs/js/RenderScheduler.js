export function shouldScheduleFrame({ isPaused, needsRender, hasActiveAnimation }) {
  return !isPaused && !!(needsRender || hasActiveAnimation);
}
