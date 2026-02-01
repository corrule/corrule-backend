// src/controllers/billingController.js
const { asyncHandler, errors } = require("../middleware/errorHandler");
const { getPagination } = require("../utils/pagination");
const billingService = require("../services/billingService");
const PaymentMethodsService = require("../services/PaymentMethodsService");
const { PaymentProviderFactory } = require("../services/paymentProviders");
const Billing = require("../models/Billing");
const BillingTransaction = require("../models/BillingTransaction");
const WithdrawalRequest = require("../models/WithdrawalRequest");
const User = require("../models/User");
const { WITHDRAWAL_STATUS } = require("../constants/enums");

/**
 * Get current user's billing account
 */
exports.getMyBillingAccount = asyncHandler(async (req, res) => {
  const billing = await billingService.getBillingAccount(req.user._id);

  res.json({
    success: true,
    data: { billing },
  });
});

/**
 * Get current user's billing statistics
 */
exports.getMyBillingStats = asyncHandler(async (req, res) => {
  const stats = await billingService.getBillingStats(req.user._id);

  res.json({
    success: true,
    data: stats,
  });
});

/**
 * Get user's billing transactions
 */
exports.getMyBillingTransactions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, type, status } = req.query;
  const skip = (page - 1) * limit;

  const billing = await Billing.findOne({ user: req.user._id });
  if (!billing) {
    throw errors.notFound("Billing account not found");
  }

  let query = { billing: billing._id };

  if (type) {
    query.type = type;
  }
  if (status) {
    query.status = status;
  }

  const transactions = await BillingTransaction.find(query)
    .populate("relatedTransaction", "amount status")
    .populate("relatedPurchase", "rule")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await BillingTransaction.countDocuments(query);

  res.json({
    success: true,
    data: {
      transactions,
      pagination: getPagination(total, page, limit),
    },
  });
});

/**
 * Get commission configuration
 */
exports.getCommissionConfig = asyncHandler(async (req, res) => {
  const config = billingService.getCommissionConfig();

  res.json({
    success: true,
    data: { config },
  });
});

/**
 * Request withdrawal (user)
 */
exports.requestWithdrawal = asyncHandler(async (req, res) => {
  const { amount, withdrawalMethod, bankAccount, paypalEmail, cryptoAddress, cryptoNetwork } =
    req.body;

  // Validate amount
  if (!amount || amount <= 0) {
    throw errors.badRequest("Invalid withdrawal amount");
  }

  // Get user's billing account
  const billing = await Billing.findOne({ user: req.user._id });
  if (!billing) {
    throw errors.notFound("Billing account not found");
  }

  // Check minimum withdrawal amount
  if (amount < billing.minimumWithdrawalAmount) {
    throw errors.badRequest(
      `Minimum withdrawal amount is $${billing.minimumWithdrawalAmount}`,
    );
  }

  // Check available balance
  if (billing.balance < amount) {
    throw errors.badRequest("Insufficient balance for withdrawal");
  }

  // Validate withdrawal method and required fields
  if (withdrawalMethod === "BANK_TRANSFER" && !bankAccount) {
    throw errors.badRequest("Bank account details required for bank transfer");
  }
  if (withdrawalMethod === "PAYPAL" && !paypalEmail) {
    throw errors.badRequest("PayPal email required for PayPal withdrawal");
  }
  if (withdrawalMethod === "CRYPTO" && !cryptoAddress) {
    throw errors.badRequest("Crypto address required for crypto withdrawal");
  }

  // Create withdrawal request
  const withdrawalRequest = await WithdrawalRequest.create({
    billing: billing._id,
    user: req.user._id,
    amount,
    currency: "USD",
    withdrawalMethod,
    bankAccount: withdrawalMethod === "BANK_TRANSFER" ? bankAccount : undefined,
    paypalEmail: withdrawalMethod === "PAYPAL" ? paypalEmail : undefined,
    cryptoAddress: withdrawalMethod === "CRYPTO" ? cryptoAddress : undefined,
    cryptoNetwork: withdrawalMethod === "CRYPTO" ? cryptoNetwork : undefined,
    status: "PENDING",
  });

  // Reserve the amount (deduct from available balance)
  billing.balance -= amount;
  billing.withdrawalRequests.push(withdrawalRequest._id);
  await billing.save();

  // Create billing transaction for withdrawal
  await BillingTransaction.create({
    billing: billing._id,
    user: req.user._id,
    type: "WITHDRAWAL",
    amount: -amount,
    currency: "USD",
    description: `Withdrawal request via ${withdrawalMethod}`,
    relatedWithdrawal: withdrawalRequest._id,
    status: "PENDING",
    metadata: {
      withdrawalMethod,
    },
  });

  res.status(201).json({
    success: true,
    message: "Withdrawal request created successfully",
    data: { withdrawalRequest },
  });
});

