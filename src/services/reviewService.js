// src/services/reviewService.js
// Centralized review service utilities

const Review = require("../models/Review");
const Rule = require("../models/Rule");
const Purchase = require("../models/Purchase");
const Activity = require("../models/Activity");
const { errors } = require("../middleware/errorHandler");

/**
 * Calculate average rating and count for a rule
 * @param {string} ruleId - Rule ID
 * @returns {Object} { avgRating, totalRatings }
 */
exports.calculateRuleRating = async (ruleId) => {
  const allReviews = await Review.find({
    rule: ruleId,
    isActive: true,
  });

  if (allReviews.length === 0) {
    return { avgRating: 0, totalRatings: 0 };
  }

  const sum = allReviews.reduce((total, review) => total + review.rating, 0);
  const avgRating = parseFloat((sum / allReviews.length).toFixed(1));
  const totalRatings = allReviews.length;

  return { avgRating, totalRatings };
};

/**
 * Update rule rating statistics
 * @param {string} ruleId - Rule ID to update
 */
exports.updateRuleRating = async (ruleId) => {
  const { avgRating, totalRatings } = await exports.calculateRuleRating(ruleId);

  await Rule.findByIdAndUpdate(ruleId, {
    "statistics.rating": avgRating,
    "statistics.totalRatings": totalRatings,
  });
};

/**
 * Check if user can review a rule (must be purchaser for paid rules)
 * @param {string} userId - User ID
 * @param {Object} rule - Rule document
 * @returns {boolean} True if user can review, false otherwise
 */
exports.canReviewRule = async (userId, rule) => {
  // Free rules can be reviewed by anyone
  if (!rule.pricing || rule.pricing.type !== "PAID") {
    return true;
  }

  // Paid rules require purchase
  const purchase = await Purchase.findOne({
    user: userId,
    rule: rule._id,
    isActive: true,
  });

  return !!purchase;
};

/**
 * Check if user has already reviewed this rule
 * @param {string} userId - User ID
 * @param {string} ruleId - Rule ID
 * @returns {Object|null} Existing review or null
 */
exports.getUserReviewForRule = async (userId, ruleId) => {
  return await Review.findOne({
    rule: ruleId,
    user: userId,
  });
};

/**
 * Log review activity
 * @param {string} userId - User ID
 * @param {string} activityType - Type of activity (RULE_REVIEWED, REVIEW_UPDATED, etc)
 * @param {string} ruleId - Rule ID
 * @param {Object} metadata - Additional metadata
 */
exports.logReviewActivity = async (userId, activityType, ruleId, metadata = {}) => {
  await Activity.create({
    user: userId,
    type: activityType,
    target: ruleId,
    targetModel: "Rule",
    metadata,
  });
};

/**
 * Check review ownership and permissions
 * @param {Object} review - Review document
 * @param {Object} user - User document
 * @throws {Error} If user doesn't have permission
 */
exports.checkReviewOwnership = (review, user) => {
  if (review.user.toString() !== user._id.toString() && user.role !== "ADMIN") {
    throw errors.forbidden("You can only manage your own reviews");
  }
};

/**
 * Mark review as helpful or not helpful
 * @param {Object} review - Review document
 * @param {string} userId - User ID marking as helpful
 * @param {boolean} helpful - True to mark helpful, false to unmark
 * @returns {Object} { count, userMarked }
 */
exports.toggleReviewHelpful = async (review, userId, helpful) => {
  const userIndex = review.helpful.users.indexOf(userId);
  const wasMarked = userIndex !== -1;

  if (helpful && !wasMarked) {
    // Mark as helpful
    review.helpful.users.push(userId);
    review.helpful.count += 1;
  } else if (!helpful && wasMarked) {
    // Unmark as helpful
    review.helpful.users.splice(userIndex, 1);
    review.helpful.count -= 1;
  }

  await review.save();

  return {
    count: review.helpful.count,
    userMarked: helpful,
  };
};

/**
 * Get sort option for reviews
 * @param {string} sortType - Sort type (helpful, newest, oldest)
 * @returns {Object} MongoDB sort object
 */
exports.getReviewSortOption = (sortType = "helpful") => {
  const sortOptions = {
    helpful: { "helpful.count": -1, createdAt: -1 },
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
  };

  return sortOptions[sortType] || sortOptions.helpful;
};

/**
 * Validate review input
 * @param {number} rating - Rating 1-5
 * @param {string} comment - Review comment
 * @returns {Object} { valid, message }
 */
exports.validateReviewInput = (rating, comment) => {
  if (!rating || rating < 1 || rating > 5) {
    return {
      valid: false,
      message: "Rating must be between 1 and 5",
    };
  }

  if (!comment || comment.trim().length < 10) {
    return {
      valid: false,
      message: "Comment must be at least 10 characters long",
    };
  }

  if (comment.length > 1000) {
    return {
      valid: false,
      message: "Comment cannot exceed 1000 characters",
    };
  }

  return { valid: true, message: null };
};

/**
 * Build review response with helpful status
 * @param {Array} reviews - Array of review documents
 * @param {string} userId - Current user ID (optional)
 * @returns {Array} Reviews with userMarkedHelpful flag
 */
exports.enrichReviewsWithHelpfulStatus = (reviews, userId) => {
  if (!userId) {
    return reviews;
  }

  return reviews.map((review) => ({
    ...review,
    userMarkedHelpful: review.helpful.users.includes(userId),
  }));
};
