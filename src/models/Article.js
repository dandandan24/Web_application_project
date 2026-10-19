'use strict';
const mongoose = require('mongoose');
const config = require('../config');

const STATUSES = ['draft', 'pending', 'published', 'returned'];
const STATUS_LABELS = {
  draft: 'In preparation',
  pending: 'Awaiting editor approval',
  published: 'Published',
  returned: 'Returned for corrections'
};

// One version of the article's content. An article keeps two of them:
//  - working: the version reporters/editors are editing (autosaved)
//  - live:    the last version an editor approved - this is what the public sees
const contentSchema = new mongoose.Schema({
  title: { type: String, trim: true, maxlength: 200, default: '' },
  summary: { type: String, trim: true, maxlength: 500, default: '' },
  body: { type: String, maxlength: 50000, default: '' },
  category: { type: String, enum: [...config.categories, ''], default: '' },
  imageUrl: { type: String, trim: true, maxlength: 500, default: '' }
}, { _id: false });

const publishEventSchema = new mongoose.Schema({
  at: { type: Date, required: true },
  editor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  version: { type: Number, required: true }
}, { _id: false });

const articleSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: STATUSES, default: 'draft', required: true },
  working: { type: contentSchema, default: () => ({}) },
  workingSavedAt: { type: Date, default: Date.now },
  live: { type: contentSchema, default: null },
  isLive: { type: Boolean, default: false }, // true once a version was approved
  editorNote: { type: String, trim: true, maxlength: 2000, default: '' },
  submittedAt: Date,
  publishedAt: Date,      // first publication
  lastPublishedAt: Date,  // last approved update
  publishEvents: { type: [publishEventSchema], default: [] },
  viewCount: { type: Number, default: 0 }
}, { timestamps: true });

// Indexes that keep the public feed fast with thousands of articles
articleSchema.index({ isLive: 1, publishedAt: -1, _id: -1 });
articleSchema.index({ isLive: 1, viewCount: -1, _id: -1 });
articleSchema.index({ isLive: 1, 'live.category': 1, publishedAt: -1 });
// Work areas
articleSchema.index({ author: 1, updatedAt: -1 });
articleSchema.index({ status: 1, updatedAt: -1 });

articleSchema.statics.STATUSES = STATUSES;
articleSchema.statics.STATUS_LABELS = STATUS_LABELS;

// True when the working copy differs from what is currently public
articleSchema.methods.hasUnpublishedChanges = function () {
  if (!this.live) return true;
  return ['title', 'summary', 'body', 'category', 'imageUrl']
    .some((f) => (this.working[f] || '') !== (this.live[f] || ''));
};

module.exports = mongoose.model('Article', articleSchema);
