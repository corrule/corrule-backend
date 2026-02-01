// src/services/transactionService.js
const { errors } = require("../middleware/errorHandler");
const Transaction = require("../models/Transaction");
const Purchase = require("../models/Purchase");
const Rule = require("../models/Rule");
const User = require("../models/User");
const Notification = require("../models/Notification");
const billingService = require("../services/billingService");
const crypto = require("crypto");

/**
 * Build date filter for period
 */
exports.buildDateFilter = (period) => {
  const now = new Date();

  if (period === "week") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === "month") {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else if (period === "year") {
    return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  }
  return new Date(0);
};

/**
 * Build query filter from params
 */
exports.buildTransactionQuery = (filters) => {
  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.paymentMethod) query.paymentMethod = filters.paymentMethod;
  return query;
};

/**
 * Check transaction authorization
 */
exports.checkTransactionAccess = (transaction, userId, userRole) => {
  if (
    transaction.buyer._id.toString() !== userId.toString() &&
    transaction.seller._id.toString() !== userId.toString() &&
    userRole !== "ADMIN"
  ) {
    throw errors.forbidden("You do not have access to this transaction");
  }
};

/**
 * Validate rule for purchase
 */
exports.validateRuleForPurchase = async (ruleId, buyerId) => {
  const rule = await Rule.findById(ruleId);
  if (!rule) throw errors.notFound("Rule not found");

  if (!rule.pricing || rule.pricing.type !== "PAID") {
    throw errors.badRequest("This rule is not for sale");
  }

  // Check if already purchased
  const existingPurchase = await Purchase.findOne({
    user: buyerId,
    rule: ruleId,
    isActive: true,
  });

  if (existingPurchase) {
    throw errors.conflict("You have already purchased this rule");
  }

  // Check if buyer is seller
  if (rule.creator.toString() === buyerId.toString()) {
    throw errors.badRequest("You cannot purchase your own rule");
  }

  return rule;
};

/**
 * Calculate transaction amounts
 */
exports.calculateTransactionAmounts = (amount) => {
  const platformFeePercent = 0.1; // 10% platform fee
  const platformFee = amount * platformFeePercent;
  const sellerEarnings = amount - platformFee;

  return { platformFee, sellerEarnings };
};

/**
 * Create purchase transaction
 */
exports.createPurchaseTransaction = async (buyerId, sellerId, ruleId, amount, platformFee, sellerEarnings, paymentMethodId) => {
  const rule = await Rule.findById(ruleId);

  const transaction = new Transaction({
    buyer: buyerId,
    seller: sellerId,
    rule: ruleId,
    amount,
    currency: "USD",
    paymentMethod: "MOCK",
    status: "COMPLETED",
    paymentIntentId: paymentMethodId || crypto.randomBytes(16).toString("hex"),
    platformFee,
    sellerEarnings,
    metadata: {
      ruleTitle: rule.title,
      buyerEmail: rule.creator.email,
    },
  });

  await transaction.save();
  return transaction;
};

/**
 * Create purchase record
 */
exports.createPurchaseRecord = async (buyerId, ruleId, transactionId) => {
  const purchase = new Purchase({
    user: buyerId,
    rule: ruleId,
    transaction: transactionId,
    licenseKey: crypto.randomBytes(16).toString("hex").toUpperCase(),
  });

  await purchase.save();
  return purchase;
};

/**
 * Update rule statistics after purchase
 */
exports.updateRuleStatistics = async (ruleId, amount) => {
  const rule = await Rule.findById(ruleId);
  rule.statistics.purchases = (rule.statistics.purchases || 0) + 1;
  rule.statistics.revenue = (rule.statistics.revenue || 0) + amount;
  await rule.save();
  return rule;
};

/**
 * Distribute purchase earnings to billing
 */
exports.distributePurchaseEarnings = async (purchaseId, transactionId, sellerId, amount) => {
  try {
    return await billingService.distributePurchaseEarnings({
      purchaseId,
      transactionId,
      sellerId,
      amount,
    });
  } catch (error) {
    console.error("❌ Error distributing earnings:", error);
    return null;
  }
};

