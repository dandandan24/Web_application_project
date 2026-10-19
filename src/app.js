'use strict';
const path = require('path');
const express = require('express');
const config = require('./config');
const logger = require('./utils/logger');
const format = require('./utils/format');
const { parseCookies } = require('./utils/cookies');
const { loadUser } = require('./middleware/auth');
const visitor = require('./middleware/visitor');
const { notFound, errorHandler } = require('./middleware/errors');
const apiRoutes = require('./routes/api');
const pageRoutes = require('./routes/pages');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');

// Values available inside every EJS template
app.locals.siteName = 'The Daily Web';
app.locals.fmt = format;
app.locals.categories = config.categories;
// Appended to CSS/JS URLs so browsers load fresh files after every deploy/restart
app.locals.assetVersion = Date.now().toString(36);

// Basic security headers + defaults used by the page header template
app.use((req, res, next) => {
  res.locals.path = req.path;
  res.locals.currentUser = null;
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  next();
});

// Static files (CSS, client JS, images). Chart.js is served from node_modules.
app.use(express.static(path.join(config.rootDir, 'public'), { maxAge: '1h' }));
app.use('/vendor/chart.js', express.static(path.join(config.rootDir, 'node_modules', 'chart.js', 'dist'), { maxAge: '7d' }));

// Request log (written to logs/app.log)
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    if (req.originalUrl.startsWith('/api/weather')) return;
    const entry = { method: req.method, url: req.originalUrl, status: res.statusCode, ms: Date.now() - started };
    if (res.statusCode >= 500) logger.error('Request failed', entry);
    else if (req.method !== 'GET' || res.statusCode >= 400) logger.info('Request', entry);
  });
  next();
});

app.use('/api/uploads', express.json({ limit: '3mb' }));
app.use(express.json({ limit: '200kb' }));
app.use((req, res, next) => {
  req.cookies = parseCookies(req.headers.cookie);
  next();
});
app.use(visitor);
app.use(loadUser);

app.use('/api', apiRoutes);
app.use('/', pageRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
