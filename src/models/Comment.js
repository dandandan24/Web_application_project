'use strict';
const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  authorName: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
  body: { type: String, required: true, trim: true, minlength: 2, maxlength: 1000 },
  // Used for the anti-spam limit (never sent to the client)
  deviceId: { type: String, index: true },
  fingerprint: { type: String, index: true }
}, { timestamps: true });

commentSchema.index({ article: 1, createdAt: -1 });
commentSchema.index({ createdAt: -1 });

commentSchema.methods.toPublic = function () {
  return {
    id: this._id.toString(),
    article: this.article.toString(),
    authorName: this.authorName,
    body: this.body,
    isStaff: Boolean(this.user),
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model('Comment', commentSchema);
