// src/controllers/adminController.js
const User = require("../models/User");
const Rule = require("../models/Rule");
const Review = require("../models/Review");
const Transaction = require("../models/Transaction");
const Notification = require("../models/Notification");
const Activity = require("../models/Activity");
const { asyncHandler, errors } = require("../middleware/errorHandler");
const { getPagination } = require("../utils/pagination");
const adminService = require("../services/adminService");

/**
 * Get dashboard overview metrics
 */
exports.getDashboardOverview = asyncHandler(async (req, res) => {
  const [metrics, revenue, topRules, recentActivity] = await Promise.all([
    adminService.getDashboardMetrics(),
    adminService.getRevenueData(),
    adminService.getTopRules(),
    adminService.getRecentActivity(),
  ]);

  res.json({
    success: true,
    data: {
      overview: metrics,
      revenue,
      topRules,
      recentActivity,
    },
  });
});

/**
 * Get user management data
 */
exports.getUserManagement = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, role, status } = req.query;
  const skip = (page - 1) * limit;

  const query = adminService.buildUserQuery({ role, status });

  const [users, total, roleDistribution] = await Promise.all([
    User.find(query)
      .select("username email role emailVerified profile lastLogin createdAt statistics")
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 })
      .lean(),
    User.countDocuments(query),
    adminService.getUserRoleDistribution(),
  ]);

  res.json({
    success: true,
    data: {
      users,
      roleDistribution,
      pagination: getPagination(total, page, limit),
    },
  });
});

/**
 * Get rule moderation data
 */
exports.getRuleModeration = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const skip = (page - 1) * limit;

  const query = adminService.buildRuleQuery({ status });

  const [rules, total, statusDistribution] = await Promise.all([
    Rule.find(query)
      .select("title slug status creator stats createdAt")
      .populate("creator", "username email")
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 })
      .lean(),
    Rule.countDocuments(query),
    adminService.getRuleStatusDistribution(),
  ]);

  res.json({
    success: true,
    data: {
      rules,
      statusDistribution,
      pagination: getPagination(total, page, limit),
    },
  });
});

/**
 * Approve or reject a rule
 */
exports.moderateRule = asyncHandler(async (req, res) => {
  const { ruleId } = req.params;
  const { approved, reason } = req.body;

  if (approved) {
    const rule = await adminService.approveRule(ruleId);
    res.json({
      success: true,
      message: "Rule approved",
      data: { rule },
    });
  } else {
    const rule = await adminService.rejectRule(ruleId, reason);
    res.json({
      success: true,
      message: "Rule rejected",
      data: { rule },
    });
  }
});

/**
 * Get review moderation data
 */
exports.getReviewModeration = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const [reviews, total] = await Promise.all([
    Review.find({ reported: true })
      .populate("user", "username email")
      .populate("rule", "title")
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 })
      .lean(),
    Review.countDocuments({ reported: true }),
  ]);

  res.json({
    success: true,
    data: {
      reviews,
      pagination: getPagination(total, page, limit),
    },
  });
});

/**
 * Take action on reported review
 */
exports.reviewModerationAction = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const { action } = req.body; // approve, remove

  adminService.validateModerationAction(action);
  const review = await adminService.moderateReview(reviewId, action);

  res.json({
    success: true,
    message: `Review ${action}d successfully`,
    data: { review },
  });
});

/**
 * Manage user roles
 */
exports.updateUserRole = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;

  adminService.validateUserRole(role);
  const user = await adminService.updateUserRoleWithLogging(userId, role, req.user._id);

  res.json({
    success: true,
    message: "User role updated",
    data: { user },
  });
});

/**
 * Suspend or ban user
 */
exports.suspendUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { reason, duration } = req.body;

  const user = await adminService.suspendUser(userId, reason, duration);

  res.json({
    success: true,
    message: "User suspended",
    data: { user },
  });
});

/**
 * Unsuspend user
 */
exports.unsuspendUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await adminService.unsuspendUser(userId);

  res.json({
    success: true,
    message: "User unsuspended",
    data: { user },
  });
});

/**
 * Get system logs
 */
exports.getSystemLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, type, userId } = req.query;
  const skip = (page - 1) * limit;

  let query = {};
  if (type) query.type = type;
  if (userId) query.user = userId;

  const [logs, total] = await Promise.all([
    Activity.find(query)
      .populate("user", "username email")
      .populate("target")
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 })
      .lean(),
    Activity.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: {
      logs,
      pagination: getPagination(total, page, limit),
    },
  });
});

/**
 * Get admin actions log
 */
exports.getAdminActions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const skip = (page - 1) * limit;

  const [actions, total] = await Promise.all([
    Activity.find({ type: "ADMIN_ACTION" })
      .populate("user", "username email")
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 })
      .lean(),
    Activity.countDocuments({ type: "ADMIN_ACTION" }),
  ]);

  res.json({
    success: true,
    data: {
      actions,
      pagination: getPagination(total, page, limit),
    },
  });
});
