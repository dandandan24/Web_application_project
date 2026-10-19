'use strict';
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const HttpError = require('../utils/httpError');

const UPLOAD_DIR = path.join(config.rootDir, 'public', 'uploads');
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = {
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  'image/gif': { ext: 'gif', magic: [0x47, 0x49, 0x46] },
  'image/webp': { ext: 'webp', magic: [0x52, 0x49, 0x46, 0x46] }
};

// POST /api/uploads { dataUrl: "data:image/png;base64,..." }
// The browser reads the file with FileReader and sends it as base64 inside JSON,
// so no multipart library is needed.
exports.uploadImage = async (req, res) => {
  const dataUrl = req.body && req.body.dataUrl;
  const match = typeof dataUrl === 'string' && dataUrl.match(/^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !TYPES[match[1]]) throw new HttpError(400, 'Only PNG, JPEG, GIF or WEBP images are allowed');

  const type = TYPES[match[1]];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_BYTES) throw new HttpError(413, 'Image is larger than 2MB');
  // Check the real file signature - not only what the client claims
  if (!type.magic.every((byte, i) => buffer[i] === byte)) throw new HttpError(400, 'File content is not a valid image');

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${type.ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, name), buffer);
  logger.event('Image uploaded', { file: name, bytes: buffer.length, by: req.user.username });
  res.status(201).json({ url: `/uploads/${name}` });
};
