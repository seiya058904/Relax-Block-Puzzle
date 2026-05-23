const canvas = document.getElementById('gameCanvas');
const keyboardInput = document.getElementById('wxKeyboard');

const touchHandlers = {
  start: [],
  move: [],
  end: [],
  cancel: []
};

const keyboardHandlers = {
  input: [],
  confirm: [],
  complete: []
};

const visibilityHandlers = {
  hide: [],
  show: []
};

function safeParseStorage(value) {
  if (value == null) {
    return '';
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
}

function buildTouchEvent(event) {
  const source =
    (event.touches && event.touches[0]) ||
    (event.changedTouches && event.changedTouches[0]) ||
    event;

  return {
    touches: source ? [{ clientX: source.clientX, clientY: source.clientY }] : [],
    changedTouches: source ? [{ clientX: source.clientX, clientY: source.clientY }] : []
  };
}

function emitTouch(type, event) {
  const handlers = touchHandlers[type] || [];
  const payload = buildTouchEvent(event);
  handlers.forEach((handler) => {
    try {
      handler(payload);
    } catch (error) {
      console.error(`touch handler failed: ${type}`, error);
    }
  });
}

function registerTouchHandlers() {
  canvas.addEventListener('touchstart', (event) => {
    event.preventDefault();
    emitTouch('start', event);
  }, { passive: false });

  canvas.addEventListener('touchmove', (event) => {
    event.preventDefault();
    emitTouch('move', event);
  }, { passive: false });

  canvas.addEventListener('touchend', (event) => {
    event.preventDefault();
    emitTouch('end', event);
  }, { passive: false });

  canvas.addEventListener('touchcancel', (event) => {
    event.preventDefault();
    emitTouch('cancel', event);
  }, { passive: false });

  let mouseDown = false;

  canvas.addEventListener('mousedown', (event) => {
    mouseDown = true;
    emitTouch('start', event);
  });

  canvas.addEventListener('mousemove', (event) => {
    if (!mouseDown) {
      return;
    }
    emitTouch('move', event);
  });

  window.addEventListener('mouseup', (event) => {
    if (!mouseDown) {
      return;
    }
    mouseDown = false;
    emitTouch('end', event);
  });
}

function registerVisibilityHandlers() {
  let visible = !document.hidden;

  const emitVisibility = (type) => {
    if (type === 'hide' && !visible) {
      return;
    }
    if (type === 'show' && visible) {
      return;
    }

    visible = type === 'show';
    visibilityHandlers[type].forEach((handler) => {
      try {
        handler();
      } catch (error) {
        console.error(`visibility handler failed: ${type}`, error);
      }
    });
  };

  document.addEventListener('visibilitychange', () => {
    emitVisibility(document.hidden ? 'hide' : 'show');
  });

  window.addEventListener('blur', () => {
    emitVisibility('hide');
  });

  window.addEventListener('focus', () => {
    emitVisibility('show');
  });

  window.addEventListener('pagehide', () => {
    emitVisibility('hide');
  });

  window.addEventListener('pageshow', () => {
    emitVisibility('show');
  });
}

function createAudioContext() {
  const audio = new Audio();
  let errorHandler = null;

  audio.preload = 'auto';

  audio.addEventListener('error', () => {
    if (errorHandler) {
      errorHandler({ errMsg: `audio error: ${audio.src}` });
    }
  });

  return {
    get src() {
      return audio.getAttribute('src') || '';
    },
    set src(value) {
      audio.src = value;
    },
    get autoplay() {
      return audio.autoplay;
    },
    set autoplay(value) {
      audio.autoplay = !!value;
    },
    get loop() {
      return audio.loop;
    },
    set loop(value) {
      audio.loop = !!value;
    },
    get volume() {
      return audio.volume;
    },
    set volume(value) {
      audio.volume = Number(value);
    },
    play() {
      const promise = audio.play();
      if (promise && typeof promise.catch === 'function') {
        promise.catch(() => {});
      }
    },
    stop() {
      audio.pause();
      audio.currentTime = 0;
    },
    seek(time) {
      audio.currentTime = Number(time) || 0;
    },
    destroy() {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    },
    onError(handler) {
      errorHandler = handler;
    }
  };
}

function syncCanvasSize() {
  const width = window.innerWidth || document.documentElement.clientWidth || 360;
  const height = window.innerHeight || document.documentElement.clientHeight || 640;
  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);

  const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (ctx && typeof ctx.setTransform === 'function') {
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  globalThis.GameGlobal = globalThis.GameGlobal || {};
  globalThis.GameGlobal.__canvasMetrics = {
    width,
    height,
    pixelRatio
  };
}

function emitKeyboard(type, value) {
  const handlers = keyboardHandlers[type] || [];
  handlers.forEach((handler) => {
    try {
      handler({ value });
    } catch (error) {
      console.error(`keyboard handler failed: ${type}`, error);
    }
  });
}

registerTouchHandlers();
registerVisibilityHandlers();
syncCanvasSize();
window.addEventListener('resize', syncCanvasSize);

function resetKeyboardInput() {
  keyboardInput.style.left = '-9999px';
  keyboardInput.style.top = '0';
  keyboardInput.style.width = '1px';
  keyboardInput.style.height = '1px';
  keyboardInput.style.opacity = '0';
  keyboardInput.style.pointerEvents = 'none';
}

keyboardInput.addEventListener('input', () => {
  emitKeyboard('input', keyboardInput.value);
});

keyboardInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') {
    return;
  }
  emitKeyboard('confirm', keyboardInput.value);
  keyboardInput.blur();
});

