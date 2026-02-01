// src/services/billingService.js
const Billing = require("../models/Billing");
const BillingTransaction = require("../models/BillingTransaction");
const User = require("../models/User");

/**
 * Commission percentage for admin (10%)
 */
const ADMIN_COMMISSION_PERCENT = 0.1;

/**
 * Initialize billing account for a user
 * Called when user is created
 */
exports.createBillingAccount = async (userId, accountType = "USER") => {
  try {
    // Check if billing account already exists
    const existingBilling = await Billing.findOne({ user: userId });
    if (existingBilling) {
      return existingBilling;
    }

    // Create new billing account
    const billing = await Billing.create({
      user: userId,
      accountType,
      balance: 0,
      totalEarnings: 0,
      totalWithdrawals: 0,
      currency: "USD",
    });

    return billing;
  } catch (error) {
    console.error("Error creating billing account:", error);
    throw error;
  }
};

/**
 * Get user's billing account
 */
exports.getBillingAccount = async (userId) => {
  try {
    let billing = await Billing.findOne({ user: userId })
      .populate("user", "username email role")
      .lean();

    if (!billing) {
      // Create billing account if it doesn't exist
      billing = await exports.createBillingAccount(userId);
    }

    return billing;
  } catch (error) {
    console.error("Error getting billing account:", error);
    throw error;
  }
};

/**
 * Distribute earnings from a purchase
 * Called when a rule purchase is completed
 *
 * @param {Object} params - Distribution parameters
 * @param {String} params.purchaseId - Purchase ID
 * @param {String} params.transactionId - Transaction ID
 * @param {String} params.sellerId - Rule owner's user ID
 * @param {Number} params.amount - Purchase amount
 * @returns {Object} Distribution result
 */
exports.distributePurchaseEarnings = async (params) => {
  const { purchaseId, transactionId, sellerId, amount } = params;

  try {
    // Validate inputs
    if (!sellerId || !amount || amount <= 0) {
      throw new Error("Invalid distribution parameters");
    }

    // Get admin user
    const adminUser = await User.findOne({ role: "ADMIN" });
    if (!adminUser) {
      throw new Error("Admin user not found");
    }

    // Calculate commission and seller earnings
    const adminCommission = amount * ADMIN_COMMISSION_PERCENT;
    const sellerEarnings = amount - adminCommission;

    // Get or create billing accounts
    const adminBilling = await exports.getBillingAccount(adminUser._id);
    const sellerBilling = await exports.getBillingAccount(sellerId);

    // Create billing transactions for admin commission
    const adminBillingTransaction = await BillingTransaction.create({
      billing: adminBilling._id,
      user: adminUser._id,
      type: "ADMIN_COMMISSION",
      amount: adminCommission,
      currency: "USD",
      description: `Admin commission from rule purchase`,
      relatedTransaction: transactionId,
      relatedPurchase: purchaseId,
      status: "COMPLETED",
      metadata: {
        purchaseId,
        transactionId,
        sellerId,
        originalAmount: amount,
        commissionPercent: ADMIN_COMMISSION_PERCENT * 100,
      },
    });

    // Create billing transactions for seller earnings
    const sellerBillingTransaction = await BillingTransaction.create({
      billing: sellerBilling._id,
      user: sellerId,
      type: "PURCHASE_EARNINGS",
      amount: sellerEarnings,
      currency: "USD",
      description: `Earnings from rule purchase`,
      relatedTransaction: transactionId,
      relatedPurchase: purchaseId,
      status: "COMPLETED",
      metadata: {
        purchaseId,
        transactionId,
        adminCommission,
        commissionPercent: ADMIN_COMMISSION_PERCENT * 100,
      },
    });

    // Update admin billing account
    adminBilling.balance += adminCommission;
    adminBilling.totalEarnings += adminCommission;
    adminBilling.transactions.push(adminBillingTransaction._id);
    await adminBilling.save();

    // Update seller billing account
    sellerBilling.balance += sellerEarnings;
    sellerBilling.totalEarnings += sellerEarnings;
    sellerBilling.transactions.push(sellerBillingTransaction._id);
    await sellerBilling.save();

    return {
      success: true,
      message: "Earnings distributed successfully",
      distribution: {
        adminCommission: {
          amount: adminCommission,
          userId: adminUser._id,
          username: adminUser.username,
          billingTransactionId: adminBillingTransaction._id,
        },
        sellerEarnings: {
          amount: sellerEarnings,
          userId: sellerId,
          billingTransactionId: sellerBillingTransaction._id,
        },
        totalAmount: amount,
      },
    };
  } catch (error) {
    console.error("Error distributing purchase earnings:", error);
    throw error;
  }
};

