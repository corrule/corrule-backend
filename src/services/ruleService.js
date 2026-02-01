// src/services/ruleService.js
const Rule = require("../models/Rule");
const RuleVersion = require("../models/RuleVersion");
const Activity = require("../models/Activity");
const { RULE_STATUS, ACTIVITY_TYPE, RULE_VISIBILITY } = require("../constants/enums");
const { errors } = require("../middleware/errorHandler");

/**
 * Check if user owns the rule or is an admin
 * @param {Object} rule - Rule document
 * @param {Object} user - User object with _id and role
 * @throws {Error} If user doesn't have permission
 */
exports.checkRuleOwnership = (rule, user) => {
  // Normalize author id whether `author` is an ObjectId or a populated object
  const authorId = rule && rule.author
    ? (rule.author._id ? rule.author._id.toString() : rule.author.toString())
    : null;

  const userId = user && user._id ? user._id.toString() : null;

  if (authorId !== userId && user.role !== "ADMIN") {
    throw errors.forbidden("You do not have permission to modify this rule");
  }
};

/**
 * Create activity log entry
 * @param {Object} activityData - Activity data
 * @returns {Promise<Object>} Created activity document
 */
exports.logActivity = async (userId, type, targetId, metadata = {}, req) => {
  return Activity.create({
    user: userId,
    type,
    target: targetId,
    targetModel: "Rule",
    metadata,
    ipAddress: req?.ip,
    userAgent: req?.get("user-agent"),
  });
};

/**
 * Enrich rule with populated author and calculated stats
 * @param {Object} rule - Rule document
 * @returns {Promise<Object>} Enriched rule
 */
exports.enrichRule = async (rule) => {
  if (!rule.populated("author")) {
    await rule.populate("author", "username profile statistics.rating");
  }
  return rule;
};

/**
 * Increment version number
 * @param {string} version - Current version (e.g., "1.0.0")
 * @returns {string} Next version
 */
exports.incrementVersion = (version) => {
  const parts = version.split(".");
  const minor = parseInt(parts[1] || 0) + 1;
  return `${parts[0] || "1"}.${minor}.0`;
};

/**
 * Create or update rule version
 * @param {string} ruleId - Rule ID
 * @param {Object} versionData - Version data
 * @returns {Promise<Object>} Created version
 */
exports.createRuleVersion = async (ruleId, versionData) => {
  const version = new RuleVersion({
    rule: ruleId,
    ...versionData,
  });
  return version.save();
};

/**
 * Get version history for a rule
 * @param {string} ruleId - Rule ID
 * @returns {Promise<Array>} Array of versions
 */
exports.getRuleVersions = async (ruleId) => {
  return RuleVersion.find({ rule: ruleId })
    .select("version changelog createdAt createdBy")
    .sort({ createdAt: -1 })
    .lean();
};

/**
 * Validate rule status transition
 * @param {string} currentStatus - Current rule status
 * @param {string} targetStatus - Target rule status
 * @throws {Error} If transition is invalid
 */
exports.validateStatusTransition = (currentStatus, targetStatus) => {
  const validTransitions = {
    [RULE_STATUS.DRAFT]: [RULE_STATUS.UNDER_REVIEW, RULE_STATUS.REJECTED],
    [RULE_STATUS.UNDER_REVIEW]: [RULE_STATUS.APPROVED, RULE_STATUS.REJECTED],
    [RULE_STATUS.REJECTED]: [RULE_STATUS.DRAFT],
    [RULE_STATUS.APPROVED]: [RULE_STATUS.DRAFT],
  };

  const allowed = validTransitions[currentStatus] || [];
  if (!allowed.includes(targetStatus)) {
    throw errors.badRequest(
      `Cannot transition from ${currentStatus} to ${targetStatus}`
    );
  }
};

/**
 * Get rule visibility string for error messages
 * @param {string} visibility - Rule visibility enum
 * @returns {string} Human-readable visibility
 */
exports.getVisibilityLabel = (visibility) => {
  const labels = {
    [RULE_VISIBILITY.PUBLIC]: "public",
    [RULE_VISIBILITY.PRIVATE]: "private",
    [RULE_VISIBILITY.PAID]: "paid",
  };
  return labels[visibility] || visibility;
};

/**
 * Calculate seller earnings from transaction
 * @param {number} amount - Transaction amount
 * @param {number} platformFeePercent - Platform fee percentage (default: 10)
 * @returns {Object} With platformFee and sellerEarnings
 */
exports.calculateEarnings = (amount, platformFeePercent = 10) => {
  const platformFee = (amount * platformFeePercent) / 100;
  const sellerEarnings = amount - platformFee;
  return { platformFee, sellerEarnings };
};
