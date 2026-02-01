// src/services/userProfileService.js
const Rule = require("../models/Rule");
const Review = require("../models/Review");
const { RULE_VISIBILITY } = require("../constants/enums");

/**
 * Enrich a user object with public profile statistics
 * Calculates rules created, average rating, and total downloads for approved rules
 * @param {Object} user - User object
 * @returns {Promise<Object>} Enriched user object with statistics
 */
exports.enrichUserProfile = async (user) => {
  try {
    // Count all APPROVED rules (regardless of visibility)
    const rulesCreated = await Rule.countDocuments({
      author: user._id,
      status: "APPROVED",
    });

    let averageRating = 0;
    let totalDownloads = 0;

    if (rulesCreated > 0) {
      // Get all approved rules to calculate downloads and rating
      const userRules = await Rule.find({
        author: user._id,
        status: "APPROVED",
      }).select("_id statistics");

      // Sum downloads from all approved rules
      totalDownloads = userRules.reduce(
        (sum, rule) => sum + (rule.statistics?.downloads || 0),
        0
      );

      // Calculate average rating from all reviews on approved rules
      const ruleIds = userRules.map((rule) => rule._id);
      const reviews = await Review.find({
        rule: { $in: ruleIds },
        isActive: true,
      }).select("rating");

      if (reviews.length > 0) {
        const totalRating = reviews.reduce(
          (sum, review) => sum + (review.rating || 0),
          0
        );
        averageRating = parseFloat((totalRating / reviews.length).toFixed(1));
      }
    }

    return {
      ...user.toObject(),
      rulesCreated,
      statistics: {
        ...user.statistics,
        totalDownloads,
        rating: averageRating,
      },
    };
  } catch (error) {
    console.error("Error enriching user profile:", error);
    throw error;
  }
};

/**
 * Enrich multiple user objects with statistics
 * @param {Array<Object>} users - Array of user objects
 * @returns {Promise<Array<Object>>} Array of enriched user objects
 */
exports.enrichUserProfiles = async (users) => {
  try {
    return Promise.all(users.map((user) => exports.enrichUserProfile(user)));
  } catch (error) {
    console.error("Error enriching user profiles:", error);
    throw error;
  }
};

/**
 * Get user stats for search results (simplified version)
 * @param {Object} user - User object
 * @returns {Promise<Object>} User with stats property
 */
exports.enrichUserWithStats = async (user) => {
  try {
    const rulesPublished = await Rule.countDocuments({
      author: user._id,
      status: "APPROVED",
    });

    let averageRating = 0;

    if (rulesPublished > 0) {
      // Get user's approved rules
      const userRules = await Rule.find({
        author: user._id,
        status: "APPROVED",
      }).select("_id");

      const ruleIds = userRules.map((rule) => rule._id);
      const reviews = await Review.find({
        rule: { $in: ruleIds },
        isActive: true,
      }).select("rating");

      if (reviews.length > 0) {
        const totalRating = reviews.reduce(
          (sum, review) => sum + (review.rating || 0),
          0
        );
        averageRating = parseFloat((totalRating / reviews.length).toFixed(1));
      }
    }

    return {
      _id: user._id,
      username: user.username,
      profile: user.profile,
      avatar: user.avatar,
      stats: {
        rulesPublished,
        averageRating,
      },
    };
  } catch (error) {
    console.error("Error enriching user with stats:", error);
    throw error;
  }
};

/**
 * Enrich multiple users with stats
 * @param {Array<Object>} users - Array of user objects
 * @returns {Promise<Array<Object>>} Array of enriched users
 */
exports.enrichUsersWithStats = async (users) => {
  try {
    return Promise.all(users.map((user) => exports.enrichUserWithStats(user)));
  } catch (error) {
    console.error("Error enriching users with stats:", error);
    throw error;
  }
};
