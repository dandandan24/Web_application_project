'use strict';
const crypto = require('crypto');
const config = require('../config');

const VISITOR_COOKIE = 'dw_vid';

// Every browser gets an anonymous device id (used for "viewed" filter and comment limits)
module.exports = function visitor(req, res, next) {
  let id = req.cookies[VISITOR_COOKIE];
  if (!id || !/^[a-f0-9-]{36}$/.test(id)) {
    id = crypto.randomUUID();
    res.cookie(VISITOR_COOKIE, id, {
      httpOnly: true, sameSite: 'lax', secure: config.cookieSecure,
      maxAge: 365 * 24 * 60 * 60 * 1000, path: '/'
    });
  }
  req.visitorId = id;
  // Secondary device signal in case the cookie is deleted
  req.fingerprint = crypto.createHash('sha256')
    .update((req.ip || '') + '|' + (req.get('user-agent') || ''))
    .digest('hex');
  next();
};
