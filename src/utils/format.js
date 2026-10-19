'use strict';

// Helpers exposed to EJS templates
function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(date) {
  if (!date) return '';
  return new Date(date).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

// Splits plain text into paragraphs (blank line = new paragraph)
function paragraphs(text) {
  return String(text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

function categoryImage(category) {
  return `/img/categories/${String(category || 'default').toLowerCase()}.svg`;
}

module.exports = { formatDate, formatDateTime, paragraphs, categoryImage };
