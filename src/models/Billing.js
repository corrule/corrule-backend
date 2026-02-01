// src/models/Billing.js
const mongoose = require("mongoose");

const billingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    accountType: {
      type: String,
      enum: ["USER", "ADMIN"],
      default: "USER",
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalEarnings: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalWithdrawals: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: "USD",
    },
    transactions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "BillingTransaction",
      },
    ],
    withdrawalRequests: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "WithdrawalRequest",
      },
    ],
    bankAccount: {
      accountHolder: String,
      accountNumber: String, // Encrypted in production
      bankName: String,
      routingNumber: String, // Encrypted in production
      accountType: {
        type: String,
        enum: ["CHECKING", "SAVINGS"],
      },
      isVerified: {
        type: Boolean,
        default: false,
      },
      verifiedAt: Date,
    },
    paypalEmail: String,
    cryptoAddress: String,
    lastWithdrawalAt: Date,
    minimumWithdrawalAmount: {
      type: Number,
      default: 10,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    suspendedReason: String,
    suspendedAt: Date,
  },
  {
    timestamps: true,
  },
);

// Indexes for efficient queries
billingSchema.index({ user: 1 });
billingSchema.index({ accountType: 1 });
billingSchema.index({ createdAt: -1 });
billingSchema.index({ balance: -1 });

// Virtual to calculate available balance
billingSchema.virtual("availableBalance").get(function () {
  return this.balance;
});

module.exports = mongoose.model("Billing", billingSchema);
