// src/routes/userRoutes.js
const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const mongoose = require("mongoose");
const userController = require("../controllers/userController");
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

/**
 * @route   GET /api/v1/users/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get("/profile", authenticate, userController.getProfile);

/**
 * @route   PUT /api/v1/users/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put(
  "/profile",
  authenticate,
  [
    body("profile.firstName").optional().trim().isLength({ max: 50 }),
    body("profile.lastName").optional().trim().isLength({ max: 50 }),
    body("profile.bio").optional().trim().isLength({ max: 500 }),
    body("profile.organization").optional().trim(),
    body("profile.location").optional().trim(),
  // Treat empty string as not-provided so an empty website doesn't fail validation
  body("profile.website").optional({ checkFalsy: true }).isURL(),
  ],
  validate,
  userController.updateProfile,
);

/**
 * @route   POST /api/v1/users/password
 * @desc    Update user password
 * @access  Private
 */
router.post(
  "/password",
  authenticate,
  [
    body("currentPassword").notEmpty().withMessage("Current password required"),
    body("newPassword")
      .isLength({ min: 10 })
      .withMessage("Password must be at least 10 characters")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/)
      .withMessage("Password must contain uppercase, lowercase, number, and symbol"),
  ],
  validate,
  userController.updatePassword,
);

/**
 * @route   POST /api/v1/users/password/reset-request
 * @desc    Request password reset
 * @access  Public
 */
router.post(
  "/password/reset-request",
  [body("email").isEmail().normalizeEmail()],
  validate,
  userController.requestPasswordReset,
);

/**
 * @route   POST /api/v1/users/password/reset
 * @desc    Reset password with token
 * @access  Public
 */
router.post(
  "/password/reset",
  [
    body("token").trim().notEmpty().withMessage("Reset token required"),
    body("newPassword")
      .isLength({ min: 10 })
      .withMessage("Password must be at least 10 characters")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/)
      .withMessage("Password must contain uppercase, lowercase, number, and symbol"),
  ],
  validate,
  userController.resetPassword,
);

/**
 * @route   GET /api/v1/users/search
 * @desc    Search users
 * @access  Public
 */
router.get(
  "/search",
  [body("query").optional().trim()],
  userController.searchUsers,
);

/**
 * @route   GET /api/v1/users/me/purchases
 * @desc    Get user's purchased rules
 * @access  Private
 */
