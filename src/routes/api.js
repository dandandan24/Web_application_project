'use strict';
const express = require('express');
const ah = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { requireRole } = require('../middleware/auth');
const auth = require('../controllers/authController');
const articles = require('../controllers/articleController');
const comments = require('../controllers/commentController');
const users = require('../controllers/userController');
const stats = require('../controllers/statsController');
const weather = require('../controllers/weatherController');
const uploads = require('../controllers/uploadController');

const router = express.Router();
const staff = requireRole('reporter', 'editor');
const editor = requireRole('editor');

// Requests that change data must be JSON. Browsers cannot send cross-site JSON
// requests with cookies without CORS permission, so this also blocks CSRF.
router.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers['content-length'] !== '0' &&
      !req.is('application/json') && req.headers['content-type'] !== undefined) {
    return next(new HttpError(415, 'Requests must be sent as JSON'));
  }
  next();
});

// Authentication
router.post('/auth/login', ah(auth.login));
router.post('/auth/logout', ah(auth.logout));
router.get('/auth/me', auth.me);

// Public articles (approved content only)
router.get('/articles', ah(articles.listPublished));
router.get('/articles/:id', ah(articles.getPublished));

// Comments
router.get('/articles/:id/comments', ah(comments.list));
router.post('/articles/:id/comments', ah(comments.create));
router.get('/comments', editor, ah(comments.listAll));
router.put('/comments/:id', editor, ah(comments.update));
router.delete('/comments/:id', editor, ah(comments.remove));

// Work area - reporters see their own articles, editors see all
router.get('/workspace/articles', staff, ah(articles.listWorkspace));
router.post('/workspace/articles', requireRole('reporter'), ah(articles.create));
router.get('/workspace/articles/:id', staff, ah(articles.getOne));
router.put('/workspace/articles/:id', staff, ah(articles.update));
router.patch('/workspace/articles/:id/status', staff, ah(articles.changeStatus));
router.delete('/workspace/articles/:id', staff, ah(articles.remove));
router.post('/uploads', staff, ah(uploads.uploadImage));

// Users management (editors)
router.get('/users', editor, ah(users.list));
router.post('/users', editor, ah(users.create));
router.get('/users/:id', editor, ah(users.getOne));
router.put('/users/:id', editor, ah(users.update));
router.delete('/users/:id', editor, ah(users.remove));

// Views statistics (editors). Views are created automatically when an article page is opened.
router.get('/stats/articles', editor, ah(stats.listArticles));
router.get('/stats/articles/:id', editor, ah(stats.articleStats));
router.get('/stats/articles/:id/buckets', editor, ah(stats.listBuckets));
router.delete('/stats/articles/:id', editor, ah(stats.resetArticle));
router.put('/stats/:statId', editor, ah(stats.updateBucket));

// External weather service (through our cache)
router.get('/weather', ah(weather.current));
router.get('/weather/cities', weather.cities);

router.use((req, res, next) => next(new HttpError(404, 'API endpoint not found')));

module.exports = router;
