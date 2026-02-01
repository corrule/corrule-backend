// src/services/moderationService.js
const { errors } = require("../middleware/errorHandler");
const Rule = require("../models/Rule");
const User = require("../models/User");
const Activity = require("../models/Activity");
const Notification = require("../models/Notification");
const { notifyRuleApproved, notifyRuleRejected } = require("../utils/notificationHelper");
const { RULE_STATUS, ACTIVITY_TYPE } = require("../constants/enums");

/**
 * Validate moderation action period
 */
exports.buildDateFilter = (period) => {
  const dateFilter = {};
  if (period === "week") {
    dateFilter.$gte = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === "month") {
    dateFilter.$gte = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  } else if (period === "quarter") {
    dateFilter.$gte = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  }
  return dateFilter;
};

/**
 * Get moderation statistics
 */
exports.getModerationStatistics = async (dateFilter) => {
  const pendingRules = await Rule.countDocuments({ status: RULE_STATUS.UNDER_REVIEW });

  const approvedRules = await Rule.countDocuments({
    status: RULE_STATUS.APPROVED,
    ...(Object.keys(dateFilter).length > 0 && { updatedAt: dateFilter }),
  });

  const rejectedRules = await Rule.countDocuments({
    status: RULE_STATUS.REJECTED,
    ...(Object.keys(dateFilter).length > 0 && { updatedAt: dateFilter }),
  });

  return { pendingRules, approvedRules, rejectedRules };
};

/**
 * Get actions by moderator
 */
exports.getActionsByModerator = async (dateFilter) => {
  return await Activity.aggregate([
    {
      $match: {
        type: { $in: [ACTIVITY_TYPE.RULE_APPROVED, ACTIVITY_TYPE.RULE_REJECTED, "USER_WARNED"] },
        ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
      },
    },
    {
      $group: {
        _id: "$user",
        count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "moderator",
      },
    },
  ]);
};

/**
 * Get average review time
 */
exports.getAverageReviewTime = async (dateFilter) => {
  const result = await Activity.aggregate([
    {
      $match: {
        type: { $in: [ACTIVITY_TYPE.RULE_APPROVED, ACTIVITY_TYPE.RULE_REJECTED] },
        ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
      },
    },
    {
      $group: {
        _id: null,
        avgTime: { $avg: "$processingTime" },
      },
    },
  ]);

  return result[0]?.avgTime || 0;
};

/**
 * Validate user warning input
 */
exports.validateWarningInput = (reason, severity) => {
  if (!reason) {
    throw errors.badRequest("Reason is required");
  }

  if (!["low", "medium", "high"].includes(severity)) {
    throw errors.badRequest("Invalid severity level");
  }
};

/**
 * Warn user about violations
 */
exports.warnUser = async (userId, reason, severity, moderatorId, req) => {
  const user = await User.findById(userId);
  if (!user) throw errors.notFound("User not found");

  // Create warning activity log
  await Activity.create({
    user: moderatorId,
    type: "USER_WARNED",
    target: userId,
    targetModel: "User",
    description: `User warned: ${reason}`,
    metadata: { severity },
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  });

  // Send notification to user
  await Notification.create({
    user: userId,
    type: "USER_WARNING",
    title: `Account Warning (${severity.toUpperCase()})`,
    message: `You have received a warning from our moderation team: ${reason}`,
    data: {
      severity,
      reason,
    },
  });

  // If high severity, disable account temporarily
  if (severity === "high") {
    user.isActive = false;
    await user.save();
  }

  return user;
};

/**
 * Approve rule for publication
 */
exports.approveRule = async (ruleId, feedback, moderatorId, req) => {
  const rule = await Rule.findById(ruleId).populate("author");

  if (!rule) throw errors.notFound("Rule not found");

  // Check status BEFORE any modifications
  if (rule.status !== RULE_STATUS.UNDER_REVIEW) {
    throw errors.badRequest("Rule must be in UNDER_REVIEW status to approve");
  }

  // Update status
  rule.status = RULE_STATUS.APPROVED;
  await rule.save();

  // Log activity
  await Activity.create({
    user: moderatorId,
    type: ACTIVITY_TYPE.RULE_APPROVED,
    target: ruleId,
    targetModel: "Rule",
    description: feedback || "Rule approved",
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  });

  // Notify author (includes Socket.IO real-time event)
  await notifyRuleApproved(rule.author._id, rule.title, ruleId);

  return rule;
};

/**
 * Reject rule submission
 */
exports.rejectRule = async (ruleId, reason, moderatorId, req) => {
  if (!reason) {
    throw errors.badRequest("Rejection reason is required");
  }

  const rule = await Rule.findById(ruleId).populate("author");

  if (!rule) throw errors.notFound("Rule not found");

  // Check status BEFORE any modifications
  if (rule.status !== RULE_STATUS.UNDER_REVIEW) {
    throw errors.badRequest("Rule must be in UNDER_REVIEW status to reject");
  }

  // Update status
  rule.status = RULE_STATUS.REJECTED;
  await rule.save();

  // Log activity
  await Activity.create({
    user: moderatorId,
    type: ACTIVITY_TYPE.RULE_REJECTED,
    target: ruleId,
    targetModel: "Rule",
    description: reason,
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  });

  // Notify author (includes Socket.IO real-time event)
  await notifyRuleRejected(rule.author._id, rule.title, reason, ruleId);

  return rule;
};
