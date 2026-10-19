'use strict';
const HttpError = require('../utils/httpError');

// Allowed status transitions. Anything not listed here is rejected by the server.
const TRANSITIONS = {
  'draft->pending': { role: 'reporter', ownerOnly: true },
  'returned->pending': { role: 'reporter', ownerOnly: true },
  'pending->published': { role: 'editor' },
  'pending->returned': { role: 'editor', noteRequired: true }
};

function isOwner(user, article) {
  const authorId = article.author && article.author._id ? article.author._id : article.author;
  return String(authorId) === String(user._id);
}

function canView(user, article) {
  return user.role === 'editor' || isOwner(user, article);
}

// Who may change the working copy, and in which status
function canEdit(user, article) {
  if (user.role === 'editor') return true;
  return isOwner(user, article) && ['draft', 'returned', 'published'].includes(article.status);
}

function canDelete(user, article) {
  if (user.role === 'editor') return true;
  // A reporter may only throw away his own draft that was never published
  return isOwner(user, article) && article.status === 'draft' && !article.isLive;
}

function assertTransition(user, article, to, note) {
  const rule = TRANSITIONS[`${article.status}->${to}`];
  if (!rule) throw new HttpError(409, `Cannot move an article from "${article.status}" to "${to}"`);
  if (user.role !== rule.role) throw new HttpError(403, 'You are not allowed to make this change');
  if (rule.ownerOnly && !isOwner(user, article)) throw new HttpError(403, 'This is not your article');
  if (rule.noteRequired && !note) throw new HttpError(400, 'Please add a note explaining what needs to be fixed');
}

// Content must be complete before it is sent for approval or published
function validateComplete(content, categories) {
  const errors = {};
  if (!content.title || content.title.length < 5) errors.title = 'Title must be at least 5 characters';
  if (!content.summary || content.summary.length < 20) errors.summary = 'Summary must be at least 20 characters';
  if (!content.body || content.body.trim().length < 100) errors.body = 'Article body must be at least 100 characters';
  if (!categories.includes(content.category)) errors.category = 'Please choose a category';
  if (Object.keys(errors).length) throw new HttpError(400, 'The article is not complete yet', errors);
}

module.exports = { TRANSITIONS, isOwner, canView, canEdit, canDelete, assertTransition, validateComplete };
