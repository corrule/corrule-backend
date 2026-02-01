// src/models/Activity.js
const mongoose = require("mongoose");
const { ACTIVITY_TYPE, ACTIVITY_TARGET_MODEL } = require("../constants/enums");

const activitySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(ACTIVITY_TYPE),
      required: true,
    },
    target: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "targetModel",
    },
    targetModel: {
      type: String,
      enum: Object.values(ACTIVITY_TARGET_MODEL),
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },
    ipAddress: String,
    userAgent: String,
  },
  {
    timestamps: true,
  },
);

activitySchema.index({ user: 1, createdAt: -1 });
activitySchema.index({ type: 1, createdAt: -1 });
activitySchema.index({ target: 1 });

module.exports = mongoose.model("Activity", activitySchema);
