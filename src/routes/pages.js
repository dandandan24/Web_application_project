'use strict';
const express = require('express');
const ah = require('../utils/asyncHandler');
const { requireRole } = require('../middleware/auth');
const pages = require('../controllers/pageController');
const auth = require('../controllers/authController');

const router = express.Router();
const staff = requireRole('reporter', 'editor');
const editor = requireRole('editor');

// Public
router.get('/', ah(pages.home));
router.get('/articles/:id', ah(pages.article));
router.get('/login', auth.loginPage);

// Reporter work area (editors can use it too)
router.get('/workspace', staff, pages.workspace);
router.get('/workspace/articles/:id/edit', staff, ah(pages.editArticle));
router.get('/workspace/articles/:id/preview', staff, ah(pages.preview));

// Editor area
router.get('/editor', editor, pages.editorDashboard);
router.get('/editor/articles/:id', editor, ah(pages.review));
router.get('/editor/analytics', editor, pages.analytics);
router.get('/editor/users', editor, pages.users);
router.get('/editor/comments', editor, pages.comments);

module.exports = router;