/**
 * Create purchase notifications
 */
exports.createPurchaseNotifications = async (transaction, rule, buyerUsername) => {
  // Seller notification
  await Notification.create({
    recipient: rule.creator,
    type: "RULE_PURCHASED",
    title: "Your rule was purchased",
    message: `${buyerUsername} purchased "${rule.title}"`,
    data: {
      transactionId: transaction._id,
      ruleId: rule._id,
      earnings: transaction.sellerEarnings,
    },
    actionUrl: `/transactions/${transaction._id}`,
  });

  // Buyer notification
  await Notification.create({
    recipient: transaction.buyer,
    type: "RULE_PURCHASED",
    title: "Purchase successful",
    message: `You successfully purchased "${rule.title}"`,
    data: {
      transactionId: transaction._id,
      ruleId: rule._id,
    },
    actionUrl: `/rules/${rule.slug}/download`,
  });
};

/**
 * Validate refund request
 */
exports.validateRefundRequest = (transaction, userId) => {
  if (!transaction) throw errors.notFound("Transaction not found");

  if (transaction.buyer.toString() !== userId.toString()) {
    throw errors.forbidden("Only the buyer can request a refund");
  }

  if (transaction.status !== "COMPLETED") {
    throw errors.badRequest("Refund can only be requested for completed transactions");
  }

  const daysSince = (Date.now() - transaction.createdAt) / (1000 * 60 * 60 * 24);
  if (daysSince > 30) {
    throw errors.badRequest("Refund requests can only be made within 30 days");
  }
};

/**
 * Submit refund request
 */
exports.submitRefundRequest = async (transactionId, reason, userId) => {
  const transaction = await Transaction.findById(transactionId);

  exports.validateRefundRequest(transaction, userId);

  transaction.status = "DISPUTED";
  transaction.metadata = {
    ...transaction.metadata,
    refundReason: reason,
    refundRequestedAt: new Date(),
    refundRequestedBy: userId,
  };

  await transaction.save();

  // Buyer notification
  await Notification.create({
    recipient: userId,
    type: "SYSTEM",
    title: "Refund request submitted",
    message: "Your refund request has been received and is under review",
    actionUrl: `/transactions/${transactionId}`,
  });

  return transaction;
};

/**
 * Process refund approval
 */
exports.approveRefund = async (transactionId) => {
  const transaction = await Transaction.findById(transactionId);
  if (!transaction) throw errors.notFound("Transaction not found");

  if (transaction.status !== "DISPUTED") {
    throw errors.badRequest("Only disputed transactions can be refunded");
  }

  transaction.status = "REFUNDED";
  await transaction.save();

  // Deduct from seller's earnings
  await User.findByIdAndUpdate(transaction.seller, {
    $inc: { "statistics.earnings": -transaction.sellerEarnings },
  });

  // Buyer notification
  await Notification.create({
    recipient: transaction.buyer,
    type: "SYSTEM",
    title: "Refund approved",
    message: `Your refund of $${transaction.amount} has been approved and will be processed`,
    actionUrl: `/transactions/${transactionId}`,
  });

  // Seller notification
  await Notification.create({
    recipient: transaction.seller,
    type: "SYSTEM",
    title: "Refund issued",
    message: `A refund of $${transaction.sellerEarnings} was issued for transaction ${transactionId}`,
    actionUrl: `/transactions/${transactionId}`,
  });

  return transaction;
};

/**
 * Process refund denial
 */
exports.denyRefund = async (transactionId) => {
  const transaction = await Transaction.findById(transactionId);
  if (!transaction) throw errors.notFound("Transaction not found");

  if (transaction.status !== "DISPUTED") {
    throw errors.badRequest("Only disputed transactions can be processed");
  }

  transaction.status = "COMPLETED";
  await transaction.save();

  // Buyer notification
  await Notification.create({
    recipient: transaction.buyer,
    type: "SYSTEM",
    title: "Refund denied",
    message: "Your refund request has been denied",
    actionUrl: `/transactions/${transactionId}`,
  });

  return transaction;
};

/**
 * Get seller earnings by period
 */
