'use strict';
const mongoose = require('mongoose');

// Views are stored pre-aggregated: one document per article per hour, holding a counter.
// With thousands of concurrent readers this keeps the collection small (max 24 docs per
// article per day) and makes the analytics graph a cheap indexed range query.
const viewStatSchema = new mongoose.Schema({
  article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true },
  bucket: { type: Date, required: true }, // start of the hour (UTC)
  count: { type: Number, required: true, min: 0, default: 0 }
}, { timestamps: false, versionKey: false });

viewStatSchema.index({ article: 1, bucket: 1 }, { unique: true });

viewStatSchema.statics.hourBucket = function (date = new Date()) {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  return d;
};

module.exports = mongoose.model('ViewStat', viewStatSchema);
