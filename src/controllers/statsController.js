'use strict';
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const HttpError = require('../utils/httpError');
const { Article, ViewStat } = require('../models');
const { requireObjectId, str, escapeRegex, int } = require('../utils/validate');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const RANGES = { '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY, '90d': 90 * DAY };
const IMPACT_WINDOW_HOURS = 24;

// GET /api/stats/articles?q= - published articles to choose from, most viewed first
exports.listArticles = async (req, res) => {
  const filter = { isLive: true };
  const q = str(req.query.q, 100);
  if (q) filter['live.title'] = new RegExp(escapeRegex(q), 'i');
  const docs = await Article.find(filter, 'live.title live.category viewCount publishEvents publishedAt')
    .sort({ viewCount: -1, _id: -1 }).limit(int(req.query.limit, { min: 1, max: 100, fallback: 30 })).lean();
  res.json({
    items: docs.map((d) => ({
      id: String(d._id),
      title: d.live.title,
      category: d.live.category,
      viewCount: d.viewCount,
      updates: Math.max(0, d.publishEvents.length - 1),
      publishedAt: d.publishedAt
    }))
  });
};

// Sums views per hour or per day between two dates, filling empty slots with 0
async function series(articleId, from, to, interval) {
  const step = interval === 'day' ? DAY : HOUR;
  const rows = await ViewStat.aggregate([
    { $match: { article: new mongoose.Types.ObjectId(articleId), bucket: { $gte: from, $lt: to } } },
    { $group: { _id: { $dateTrunc: { date: '$bucket', unit: interval, timezone: 'UTC' } }, views: { $sum: '$count' } } },
    { $sort: { _id: 1 } }
  ]);
  const byTime = new Map(rows.map((r) => [r._id.getTime(), r.views]));
  const start = new Date(from);
  if (interval === 'day') start.setUTCHours(0, 0, 0, 0); else start.setUTCMinutes(0, 0, 0);
  const points = [];
  for (let t = start.getTime(); t < to.getTime(); t += step) {
    points.push({ t: new Date(t).toISOString(), views: byTime.get(t) || 0 });
  }
  return points;
}

// Average views per hour in the 24h before and after every approved update
async function impact(articleId, events) {
  const result = [];
  for (const event of events) {
    const at = ViewStat.hourBucket(event.at).getTime();
    const windowMs = IMPACT_WINDOW_HOURS * HOUR;
    const [before, after] = await Promise.all([
      sum(articleId, new Date(at - windowMs), new Date(at)),
      sum(articleId, new Date(at), new Date(Math.min(at + windowMs, Date.now() + HOUR)))
    ]);
    const hoursAfter = Math.max(1, Math.min(IMPACT_WINDOW_HOURS, Math.ceil((Date.now() - at) / HOUR)));
    const avgBefore = before / IMPACT_WINDOW_HOURS;
    const avgAfter = after / hoursAfter;
    result.push({
      at: event.at,
      version: event.version,
      isFirstPublish: event.version === 1,
      avgBefore: Math.round(avgBefore * 10) / 10,
      avgAfter: Math.round(avgAfter * 10) / 10,
      changePct: avgBefore > 0 ? Math.round(((avgAfter - avgBefore) / avgBefore) * 100) : null
    });
  }
  return result;
}

async function sum(articleId, from, to) {
  const [row] = await ViewStat.aggregate([
    { $match: { article: new mongoose.Types.ObjectId(articleId), bucket: { $gte: from, $lt: to } } },
    { $group: { _id: null, total: { $sum: '$count' } } }
  ]);
  return row ? row.total : 0;
}

// GET /api/stats/articles/:id?range=24h|7d|30d|90d|all&interval=hour|day
exports.articleStats = async (req, res) => {
  requireObjectId(req.params.id, 'article id');
  const article = await Article.findById(req.params.id, 'live working status publishEvents publishedAt viewCount isLive').lean();
  if (!article) throw new HttpError(404, 'Article not found');

  const range = RANGES[req.query.range] || ['all', 'updates'].includes(req.query.range) ? req.query.range : 'updates';
  const nowBucket = new Date(ViewStat.hourBucket().getTime() + HOUR);
  const events = article.publishEvents;
  let to = nowBucket;
  let from;
  if (range === 'updates' && events.length) {
    // From one day before the first publication until 3 days after the last approved update
    from = ViewStat.hourBucket(new Date(events[0].at.getTime() - DAY));
    to = new Date(Math.min(nowBucket.getTime(), ViewStat.hourBucket(events[events.length - 1].at).getTime() + 3 * DAY));
  } else if (range === 'all' || range === 'updates') {
    from = ViewStat.hourBucket(article.publishedAt || new Date(Date.now() - 7 * DAY));
  } else {
    from = new Date(to.getTime() - RANGES[range]);
  }
  if (to - from > 120 * DAY) from = new Date(to.getTime() - 120 * DAY); // keep the response small
  if (to - from < DAY) to = new Date(from.getTime() + DAY);
  let interval = req.query.interval === 'day' || req.query.interval === 'hour' ? req.query.interval : null;
  if (!interval) interval = to - from > 14 * DAY ? 'day' : 'hour';
  if (interval === 'hour' && to - from > 31 * DAY) interval = 'day';

  const points = await series(req.params.id, from, to, interval);
  const impacts = await impact(req.params.id, events.filter((e) => e.at >= from && e.at < to));

  res.json({
    article: {
      id: String(article._id),
      title: (article.live || article.working).title,
      status: article.status,
      viewCount: article.viewCount,
      totalUpdates: Math.max(0, article.publishEvents.length - 1)
    },
    range,
    interval,
    from,
    to,
    totalInRange: points.reduce((s, p) => s + p.views, 0),
    points,
    events: impacts
  });
};

// PUT /api/stats/:statId { count } - manual correction of one hourly bucket
exports.updateBucket = async (req, res) => {
  requireObjectId(req.params.statId, 'statistic id');
  const count = Number(req.body && req.body.count);
  if (!Number.isInteger(count) || count < 0) throw new HttpError(400, 'count must be a non-negative integer');
  const stat = await ViewStat.findById(req.params.statId);
  if (!stat) throw new HttpError(404, 'Statistic not found');
  const diff = count - stat.count;
  stat.count = count;
  await stat.save();
  await Article.updateOne({ _id: stat.article }, { $inc: { viewCount: diff } });
  logger.event('View statistic corrected', { stat: stat.id, count, by: req.user.username });
  res.json(stat);
};

// GET /api/stats/articles/:id/buckets?from=&to= - raw hourly documents
exports.listBuckets = async (req, res) => {
  requireObjectId(req.params.id, 'article id');
  const filter = { article: req.params.id };
  const from = new Date(req.query.from);
  const to = new Date(req.query.to);
  if (!Number.isNaN(from.getTime()) || !Number.isNaN(to.getTime())) {
    filter.bucket = {};
    if (!Number.isNaN(from.getTime())) filter.bucket.$gte = from;
    if (!Number.isNaN(to.getTime())) filter.bucket.$lt = to;
  }
  const items = await ViewStat.find(filter).sort({ bucket: -1 }).limit(500).lean();
  res.json({ items });
};

// DELETE /api/stats/articles/:id - reset an article's statistics
exports.resetArticle = async (req, res) => {
  requireObjectId(req.params.id, 'article id');
  const result = await ViewStat.deleteMany({ article: req.params.id });
  await Article.updateOne({ _id: req.params.id }, { $set: { viewCount: 0 } });
  logger.event('Article statistics reset', { article: req.params.id, removed: result.deletedCount, by: req.user.username });
  res.status(204).end();
};