exports.getSellerEarnings = async (userId, period) => {
  const dateFilter = exports.buildDateFilter(period);

  const earnings = await Transaction.aggregate([
    {
      $match: {
        seller: userId,
        status: "COMPLETED",
        createdAt: { $gte: dateFilter },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        earnings: { $sum: "$sellerEarnings" },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const total = earnings.reduce((sum, e) => sum + e.earnings, 0);

  return { total, earningsByDate: earnings };
};

/**
 * Get platform statistics
 */
exports.getPlatformStats = async (period) => {
  const dateFilter = exports.buildDateFilter(period);

  const [stats, paymentMethodStats] = await Promise.all([
    Transaction.aggregate([
      {
        $match: {
          status: "COMPLETED",
          createdAt: { $gte: dateFilter },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalPlatformFees: { $sum: "$platformFee" },
          totalSellerEarnings: { $sum: "$sellerEarnings" },
          transactionCount: { $sum: 1 },
        },
      },
    ]),
    Transaction.aggregate([
      {
        $match: {
          status: "COMPLETED",
          createdAt: { $gte: dateFilter },
        },
      },
      {
        $group: {
          _id: "$paymentMethod",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ]),
  ]);

  return {
    overview: stats[0] || {
      totalRevenue: 0,
      totalPlatformFees: 0,
      totalSellerEarnings: 0,
      transactionCount: 0,
    },
    paymentMethodStats,
  };
};

/**
 * Get user earnings breakdown by month
 */
exports.getMyEarningsBreakdown = async (userId, period) => {
  const dateFilter = {};

  if (period === "month") {
    dateFilter.$gte = new Date(new Date().setMonth(new Date().getMonth() - 1));
  } else if (period === "quarter") {
    dateFilter.$gte = new Date(new Date().setMonth(new Date().getMonth() - 3));
  } else if (period === "year") {
    dateFilter.$gte = new Date(new Date().setFullYear(new Date().getFullYear() - 1));
  }

  // Get total earnings
  const [earnings, breakdown] = await Promise.all([
    Transaction.aggregate([
      {
        $match: {
          seller: userId,
          status: "COMPLETED",
          ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$sellerEarnings" },
        },
      },
    ]),
    Transaction.aggregate([
      {
        $match: {
          seller: userId,
          status: "COMPLETED",
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          amount: { $sum: "$sellerEarnings" },
        },
      },
      {
        $sort: { "_id.year": -1, "_id.month": -1 },
      },
      {
        $limit: 12,
      },
    ]),
  ]);

  const total = earnings[0]?.total || 0;

  return {
    total,
    breakdown: breakdown.map(item => ({
      date: `${item._id.year}-${String(item._id.month).padStart(2, "0")}`,
      amount: item.amount,
    })),
  };
};

/**
 * Validate withdrawal request
 */
exports.validateWithdrawalRequest = async (amount, userId) => {
  if (!amount || amount <= 0) {
    throw errors.badRequest("Invalid amount");
  }

  // Get available balance
  const earnings = await Transaction.aggregate([
    {
      $match: {
        seller: userId,
        status: "COMPLETED",
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$sellerEarnings" },
      },
    },
  ]);

  const availableBalance = earnings[0]?.total || 0;

  if (amount > availableBalance) {
    throw errors.badRequest("Insufficient balance");
  }

  return availableBalance;
};

/**
 * Create withdrawal transaction
 */
exports.createWithdrawalTransaction = async (amount, paymentMethod, userId) => {
  const withdrawal = new Transaction({
    buyer: null,
    seller: userId,
    rule: null,
    type: "WITHDRAWAL",
    amount,
    paymentMethod,
    platformFee: 0,
    sellerEarnings: amount,
    status: "PENDING",
    description: `Withdrawal request for $${amount}`,
  });

  await withdrawal.save();

  // Create notification
  await Notification.create({
    user: userId,
    type: "WITHDRAWAL_REQUESTED",
    title: "Withdrawal Requested",
    message: `Your withdrawal request of $${amount} has been submitted for processing`,
    data: { transactionId: withdrawal._id },
  });

  return withdrawal;
};
