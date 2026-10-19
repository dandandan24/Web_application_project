'use strict';
const mongoose = require('mongoose');

// Which articles a visitor (identified by an anonymous device cookie) has already opened.
// Powers the "viewed / not viewed" feed filter.
const readHistorySchema = new mongoose.Schema({
  visitor: { type: String, required: true },
  article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true },
  lastViewedAt: { type: Date, default: Date.now }
}, { versionKey: false });

readHistorySchema.index({ visitor: 1, article: 1 }, { unique: true });

module.exports = mongoose.model('ReadHistory', readHistorySchema);
