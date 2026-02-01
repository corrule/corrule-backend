// src/models/Rule.js
const mongoose = require("mongoose");
const { RULE_STATUS, RULE_SEVERITY, RULE_VISIBILITY, PRICING_TYPE } = require("../constants/enums");

const ruleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    queryLanguage: {
      type: String,
      required: true,
      enum: [
        "SIGMA",
        "KQL",
        "SPL",
        "YARA",
        "SURICATA",
        "SNORT",
        "LUCENE",
        "ESQL",
        "SQL",
        "XQL",
        "CUSTOM",
      ],
    },
    vendor: {
      type: String,
      required: true,
      enum: [
        "ELASTIC",
        "SPLUNK",
        "MICROSOFT_SENTINEL",
        "CHRONICLE",
        "QRADAR",
        "ARCSIGHT",
        "SUMO_LOGIC",
        "PALO_ALTO_XDR",
        "PALO_ALTO_XSIAM",
        "GENERIC",
      ],
    },
    category: {
      type: String,
      required: true,
      enum: [
        "DETECTION",
        "HUNTING",
        "CORRELATION",
        "ENRICHMENT",
        "RESPONSE",
        "MONITORING",
        "FORENSICS",
      ],
    },
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    mitreAttack: {
      tactics: [String],
      techniques: [String],
      subtechniques: [String],
    },
    severity: {
      type: String,
      enum: Object.values(RULE_SEVERITY),
      default: RULE_SEVERITY.MEDIUM,
    },
    ruleContent: {
      query: {
        type: String,
        required: true,
      },
      metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
      },
      dependencies: [String],
      references: [String],
    },
    visibility: {
      type: String,
      enum: Object.values(RULE_VISIBILITY),
      default: RULE_VISIBILITY.PRIVATE,
    },
    pricing: {
      isPaid: { type: Boolean, default: false },
      price: { type: Number, default: 0, min: 0 },
      currency: { type: String, default: "USD" },
      licenseType: {
        type: String,
        enum: Object.values(PRICING_TYPE),
        default: PRICING_TYPE.FREE,
      },
    },
    status: {
      type: String,
      enum: Object.values(RULE_STATUS),
      default: RULE_STATUS.DRAFT,
    },
    moderation: {
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reviewedAt: Date,
      reviewNotes: String,
      rejectionReason: String,
    },
    version: {
      current: { type: String, default: "1.0.0" },
      changelog: [
        {
          version: String,
          changes: String,
          author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          createdAt: { type: Date, default: Date.now },
        },
      ],
    },
    forkedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rule",
    },
    mergedAt: {
      type: Date,
      default: null,
      // When a fork is merged, this timestamp is set
      // Used to hide merged forks from the Forks list
    },
    mergedIntoRule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rule",
      // Reference to the rule this fork was merged into
    },
    statistics: {
      views: { type: Number, default: 0 },
      downloads: { type: Number, default: 0 },
      forks: { type: Number, default: 0 },
      purchases: { type: Number, default: 0 },
      likes: { type: Number, default: 0 },
      rating: { type: Number, default: 0, min: 0, max: 5 },
      totalRatings: { type: Number, default: 0 },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    publishedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Indexes for efficient queries
ruleSchema.index({ author: 1, status: 1 });
ruleSchema.index({ queryLanguage: 1, vendor: 1 });
ruleSchema.index({ category: 1, severity: 1 });
ruleSchema.index({ tags: 1 });
ruleSchema.index({ "pricing.isPaid": 1 });
ruleSchema.index({ status: 1, visibility: 1 });
ruleSchema.index({ "statistics.rating": -1 });
ruleSchema.index({ "statistics.downloads": -1 });
ruleSchema.index({ publishedAt: -1 });
ruleSchema.index({ createdAt: -1 });

// Unique indexes - ensure title is globally unique
ruleSchema.index({ title: 1 }, { unique: true, sparse: true });

// Conditional unique index for published rules only
// This allows multiple DRAFT rules with the same query (for forking)
// but prevents published rules from having duplicate queries
ruleSchema.index({ "ruleContent.query": 1, status: 1 }, { 
  unique: true, 
  partialFilterExpression: { 
    status: { $in: ["APPROVED", "UNDER_REVIEW"] } 
  }
});

// Text search index
ruleSchema.index({ title: "text", description: "text", tags: "text" });

// Virtual for review count
ruleSchema.virtual("reviews", {
  ref: "Review",
  localField: "_id",
  foreignField: "rule",
});

module.exports = mongoose.model("Rule", ruleSchema);