/**
 * Get user's withdrawal requests
 */
exports.getMyWithdrawals = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const skip = (page - 1) * limit;

  let query = { user: req.user._id };
  if (status) {
    query.status = status;
  }

  const withdrawals = await WithdrawalRequest.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await WithdrawalRequest.countDocuments(query);

  res.json({
    success: true,
    data: {
      withdrawals,
      pagination: getPagination(total, page, limit),
    },
  });
});

/**
 * Get admin billing overview (admin only)
 */
exports.getAdminBillingOverview = asyncHandler(async (req, res) => {
  if (req.user.role !== "ADMIN") {
    throw errors.forbidden("Only admins can access billing overview");
  }

  const adminUser = await User.findOne({ role: "ADMIN" });
  if (!adminUser) {
    throw errors.notFound("Admin user not found");
  }

  const adminBilling = await Billing.findOne({ user: adminUser._id });
  const adminEarnings = await billingService.getAdminEarnings();

  // Get all withdrawal requests
  const pendingWithdrawals = await WithdrawalRequest.find({ status: "PENDING" })
    .populate("user", "username email")
    .populate("billing");

  // Get recent transactions
  const recentTransactions = await BillingTransaction.find()
    .sort({ createdAt: -1 })
    .limit(20)
    .populate("user", "username email");

  res.json({
    success: true,
    data: {
      adminEarnings,
      adminBilling,
      pendingWithdrawals,
      recentTransactions,
    },
  });
});

/**
 * Process withdrawal request (admin only)
 */
exports.processWithdrawal = asyncHandler(async (req, res) => {
  if (req.user.role !== "ADMIN") {
    throw errors.forbidden("Only admins can process withdrawals");
  }

  const { id } = req.params;
  const { approved, failureReason, transactionHash, estimatedArrivalDate } = req.body;

  const withdrawalRequest = await WithdrawalRequest.findById(id);
  if (!withdrawalRequest) {
    throw errors.notFound("Withdrawal request not found");
  }

  if (withdrawalRequest.status !== "PENDING") {
    throw errors.badRequest("Withdrawal request is not pending");
  }

  if (approved) {
    withdrawalRequest.status = WITHDRAWAL_STATUS.APPROVED;
    withdrawalRequest.processedBy = req.user._id;

    // If additional details provided (e.g., for crypto)
    if (transactionHash) {
      withdrawalRequest.transactionHash = transactionHash;
    }
    if (estimatedArrivalDate) {
      withdrawalRequest.estimatedArrivalDate = estimatedArrivalDate;
    }

    await withdrawalRequest.save();

    res.json({
      success: true,
      message: "Withdrawal request approved",
      data: { withdrawalRequest },
    });
  } else {
    if (!failureReason) {
      throw errors.badRequest("Failure reason required for rejection");
    }

    // Restore the balance if rejected
    const billing = await Billing.findById(withdrawalRequest.billing);
    if (billing) {
      billing.balance += withdrawalRequest.amount;
      await billing.save();
    }

    withdrawalRequest.status = WITHDRAWAL_STATUS.FAILED;
    withdrawalRequest.failureReason = failureReason;
    withdrawalRequest.processedBy = req.user._id;
    await withdrawalRequest.save();

    // Create reverse billing transaction
    await BillingTransaction.create({
      billing: withdrawalRequest.billing,
      user: withdrawalRequest.user,
      type: "ADJUSTMENT",
      amount: withdrawalRequest.amount,
      currency: "USD",
      description: `Withdrawal rejection: ${failureReason}`,
      relatedWithdrawal: withdrawalRequest._id,
      status: "COMPLETED",
      processedBy: req.user._id,
      metadata: {
        rejectionReason: failureReason,
      },
    });

    res.json({
      success: true,
      message: "Withdrawal request rejected",
      data: { withdrawalRequest },
    });
  }
});

