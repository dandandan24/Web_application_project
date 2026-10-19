'use strict';
const crypto = require('crypto');
const config = require('../config');
const { Session } = require('../models');
const HttpError = require('../utils/httpError');
const logger = require('../utils/logger');

const SESSION_COOKIE = 'dw_session';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createSession(res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  const maxAge = config.sessionDays * 24 * 60 * 60 * 1000;
  await Session.create({ tokenHash: hashToken(token), user: user._id, expiresAt: new Date(Date.now() + maxAge) });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, // not readable from browser JavaScript
    sameSite: 'lax', // basic CSRF protection
    secure: config.cookieSecure,
    maxAge,
    path: '/'
  });
}

async function destroySession(req, res) {
  const token = req.cookies[SESSION_COOKIE];
  if (token) await Session.deleteOne({ tokenHash: hashToken(token) });
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

// Loads the logged-in user from the session cookie. The role always comes from the
// database, never from something the browser sends, so it cannot be forged.
async function loadUser(req, res, next) {
  req.user = null;
  const token = req.cookies[SESSION_COOKIE];
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    try {
      const session = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } })
        .populate('user');
      if (session && session.user) req.user = session.user;
    } catch (err) {
      logger.error('Failed to load session', err);
    }
  }
  res.locals.currentUser = req.user ? req.user.toPublic() : null;
  next();
}

function wantsJson(req) {
  return req.originalUrl.startsWith('/api/');
}

// requireRole() - any logged-in user; requireRole('editor') - editors only
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      if (wantsJson(req)) return next(new HttpError(401, 'Please log in first'));
      return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    }
    if (roles.length && !roles.includes(req.user.role)) {
      logger.warn('Forbidden access attempt', { user: req.user.username, url: req.originalUrl });
      return next(new HttpError(403, 'You do not have permission to do this'));
    }
    next();
  };
}

module.exports = { loadUser, requireRole, createSession, destroySession };
