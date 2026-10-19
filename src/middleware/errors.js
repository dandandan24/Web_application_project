'use strict';
const mongoose = require('mongoose');
const HttpError = require('../utils/httpError');
const logger = require('../utils/logger');

function notFound(req, res, next) {
  next(new HttpError(404, 'Page not found'));
}

// Central error handler - turns every error into a proper response and never crashes the server
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details;

  if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = 'Invalid data';
    details = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid value for ${err.path}`;
  } else if (err.code === 11000) {
    status = 409;
    message = 'This value already exists';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request is too large';
  }

  if (status >= 500) {
    logger.error('Unhandled error', { url: req.originalUrl, method: req.method, error: err.message, stack: err.stack });
    message = 'Something went wrong on our side. Please try again.';
  } else if (status !== 404) {
    logger.warn('Request rejected', { url: req.originalUrl, method: req.method, status, message });
  }

  if (res.headersSent) return;
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(status).json({ error: message, details });
  }
  res.status(status).render('pages/error', { title: 'Error', status, message });
}

module.exports = { notFound, errorHandler, HttpError };
