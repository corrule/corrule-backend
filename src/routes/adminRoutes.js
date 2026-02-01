// src/routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const adminController = require("../controllers/adminController");
const analyticsController = require("../controllers/analyticsController");
const { authenticate, hasRole } = require("../middleware/auth");

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  }
  next();
};

// Admin middleware - only ADMIN role
router.use(authenticate);
router.use(hasRole("ADMIN"));

// ============= DASHBOARD ENDPOINTS =============

/**
 * @route   GET /api/v1/admin/dashboard
 * @desc    Get dashboard overview metrics
 * @access  Private (Admin)
 */
router.get("/dashboard", adminController.getDashboardOverview);

// ============= USER MANAGEMENT ENDPOINTS =============

/**
 * @route   GET /api/v1/admin/users
 * @desc    Get user management data
 * @access  Private (Admin)
 */
router.get("/users", adminController.getUserManagement);

/**
 * @route   PUT /api/v1/admin/users/:userId/role
 * @desc    Update user role
 * @access  Private (Admin)
 */
router.put(
  "/users/:userId/role",
  [
    body("role")
      .isIn(["USER", "VERIFIED_CONTRIBUTOR", "MODERATOR", "ADMIN"])
      .withMessage("Invalid role"),
  ],
  validate,
  adminController.updateUserRole
);

/**
 * @route   POST /api/v1/admin/users/:userId/suspend
 * @desc    Suspend user account
 * @access  Private (Admin)
 */
router.post(
  "/users/:userId/suspend",
  [
    body("reason").trim().notEmpty().withMessage("Reason is required"),
    body("duration").optional().isInt().withMessage("Duration must be integer"),
  ],
  validate,
  adminController.suspendUser
);

/**
 * @route   POST /api/v1/admin/users/:userId/unsuspend
 * @desc    Unsuspend user account
 * @access  Private (Admin)
 */
router.post("/users/:userId/unsuspend", adminController.unsuspendUser);

// ============= RULE MODERATION ENDPOINTS =============

/**
 * @route   GET /api/v1/admin/rules
 * @desc    Get rule moderation data
 * @access  Private (Admin)
 */
router.get("/rules", adminController.getRuleModeration);

/**
 * @route   POST /api/v1/admin/rules/:ruleId/moderate
 * @desc    Approve or reject a rule
 * @access  Private (Admin)
 */
router.post(
  "/rules/:ruleId/moderate",
  [
    body("approved").isBoolean().withMessage("approved must be boolean"),
    body("reason").optional().trim(),
  ],
  validate,
  adminController.moderateRule
);

// ============= REVIEW MODERATION ENDPOINTS =============

/**
 * @route   GET /api/v1/admin/reviews
 * @desc    Get reported reviews for moderation
 * @access  Private (Admin)
 */
router.get("/reviews", adminController.getReviewModeration);

/**
 * @route   POST /api/v1/admin/reviews/:reviewId/action
 * @desc    Take action on reported review
 * @access  Private (Admin)
 */
router.post(
  "/reviews/:reviewId/action",
  [
    body("action")
      .isIn(["approve", "remove"])
      .withMessage("Invalid action"),
  ],
  validate,
  adminController.reviewModerationAction
);

// ============= SYSTEM LOGS ENDPOINTS =============

/**
 * @route   GET /api/v1/admin/logs
 * @desc    Get system activity logs
 * @access  Private (Admin)
 */
router.get("/logs", adminController.getSystemLogs);

/**
 * @route   GET /api/v1/admin/logs/admin-actions
 * @desc    Get admin action logs
 * @access  Private (Admin)
 */
router.get("/logs/admin-actions", adminController.getAdminActions);

// ============= ANALYTICS ENDPOINTS =============

/**
 * @route   GET /api/v1/admin/analytics/platform
 * @desc    Get platform analytics overview
 * @access  Private (Admin)
 */
router.get("/analytics/platform", analyticsController.getPlatformAnalytics);

/**
 * @route   GET /api/v1/admin/analytics/user-behavior
 * @desc    Get user behavior analytics
 * @access  Private (Admin)
 */
router.get(
  "/analytics/user-behavior",
  analyticsController.getUserBehaviorAnalytics
);

/**
 * @route   GET /api/v1/admin/analytics/rules
 * @desc    Get rule analytics
 * @access  Private (Admin)
 */
router.get("/analytics/rules", analyticsController.getRuleAnalytics);

/**
 * @route   GET /api/v1/admin/analytics/revenue
 * @desc    Get transaction and revenue analytics
 * @access  Private (Admin)
 */
router.get("/analytics/revenue", analyticsController.getRevenueAnalytics);

/**
 * @route   GET /api/v1/admin/analytics/reviews
 * @desc    Get review analytics
 * @access  Private (Admin)
 */
router.get("/analytics/reviews", analyticsController.getReviewAnalytics);

/**
 * @route   POST /api/v1/admin/analytics/report
 * @desc    Generate custom report
 * @access  Private (Admin)
 */
router.post(
  "/analytics/report",
  [
    body("reportType")
      .isIn(["user_activity", "rule_performance", "revenue_breakdown", "user_growth"])
      .withMessage("Invalid reportType"),
    body("startDate").isISO8601().withMessage("Valid startDate required"),
    body("endDate").isISO8601().withMessage("Valid endDate required"),
  ],
  validate,
  analyticsController.generateCustomReport
);

/**
 * @route   GET /api/v1/admin/analytics/export
 * @desc    Export analytics report to CSV
 * @access  Private (Admin)
 */
router.get("/analytics/export", analyticsController.exportReport);

module.exports = router;
