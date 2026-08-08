const crypto = require('node:crypto');
const express = require('express');

const WECHAT_CODE2SESSION_URL = 'https://api.weixin.qq.com/sns/jscode2session';

function truncateText(value, maxLength = 500) {
  return String(value || '').slice(0, maxLength);
}

function safeCauseSummary(cause) {
  if (!cause) {
    return '';
  }

  if (typeof cause === 'string') {
    return truncateText(cause, 200);
  }

  if (cause && typeof cause.message === 'string' && cause.message.trim()) {
    return truncateText(cause.message, 200);
  }

  return truncateText(JSON.stringify(cause), 200);
}

function parseListEnv(name) {
  const raw = process.env[name];
  if (!raw) {
    return [];
  }

  const value = String(raw).trim();
  if (!value) {
    return [];
  }

  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item || '').trim())
          .filter(Boolean);
      }
    } catch (error) {
      // Fall through to delimiter parsing.
    }
  }

  return value
    .split(/[\r\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getWechatConfig() {
  return {
    appId: String(process.env.WECHAT_APPID || '').trim(),
    secret: String(process.env.WECHAT_SECRET || '').trim()
  };
}

function validateWechatConfig() {
  const config = getWechatConfig();
  if (!config.appId || !config.secret) {
    const error = new Error('Missing WECHAT_APPID or WECHAT_SECRET');
    error.statusCode = 500;
    throw error;
  }
  return config;
}

function createUserId(openid) {
  const { appId, secret } = getWechatConfig();
  const hash = crypto.createHash('sha256');
  hash.update(`${appId}:${secret}:${openid}`);
  return hash.digest('hex');
}

async function exchangeCodeForSession(code) {
  const trimmedCode = String(code || '').trim();
  if (!trimmedCode) {
    const error = new Error('code is required');
    error.statusCode = 400;
    throw error;
  }

  const { appId, secret } = validateWechatConfig();
  const url = new URL(WECHAT_CODE2SESSION_URL);
  url.searchParams.set('appid', appId);
  url.searchParams.set('secret', secret);
  url.searchParams.set('js_code', trimmedCode);
  url.searchParams.set('grant_type', 'authorization_code');

  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    console.error('[Backend] code2Session fetch exception', {
      name: error && error.name ? error.name : 'Error',
      message: error && error.message ? error.message : 'fetch failed',
      cause: safeCauseSummary(error && error.cause)
    });
    const wrappedError = new Error('code2Session failed');
    wrappedError.statusCode = 502;
    wrappedError.reason = error && error.message ? error.message : 'fetch failed';
    throw wrappedError;
  }

  const responseBody = await response.text();
  if (!response.ok) {
    console.error('[Backend] code2Session http status', response.status, truncateText(responseBody, 500));
    const error = new Error('code2Session failed');
    error.statusCode = 502;
    error.reason = `http status ${response.status}`;
    throw error;
  }

  let data;
  try {
    data = JSON.parse(responseBody);
  } catch (error) {
    console.error('[Backend] code2Session json parse failed', truncateText(responseBody, 500));
    const wrappedError = new Error('code2Session failed');
    wrappedError.statusCode = 502;
    wrappedError.reason = 'invalid json response';
    throw wrappedError;
  }

  if (data.errcode) {
    console.error('[Backend] code2Session failed', {
      errcode: data.errcode,
      errmsg: data.errmsg || ''
    });
    const error = new Error('code2Session failed');
    error.statusCode = 401;
    error.reason = data.errmsg || 'wechat errcode';
    error.details = {
      errcode: data.errcode,
      errmsg: data.errmsg || ''
    };
    throw error;
  }

  if (!data.openid) {
    const error = new Error('openid missing from WeChat response');
    error.statusCode = 502;
    throw error;
  }

  return data;
}

function buildAuthState(openid) {
  const memberOpenIds = parseListEnv('MEMBER_OPENIDS');
  const adminOpenIds = parseListEnv('ADMIN_OPENIDS');

  return {
    loggedIn: true,
    userId: createUserId(openid),
    isMember: memberOpenIds.includes(openid),
    isAdminAllowed: adminOpenIds.includes(openid)
  };
}

function buildApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/login', async (req, res, next) => {
    try {
      const { code } = req.body || {};
      const session = await exchangeCodeForSession(code);
      const authState = buildAuthState(session.openid);
      res.json(authState);
    } catch (error) {
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      return res.status(statusCode).json({
        loggedIn: false,
        userId: '',
        isMember: false,
        isAdminAllowed: false,
        error: error && error.message ? error.message : 'login failed',
        reason: error && error.reason ? error.reason : 'safe reason'
      });
    }
  });

  app.post('/api/admin/verify', async (req, res, next) => {
    try {
      const { code, adminCode } = req.body || {};
      const trimmedAdminCode = String(adminCode || '').trim();
      if (!trimmedAdminCode) {
        return res.status(400).json({
          adminMode: false,
          error: 'adminCode is required'
        });
      }

      const session = await exchangeCodeForSession(code);
      const adminOpenIds = parseListEnv('ADMIN_OPENIDS');
      const adminCodes = parseListEnv('ADMIN_CODES');
      const adminMode =
        adminOpenIds.includes(session.openid) &&
        adminCodes.includes(trimmedAdminCode);

      return res.json({ adminMode });
    } catch (error) {
      return next(error);
    }
  });

  app.use((req, res) => {
    res.status(404).json({
      error: 'Not Found'
    });
  });

  app.use((error, req, res, next) => {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    const payload = {
      error: error.message || 'Internal Server Error'
    };

    if (error.details) {
      payload.details = error.details;
    }

    if (statusCode === 401 && req.path === '/api/admin/verify') {
      return res.status(200).json({
        adminMode: false
      });
    }

    if (statusCode === 401 && req.path === '/api/login') {
      return res.status(401).json({
        loggedIn: false,
        userId: '',
        isMember: false,
        isAdminAllowed: false,
        error: payload.error
      });
    }

    return res.status(statusCode).json(payload);
  });

  return app;
}

module.exports = {
  buildApp,
  parseListEnv,
  exchangeCodeForSession,
  buildAuthState,
  createUserId
};
