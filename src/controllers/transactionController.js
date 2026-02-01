// src/controllers/transactionController.js
const Transaction = require("../models/Transaction");
const Rule = require("../models/Rule");
const { asyncHandler, errors } = require("../middleware/errorHandler");
const { getPagination } = require("../utils/pagination");
const transactionService = require("../services/transactionService");
const billingService = require("../services/billingService");

/**
 * Get all transactions (admin only)
 */
exports.getAllTransactions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, paymentMethod } = req.query;
  const skip = (page - 1) * limit;

  const query = transactionService.buildTransactionQuery({ status, paymentMethod });

  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .populate("buyer", "username email")
      .populate("seller", "username email")
      .populate("rule", "title slug")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Transaction.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: {
      transactions,
      pagination: getPagination(total, page, limit),
    },
  });
});

/**
 * Get current user's transactions
 */
exports.getMyTransactions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, type = "all" } = req.query;
  const skip = (page - 1) * limit;

  let query;

  if (type === "purchases") {
    query = { buyer: req.user._id };
  } else if (type === "sales") {
    query = { seller: req.user._id };
  } else {
    query = {
      $or: [{ buyer: req.user._id }, { seller: req.user._id }],
    };
  }

  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .populate("buyer", "username email")
      .populate("seller", "username email")
      .populate("rule", "title slug")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Transaction.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: {
      transactions,
      pagination: getPagination(total, page, limit),
    },
  });
});

/**
 * Get single transaction
 */
exports.getTransaction = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const transaction = await Transaction.findById(id)
    .populate("buyer", "username email profile")
    .populate("seller", "username email profile")
    .populate("rule", "title slug");

  if (!transaction) {
    throw errors.notFound("Transaction not found");
  }

  // Check authorization
  transactionService.checkTransactionAccess(transaction, req.user._id, req.user.role);

  res.json({
    success: true,
    data: { transaction },
  });
});

/**
 * Purchase a rule
 */
exports.purchaseRule = asyncHandler(async (req, res) => {
  const { ruleId, paymentMethodId } = req.body;

  // Validate rule for purchase
  const rule = await transactionService.validateRuleForPurchase(ruleId, req.user._id);

  // Calculate amounts
  const { platformFee, sellerEarnings } = transactionService.calculateTransactionAmounts(rule.pricing.amount);

  // Create transaction and purchase records
  const transaction = await transactionService.createPurchaseTransaction(
    req.user._id,
    rule.creator,
    ruleId,
    rule.pricing.amount,
    platformFee,
    sellerEarnings,
    paymentMethodId
  );

  const purchase = await transactionService.createPurchaseRecord(req.user._id, ruleId, transaction._id);

  // Update rule statistics
  await transactionService.updateRuleStatistics(ruleId, rule.pricing.amount);

  // Distribute earnings
  const distributionResult = await transactionService.distributePurchaseEarnings(
    purchase._id,
    transaction._id,
    rule.creator._id,
    rule.pricing.amount
  );

  // Update transaction with distribution info if successful
  if (distributionResult) {
    transaction.metadata = {
      ...transaction.metadata,
      billingDistribution: {
        adminCommission: distributionResult.distribution.adminCommission,
        sellerEarnings: distributionResult.distribution.sellerEarnings,
        distributedAt: new Date(),
      },
    };
    await transaction.save();
  }

  // Create notifications
  await transactionService.createPurchaseNotifications(transaction, rule, req.user.username);

  await transaction.populate("rule", "title slug");

  res.status(201).json({
    success: true,
    message: "Purchase completed successfully",
    data: {
      transaction,
      purchase,
      licenseKey: purchase.licenseKey,
    },
  });
});

/**
 * Request refund
 */
exports.requestRefund = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    throw errors.badRequest("Refund reason is required");
  }

  const transaction = await transactionService.submitRefundRequest(id, reason, req.user._id);

  res.json({
    success: true,
    message: "Refund request submitted successfully",
    data: { transaction },
  });
});

/**
 * Process refund (admin only)
 */
exports.processRefund = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { approved } = req.body;

  const transaction = approved
    ? await transactionService.approveRefund(id)
    : await transactionService.denyRefund(id);

  res.json({
    success: true,
    message: approved ? "Refund processed" : "Refund denied",
    data: { transaction },
  });
});

/**
 * Get seller earnings
 */
exports.getSellerEarnings = asyncHandler(async (req, res) => {
  const { period = "month" } = req.query;

  const { total, earningsByDate } = await transactionService.getSellerEarnings(req.user._id, period);

  res.json({
    success: true,
    data: {
      period,
      totalEarnings: total,
      earningsByDate,
    },
  });
});

/**
 * Get platform revenue statistics (admin only)
 */
exports.getPlatformStats = asyncHandler(async (req, res) => {
  const { period = "month" } = req.query;

  const { overview, paymentMethodStats } = await transactionService.getPlatformStats(period);

  res.json({
    success: true,
    data: {
      period,
      overview,
      paymentMethodStats,
    },
  });
});

/**
 * Get user earnings breakdown
 */
exports.getMyEarnings = asyncHandler(async (req, res) => {
  const { period = "all" } = req.query;

  const { total, breakdown } = await transactionService.getMyEarningsBreakdown(req.user._id, period);

  res.json({
    success: true,
    data: {
      total,
      breakdown,
    },
  });
});

/**
 * Request withdrawal (payout)
 */
exports.requestWithdrawal = asyncHandler(async (req, res) => {
  const { amount, paymentMethod } = req.body;

  // Validate withdrawal request
  await transactionService.validateWithdrawalRequest(amount, req.user._id);

  // Create withdrawal transaction
  const withdrawal = await transactionService.createWithdrawalTransaction(amount, paymentMethod, req.user._id);

  res.json({
    success: true,
    message: "Withdrawal request submitted",
    data: {
      transaction: withdrawal,
    },
  });
});

module.exports = exports;