/**
 * Mark withdrawal as completed (admin only)
 */
exports.completeWithdrawal = asyncHandler(async (req, res) => {
  if (req.user.role !== "ADMIN") {
    throw errors.forbidden("Only admins can mark withdrawals as completed");
  }

  const { id } = req.params;
  const { trackingNumber, completedAt } = req.body;

  const withdrawalRequest = await WithdrawalRequest.findById(id);
  if (!withdrawalRequest) {
    throw errors.notFound("Withdrawal request not found");
  }

  if (![WITHDRAWAL_STATUS.APPROVED, WITHDRAWAL_STATUS.PROCESSING].includes(withdrawalRequest.status)) {
    throw errors.badRequest("Withdrawal request cannot be marked as completed");
  }

  withdrawalRequest.status = WITHDRAWAL_STATUS.COMPLETED;
  withdrawalRequest.completedAt = completedAt || new Date();
  if (trackingNumber) {
    withdrawalRequest.trackingNumber = trackingNumber;
  }
  await withdrawalRequest.save();

  // Update billing account
  const billing = await Billing.findById(withdrawalRequest.billing);
  if (billing) {
    billing.totalWithdrawals += withdrawalRequest.amount;
    billing.lastWithdrawalAt = new Date();
    await billing.save();
  }

  res.json({
    success: true,
    message: "Withdrawal marked as completed",
    data: { withdrawalRequest },
  });
});

/**
 * Adjust user balance (admin only)
 */
