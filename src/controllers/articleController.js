'use strict';
const config = require('../config');
const logger = require('../utils/logger');
const HttpError = require('../utils/httpError');
const { Article, Comment, ViewStat, ReadHistory } = require('../models');
const { requireObjectId, str, int, escapeRegex, isSafeImageUrl } = require('../utils/validate');
const workflow = require('../services/articleWorkflow');
const articleService = require('../services/articleService');

const CONTENT_LIMITS = { title: 200, summary: 500, body: 50000, category: 40, imageUrl: 500 };

// Reads the editable content fields from a request body, ignoring anything else
function readContent(body) {
  const content = {};
  for (const [field, max] of Object.entries(CONTENT_LIMITS)) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== 'string') throw new HttpError(400, `Field "${field}" must be text`);
    content[field] = field === 'body' ? body[field].slice(0, max) : str(body[field], max);
  }
  if (content.category && !config.categories.includes(content.category)) {
    throw new HttpError(400, 'Unknown category');
  }
  if (content.imageUrl && !isSafeImageUrl(content.imageUrl)) {
    throw new HttpError(400, 'Image must be an http(s) URL or an uploaded image');
  }
  return content;
}

async function loadArticle(id, { populate = true } = {}) {
  requireObjectId(id, 'article id');
  const query = Article.findById(id);
  if (populate) query.populate('author', 'displayName username');
  const article = await query;
  if (!article) throw new HttpError(404, 'Article not found');
  return article;
}

/* ---------- Public API ---------- */

// GET /api/articles?q=&category=&viewed=all|viewed|unviewed&sort=date|popular&page=1
exports.listPublished = async (req, res) => {
  const category = str(req.query.category);
  const result = await articleService.findPublished({
    q: str(req.query.q, 100),
    category: config.categories.includes(category) ? category : '',
    viewed: str(req.query.viewed),
    sort: str(req.query.sort),
    page: int(req.query.page, { min: 1, max: 10000, fallback: 1 }),
    visitorId: req.visitorId
  });
  res.json(result);
};

// GET /api/articles/:id - public (live) version only
exports.getPublished = async (req, res) => {
  requireObjectId(req.params.id, 'article id');
  const doc = await Article.findOne({ _id: req.params.id, isLive: true }).populate('author', 'displayName').lean();
  if (!doc) throw new HttpError(404, 'Article not found');
  res.json({ ...articleService.toCard(doc), body: doc.live.body });
};

/* ---------- Work area API (reporters & editors) ---------- */

// GET /api/workspace/articles?status=&q=&page=
// Reporters only get their own articles; editors get everything.
exports.listWorkspace = async (req, res) => {
  const filter = {};
  if (req.user.role !== 'editor') filter.author = req.user._id;
  const status = str(req.query.status);
  if (Article.STATUSES.includes(status)) filter.status = status;
  const q = str(req.query.q, 100);
  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ 'working.title': regex }, { 'live.title': regex }];
  }
  const page = int(req.query.page, { min: 1, max: 10000, fallback: 1 });
  const limit = 25;

  const [docs, total, counts] = await Promise.all([
    Article.find(filter, 'status working.title working.category live.title isLive author updatedAt workingSavedAt submittedAt publishedAt lastPublishedAt editorNote viewCount')
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', 'displayName')
      .lean(),
    Article.countDocuments(filter),
    Article.aggregate([
      { $match: req.user.role === 'editor' ? {} : { author: req.user._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ])
  ]);

  res.json({
    items: docs.map((d) => ({
      id: String(d._id),
      title: d.working.title || (d.live && d.live.title) || 'Untitled article',
      category: d.working.category,
      status: d.status,
      statusLabel: Article.STATUS_LABELS[d.status],
      isLive: d.isLive,
      author: d.author ? d.author.displayName : '',
      editorNote: d.editorNote,
      updatedAt: d.updatedAt,
      submittedAt: d.submittedAt,
      publishedAt: d.publishedAt,
      lastPublishedAt: d.lastPublishedAt,
      viewCount: d.viewCount
    })),
    counts: Object.fromEntries(counts.map((c) => [c._id, c.count])),
    page,
    total,
    hasMore: page * limit < total
  });
};

// POST /api/workspace/articles - a new article always starts "In preparation"
exports.create = async (req, res) => {
  const content = readContent(req.body || {});
  const article = await Article.create({ author: req.user._id, status: 'draft', working: content });
  logger.event('Article created', { article: article.id, by: req.user.username });
  res.status(201).json(articleService.toWorkspace(article));
};

// GET /api/workspace/articles/:id
exports.getOne = async (req, res) => {
  const article = await loadArticle(req.params.id);
  if (!workflow.canView(req.user, article)) throw new HttpError(403, 'This is not your article');
  res.json(articleService.toWorkspace(article));
};

// PUT /api/workspace/articles/:id - saves the working copy (used by autosave).
// The public (live) version is never touched here.
exports.update = async (req, res) => {
  const article = await loadArticle(req.params.id);
  if (!workflow.canEdit(req.user, article)) {
    throw new HttpError(403, article.status === 'pending' && workflow.isOwner(req.user, article)
      ? 'The article is waiting for editor approval and cannot be changed right now'
      : 'You are not allowed to edit this article');
  }
  const content = readContent(req.body || {});
  const changed = Object.keys(content).some((k) => (article.working[k] || '') !== content[k]);

  if (changed) {
    Object.assign(article.working, content);
    article.workingSavedAt = new Date();
    // Editing published content starts a new revision that must be approved again.
    // The approved version stays live for readers in the meantime.
    if (article.status === 'published') {
      article.status = req.user.role === 'editor' ? 'pending' : 'draft';
      article.editorNote = '';
      if (article.status === 'pending') article.submittedAt = new Date();
      logger.event('New revision of a published article started', { article: article.id, by: req.user.username });
    }
    await article.save();
  }
  res.json(articleService.toWorkspace(article));
};

// PATCH /api/workspace/articles/:id/status { status, note }
exports.changeStatus = async (req, res) => {
  const article = await loadArticle(req.params.id);
  const to = str(req.body && req.body.status);
  const note = str(req.body && req.body.note, 2000);
  workflow.assertTransition(req.user, article, to, note);

  if (to === 'pending') {
    workflow.validateComplete(article.working, config.categories);
    article.submittedAt = new Date();
  }
  if (to === 'returned') {
    article.editorNote = note;
  }
  if (to === 'published') {
    workflow.validateComplete(article.working, config.categories);
    const now = new Date();
    article.live = article.working.toObject();
    article.isLive = true;
    if (!article.publishedAt) article.publishedAt = now;
    article.lastPublishedAt = now;
    article.editorNote = '';
    article.publishEvents.push({ at: now, editor: req.user._id, version: article.publishEvents.length + 1 });
  }
  const from = article.status;
  article.status = to;
  await article.save();
  logger.event('Article status changed', { article: article.id, from, to, by: req.user.username });
  res.json(articleService.toWorkspace(article));
};

// DELETE /api/workspace/articles/:id - also removes its comments and statistics
exports.remove = async (req, res) => {
  const article = await loadArticle(req.params.id, { populate: false });
  if (!workflow.canDelete(req.user, article)) throw new HttpError(403, 'You are not allowed to delete this article');
  await Promise.all([
    Article.deleteOne({ _id: article._id }),
    Comment.deleteMany({ article: article._id }),
    ViewStat.deleteMany({ article: article._id }),
    ReadHistory.deleteMany({ article: article._id })
  ]);
  logger.event('Article deleted', { article: article.id, by: req.user.username });
  res.status(204).end();
};

exports.loadArticle = loadArticle;
