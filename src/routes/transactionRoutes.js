// src/routes/transactionRoutes.js
const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const transactionController = require("../controllers/transactionController");
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
 * @route   GET /api/v1/transactions
 * @desc    Get all transactions (admin only)
 * @access  Private (Admin)
 */
router.get(
  "/",
  authenticate,
  hasRole("ADMIN"),
  transactionController.getAllTransactions,
);

/**
 * @route   GET /api/v1/transactions/my
 * @desc    Get current user's transactions
 * @access  Private
 */
router.get("/my", authenticate, transactionController.getMyTransactions);

/**
 * @route   GET /api/v1/transactions/earnings
 * @desc    Get current user's earnings breakdown
 * @access  Private
 */
router.get("/earnings", authenticate, transactionController.getMyEarnings);

/**
 * @route   GET /api/v1/transactions/stats/platform
 * @desc    Get platform revenue statistics (admin only)
 * @access  Private (Admin)
 */
router.get(
  "/stats/platform",
  authenticate,
  hasRole("ADMIN"),
  transactionController.getPlatformStats,
);

/**
 * @route   GET /api/v1/transactions/earnings/seller
 * @desc    Get seller earnings
 * @access  Private
 */
router.get(
  "/earnings/seller",
  authenticate,
  transactionController.getSellerEarnings,
);

/**
 * @route   POST /api/v1/transactions/purchase
 * @desc    Purchase a paid rule
 * @access  Private
 */
router.post(
  "/purchase",
  authenticate,
  [
    body("ruleId").isMongoId().withMessage("Valid rule ID is required"),
    body("paymentMethodId").optional().trim(),
  ],
  validate,
  transactionController.purchaseRule,
);

/**
 * @route   POST /api/v1/transactions/withdraw
 * @desc    Request withdrawal/payout
 * @access  Private
 */
router.post(
  "/withdraw",
  authenticate,
  [
    body("amount").isFloat({ min: 1 }).withMessage("Amount must be at least $1"),
    body("paymentMethod").isIn(["stripe", "bank"]).withMessage("Invalid payment method"),
  ],
  validate,
  transactionController.requestWithdrawal,
);

/**
 * @route   GET /api/v1/transactions/:id
 * @desc    Get single transaction
 * @access  Private
 */
router.get("/:id", authenticate, transactionController.getTransaction);

/**
 * @route   POST /api/v1/transactions/:id/refund
 * @desc    Request refund
 * @access  Private
 */
router.post(
  "/:id/refund",
  authenticate,
  [body("reason").trim().notEmpty().withMessage("Refund reason is required")],
  validate,
  transactionController.requestRefund,
);

/**
 * @route   POST /api/v1/transactions/:id/refund/process
 * @desc    Process refund (admin only)
 * @access  Private (Admin)
 */
router.post(
  "/:id/refund/process",
  authenticate,
  hasRole("ADMIN"),
  [body("approved").isBoolean().withMessage("approved must be boolean")],
  validate,
  transactionController.processRefund,
);

module.exports = router;
