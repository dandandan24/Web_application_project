'use strict';
const config = require('./config');
const logger = require('./utils/logger');
const db = require('./db');
const app = require('./app');
const viewTracker = require('./services/viewTracker');

let server;

async function start() {
  try {
    await db.connect();
  } catch (err) {
    logger.error(`Cannot connect to MongoDB at ${config.mongoUri}. Is MongoDB running?`, err);
    process.exit(1);
  }
  viewTracker.start();
  server = app.listen(config.port, () => {
    logger.info(`The Daily Web is running on http://localhost:${config.port}`);
  });
}

// Graceful shutdown: write the buffered view counters before exiting
async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down`);
  const forceExit = setTimeout(() => process.exit(1), 8000);
  forceExit.unref();
  if (server) server.close();
  await viewTracker.stop();
  await db.mongoose.disconnect();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Last line of defence - log instead of crashing silently
process.on('unhandledRejection', (reason) => logger.error('Unhandled promise rejection', reason));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err);
  process.exit(1);
});

start();
