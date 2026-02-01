// src/models/Review.js
const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    rule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rule",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      maxlength: 1000,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    helpful: {
      count: { type: Number, default: 0 },
      users: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    },
    reported: {
      type: Boolean,
      default: false,
    },
    reportReason: String,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

reviewSchema.index({ rule: 1, user: 1 }, { unique: true });
reviewSchema.index({ rule: 1, createdAt: -1 });
reviewSchema.index({ user: 1 });

module.exports = mongoose.model("Review", reviewSchema);
