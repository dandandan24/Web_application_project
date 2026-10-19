'use strict';
const config = require('../config');
const logger = require('../utils/logger');
const { ViewStat, Article, ReadHistory } = require('../models');

// Article views are counted in memory and written to MongoDB in batches every few seconds.
// Thousands of readers opening articles become a handful of bulk "$inc" writes instead of
// one database write per page view.
let pending = new Map(); // "articleId|bucketISO" -> count
let timer = null;

function recordView(articleId, visitorId) {
  const bucket = ViewStat.hourBucket().toISOString();
  const key = `${articleId}|${bucket}`;
  pending.set(key, (pending.get(key) || 0) + 1);

  // The per-visitor history is written right away so the "viewed" filter is accurate immediately
  if (visitorId) {
    ReadHistory.updateOne(
      { visitor: visitorId, article: articleId },
      { $set: { lastViewedAt: new Date() } },
      { upsert: true }
    ).catch((err) => logger.error('Failed to save read history', err));
  }
}

async function flush() {
  if (pending.size === 0) return;
  const batch = pending;
  pending = new Map();

  const statOps = [];
  const totals = new Map();
  for (const [key, count] of batch) {
    const [article, bucket] = key.split('|');
    statOps.push({
      updateOne: {
        filter: { article, bucket: new Date(bucket) },
        update: { $inc: { count } },
        upsert: true
      }
    });
    totals.set(article, (totals.get(article) || 0) + count);
  }
  const articleOps = [...totals].map(([id, count]) => ({
    updateOne: { filter: { _id: id }, update: { $inc: { viewCount: count } } }
  }));

  try {
    await ViewStat.bulkWrite(statOps, { ordered: false });
    await Article.bulkWrite(articleOps, { ordered: false });
  } catch (err) {
    logger.error('Failed to flush view statistics - will retry', err);
    // Put the counts back so no views are lost
    for (const [key, count] of batch) pending.set(key, (pending.get(key) || 0) + count);
  }
}

function start() {
  if (timer) return;
  timer = setInterval(flush, config.viewsFlushMs);
  timer.unref();
}

async function stop() {
  clearInterval(timer);
  timer = null;
  await flush();
}

module.exports = { recordView, flush, start, stop };
