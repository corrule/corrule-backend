// src/routes/billingRoutes.js
const express = require("express");
const billingController = require("../controllers/billingController");
const { authenticate, hasRole } = require("../middleware/auth");

const router = express.Router();

/**
 * User Billing Routes
 */

// Payment Methods Routes
router.get("/payment-methods", authenticate, billingController.getPaymentMethods);
router.post("/payment-methods", authenticate, billingController.addPaymentMethod);
router.delete("/payment-methods/:paymentMethodId", authenticate, billingController.deletePaymentMethod);
router.post("/payment-methods/:paymentMethodId/set-default", authenticate, billingController.setDefaultPaymentMethod);

// Payment History Routes
router.get("/payment-history", authenticate, billingController.getPaymentHistory);

// Get my billing account
router.get("/my-account", authenticate, billingController.getMyBillingAccount);

// Get my billing statistics
router.get("/my-stats", authenticate, billingController.getMyBillingStats);

// Get my billing transactions
router.get("/my-transactions", authenticate, billingController.getMyBillingTransactions);

// Get my earnings report
router.get("/earnings-report", authenticate, billingController.getEarningsReport);

// Get commission configuration (public)
router.get("/commission-config", billingController.getCommissionConfig);

// Request withdrawal
router.post("/withdrawals/request", authenticate, billingController.requestWithdrawal);

// Get my withdrawal requests
router.get("/withdrawals/my-requests", authenticate, billingController.getMyWithdrawals);

/**
 * Admin Billing Routes
 */

// Get admin billing overview
router.get("/admin/overview", authenticate, hasRole("ADMIN"), billingController.getAdminBillingOverview);

// Get all withdrawal requests
router.get("/admin/withdrawals", authenticate, hasRole("ADMIN"), billingController.getAllWithdrawals);

// Process withdrawal request (approve/reject)
router.post(
  "/admin/withdrawals/:id/process",
  authenticate,
  hasRole("ADMIN"),
  billingController.processWithdrawal,
);

// Mark withdrawal as completed
router.post(
  "/admin/withdrawals/:id/complete",
  authenticate,
  hasRole("ADMIN"),
  billingController.completeWithdrawal,
);

// Adjust user balance
router.post(
  "/admin/adjust-balance/:userId",
  authenticate,
  hasRole("ADMIN"),
  billingController.adjustBalance,
);

module.exports = router;
