'use strict';
const mongoose = require('mongoose');

// Login sessions live in MongoDB (not in server memory), so a server restart
// does not log anybody out. Only a SHA-256 hash of the cookie token is stored.
const sessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

// TTL index - MongoDB removes expired sessions automatically
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ user: 1 });

module.exports = mongoose.model('Session', sessionSchema);