exports.adjustBalance = asyncHandler(async (req, res) => {
  if (req.user.role !== "ADMIN") {
    throw errors.forbidden("Only admins can adjust balances");
  }

  const { userId } = req.params;
  const { amount, reason } = req.body;

  if (!amount || !reason) {
    throw errors.badRequest("Amount and reason are required");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw errors.notFound("User not found");
  }

  const result = await billingService.adjustBalance({
    userId,
    amount,
    reason,
    adjustedBy: req.user._id,
  });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * Get all withdrawal requests (admin only)
 */
exports.getAllWithdrawals = asyncHandler(async (req, res) => {
  if (req.user.role !== "ADMIN") {
    throw errors.forbidden("Only admins can view all withdrawals");
  }

  const { page = 1, limit = 20, status } = req.query;
  const skip = (page - 1) * limit;

  let query = {};
  if (status) {
    query.status = status;
  }

  const withdrawals = await WithdrawalRequest.find(query)
    .populate("user", "username email")
    .populate("billing")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await WithdrawalRequest.countDocuments(query);

  res.json({
    success: true,
    data: {
      withdrawals,
      pagination: getPagination(total, page, limit),
    },
  });
});

/**
 * Get earnings report with daily breakdown
 */
exports.getEarningsReport = asyncHandler(async (req, res) => {
  const { period = "month" } = req.query;

  const billing = await Billing.findOne({ user: req.user._id });
  if (!billing) {
    throw errors.notFound("Billing account not found");
  }

  const dateFrom = new Date();
  if (period === "week") {
    dateFrom.setDate(dateFrom.getDate() - 7);
  } else if (period === "month") {
    dateFrom.setMonth(dateFrom.getMonth() - 1);
  } else if (period === "year") {
    dateFrom.setFullYear(dateFrom.getFullYear() - 1);
  }

  const dailyData = await BillingTransaction.aggregate([
    {
      $match: {
        billing: billing._id,
        type: { $in: ["CREDIT", "PURCHASE_EARNINGS"] },
        createdAt: { $gte: dateFrom },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
        },
        amount: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);

  res.json({
    success: true,
    data: {
      period,
      daily: dailyData.map((d) => ({
        date: d._id,
        amount: d.amount,
        transactions: d.count,
      })),
    },
  });
});

/**
 * Get all payment methods for current user
 * Returns safe data (no provider tokens/IDs)
 */
exports.getPaymentMethods = asyncHandler(async (req, res) => {
  const paymentMethods = await PaymentMethodsService.getPaymentMethods(req.user._id);

  res.json({
    success: true,
    data: paymentMethods,
  });
});

/**
 * Add a payment method (tokenized from payment provider)
 * Request body: { provider, paymentMethodId/token, customerId }
 * No raw card data is sent to backend - provider handles tokenization
 */
exports.addPaymentMethod = asyncHandler(async (req, res) => {
  const { provider, paymentMethodId, setupTokenId } = req.body;

  // Validate required fields
  if (!provider) {
    throw errors.badRequest("Payment provider is required");
  }

  if (!PaymentProviderFactory.isProviderAvailable(provider)) {
    throw errors.badRequest(
      `Payment provider '${provider}' is not available. Available providers: ${PaymentProviderFactory.getAvailableProviders().join(', ')}`
    );
  }

  // Validate provider-specific tokens
  if (provider === "stripe" && !paymentMethodId) {
    throw errors.badRequest("Stripe paymentMethodId is required");
  }

  if (provider === "paypal" && !setupTokenId) {
    throw errors.badRequest("PayPal setupTokenId is required");
  }

  // Create payment method using the service
  const paymentData = {
    customerId: req.user._id.toString(),
  };

  if (provider === "stripe") {
    paymentData.paymentMethodId = paymentMethodId;
  } else if (provider === "paypal") {
    paymentData.setupTokenId = setupTokenId;
  }

  const result = await PaymentMethodsService.createPaymentMethod(
    req.user._id,
    provider,
    paymentData
  );

  res.json({
    success: true,
    message: "Payment method added successfully",
    data: result,
  });
});

/**
 * Delete a payment method
 * Provider automatically deletes the tokenized payment method
 */
exports.deletePaymentMethod = asyncHandler(async (req, res) => {
  const { paymentMethodId } = req.params;

  await PaymentMethodsService.deletePaymentMethod(req.user._id, paymentMethodId);

  res.json({
    success: true,
    message: "Payment method deleted successfully",
  });
});

/**
 * Set a payment method as default
 */
exports.setDefaultPaymentMethod = asyncHandler(async (req, res) => {
  const { paymentMethodId } = req.params;

  const result = await PaymentMethodsService.setDefaultPaymentMethod(req.user._id, paymentMethodId);

  res.json({
    success: true,
    message: "Default payment method updated successfully",
    data: result,
  });
});

/**
 * Get payment history (transactions)
 */
exports.getPaymentHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, type, status } = req.query;
  const skip = (page - 1) * limit;

  const billing = await Billing.findOne({ user: req.user._id });
  if (!billing) {
    // Return empty payment history if no billing account yet
    return res.json({
      success: true,
      data: [],
      pagination: {
        total: 0,
        pages: 0,
        page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  }

  let query = { billing: billing._id };

  if (type) {
    // Map frontend types to backend transaction types
    const typeMap = {
      purchase: "DEBIT",
      earnings: "CREDIT",
      withdrawal: "WITHDRAWAL",
      refund: "REFUND",
    };
    query.type = typeMap[type] || type;
  }

  if (status) {
    query.status = status.toUpperCase();
  }

  const transactions = await BillingTransaction.find(query)
    .populate("relatedPurchase", "rule")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await BillingTransaction.countDocuments(query);

  // Transform transactions for frontend
  const transformedTransactions = transactions.map((transaction) => {
    // Map backend types to frontend types
    const typeMap = {
      DEBIT: "purchase",
      CREDIT: "earnings",
      WITHDRAWAL: "withdrawal",
      REFUND: "refund",
      PURCHASE_EARNINGS: "earnings",
    };

    return {
      id: transaction._id,
      type: typeMap[transaction.type] || transaction.type.toLowerCase(),
      amount: transaction.amount,
      status: transaction.status.toLowerCase(),
      description: transaction.description,
      ruleTitle: transaction.relatedPurchase?.rule?.title || null,
      date: transaction.createdAt,
      paymentMethod: transaction.paymentMethod || null,
    };
  });

  res.json({
    success: true,
    data: transformedTransactions,
    pagination: {
      total,
      pages: Math.ceil(total / limit),
      page: parseInt(page),
      limit: parseInt(limit),
    },
  });
});

