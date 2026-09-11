import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { getVersionPath } from '../helpers/version-adapter.mjs';
import { installBrowserEnvironment } from '../helpers/platform-mocks.mjs';

for (const version of ['web', 'android']) {
  test(`${version}: shim re-arms DPR notifications without writing a bitmap`, async () => {
    const environment = installBrowserEnvironment();
    const previousMatchMedia = globalThis.matchMedia;
    const queries = [];
    const events = new Map();
    globalThis.addEventListener = (type, callback) => events.set(type, callback);
    globalThis.matchMedia = (media) => {
      const handlers = new Set();
      const query = {
        media, handlers,
        addEventListener(type, handler) { handlers.add(handler); },
        removeEventListener(type, handler) { handlers.delete(handler); }
      };
      queries.push(query);
      return query;
    };
    try {
      const surface = document.getElementById('gameCanvas');
      let bitmapWrites = 0;
      for (const dimension of ['width', 'height']) Object.defineProperty(surface, dimension, { set() { bitmapWrites++; } });
      await import(`${pathToFileURL(getVersionPath(version, '../browser-wx-shim.js')).href}?viewport-events`);
      let notifications = 0;
      const handler = () => notifications++;
      wx.onWindowResize(handler);
      wx.onWindowResize(handler);
      wx.createCanvas();
      assert.equal(notifications, 0);
      globalThis.devicePixelRatio = 1.25;
      [...queries[0].handlers].forEach((changed) => changed());
      assert.equal(notifications, 1);
      assert.equal(queries[0].handlers.size, 0);
      assert.equal(queries[1].media, '(resolution: 1.25dppx)');
      assert.equal(queries[1].handlers.size, 1);
      assert.equal(wx.getSystemInfoSync().pixelRatio, 1.25);
      events.get('resize')();
      assert.equal(notifications, 1);
      globalThis.innerWidth = 400;
      events.get('resize')();
      assert.equal(notifications, 2);
      assert.equal(wx.getWindowInfo().screenWidth, 400);
      wx.offWindowResize(handler);
      globalThis.innerWidth = 410;
      events.get('resize')();
      assert.equal(notifications, 2);
      assert.equal(bitmapWrites, 0);
    } finally {
      if (previousMatchMedia) globalThis.matchMedia = previousMatchMedia;
      else delete globalThis.matchMedia;
      environment.restore();
    }
  });
}
