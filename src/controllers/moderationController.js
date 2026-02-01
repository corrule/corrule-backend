// src/controllers/moderationController.js
const Rule = require("../models/Rule");
const User = require("../models/User");
const Activity = require("../models/Activity");
const { asyncHandler, errors } = require("../middleware/errorHandler");
const { getPagination } = require("../utils/pagination");
const moderationService = require("../services/moderationService");
const { RULE_STATUS, ACTIVITY_TYPE } = require("../constants/enums");

/**
 * Get moderation queue (pending rules for review)
 * @access Moderator, Admin
 */
exports.getModerationQueue = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status = RULE_STATUS.UNDER_REVIEW } = req.query;
  const skip = (page - 1) * limit;

  const [rules, total] = await Promise.all([
    Rule.find({ status })
      .populate("author", "username email")
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Rule.countDocuments({ status }),
  ]);

  res.json({
    success: true,
    data: {
      rules,
      pagination: getPagination(total, page, limit),
    },
  });
});

/**
 * Get moderation history (actions taken by moderators)
 * @access Moderator, Admin
 */
exports.getModerationHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, moderator } = req.query;
  const skip = (page - 1) * limit;

  let query = {
    type: { $in: ["RULE_APPROVED", "RULE_REJECTED", "USER_WARNED", "USER_SUSPENDED"] },
  };

  if (moderator) {
    query.user = moderator;
  }

  const [history, total] = await Promise.all([
    Activity.find(query)
      .populate("user", "username email role")
      .populate("target")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Activity.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: {
      history,
      pagination: getPagination(total, page, limit),
    },
  });
});

/**
 * Get moderation statistics
 * @access Moderator, Admin
 */
exports.getModerationStats = asyncHandler(async (req, res) => {
  const { period = "month" } = req.query;

  const dateFilter = moderationService.buildDateFilter(period);

  const [stats, actions, avgReviewTime] = await Promise.all([
    moderationService.getModerationStatistics(dateFilter),
    moderationService.getActionsByModerator(dateFilter),
    moderationService.getAverageReviewTime(dateFilter),
  ]);

  res.json({
    success: true,
    data: {
      pendingRules: stats.pendingRules,
      approvedRules: stats.approvedRules,
      rejectedRules: stats.rejectedRules,
      actionsByModerator: actions,
      averageReviewTime: avgReviewTime,
    },
  });
});

/**
 * Warn user about violations
 * @access Moderator, Admin
 */
exports.warnUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { reason, severity = "low" } = req.body;

  moderationService.validateWarningInput(reason, severity);
  const user = await moderationService.warnUser(userId, reason, severity, req.user._id, req);

  res.json({
    success: true,
    message: "User warned successfully",
    data: {
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
      },
    },
  });
});

/**
 * Approve rule for publication
 * @access Moderator, Admin
 */
exports.approveRule = asyncHandler(async (req, res) => {
  const { ruleId } = req.params;
  const { feedback } = req.body;

  const rule = await moderationService.approveRule(ruleId, feedback, req.user._id, req);

  res.json({
    success: true,
    message: "Rule approved successfully",
    data: { rule },
  });
});

/**
 * Reject rule submission
 * @access Moderator, Admin
 */
exports.rejectRule = asyncHandler(async (req, res) => {
  const { ruleId } = req.params;
  const { reason } = req.body;

  const rule = await moderationService.rejectRule(ruleId, reason, req.user._id, req);

  res.json({
    success: true,
    message: "Rule rejected successfully",
    data: { rule },
  });
});

module.exports = exports;