router.get("/me/purchases", authenticate, async (req, res) => {
  try {
    const Purchase = require("../models/Purchase");

    const purchases = await Purchase.find({
      user: req.user._id,
      isActive: true,
    })
      .populate("rule", "title description stats")
      .sort("-createdAt")
      .lean();

    res.json({
      success: true,
      data: { purchases },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch purchases",
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/v1/users/activity
 * @desc    Get user's activity history
 * @access  Private
 */
router.get(
  "/activity",
  authenticate,
  userController.getUserActivity,
);

/**
 * @route   GET /api/v1/users/earnings
 * @desc    Get user's earnings (seller view)
 * @access  Private
 */
router.get(
  "/earnings",
  authenticate,
  userController.getEarnings,
);

/**
 * @route   GET /api/v1/users/notifications
 * @desc    Get user's notifications
 * @access  Private
 */
router.get(
  "/notifications",
  authenticate,
  userController.getNotifications,
);

/**
 * @route   POST /api/v1/users/notifications/:notificationId/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.post(
  "/notifications/:notificationId/read",
  authenticate,
  userController.markNotificationAsRead,
);

/**
 * @route   POST /api/v1/users/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.post(
  "/notifications/read-all",
  authenticate,
  userController.markAllNotificationsAsRead,
);

/**
 * @route   DELETE /api/v1/users/notifications/:notificationId
 * @desc    Delete notification
 * @access  Private
 */
router.delete(
  "/notifications/:notificationId",
  authenticate,
  userController.deleteNotification,
);

/**
 * @route   POST /api/v1/users/2fa/setup
 * @desc    Setup 2FA for user account
 * @access  Private
 */
router.post("/2fa/setup", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user.requires2FA) {
      return res.status(400).json({
        success: false,
        message: "2FA is already enabled",
      });
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `Security Rules (${req.user.email})`,
    });

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    res.json({
      success: true,
      data: {
        secret: secret.base32,
        qrCode,
        message:
          "Scan the QR code with your authenticator app and verify with a token",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to setup 2FA",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/v1/users/2fa/verify
 * @desc    Verify and enable 2FA
 * @access  Private
 */
router.post(
  "/2fa/verify",
  authenticate,
  [body("token").isLength({ min: 6, max: 6 })],
  validate,
  async (req, res) => {
    try {
      const { token, secret } = req.body;

      // Verify token
      const verified = speakeasy.totp.verify({
        secret: secret,
        encoding: "base32",
        token,
        window: 2,
      });

      if (!verified) {
        return res.status(401).json({
          success: false,
          message: "Invalid token",
        });
      }

      // Enable 2FA
      const user = await User.findByIdAndUpdate(
        req.user._id,
        {
          requires2FA: true,
          twoFactorSecret: secret,
        },
        { new: true },
      );

      res.json({
        success: true,
        message: "2FA enabled successfully",
        data: { user },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to verify 2FA",
        error: error.message,
      });
    }
  },
);

/**
 * @route   GET /api/v1/users/stats
 * @desc    Get current user's statistics (rules created, earnings, etc.)
 * @access  Private
 */
router.get("/stats", authenticate, userController.getUserStats);

/**
 * @route   GET /api/v1/users/my-rules
 * @desc    Get current user's created rules
 * @access  Private
 */
router.get("/my-rules", authenticate, userController.getUserOwnRules);

/**
 * @route   GET /api/v1/users/analytics/downloads-views
 * @desc    Get user's downloads and views analytics by time period
 * @access  Private
 */
router.get("/analytics/downloads-views", authenticate, analyticsController.getUserDownloadsViewsAnalytics);

/**
 * @route   GET /api/v1/users/analytics/rule-reviews
 * @desc    Get all reviews/comments on user's rules
 * @access  Private
 */
router.get("/analytics/rule-reviews", authenticate, analyticsController.getUserRuleReviews);

/**
 * @route   GET /api/v1/users/:username/rules
 * @desc    Get user's created rules
 * @access  Public
 */
router.get(
  "/:username/rules",
  userController.getUserRules,
);

/**
 * @route   POST /api/v1/users/work-experience
 * @desc    Add work experience to user profile
 * @access  Private
 */
router.post(
  "/work-experience",
  authenticate,
  [
    body("company.name").notEmpty().trim().isLength({ min: 1, max: 100 }),
    body("company.isCustom").isBoolean(),
    body("job.title").notEmpty().trim().isLength({ min: 1, max: 100 }),
    body("job.isCustom").isBoolean(),
    body("startDate").isISO8601(),
    body("endDate").custom((value) => {
      if (value === null) return true; // Allow null for current positions
      if (!value) return true; // Allow undefined
      if (typeof value === 'string' && new Date(value).toString() === 'Invalid Date') {
        throw new Error('Invalid date format');
      }
      return true;
    }),
    body("isCurrent").isBoolean(),
  ],
  validate,
  userController.addWorkExperience,
);

/**
 * @route   PUT /api/v1/users/work-experience/:id
 * @desc    Update work experience
 * @access  Private
 */
router.put(
  "/work-experience/:id",
  authenticate,
  [
    body("company.name").optional().notEmpty().trim().isLength({ min: 1, max: 100 }),
    body("company.isCustom").optional().isBoolean(),
    body("job.title").optional().notEmpty().trim().isLength({ min: 1, max: 100 }),
    body("job.isCustom").optional().isBoolean(),
    body("startDate").optional().isISO8601(),
    body("endDate").optional().custom((value) => {
      if (value === null) return true; // Allow null for current positions
      if (!value) return true; // Allow undefined
      if (typeof value === 'string' && new Date(value).toString() === 'Invalid Date') {
        throw new Error('Invalid date format');
      }
      return true;
    }),
    body("isCurrent").optional().isBoolean(),
  ],
  validate,
  userController.updateWorkExperience,
);

/**
 * @route   DELETE /api/v1/users/work-experience/:id
 * @desc    Delete work experience
 * @access  Private
 */
router.delete(
  "/work-experience/:id",
  authenticate,
  userController.deleteWorkExperience,
);

/**
 * @route   POST /api/v1/users/social-media
 * @desc    Add social media account to user profile
 * @access  Private
 */
router.post(
  "/social-media",
  authenticate,
  [
    body("platform").notEmpty().trim().isLength({ min: 1, max: 50 }),
    body("url").notEmpty().trim().isURL(),
  ],
  validate,
  userController.addSocialMedia,
);

/**
 * @route   PUT /api/v1/users/social-media/:id
 * @desc    Update social media account
 * @access  Private
 */
router.put(
  "/social-media/:id",
  authenticate,
  [
    body("platform").optional().notEmpty().trim().isLength({ min: 1, max: 50 }),
    body("url").optional().notEmpty().trim().isURL(),
  ],
  validate,
  userController.updateSocialMedia,
);

/**
 * @route   DELETE /api/v1/users/social-media/:id
 * @desc    Delete social media account
 * @access  Private
 */
router.delete(
  "/social-media/:id",
  authenticate,
  userController.deleteSocialMedia,
);

// =====================================================
// Two-Factor Authentication (2FA) Routes
// =====================================================

/**
 * @route   GET /api/v1/users/2fa/status
 * @desc    Get current 2FA status
 * @access  Private
 */
router.get("/2fa/status", authenticate, userController.get2FAStatus);

/**
 * @route   POST /api/v1/users/2fa/enable
 * @desc    Enable 2FA and send verification code
 * @access  Private
 */
router.post(
  "/2fa/enable",
  authenticate,
  userController.enable2FA,
);

/**
 * @route   POST /api/v1/users/2fa/verify-setup
 * @desc    Verify 2FA setup with code
 * @access  Private
 */
router.post(
  "/2fa/verify-setup",
  authenticate,
  [body("code").trim().isLength({ min: 6, max: 6 }).isNumeric()],
  validate,
  userController.verify2FASetup,
);

/**
 * @route   POST /api/v1/users/2fa/disable
 * @desc    Disable 2FA (requires password)
 * @access  Private
 */
router.post(
  "/2fa/disable",
  authenticate,
  [body("password").notEmpty().withMessage("Password is required")],
  validate,
  userController.disable2FA,
);

/**
 * @route   POST /api/v1/users/2fa/resend-code
 * @desc    Resend verification code
 * @access  Private
 */
router.post(
  "/2fa/resend-code",
  authenticate,
  userController.resend2FACode,
);

/**
 * @route   GET /api/v1/users/:id
 * @desc    Get public user profile by username only (no ID-based access)
 * @access  Public
 * Note: This route MUST be last to avoid conflicting with other routes
 * Only usernames are accepted for public profile access
 */
router.get("/:id", (req, res, next) => {
  // Only allow username-based access, not ID-based
  // Reject if it's a valid MongoDB ObjectId (indicating ID-based access attempt)
  if (mongoose.Types.ObjectId.isValid(req.params.id)) {
    // ID-based access is not allowed
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }
  
  // Treat as username
  req.params.username = req.params.id;
  userController.getUserProfile(req, res, next);
});

module.exports = router;

