'use strict';
const mongoose = require('mongoose');
const config = require('./config');
const logger = require('./utils/logger');

async function connect() {
  mongoose.set('strictQuery', true);
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  mongoose.connection.on('error', (err) => logger.error('MongoDB error', err));
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  logger.info('Connected to MongoDB');
}

module.exports = { connect, mongoose };
