'use strict';
const mongoose = require('mongoose');
const HttpError = require('./httpError');

function isObjectId(value) {
  return typeof value === 'string' && mongoose.Types.ObjectId.isValid(value) && /^[a-f0-9]{24}$/i.test(value);
}

function requireObjectId(value, what = 'id') {
  if (!isObjectId(value)) throw new HttpError(404, `Invalid ${what}`);
  return value;
}

// Returns a trimmed string, or '' for anything that is not a string
function str(value, maxLength) {
  if (typeof value !== 'string') return '';
  const s = value.trim();
  return maxLength ? s.slice(0, maxLength) : s;
}

function int(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0 } = {}) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Escapes user input so it can be safely used inside a RegExp (prevents ReDoS / injection)
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isSafeImageUrl(url) {
  if (!url) return true;
  if (url.startsWith('/uploads/') || url.startsWith('/img/')) return !url.includes('..');
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

module.exports = { isObjectId, requireObjectId, str, int, escapeRegex, isSafeImageUrl };
