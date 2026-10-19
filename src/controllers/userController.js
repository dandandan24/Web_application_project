'use strict';
const logger = require('../utils/logger');
const HttpError = require('../utils/httpError');
const { User, Article, Session } = require('../models');
const { requireObjectId, str, int, escapeRegex } = require('../utils/validate');

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 6 || password.length > 100) {
    throw new HttpError(400, 'Password must be 6-100 characters long', { password: 'Password must be 6-100 characters long' });
  }
}

function readRole(role) {
  if (!User.ROLES.includes(role)) throw new HttpError(400, 'Role must be reporter or editor', { role: 'Invalid role' });
  return role;
}

// GET /api/users?q=&role=&page=
exports.list = async (req, res) => {
  const filter = {};
  const q = str(req.query.q, 50);
  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ username: regex }, { displayName: regex }];
  }
  if (User.ROLES.includes(req.query.role)) filter.role = req.query.role;
  const page = int(req.query.page, { min: 1, max: 1000, fallback: 1 });
  const limit = 50;
  const [users, total] = await Promise.all([
    User.find(filter).sort({ role: 1, displayName: 1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter)
  ]);
  const counts = await Article.aggregate([
    { $match: { author: { $in: users.map((u) => u._id) } } },
    { $group: { _id: '$author', count: { $sum: 1 } } }
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
  res.json({
    items: users.map((u) => ({ ...u.toPublic(), articleCount: countMap.get(u.id) || 0 })),
    page,
    total,
    hasMore: page * limit < total
  });
};

// GET /api/users/:id
exports.getOne = async (req, res) => {
  requireObjectId(req.params.id, 'user id');
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'User not found');
  res.json(user.toPublic());
};

// POST /api/users
exports.create = async (req, res) => {
  const body = req.body || {};
  validatePassword(body.password);
  const user = new User({
    username: str(body.username, 30).toLowerCase(),
    displayName: str(body.displayName, 60),
    role: readRole(body.role)
  });
  user.setPassword(body.password);
  if (await User.exists({ username: user.username })) {
    throw new HttpError(409, 'Username is already taken', { username: 'Username is already taken' });
  }
  await user.save();
  logger.event('User created', { user: user.username, role: user.role, by: req.user.username });
  res.status(201).json(user.toPublic());
};

// PUT /api/users/:id { displayName?, role?, password? }
exports.update = async (req, res) => {
  requireObjectId(req.params.id, 'user id');
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'User not found');
  const body = req.body || {};

  if (body.displayName !== undefined) user.displayName = str(body.displayName, 60);
  if (body.role !== undefined) {
    const role = readRole(body.role);
    if (user.id === req.user.id && role !== 'editor') throw new HttpError(400, 'You cannot remove your own editor role');
    user.role = role;
  }
  if (body.password) {
    validatePassword(body.password);
    user.setPassword(body.password);
  }
  await user.save();
  // Password change logs the user out everywhere
  if (body.password && user.id !== req.user.id) await Session.deleteMany({ user: user._id });
  logger.event('User updated', { user: user.username, by: req.user.username });
  res.json(user.toPublic());
};

// DELETE /api/users/:id
exports.remove = async (req, res) => {
  requireObjectId(req.params.id, 'user id');
  if (req.params.id === req.user.id) throw new HttpError(400, 'You cannot delete your own account');
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'User not found');
  if (await Article.exists({ author: user._id })) {
    throw new HttpError(409, 'This user still has articles. Delete or reassign them first.');
  }
  await Promise.all([User.deleteOne({ _id: user._id }), Session.deleteMany({ user: user._id })]);
  logger.event('User deleted', { user: user.username, by: req.user.username });
  res.status(204).end();
};
