'use strict';
const config = require('../config');
const { Comment } = require('../models');

// Anti-spam: a guest device may post at most N comments per minute.
// The check is based on comments saved in MongoDB, so it also survives a server restart.
// The device is identified by its cookie id OR by IP + user agent (if the cookie was deleted).
const locks = new Map();

// Runs checks for the same device one after another (prevents parallel requests slipping through)
function withLock(key, fn) {
  const previous = locks.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(fn);
  locks.set(key, current);
  current.finally(() => { if (locks.get(key) === current) locks.delete(key); }).catch(() => {});
  return current;
}

async function checkLimit(deviceId, fingerprint) {
  const since = new Date(Date.now() - config.comments.windowMs);
  const recent = await Comment.find(
    { createdAt: { $gt: since }, user: null, $or: [{ deviceId }, { fingerprint }] },
    { createdAt: 1 }
  ).sort({ createdAt: 1 }).limit(config.comments.maxPerWindow).lean();

  if (recent.length < config.comments.maxPerWindow) return { allowed: true };
  const retryAfterMs = recent[0].createdAt.getTime() + config.comments.windowMs - Date.now();
  return { allowed: false, retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
}

module.exports = { checkLimit, withLock };
