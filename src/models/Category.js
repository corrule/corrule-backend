// src/models/Category.js
const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    icon: String,
    color: String,
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    ruleCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

categorySchema.index({ slug: 1 });
categorySchema.index({ parent: 1 });

module.exports = mongoose.model("Category", categorySchema);