keyboardInput.addEventListener('blur', () => {
  resetKeyboardInput();
  emitKeyboard('complete', keyboardInput.value);
});

globalThis.GameGlobal = globalThis.GameGlobal || {};
globalThis.canvas = canvas;
globalThis.GameGlobal.canvas = canvas;

globalThis.wx = {
  createCanvas() {
    syncCanvasSize();
    return canvas;
  },
  getSystemInfoSync() {
    const metrics = globalThis.GameGlobal.__canvasMetrics || {};
    const width = metrics.width || window.innerWidth || document.documentElement.clientWidth || 360;
    const height = metrics.height || window.innerHeight || document.documentElement.clientHeight || 640;
    const pixelRatio = metrics.pixelRatio || window.devicePixelRatio || 1;
    return {
      screenWidth: width,
      screenHeight: height,
      windowWidth: width,
      windowHeight: height,
      safeArea: {
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        width,
        height
      },
      pixelRatio
    };
  },
  getWindowInfo() {
    const metrics = globalThis.GameGlobal.__canvasMetrics || {};
    const width = metrics.width || window.innerWidth || document.documentElement.clientWidth || 360;
    const height = metrics.height || window.innerHeight || document.documentElement.clientHeight || 640;
    return {
      screenWidth: width,
      screenHeight: height,
      windowWidth: width,
      windowHeight: height
    };
  },
  getMenuButtonBoundingClientRect() {
    return null;
  },
  createImage() {
    return new Image();
  },
  createInnerAudioContext() {
    return createAudioContext();
  },
  onTouchStart(handler) {
    touchHandlers.start.push(handler);
  },
  onTouchMove(handler) {
    touchHandlers.move.push(handler);
  },
  onTouchEnd(handler) {
    touchHandlers.end.push(handler);
  },
  onTouchCancel(handler) {
    touchHandlers.cancel.push(handler);
  },
  getStorageSync(key) {
    return safeParseStorage(localStorage.getItem(key));
  },
  setStorageSync(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  vibrateShort() {
    if (navigator.vibrate) {
      navigator.vibrate(20);
    }
  },
  onKeyboardInput(handler) {
    keyboardHandlers.input.push(handler);
  },
  onKeyboardConfirm(handler) {
    keyboardHandlers.confirm.push(handler);
  },
  onKeyboardComplete(handler) {
    keyboardHandlers.complete.push(handler);
  },
  showKeyboard(options = {}) {
    keyboardInput.value = options.defaultValue || '';
    keyboardInput.maxLength = Number(options.maxLength) > 0 ? Number(options.maxLength) : 32;

    if (options.inputRect) {
      const r = options.inputRect;
      keyboardInput.style.left = r.x + 'px';
      keyboardInput.style.top = r.y + 'px';
      keyboardInput.style.width = r.width + 'px';
      keyboardInput.style.height = r.height + 'px';
      keyboardInput.style.opacity = '0';
      keyboardInput.style.pointerEvents = 'auto';
    }

    keyboardInput.focus();
  },
  hideKeyboard() {
    keyboardInput.blur();
    resetKeyboardInput();
  },
  request(options = {}) {
    const method = options.method || 'GET';
    const headers = options.header || {};
    const body = options.data === undefined ? undefined : JSON.stringify(options.data);

    fetch(options.url, {
      method,
      headers,
      body
    })
      .then(async (response) => {
        const text = await response.text();
        let data = text;
        try {
          data = JSON.parse(text);
        } catch (error) {
          // Keep plain text when the response is not JSON.
        }

        options.success && options.success({
          data,
          statusCode: response.status
        });
      })
      .catch((error) => {
        options.fail && options.fail({
          errMsg: error.message || 'request failed'
        });
      });
  },
  login(options = {}) {
    const code = 'android-local-login-disabled';
    options.success && options.success({ code });
  },
  onHide(handler) {
    visibilityHandlers.hide.push(handler);
  },
  onShow(handler) {
    visibilityHandlers.show.push(handler);
  },
  cloud: {
    init() {
      return true;
    }
  }
};
