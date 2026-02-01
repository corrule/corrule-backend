// src/routes/moderationRoutes.js
const express = require("express");
const router = express.Router();
const { body, query, validationResult } = require("express-validator");
const moderationController = require("../controllers/moderationController");
const { RULE_STATUS } = require("../constants/enums");
const { authenticate, hasPermission } = require("../middleware/auth");

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

// All moderation routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/v1/moderation/queue
 * @desc    Get moderation queue (pending rules for review)
 * @access  Private (Moderator, Admin)
 */
router.get(
  "/queue",
  hasPermission("rule:approve"),
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("status").optional().isIn(Object.values(RULE_STATUS)),
  ],
  validate,
  moderationController.getModerationQueue,
);

/**
 * @route   GET /api/v1/moderation/history
 * @desc    Get moderation history (actions taken by moderators)
 * @access  Private (Moderator, Admin)
 */
router.get(
  "/history",
  hasPermission("rule:approve"),
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("moderator").optional().isMongoId(),
  ],
  validate,
  moderationController.getModerationHistory,
);

/**
 * @route   GET /api/v1/moderation/stats
 * @desc    Get moderation statistics
 * @access  Private (Moderator, Admin)
 */
router.get(
  "/stats",
  hasPermission("rule:approve"),
  [
    query("period").optional().isIn(["week", "month", "quarter"]),
  ],
  validate,
  moderationController.getModerationStats,
);

/**
 * @route   POST /api/v1/moderation/users/:userId/warn
 * @desc    Warn user about violations
 * @access  Private (Moderator, Admin)
 */
router.post(
  "/users/:userId/warn",
  hasPermission("user:moderate"),
  [
    body("reason").trim().notEmpty().withMessage("Reason is required"),
    body("severity").optional().isIn(["low", "medium", "high"]),
  ],
  validate,
  moderationController.warnUser,
);

/**
 * @route   POST /api/v1/moderation/rules/:ruleId/approve
 * @desc    Approve rule submission
 * @access  Private (Moderator, Admin)
 */
router.post(
  "/rules/:ruleId/approve",
  hasPermission("rule:approve"),
  [
    body("feedback").optional().trim(),
  ],
  validate,
  moderationController.approveRule,
);

/**
 * @route   POST /api/v1/moderation/rules/:ruleId/reject
 * @desc    Reject rule submission
 * @access  Private (Moderator, Admin)
 */
router.post(
  "/rules/:ruleId/reject",
  hasPermission("rule:reject"),
  [
    body("reason").trim().notEmpty().withMessage("Rejection reason is required"),
  ],
  validate,
  moderationController.rejectRule,
);

module.exports = router;
