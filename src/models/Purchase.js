// src/models/Purchase.js
const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rule",
      required: true,
    },
    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
    },
    accessGrantedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: Date,
    downloads: {
      count: { type: Number, default: 0 },
      lastDownloadedAt: Date,
      history: [
        {
          downloadedAt: { type: Date, default: Date.now },
          ipAddress: String,
          userAgent: String,
        },
      ],
    },
    licenseKey: String,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

purchaseSchema.index({ user: 1, rule: 1 });
purchaseSchema.index({ user: 1, createdAt: -1 });
purchaseSchema.index({ rule: 1 });
purchaseSchema.index({ expiresAt: 1 });

module.exports = mongoose.model("Purchase", purchaseSchema);
