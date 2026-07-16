import {
  CLOUD_ENV,
  CLOUD_SERVICE_NAME,
  PUBLIC_API_BASE_URL
} from '../config/backend.js';

let cloudInitialized = false;

function toSafeErrorMessage(error, fallback = 'unknown error') {
  if (!error) {
    return fallback;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error.errMsg === 'string' && error.errMsg.trim()) {
    return error.errMsg.trim();
  }

  if (error && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}

function buildSafeError(error, fallback) {
  const safeMessage = toSafeErrorMessage(error, fallback);
  const wrapped = new Error(safeMessage);
  wrapped.safeMessage = safeMessage;
  return wrapped;
}

function wrapWxCall(executor) {
  return new Promise((resolve, reject) => {
    try {
      executor(resolve, reject);
    } catch (error) {
      reject(error);
    }
  });
}

function normalizeResponse(result) {
  if (result && typeof result === 'object' && result.data != null) {
    return result.data;
  }

  if (result && typeof result === 'object' && result.data && typeof result.data === 'object') {
    return result.data;
  }

  if (result && typeof result === 'object' && result.result && typeof result.result === 'object') {
    return result.result;
  }

  return result;
}

export function initCloud() {
  if (cloudInitialized) {
    return true;
  }

  if (!wx.cloud || !wx.cloud.init) {
    return false;
  }

  try {
    wx.cloud.init({
      env: CLOUD_ENV,
      traceUser: true
    });
    cloudInitialized = true;
    return true;
  } catch (error) {
    return false;
  }
}

export default class AuthClient {
  constructor() {
    this.cloudReady = initCloud();
    this.backendTransport = 'unknown';
    this.callContainerHealthProbePromise = null;
  }

  ensureCloudReady() {
    if (this.cloudReady) {
      return true;
    }

    this.cloudReady = initCloud();
    return this.cloudReady;
  }

  async requestLoginCode() {
    if (!wx.login) {
      throw buildSafeError(null, 'wx.login is unavailable');
    }

    const loginResult = await wrapWxCall((resolve, reject) => {
      wx.login({
        success: resolve,
        fail: reject
      });
    });

    const code = String((loginResult && loginResult.code) || '').trim();
    if (!code) {
      throw buildSafeError(null, 'wx.login returned empty code');
    }

    return code;
  }

  async requestBackend(path, method, data) {
    if (this.backendTransport === 'unknown') {
      await this.testCallContainerHealth();
    }

    if (this.backendTransport === 'callContainer') {
      return this.requestBackendByCallContainer(path, method, data);
    }

    return this.requestBackendByPublicUrl(path, method, data);
  }

  async testCallContainerHealth() {
    if (this.backendTransport === 'callContainer') {
      return true;
    }

    if (this.backendTransport === 'request') {
      return false;
    }

    if (this.callContainerHealthProbePromise) {
      return this.callContainerHealthProbePromise;
    }

    this.callContainerHealthProbePromise = this.runCallContainerHealthProbe();
    return this.callContainerHealthProbePromise;
  }

  async runCallContainerHealthProbe() {
    try {
      const response = await this.requestBackendByCallContainer('/api/health', 'GET');
      const result = response.data;

      if (result && result.ok) {
        this.backendTransport = 'callContainer';
        console.log('[Auth] callContainer health success');
        return true;
      }
    } catch (error) {
      console.warn('[Auth] callContainer health failed', error && error.errMsg ? error.errMsg : error);
    }

    this.backendTransport = 'request';
    return false;
  }

  async requestBackendByCallContainer(path, method, data) {
    if (!wx.cloud || !wx.cloud.callContainer) {
      throw buildSafeError(null, 'wx.cloud.callContainer is unavailable');
    }

    const rawResponse = await wrapWxCall((resolve, reject) => {
      wx.cloud.callContainer({
      path,
      method,
      config: {
        env: CLOUD_ENV
      },
      header: {
        'X-WX-SERVICE': CLOUD_SERVICE_NAME,
        'content-type': 'application/json'
      },
      data
      ,
      success: resolve,
      fail: reject
    });
    });

    return {
      rawResponse,
      data: normalizeResponse(rawResponse)
    };
  }

  async requestBackendByPublicUrl(path, method, data) {
    if (!wx.request) {
      throw buildSafeError(null, 'wx.request is unavailable');
    }

    const requestOptions = {
      url: `${PUBLIC_API_BASE_URL}${path}`,
      method,
      header: {
        'content-type': 'application/json'
      },
      success: resolve => resolve(resolve),
      fail: reject => reject(reject)
    };

    if (data !== undefined) {
      requestOptions.data = data;
    }

    const rawResponse = await wrapWxCall((resolve, reject) => {
      requestOptions.success = resolve;
      requestOptions.fail = reject;
      wx.request(requestOptions);
    });

    return {
      rawResponse,
      data: normalizeResponse(rawResponse)
    };
  }

  async login() {
    try {
      const code = await this.requestLoginCode();
      const backendResponse = await this.requestBackend('/api/login', 'POST', { code });

      const result = backendResponse.data;
      const safeResult = {
        loggedIn: !!(result && result.loggedIn),
        userId: String((result && result.userId) || ''),
        isMember: !!(result && result.isMember),
        isAdminAllowed: !!(result && result.isAdminAllowed),
        error: result && result.error ? String(result.error) : '',
        details: result && result.details ? result.details : null
      };

      return safeResult;
    } catch (error) {
      const safeError = buildSafeError(error, 'login failed');
      throw safeError;
    }
  }

  async verifyAdmin(adminCode) {
    const trimmedAdminCode = String(adminCode || '').trim();
    if (!trimmedAdminCode) {
      return {
        adminMode: false
      };
    }

    try {
      const code = await this.requestLoginCode();
      const backendResponse = await this.requestBackend('/api/admin/verify', 'POST', {
        code,
        adminCode: trimmedAdminCode
      });
      const result = backendResponse.data;

      const safeResult = {
        adminMode: !!(result && result.adminMode)
      };
      return safeResult;
    } catch (error) {
      const safeError = buildSafeError(error, 'verifyAdmin failed');
      throw safeError;
    }
  }

  async healthCheck() {
    try {
      const backendResponse = await this.requestBackend('/api/health', 'GET');
      const result = backendResponse.data;
      const safeResult = {
        ok: !!(result && result.ok)
      };
      return safeResult;
    } catch (error) {
      const safeError = buildSafeError(error, 'healthCheck failed');
      throw safeError;
    }
  }
}
