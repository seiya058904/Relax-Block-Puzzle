export function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));

  return {
    getStorageSync(key) {
      return values.has(key) ? structuredClone(values.get(key)) : '';
    },
    setStorageSync(key, value) {
      values.set(key, structuredClone(value));
    },
    delete(key) {
      values.delete(key);
    },
    snapshot() {
      return Object.fromEntries(
        Array.from(values.entries(), ([key, value]) => [key, structuredClone(value)])
      );
    }
  };
}

export function installWxStorage(storage) {
  const previous = globalThis.wx;
  globalThis.wx = {
    ...(previous || {}),
    getStorageSync: storage.getStorageSync.bind(storage),
    setStorageSync: storage.setStorageSync.bind(storage)
  };

  return () => {
    if (previous === undefined) {
      delete globalThis.wx;
    } else {
      globalThis.wx = previous;
    }
  };
}

export async function withRandomSequence(sequence, callback) {
  const originalRandom = Math.random;
  let index = 0;
  Math.random = () => {
    const value = sequence[Math.min(index, sequence.length - 1)];
    index += 1;
    return value;
  };

  try {
    return await callback({ calls: () => index });
  } finally {
    Math.random = originalRandom;
  }
}

export async function withFixedNow(now, callback) {
  const originalPerformance = globalThis.performance;
  globalThis.performance = { now: () => now };
  try {
    return await callback();
  } finally {
    globalThis.performance = originalPerformance;
  }
}

export async function withFixedDateNow(now, callback) {
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    return await callback();
  } finally {
    Date.now = originalNow;
  }
}

export function createNoopPlatform() {
  return {
    lifecycle: { backgroundHandlers: [], foregroundHandlers: [] },
    audio: { calls: [] },
    vibration: { calls: [] }
  };
}

export function installBrowserEnvironment(initialStorage = {}) {
  const previous = new Map();
  const names = ['document', 'window', 'localStorage', 'navigator', 'Audio', 'Image', 'canvas', 'GameGlobal', 'wx'];
  for (const name of names) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  }

  const listeners = new Map();
  const makeTarget = () => ({
    style: {},
    value: '',
    maxLength: 32,
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener() {},
    removeAttribute() { this.style = {}; },
    focus() {},
    blur() {},
    getContext() { return { setTransform() {} }; }
  });
  const canvas = makeTarget();
  const keyboard = makeTarget();
  const errorBox = makeTarget();
  const values = new Map(Object.entries(initialStorage));
  const localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    snapshot() { return Object.fromEntries(values); }
  };

  class FakeAudio {
    constructor() {
      this.autoplay = false;
      this.loop = false;
      this.volume = 1;
      this.currentTime = 0;
      this.attributes = new Map();
    }
    addEventListener() {}
    getAttribute(name) { return this.attributes.get(name) || ''; }
    set src(value) { this.attributes.set('src', value); }
    get src() { return this.getAttribute('src'); }
    play() { return Promise.resolve(); }
    pause() {}
    removeAttribute(name) { this.attributes.delete(name); }
    load() {}
  }

  const document = {
    hidden: false,
    documentElement: { clientWidth: 360, clientHeight: 640 },
    getElementById(id) {
      return { gameCanvas: canvas, wxKeyboard: keyboard, bootError: errorBox }[id] || makeTarget();
    },
    addEventListener() {}
  };

  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: globalThis });
  globalThis.addEventListener = () => {};
  globalThis.innerWidth = 360;
  globalThis.innerHeight = 640;
  globalThis.devicePixelRatio = 2;
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: document });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: localStorage });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: { vibrate() {} } });
  Object.defineProperty(globalThis, 'Audio', { configurable: true, writable: true, value: FakeAudio });
  Object.defineProperty(globalThis, 'Image', { configurable: true, writable: true, value: class {} });

  return {
    localStorage,
    restore() {
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
      delete globalThis.addEventListener;
      delete globalThis.innerWidth;
      delete globalThis.innerHeight;
      delete globalThis.devicePixelRatio;
    }
  };
}
