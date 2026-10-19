'use strict';
const fs = require('fs');
const path = require('path');
const config = require('../config');

const LOG_DIR = path.join(config.rootDir, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

const appLog = fs.createWriteStream(path.join(LOG_DIR, 'app.log'), { flags: 'a' });
const errorLog = fs.createWriteStream(path.join(LOG_DIR, 'error.log'), { flags: 'a' });

function format(level, message, meta) {
  const entry = { time: new Date().toISOString(), level, message };
  if (meta !== undefined) {
    entry.meta = meta instanceof Error ? { error: meta.message, stack: meta.stack } : meta;
  }
  return JSON.stringify(entry);
}

function write(level, message, meta) {
  const line = format(level, message, meta);
  appLog.write(line + '\n');
  if (level === 'error') {
    errorLog.write(line + '\n');
    console.error(line);
  } else if (level !== 'debug') {
    console.log(line);
  }
}

module.exports = {
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
  // Operational events (logins, publishing, deletions...) - written to app.log only
  event: (message, meta) => write('event', message, meta)
};
