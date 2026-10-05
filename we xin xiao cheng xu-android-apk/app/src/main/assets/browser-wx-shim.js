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

const loopingAudioContexts = new Set();

let storageLockDatabase;

function withStorageLock(name, update) {
  if (navigator.locks?.request) return navigator.locks.request(name, update);
  // A readwrite transaction is the fallback mutex for WebViews without Web Locks.
  // All localStorage reads and writes run synchronously while this transaction owns it.
  if (!globalThis.indexedDB) return Promise.reject(new Error('Storage coordination unavailable'));
  if (!storageLockDatabase) storageLockDatabase = new Promise((resolve, reject) => {
    const request = indexedDB.open('block-puzzle-storage-locks', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('locks');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Storage coordination blocked'));
  }).catch(error => { storageLockDatabase = undefined; throw error; });
  return storageLockDatabase.then(database => new Promise((resolve, reject) => {
    const transaction = database.transaction('locks', 'readwrite');
    let result;
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('Storage coordination failed'));
    transaction.objectStore('locks').get(name).onsuccess = () => {
      try { result = update(); } catch (error) { transaction.abort(); reject(error); }
    };
  }));
}

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

function buildTouchEvent(event, type) {
  const mapTouches = (touches) => Array.from(touches || [], (touch) => ({
    identifier: touch.identifier,
    clientX: touch.clientX,
    clientY: touch.clientY
  }));
  if (event.touches || event.changedTouches) {
    return { touches: mapTouches(event.touches), changedTouches: mapTouches(event.changedTouches) };
  }
  const mouse = { identifier: 'mouse', clientX: event.clientX, clientY: event.clientY };
  return { touches: type === 'end' || type === 'cancel' ? [] : [mouse], changedTouches: [mouse] };
}

function emitTouch(type, event) {
  const handlers = touchHandlers[type] || [];
  const payload = buildTouchEvent(event, type);
  handlers.forEach((handler) => {
    try {
      handler(payload);
    } catch (error) {
      console.error(`touch handler failed: ${type}`, error);
    }
  });

  if (type === 'start' || type === 'end') {
    resumeRequestedLoopingAudio();
  }
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
  let wantsPlayback = false;
  let destroyed = false;

  audio.preload = 'auto';

  audio.addEventListener('error', () => {
    if (errorHandler) {
      errorHandler({ errMsg: `audio error: ${audio.src}` });
    }
  });

  const reportPlayFailure = (error) => {
    if (errorHandler) {
      errorHandler({ errMsg: (error && error.message) || `audio playback failed: ${audio.src}` });
    }
  };

  const attemptPlayback = () => {
    if (destroyed || !wantsPlayback) {
      return;
    }

    try {
      const promise = audio.play();
      if (promise && typeof promise.catch === 'function') {
        promise.catch(reportPlayFailure);
      }
    } catch (error) {
      reportPlayFailure(error);
    }
  };

  const context = {
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
      if (audio.loop) {
        loopingAudioContexts.add(context);
      } else {
        loopingAudioContexts.delete(context);
      }
    },
    get volume() {
      return audio.volume;
    },
    set volume(value) {
      audio.volume = Number(value);
    },
    play() {
      wantsPlayback = true;
      attemptPlayback();
    },
    stop() {
      wantsPlayback = false;
      audio.pause();
      audio.currentTime = 0;
    },
    seek(time) {
      audio.currentTime = Number(time) || 0;
    },
    destroy() {
      wantsPlayback = false;
      destroyed = true;
      loopingAudioContexts.delete(context);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    },
    onError(handler) {
      errorHandler = handler;
    },
    resumeIfNeeded() {
      if (audio.paused) {
        attemptPlayback();
      }
    }
  };

  return context;
}

function resumeRequestedLoopingAudio() {
  loopingAudioContexts.forEach((audio) => audio.resumeIfNeeded());
}

const resizeHandlers = new Set();

function syncCanvasMetrics(notify = true) {
  const width = window.innerWidth || document.documentElement.clientWidth || 360;
  const height = window.innerHeight || document.documentElement.clientHeight || 640;
  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  globalThis.GameGlobal = globalThis.GameGlobal || {};
  const previous = globalThis.GameGlobal.__canvasMetrics;
  globalThis.GameGlobal.__canvasMetrics = { width, height, pixelRatio };
  if (notify && (!previous || previous.width !== width || previous.height !== height || previous.pixelRatio !== pixelRatio)) {
    resizeHandlers.forEach((handler) => handler({ windowWidth: width, windowHeight: height }));
  }
}

