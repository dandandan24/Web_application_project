'use strict';
const config = require('../config');
const { Article, ReadHistory } = require('../models');
const { escapeRegex } = require('../utils/validate');
const { categoryImage } = require('../utils/format');

const CARD_FIELDS = 'live.title live.summary live.category live.imageUrl publishedAt lastPublishedAt viewCount author';

// Builds and runs the public feed query: only approved (live) content is ever returned
async function findPublished({ q, category, viewed, sort, page, visitorId }) {
  const filter = { isLive: true };
  if (category) filter['live.category'] = category;
  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ 'live.title': regex }, { 'live.summary': regex }];
  }
  if (viewed === 'viewed' || viewed === 'unviewed') {
    const ids = await ReadHistory.find({ visitor: visitorId }).distinct('article');
    filter._id = viewed === 'viewed' ? { $in: ids } : { $nin: ids };
  }
  const sortBy = sort === 'popular' ? { viewCount: -1, _id: -1 } : { publishedAt: -1, _id: -1 };
  const limit = config.feedPageSize;

  const [docs, total] = await Promise.all([
    Article.find(filter, CARD_FIELDS)
      .sort(sortBy)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', 'displayName')
      .lean(),
    Article.countDocuments(filter)
  ]);

  const viewedSet = await viewedIds(visitorId, docs.map((d) => d._id));
  return {
    items: docs.map((d) => toCard(d, viewedSet)),
    page,
    total,
    hasMore: page * limit < total
  };
}

async function viewedIds(visitorId, articleIds) {
  if (!visitorId || articleIds.length === 0) return new Set();
  const rows = await ReadHistory.find({ visitor: visitorId, article: { $in: articleIds } }, { article: 1 }).lean();
  return new Set(rows.map((r) => String(r.article)));
}

function toCard(doc, viewedSet = new Set()) {
  const id = String(doc._id);
  return {
    id,
    url: `/articles/${id}`,
    title: doc.live.title,
    summary: doc.live.summary,
    category: doc.live.category,
    imageUrl: doc.live.imageUrl || categoryImage(doc.live.category),
    author: doc.author ? doc.author.displayName : 'Staff',
    publishedAt: doc.publishedAt,
    updatedAt: doc.lastPublishedAt,
    viewCount: doc.viewCount,
    viewed: viewedSet.has(id)
  };
}

// Full representation for the reporter/editor work areas
function toWorkspace(article) {
  const author = article.author && article.author.displayName
    ? { id: String(article.author._id), displayName: article.author.displayName }
    : { id: String(article.author) };
  return {
    id: String(article._id),
    status: article.status,
    statusLabel: Article.STATUS_LABELS[article.status],
    author,
    working: article.working,
    live: article.live,
    isLive: article.isLive,
    hasUnpublishedChanges: article.isLive ? article.hasUnpublishedChanges() : true,
    editorNote: article.editorNote,
    workingSavedAt: article.workingSavedAt,
    submittedAt: article.submittedAt,
    publishedAt: article.publishedAt,
    lastPublishedAt: article.lastPublishedAt,
    publishEvents: article.publishEvents,
    viewCount: article.viewCount,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt
  };
}

module.exports = { findPublished, toCard, toWorkspace };
