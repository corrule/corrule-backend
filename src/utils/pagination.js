/**
 * Generate standardized pagination object
 * @param {number} total - Total count of items
 * @param {number} page - Current page (1-based, default: 1)
 * @param {number} limit - Items per page (default: 20, max: 100)
 * @returns {object} Pagination object with total, page, limit, pages, hasNext, hasPrev
 */
function getPagination(total, page = 1, limit = 20) {
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
  
  const totalPages = Math.ceil(total / limitNum);
  
  return {
    total,
    page: pageNum,
    limit: limitNum,
    pages: totalPages,
    hasNext: pageNum < totalPages,
    hasPrev: pageNum > 1,
  };
}

module.exports = { getPagination };
