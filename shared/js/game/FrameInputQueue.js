export function createFrameInputQueue(requestFrame) {
  let pending = null;
  let frameRequested = false;

  return {
    push(point) {
      pending = { x: point.x, y: point.y };
      if (!frameRequested) {
        frameRequested = true;
        requestFrame();
      }
    },

    flush(consume) {
      if (!pending) {
        frameRequested = false;
        return false;
      }

      const point = pending;
      pending = null;
      frameRequested = false;
      consume(point);
      return true;
    },

    clear() {
      pending = null;
      frameRequested = false;
    },

    hasPending() {
      return !!pending;
    }
  };
}
