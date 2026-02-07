// src/routes/authRoutes.js
const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const authController = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");

// Validation middleware
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
 * @route   POST /api/v1/auth/register
 * @desc    Register new user
 * @access  Public
 */
router.post(
  "/register",
  [
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Valid email is required"),
    body("password")
      .isLength({ min: 10 })
      .withMessage("Password must be at least 10 characters")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/)
      .withMessage("Password must contain uppercase, lowercase, number, and symbol"),
    body("username")
      .isLength({ min: 3, max: 30 })
      .withMessage("Username must be 3-30 characters")
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage(
        "Username can only contain letters, numbers, underscore and dash",
      ),
    body("firstName").optional().trim().isLength({ max: 50 }),
    body("lastName").optional().trim().isLength({ max: 50 }),
  ],
  validate,
  authController.register,
);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post(
  "/login",
  [
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  validate,
  authController.login,
);

/**
 * @route   POST /api/v1/auth/verify-2fa
 * @desc    Verify 2FA token and complete login
 * @access  Public
 */
router.post(
  "/verify-2fa",
  [
    body("userId").notEmpty().withMessage("User ID is required"),
    body("code")
      .isLength({ min: 6, max: 6 })
      .withMessage("Invalid 2FA code format"),
    body("type").optional().isIn(["email", "totp"]).withMessage("Invalid 2FA type"),
  ],
  validate,
  authController.verify2FA,
);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post(
  "/refresh",
  [body("refreshToken").notEmpty().withMessage("Refresh token is required")],
  validate,
  authController.refreshToken,
);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post("/logout", authenticate, authController.logout);

/**
 * @route   GET /api/v1/auth/verify-email/:token
 * @desc    Verify email address
 * @access  Public
 */
router.get("/verify-email/:token", authController.verifyEmail);

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post(
  "/forgot-password",
  [
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Valid email is required"),
  ],
  validate,
  authController.forgotPassword,
);

/**
 * @route   POST /api/v1/auth/reset-password/:token
 * @desc    Reset password with token
 * @access  Public
 */
router.post(
  "/reset-password/:token",
  [
    body("password")
      .isLength({ min: 10 })
      .withMessage("Password must be at least 10 characters")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/)
      .withMessage("Password must contain uppercase, lowercase, number, and symbol"),
  ],
  validate,
  authController.resetPassword,
);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current user
 * @access  Private
 */
router.get("/me", authenticate, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        user: {
          id: req.user._id,
          email: req.user.email,
          username: req.user.username,
          role: req.user.role,
          emailVerified: req.user.emailVerified,
          profile: req.user.profile,
          statistics: req.user.statistics,
          createdAt: req.user.createdAt,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch user",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/v1/auth/google
 * @desc    Google OAuth Login
 * @access  Public
 */
router.post(
  "/google",
  [
    body("token")
      .notEmpty()
      .withMessage("Google token is required"),
  ],
  validate,
  authController.googleLogin,
);

/**
 * @route   POST /api/v1/auth/google/register
 * @desc    Google OAuth Register
 * @access  Public
 */
router.post(
  "/google/register",
  [
    body("token")
      .notEmpty()
      .withMessage("Google token is required"),
  ],
  validate,
  authController.googleRegister,
);

module.exports = router;
