const mongoose = require("mongoose");

/**
 * Validate MongoDB ObjectId format
 * @param {string} id - ID to validate
 * @returns {boolean} True if valid ObjectId
 */
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate numeric amount (for billing/transactions)
 * @param {number|string} amount - Amount to validate
 * @param {number} min - Minimum value (default: 0)
 * @param {number} max - Maximum value (default: Infinity)
 * @returns {boolean} True if valid amount
 */
function isValidAmount(amount, min = 0, max = Infinity) {
  const num = parseFloat(amount);
  return !isNaN(num) && num >= min && num <= max;
}

/**
 * Validate enum value
 * @param {any} value - Value to validate
 * @param {object} enumObject - Enum object with allowed values
 * @returns {boolean} True if value is in enum
 */
function isValidEnum(value, enumObject) {
  return Object.values(enumObject).includes(value);
}

module.exports = {
  isValidObjectId,
  isValidEmail,
  isValidAmount,
  isValidEnum,
};
