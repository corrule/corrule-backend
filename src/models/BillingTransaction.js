// src/models/BillingTransaction.js
const mongoose = require("mongoose");

const billingTransactionSchema = new mongoose.Schema(
  {
    billing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Billing",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "PURCHASE_EARNINGS",
        "ADMIN_COMMISSION",
        "WITHDRAWAL",
        "REFUND",
        "ADJUSTMENT",
        "BONUS",
      ],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "USD",
    },
    description: String,
    relatedTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
    },
    relatedPurchase: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Purchase",
    },
    relatedWithdrawal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WithdrawalRequest",
    },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED", "REVERSED"],
      default: "COMPLETED",
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
billingTransactionSchema.index({ billing: 1, createdAt: -1 });
billingTransactionSchema.index({ user: 1, createdAt: -1 });
billingTransactionSchema.index({ type: 1 });
billingTransactionSchema.index({ status: 1 });
billingTransactionSchema.index({ relatedTransaction: 1 });

module.exports = mongoose.model("BillingTransaction", billingTransactionSchema);
