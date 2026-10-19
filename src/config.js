'use strict';
const fs = require('fs');
const path = require('path');

// Minimal .env loader (no external packages): KEY=VALUE per line, '#' starts a comment.
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Real environment variables win over the file
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const ROOT_DIR = path.join(__dirname, '..');
loadEnvFile(path.join(ROOT_DIR, '.env'));

module.exports = {
  rootDir: ROOT_DIR,
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/daily_web',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  sessionDays: Number(process.env.SESSION_DAYS) || 7,
  feedPageSize: 20,
  comments: { maxPerWindow: 3, windowMs: 60 * 1000 },
  weather: {
    cacheMs: 10 * 60 * 1000, // max allowed lag is 15 minutes
    timeoutMs: 5000
  },
  viewsFlushMs: 5000,
  categories: ['Politics', 'World', 'Business', 'Technology', 'Science', 'Health', 'Sports', 'Culture']
};