let devicePixelRatioQuery;

function watchDevicePixelRatio() {
  if (!window.matchMedia) return;
  const query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  devicePixelRatioQuery = query;
  const changed = () => {
    if (devicePixelRatioQuery !== query) return;
    if (query.removeEventListener) query.removeEventListener('change', changed);
    else query.removeListener(changed);
    syncCanvasMetrics();
    watchDevicePixelRatio();
  };
  if (query.addEventListener) query.addEventListener('change', changed);
  else query.addListener(changed);
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
syncCanvasMetrics();
window.addEventListener('resize', () => syncCanvasMetrics());
watchDevicePixelRatio();

function resetKeyboardInput() {
  keyboardInput.removeAttribute('style');
}

var currentTapHandler = null;

globalThis.__syncKeyboardInputPosition = function (rect) {
  if (!rect) {
    if (currentTapHandler) {
      keyboardInput.removeEventListener('touchstart', currentTapHandler);
      keyboardInput.removeEventListener('mousedown', currentTapHandler);
      currentTapHandler = null;
    }
    resetKeyboardInput();
    return;
  }
  keyboardInput.style.position = 'fixed';
  keyboardInput.style.left = rect.x + 'px';
  keyboardInput.style.top = rect.y + 'px';
  keyboardInput.style.width = rect.width + 'px';
  keyboardInput.style.height = rect.height + 'px';
  keyboardInput.style.background = 'rgba(11, 28, 52, 0.92)';
  keyboardInput.style.border = '1px solid rgba(120,202,255,0.28)';
  keyboardInput.style.borderRadius = '14px';
  keyboardInput.style.color = '#F5FBFF';
  keyboardInput.style.font = '17px sans-serif';
  keyboardInput.style.padding = '0 16px';
  keyboardInput.style.outline = 'none';
  keyboardInput.style.boxSizing = 'border-box';
  keyboardInput.style.zIndex = '10';

  if (!currentTapHandler) {
    currentTapHandler = function () {
      if (wx.showKeyboard) {
        wx.showKeyboard({
          defaultValue: keyboardInput.value || '',
          maxLength: 32,
          confirmHold: true,
          confirmType: 'done'
        });
      }
    };
    keyboardInput.addEventListener('touchstart', currentTapHandler);
    keyboardInput.addEventListener('mousedown', currentTapHandler);
  }
};

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

let safeAreaProbe;
function readSafeInsets() {
  if (!document.createElement || !document.body || !globalThis.getComputedStyle) {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  if (!safeAreaProbe) {
    safeAreaProbe = document.createElement('div');
    safeAreaProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(safeAreaProbe);
  }
  const style = getComputedStyle(safeAreaProbe);
  return { top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0 };
}

globalThis.wx = {
  createCanvas() {
    syncCanvasMetrics();
    return canvas;
  },
  onWindowResize(handler) { resizeHandlers.add(handler); },
  offWindowResize(handler) { resizeHandlers.delete(handler); },
  getSystemInfoSync() {
    syncCanvasMetrics(false);
    const metrics = globalThis.GameGlobal.__canvasMetrics || {};
    const width = metrics.width || window.innerWidth || document.documentElement.clientWidth || 360;
    const height = metrics.height || window.innerHeight || document.documentElement.clientHeight || 640;
    const pixelRatio = metrics.pixelRatio || window.devicePixelRatio || 1;
    const insets = readSafeInsets();
    return {
      screenWidth: width,
      screenHeight: height,
      windowWidth: width,
      windowHeight: height,
      safeArea: {
        left: insets.left,
        top: insets.top,
        right: width - insets.right,
        bottom: height - insets.bottom,
        width: width - insets.left - insets.right,
        height: height - insets.top - insets.bottom
      },
      pixelRatio
    };
  },
  getWindowInfo() {
    syncCanvasMetrics(false);
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
  withStorageLock,
  onStorageChange(handler) {
    window.addEventListener('storage', handler);
  },
  getStorageSync(key) {
    return safeParseStorage(localStorage.getItem(key));
  },
  setStorageSync(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  vibrateShort({ type = 'light' } = {}) {
    if (navigator.vibrate) {
      navigator.vibrate(type === 'heavy' ? 32 : type === 'medium' ? 24 : 12);
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
