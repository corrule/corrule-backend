// src/models/WithdrawalRequest.js
const mongoose = require("mongoose");

const withdrawalRequestSchema = new mongoose.Schema(
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
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "USD",
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"],
      default: "PENDING",
    },
    withdrawalMethod: {
      type: String,
      enum: ["BANK_TRANSFER", "PAYPAL", "CRYPTO"],
      required: true,
    },
    bankAccount: {
      accountHolder: String,
      accountNumber: String,
      bankName: String,
      routingNumber: String,
    },
    paypalEmail: String,
    cryptoAddress: String,
    cryptoNetwork: String,
    transactionHash: String,
    trackingNumber: String,
    estimatedArrivalDate: Date,
    completedAt: Date,
    failureReason: String,
    notes: String,
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
withdrawalRequestSchema.index({ billing: 1, createdAt: -1 });
withdrawalRequestSchema.index({ user: 1, status: 1 });
withdrawalRequestSchema.index({ status: 1 });

module.exports = mongoose.model("WithdrawalRequest", withdrawalRequestSchema);