/**
 * Record a refund transaction
 * Reverses the earnings distribution when a refund is issued
 */
exports.recordRefund = async (params) => {
  const { transactionId, purchaseId, sellerId, amount } = params;

  try {
    const adminUser = await User.findOne({ role: "ADMIN" });
    if (!adminUser) {
      throw new Error("Admin user not found");
    }

    const adminCommission = amount * ADMIN_COMMISSION_PERCENT;
    const sellerRefund = amount - adminCommission;

    const adminBilling = await exports.getBillingAccount(adminUser._id);
    const sellerBilling = await exports.getBillingAccount(sellerId);

    // Create refund billing transactions (negative amounts)
    const adminRefundTransaction = await BillingTransaction.create({
      billing: adminBilling._id,
      user: adminUser._id,
      type: "REFUND",
      amount: -adminCommission,
      currency: "USD",
      description: `Refund of admin commission`,
      relatedTransaction: transactionId,
      relatedPurchase: purchaseId,
      status: "COMPLETED",
      metadata: {
        refundReason: "Purchase refunded",
        originalTransactionId: transactionId,
      },
    });

    const sellerRefundTransaction = await BillingTransaction.create({
      billing: sellerBilling._id,
      user: sellerId,
      type: "REFUND",
      amount: -sellerRefund,
      currency: "USD",
      description: `Refund of purchase earnings`,
      relatedTransaction: transactionId,
      relatedPurchase: purchaseId,
      status: "COMPLETED",
      metadata: {
        refundReason: "Purchase refunded",
        originalTransactionId: transactionId,
      },
    });

    // Update balances
    adminBilling.balance -= adminCommission;
    adminBilling.transactions.push(adminRefundTransaction._id);
    await adminBilling.save();

    sellerBilling.balance -= sellerRefund;
    sellerBilling.transactions.push(sellerRefundTransaction._id);
    await sellerBilling.save();

    return {
      success: true,
      message: "Refund recorded successfully",
      refund: {
        adminRefund: adminCommission,
        sellerRefund: sellerRefund,
        totalRefund: amount,
      },
    };
  } catch (error) {
    console.error("Error recording refund:", error);
    throw error;
  }
};

/**
 * Get billing account statistics
 */
exports.getBillingStats = async (userId) => {
  try {
    const billing = await Billing.findOne({ user: userId });

    if (!billing) {
      return {
        balance: 0,
        totalEarnings: 0,
        totalWithdrawals: 0,
        transactions: [],
      };
    }

    const transactions = await BillingTransaction.find({
      billing: billing._id,
    }).sort({ createdAt: -1 });

    return {
      balance: billing.balance,
      totalEarnings: billing.totalEarnings,
      totalWithdrawals: billing.totalWithdrawals,
      currency: billing.currency,
      transactions: transactions,
    };
  } catch (error) {
    console.error("Error getting billing stats:", error);
    throw error;
  }
};

/**
 * Get admin earnings
 */
exports.getAdminEarnings = async () => {
  try {
    const adminUser = await User.findOne({ role: "ADMIN" });
    if (!adminUser) {
      throw new Error("Admin user not found");
    }

    return await exports.getBillingStats(adminUser._id);
  } catch (error) {
    console.error("Error getting admin earnings:", error);
    throw error;
  }
};

/**
 * Manual adjustment to billing account (admin only)
 */
exports.adjustBalance = async (params) => {
  const { userId, amount, reason, adjustedBy } = params;

  try {
    const billing = await exports.getBillingAccount(userId);

    const transaction = await BillingTransaction.create({
      billing: billing._id,
      user: userId,
      type: "ADJUSTMENT",
      amount: amount,
      currency: "USD",
      description: `Manual adjustment: ${reason}`,
      status: "COMPLETED",
      processedBy: adjustedBy,
      metadata: {
        adjustmentReason: reason,
        adjustedBy,
      },
    });

    billing.balance += amount;
    if (amount > 0) {
      billing.totalEarnings += amount;
    }
    billing.transactions.push(transaction._id);
    await billing.save();

    return {
      success: true,
      message: "Balance adjusted successfully",
      transaction: transaction,
    };
  } catch (error) {
    console.error("Error adjusting balance:", error);
    throw error;
  }
};

/**
 * Get commission configuration
 */
exports.getCommissionConfig = () => {
  return {
    adminCommissionPercent: ADMIN_COMMISSION_PERCENT * 100,
    sellerPercentage: (1 - ADMIN_COMMISSION_PERCENT) * 100,
  };
};
