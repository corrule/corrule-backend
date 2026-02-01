// src/services/adminService.js
const { errors } = require("../middleware/errorHandler");
const User = require("../models/User");
const Rule = require("../models/Rule");
const Review = require("../models/Review");
const Transaction = require("../models/Transaction");
const Activity = require("../models/Activity");
const Notification = require("../models/Notification");

/**
 * Get dashboard metrics
 */
exports.getDashboardMetrics = async () => {
  const [
    totalUsers,
    totalRules,
    totalReviews,
    totalTransactions,
    activeUsers,
    pendingRules,
  ] = await Promise.all([
    User.countDocuments(),
    Rule.countDocuments(),
    Review.countDocuments({ isActive: true }),
    Transaction.countDocuments(),
    User.countDocuments({ lastLogin: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
    Rule.countDocuments({ status: "UNDER_REVIEW" }),
  ]);

  return {
    totalUsers,
    totalRules,
    totalReviews,
    totalTransactions,
    activeUsers,
    pendingRules,
  };
};

/**
 * Get revenue aggregation
 */
exports.getRevenueData = async () => {
  const revenueData = await Transaction.aggregate([
    {
      $match: { status: "COMPLETED" },
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$amount" },
        platformFees: { $sum: "$platformFee" },
        sellerPayouts: { $sum: "$sellerEarnings" },
        transactionCount: { $sum: 1 },
      },
    },
  ]);

  return revenueData[0] || {
    totalRevenue: 0,
    platformFees: 0,
    sellerPayouts: 0,
    transactionCount: 0,
  };
};

/**
 * Get top rules by downloads
 */
exports.getTopRules = async () => {
  return await Rule.find()
    .select("title statistics author")
    .sort({ "statistics.downloads": -1 })
    .limit(5)
    .populate("author", "username email")
    .lean();
};

/**
 * Get recent activity log
 */
exports.getRecentActivity = async () => {
  return await Activity.find()
    .populate("user", "username")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
};

/**
 * Build user query filters
 */
exports.buildUserQuery = (filters) => {
  const query = {};
  if (filters.role) query.role = filters.role;
  if (filters.status === "active")
    query.lastLogin = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
  if (filters.status === "inactive")
    query.lastLogin = { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
  return query;
};

/**
 * Get user role distribution
 */
exports.getUserRoleDistribution = async () => {
  return await User.aggregate([
    {
      $group: {
        _id: "$role",
        count: { $sum: 1 },
      },
    },
  ]);
};

/**
 * Build rule query filters
 */
exports.buildRuleQuery = (filters) => {
  const query = {};
  if (filters.status) query.status = filters.status;
  return query;
};

/**
 * Get rule status distribution
 */
exports.getRuleStatusDistribution = async () => {
  return await Rule.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);
};

/**
 * Approve rule and notify creator
 */
exports.approveRule = async (ruleId) => {
  const rule = await Rule.findById(ruleId);
  if (!rule) throw errors.notFound("Rule not found");

  rule.status = "APPROVED";
  rule.publishedAt = new Date();

  // Create notification
  await Notification.create({
    recipient: rule.creator,
    type: "RULE_APPROVED",
    title: "Rule Approved",
    message: `Your rule "${rule.title}" has been approved and published!`,
    data: { ruleId: rule._id },
    actionUrl: `/rules/${rule.slug}`,
  });

  await rule.save();
  return rule;
};

/**
 * Reject rule and notify creator
 */
exports.rejectRule = async (ruleId, reason) => {
  const rule = await Rule.findById(ruleId);
  if (!rule) throw errors.notFound("Rule not found");

  rule.status = "REJECTED";
  rule.rejectionReason = reason;

  // Create notification
  await Notification.create({
    recipient: rule.creator,
    type: "RULE_REJECTED",
    title: "Rule Rejected",
    message: `Your rule "${rule.title}" was rejected. Reason: ${reason}`,
    data: { ruleId: rule._id, reason },
  });

  await rule.save();
  return rule;
};

/**
 * Validate user role
 */
exports.validateUserRole = (role) => {
  const validRoles = ["USER", "VERIFIED_CONTRIBUTOR", "MODERATOR", "ADMIN"];
  if (!validRoles.includes(role)) {
    throw errors.badRequest("Invalid role");
  }
};

/**
 * Update user role with activity logging
 */
exports.updateUserRoleWithLogging = async (userId, newRole, adminUserId) => {
  const user = await User.findById(userId);
  if (!user) throw errors.notFound("User not found");

  const oldRole = user.role;
  user.role = newRole;
  await user.save();

  // Log activity
  await Activity.create({
    user: adminUserId,
    type: "ADMIN_ACTION",
    target: userId,
    targetModel: "User",
    metadata: {
      action: "role_updated",
      oldRole,
      newRole,
    },
  });

  return user.select("-password -refreshTokens");
};

/**
 * Suspend user with notification
 */
exports.suspendUser = async (userId, reason, duration) => {
  const user = await User.findById(userId);
  if (!user) throw errors.notFound("User not found");

  user.suspended = true;
  user.suspensionReason = reason;
  user.suspensionUntil = duration ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000) : null;
  await user.save();

  // Create notification
  await Notification.create({
    recipient: userId,
    type: "SYSTEM",
    title: "Account Suspended",
    message: `Your account has been suspended. Reason: ${reason}`,
  });

  return user;
};

/**
 * Unsuspend user
 */
exports.unsuspendUser = async (userId) => {
  const user = await User.findByIdAndUpdate(
    userId,
    {
      suspended: false,
      suspensionReason: null,
      suspensionUntil: null,
    },
    { new: true }
  );

  if (!user) throw errors.notFound("User not found");
  return user;
};

/**
 * Handle review moderation action (approve or remove)
 */
exports.moderateReview = async (reviewId, action) => {
  const review = await Review.findById(reviewId);
  if (!review) throw errors.notFound("Review not found");

  if (action === "remove") {
    review.isActive = false;
  } else if (action === "approve") {
    review.reported = false;
  }

  await review.save();
  return review;
};

/**
 * Validate moderation action
 */
exports.validateModerationAction = (action) => {
  const validActions = ["approve", "remove"];
  if (!validActions.includes(action)) {
    throw errors.badRequest("Invalid moderation action");
  }
};
