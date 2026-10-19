'use strict';
const logger = require('../utils/logger');
const HttpError = require('../utils/httpError');
const { Article, Comment } = require('../models');
const { requireObjectId, str, int } = require('../utils/validate');
const limiter = require('../services/commentLimiter');

async function requirePublishedArticle(id) {
  requireObjectId(id, 'article id');
  const exists = await Article.exists({ _id: id, isLive: true });
  if (!exists) throw new HttpError(404, 'Article not found');
}

function readComment(body, { requireName }) {
  const authorName = str(body.authorName, 50);
  const text = str(body.body, 1000);
  const errors = {};
  if (requireName && authorName.length < 2) errors.authorName = 'Please enter your name (at least 2 characters)';
  if (text.length < 2) errors.body = 'Comment is too short';
  if (typeof body.body === 'string' && body.body.trim().length > 1000) errors.body = 'Comment is limited to 1000 characters';
  if (Object.keys(errors).length) throw new HttpError(400, 'Please fix the comment form', errors);
  return { authorName, body: text };
}

// GET /api/articles/:id/comments?page=
exports.list = async (req, res) => {
  await requirePublishedArticle(req.params.id);
  const page = int(req.query.page, { min: 1, max: 1000, fallback: 1 });
  const limit = 50;
  const filter = { article: req.params.id };
  const [docs, total] = await Promise.all([
    Comment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Comment.countDocuments(filter)
  ]);
  res.json({ items: docs.map((c) => c.toPublic()), page, total, hasMore: page * limit < total });
};

// POST /api/articles/:id/comments
exports.create = async (req, res) => {
  await requirePublishedArticle(req.params.id);
  const input = readComment(req.body || {}, { requireName: !req.user });

  // Logged-in staff comment under their own name, guests are rate limited per device
  if (req.user) {
    const comment = await Comment.create({
      article: req.params.id, user: req.user._id, authorName: req.user.displayName, body: input.body
    });
    return res.status(201).json(comment.toPublic());
  }

  const comment = await limiter.withLock(req.visitorId, async () => {
    const check = await limiter.checkLimit(req.visitorId, req.fingerprint);
    if (!check.allowed) {
      logger.warn('Comment rate limit reached', { visitor: req.visitorId, ip: req.ip });
      res.set('Retry-After', String(check.retryAfter));
      throw new HttpError(429, `You can post up to 3 comments per minute. Please try again in ${check.retryAfter} seconds.`, { retryAfter: check.retryAfter });
    }
    return Comment.create({
      article: req.params.id,
      authorName: input.authorName,
      body: input.body,
      deviceId: req.visitorId,
      fingerprint: req.fingerprint
    });
  });
  res.status(201).json(comment.toPublic());
};

// GET /api/comments?q=&page= - editor moderation list (newest first)
exports.listAll = async (req, res) => {
  const page = int(req.query.page, { min: 1, max: 10000, fallback: 1 });
  const limit = 30;
  const docs = await Comment.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit + 1)
    .populate('article', 'live.title');
  res.json({
    items: docs.slice(0, limit).map((c) => ({
      ...c.toPublic(),
      articleTitle: c.article && c.article.live ? c.article.live.title : '(deleted article)'
    })),
    page,
    hasMore: docs.length > limit
  });
};

// PUT /api/comments/:id - editor moderation
exports.update = async (req, res) => {
  requireObjectId(req.params.id, 'comment id');
  const comment = await Comment.findById(req.params.id);
  if (!comment) throw new HttpError(404, 'Comment not found');
  const input = readComment({ authorName: comment.authorName, ...req.body }, { requireName: true });
  comment.body = input.body;
  comment.authorName = input.authorName;
  await comment.save();
  logger.event('Comment edited', { comment: comment.id, by: req.user.username });
  res.json(comment.toPublic());
};

// DELETE /api/comments/:id - editor moderation
exports.remove = async (req, res) => {
  requireObjectId(req.params.id, 'comment id');
  const result = await Comment.deleteOne({ _id: req.params.id });
  if (result.deletedCount === 0) throw new HttpError(404, 'Comment not found');
  logger.event('Comment deleted', { comment: req.params.id, by: req.user.username });
  res.status(204).end();
};
