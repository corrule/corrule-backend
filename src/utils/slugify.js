/**
 * Convert title to URL-safe slug
 * Consistent with frontend implementation in forkUtils.ts
 * @param {string} title - Title to convert to slug
 * @returns {string} URL-safe slug (lowercase, hyphenated, no special chars)
 */
function slugify(title) {
  if (!title || typeof title !== 'string') {
    return '';
  }
  
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

module.exports = slugify;
