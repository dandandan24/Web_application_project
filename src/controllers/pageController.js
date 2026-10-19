'use strict';
const config = require('../config');
const HttpError = require('../utils/httpError');
const { Article, Comment } = require('../models');
const { requireObjectId, str } = require('../utils/validate');
const articleService = require('../services/articleService');
const viewTracker = require('../services/viewTracker');
const workflow = require('../services/articleWorkflow');
const { categoryImage } = require('../utils/format');

// GET / - home page. The first 20 articles are rendered on the server, the rest are
// loaded with Ajax (infinite scroll, search, filters) without reloading the page.
exports.home = async (req, res) => {
  const category = str(req.query.category);
  const filters = {
    q: str(req.query.q, 100),
    category: config.categories.includes(category) ? category : '',
    viewed: ['viewed', 'unviewed'].includes(req.query.viewed) ? req.query.viewed : 'all',
    sort: req.query.sort === 'popular' ? 'popular' : 'date'
  };
  const feed = await articleService.findPublished({ ...filters, page: 1, visitorId: req.visitorId });
  res.render('pages/home', {
    title: 'The Daily Web - Latest news',
    description: 'The Daily Web - breaking news, politics, business, technology, science, sports and culture.',
    categories: config.categories,
    filters,
    feed
  });
};

// GET /articles/:id - full article. The whole content is in the initial HTML (SEO friendly).
exports.article = async (req, res) => {
  requireObjectId(req.params.id, 'article id');
  const article = await Article.findOne({ _id: req.params.id, isLive: true }, '-working')
    .populate('author', 'displayName').lean();
  if (!article) throw new HttpError(404, 'Article not found');

  // Every visit counts for the statistics
  viewTracker.recordView(String(article._id), req.visitorId);

  const [comments, commentCount, related] = await Promise.all([
    Comment.find({ article: article._id }).sort({ createdAt: -1 }).limit(50),
    Comment.countDocuments({ article: article._id }),
    Article.find({ isLive: true, 'live.category': article.live.category, _id: { $ne: article._id } },
      'live.title live.category live.imageUrl publishedAt')
      .sort({ publishedAt: -1 }).limit(4).lean()
  ]);

  res.render('pages/article', {
    title: `${article.live.title} - The Daily Web`,
    description: article.live.summary,
    content: article.live,
    article,
    imageUrl: article.live.imageUrl || categoryImage(article.live.category),
    comments: comments.map((c) => c.toPublic()),
    commentCount,
    hasMoreComments: commentCount > comments.length,
    related,
    preview: false
  });
};

// GET /workspace/articles/:id/preview - staff preview of the working copy (not counted as a view)
exports.preview = async (req, res) => {
  requireObjectId(req.params.id, 'article id');
  const article = await Article.findById(req.params.id).populate('author', 'displayName').lean();
  if (!article) throw new HttpError(404, 'Article not found');
  if (!workflow.canView(req.user, article)) throw new HttpError(403, 'This is not your article');
  res.render('pages/article', {
    title: `Preview: ${article.working.title || 'Untitled'}`,
    description: '',
    content: article.working,
    article,
    imageUrl: article.working.imageUrl || categoryImage(article.working.category),
    comments: [],
    commentCount: 0,
    hasMoreComments: false,
    related: [],
    preview: true,
    statusLabel: Article.STATUS_LABELS[article.status]
  });
};

// Reporter work area
exports.workspace = (req, res) => {
  res.render('pages/workspace', { title: 'My articles', statusLabels: Article.STATUS_LABELS });
};

exports.editArticle = async (req, res) => {
  requireObjectId(req.params.id, 'article id');
  const article = await Article.findById(req.params.id, 'author status');
  if (!article) throw new HttpError(404, 'Article not found');
  if (!workflow.canView(req.user, article)) throw new HttpError(403, 'This is not your article');
  res.render('pages/edit', { title: 'Edit article', articleId: article.id, categories: config.categories });
};

// Editor area
exports.editorDashboard = (req, res) => {
  res.render('pages/editor', { title: 'Editorial desk', statusLabels: Article.STATUS_LABELS });
};

exports.review = async (req, res) => {
  requireObjectId(req.params.id, 'article id');
  if (!(await Article.exists({ _id: req.params.id }))) throw new HttpError(404, 'Article not found');
  res.render('pages/review', { title: 'Review article', articleId: req.params.id });
};

exports.analytics = (req, res) => {
  res.render('pages/analytics', { title: 'Impact analytics', selected: str(req.query.article) });
};

exports.users = (req, res) => {
  res.render('pages/users', { title: 'Users' });
};

exports.comments = (req, res) => {
  res.render('pages/comments', { title: 'Comments moderation' });
};
