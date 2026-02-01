// src/models/RuleVersion.js
const mongoose = require("mongoose");

const ruleVersionSchema = new mongoose.Schema(
  {
    rule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rule",
      required: true,
    },
    version: {
      type: String,
      required: true,
    },
    title: String,
    description: String,
    ruleContent: {
      query: String,
      metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
      },
    },
    changelog: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

ruleVersionSchema.index({ rule: 1, version: 1 }, { unique: true });
ruleVersionSchema.index({ rule: 1, createdAt: -1 });

module.exports = mongoose.model("RuleVersion", ruleVersionSchema);
