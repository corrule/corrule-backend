// src/models/Transaction.js
const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rule",
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
    paymentMethod: {
      type: String,
      enum: ["STRIPE", "PAYPAL", "CRYPTO", "CREDITS", "MOCK"],
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED", "REFUNDED", "DISPUTED"],
      default: "PENDING",
    },
    paymentIntentId: String,
    receiptUrl: String,
    platformFee: {
      type: Number,
      default: 0,
    },
    sellerEarnings: {
      type: Number,
      default: 0,
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },
    refundReason: String,
    refundedAt: Date,
  },
  {
    timestamps: true,
  },
);

transactionSchema.index({ buyer: 1, createdAt: -1 });
transactionSchema.index({ seller: 1, createdAt: -1 });
transactionSchema.index({ rule: 1 });
transactionSchema.index({ status: 1 });

module.exports = mongoose.model("Transaction", transactionSchema);
