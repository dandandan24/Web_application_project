'use strict';
const logger = require('../utils/logger');
const HttpError = require('../utils/httpError');
const { User } = require('../models');
const { str } = require('../utils/validate');
const { createSession, destroySession } = require('../middleware/auth');

function homeFor(user) {
  return user.role === 'editor' ? '/editor' : '/workspace';
}

// Only allow redirects to local paths (prevents open-redirect attacks)
function safeNext(next) {
  return typeof next === 'string' && /^\/(?!\/)[\w\-/?=&.%]*$/.test(next) ? next : null;
}

// GET /login
exports.loginPage = (req, res) => {
  if (req.user) return res.redirect(homeFor(req.user));
  res.render('pages/login', { title: 'Staff login', next: safeNext(req.query.next) || '' });
};

// POST /api/auth/login { username, password }
exports.login = async (req, res) => {
  const username = str(req.body && req.body.username, 30).toLowerCase();
  const password = req.body && typeof req.body.password === 'string' ? req.body.password : '';
  if (!username || !password) throw new HttpError(400, 'Please enter username and password');

  const user = await User.findOne({ username });
  if (!user || !user.checkPassword(password)) {
    logger.warn('Failed login attempt', { username, ip: req.ip });
    throw new HttpError(401, 'Wrong username or password');
  }
  user.lastLoginAt = new Date();
  await user.save();
  await createSession(res, user);
  logger.event('User logged in', { user: user.username, role: user.role });

  // Editors may also go to the page they originally asked for
  const next = safeNext(req.body.next);
  const redirect = next && (user.role === 'editor' || !next.startsWith('/editor')) ? next : homeFor(user);
  res.json({ user: user.toPublic(), redirect });
};

// POST /api/auth/logout
exports.logout = async (req, res) => {
  await destroySession(req, res);
  if (req.user) logger.event('User logged out', { user: req.user.username });
  res.json({ ok: true });
};

// GET /api/auth/me
exports.me = (req, res) => {
  res.json({ user: req.user ? req.user.toPublic() : null });
};
