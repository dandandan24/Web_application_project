'use strict';
const crypto = require('crypto');
const mongoose = require('mongoose');

const ROLES = ['reporter', 'editor'];
const KEY_LENGTH = 64;

const userSchema = new mongoose.Schema({
  username: {
    type: String, required: true, unique: true, lowercase: true, trim: true,
    minlength: 3, maxlength: 30, match: /^[a-z0-9_.-]+$/
  },
  displayName: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
  role: { type: String, enum: ROLES, required: true, default: 'reporter' },
  // Passwords are never stored as plain text: we keep a random salt and a scrypt hash (one-way)
  passwordHash: { type: String, required: true },
  passwordSalt: { type: String, required: true },
  lastLoginAt: Date
}, { timestamps: true });

userSchema.methods.setPassword = function (password) {
  this.passwordSalt = crypto.randomBytes(16).toString('hex');
  this.passwordHash = crypto.scryptSync(password, this.passwordSalt, KEY_LENGTH).toString('hex');
};

userSchema.methods.checkPassword = function (password) {
  const hash = crypto.scryptSync(String(password), this.passwordSalt, KEY_LENGTH);
  const stored = Buffer.from(this.passwordHash, 'hex');
  // timingSafeEqual prevents timing attacks on the comparison
  return stored.length === hash.length && crypto.timingSafeEqual(stored, hash);
};

// Never send password fields to the client
userSchema.methods.toPublic = function () {
  return {
    id: this._id.toString(),
    username: this.username,
    displayName: this.displayName,
    role: this.role,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt
  };
};

userSchema.statics.ROLES = ROLES;

module.exports = mongoose.model('User', userSchema);
