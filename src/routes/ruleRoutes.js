// src/routes/ruleRoutes.js
const express = require("express");
const router = express.Router();
const { body, query, validationResult } = require("express-validator");
const ruleController = require("../controllers/ruleController");
const { RULE_STATUS } = require("../constants/enums");
const {
  authenticate,
  hasPermission,
  isOwnerOr,
  optionalAuth,
  requireEmailVerification,
} = require("../middleware/auth");

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  }
  next();
};

// Middleware to load rule and attach to request
const loadRule = async (req, res, next) => {
  try {
    const Rule = require("../models/Rule");
    const rule = await Rule.findById(req.params.id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Rule not found",
      });
    }

    req.resource = rule;
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load rule",
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/v1/rules
 * @desc    Get all rules with filters
 * @access  Public (with optional auth for personalized results)
 */
router.get(
  "/",
  optionalAuth,
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("queryLanguage")
      .optional()
      .isIn([
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
      ]),
    query("vendor")
      .optional()
      .isIn([
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
      ]),
    query("category")
      .optional()
      .isIn([
        "DETECTION",
        "HUNTING",
        "CORRELATION",
        "ENRICHMENT",
        "RESPONSE",
        "MONITORING",
        "FORENSICS",
      ]),
    query("severity").optional().isIn(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    query("isPaid").optional().isBoolean(),
    query("minRating").optional().isFloat({ min: 0, max: 5 }),
  ],
  validate,
  ruleController.getRules,
);

/**
 * @route   GET /api/v1/rules/my/rules
 * @desc    Get authenticated user's own rules
 * @access  Private
 */
router.get(
  "/my/rules",
  authenticate,
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("status").optional().isIn([...Object.values(RULE_STATUS), "all"]),
    query("search").optional().isString(),
  ],
  validate,
  ruleController.getMyRules
);

/**
 * @route   GET /api/v1/rules/:id
 * @desc    Get single rule by ID
 * @access  Public (with optional auth)
 */
router.get("/:id", optionalAuth, ruleController.getRuleById);

/**
 * @route   POST /api/v1/rules
 * @desc    Create new rule
 * @access  Private
 */
router.post(
  "/",
  authenticate,
  requireEmailVerification,
  [
    body("title")
      .trim()
      .isLength({ min: 5, max: 200 })
      .withMessage("Title must be 5-200 characters"),
    body("description")
      .trim()
      .isLength({ min: 20, max: 2000 })
      .withMessage("Description must be 20-2000 characters"),
    body("queryLanguage")
      .isIn([
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
      ])
      .withMessage("Invalid query language"),
    body("vendor")
      .isIn([
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
      ])
      .withMessage("Invalid vendor"),
    body("category")
      .isIn([
        "DETECTION",
        "HUNTING",
        "CORRELATION",
        "ENRICHMENT",
        "RESPONSE",
        "MONITORING",
        "FORENSICS",
      ])
      .withMessage("Invalid category"),
    body("severity").optional().isIn(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    body("ruleContent.query").notEmpty().withMessage("Rule query is required"),
    body("tags").optional().isArray(),
    body("visibility").optional().isIn(["PUBLIC", "PRIVATE", "UNLISTED", "PAID"]),
    body("pricing.isPaid").optional().isBoolean(),
    body("pricing.price").optional().isFloat({ min: 0 }),
  ],
  validate,
  ruleController.createRule,
);

/**
 * @route   PUT /api/v1/rules/:id
 * @desc    Update rule
 * @access  Private (owner or moderator)
 */
router.put(
  "/:id",
  authenticate,
  loadRule,
  isOwnerOr("rule:update:any"),
  [
    body("title").optional().trim().isLength({ min: 5, max: 200 }),
    body("description").optional().trim().isLength({ min: 20, max: 2000 }),
    body("ruleContent.query").optional().notEmpty(),
  ],
  validate,
  ruleController.updateRule,
);

/**
 * @route   POST /api/v1/rules/:id/publish
 * @desc    Publish rule (submit for review or auto-approve)
 * @access  Private (owner)
 */
router.post(
  "/:id/publish",
  authenticate,
  requireEmailVerification,
  loadRule,
  isOwnerOr("rule:approve"),
  ruleController.publishRule,
);

/**
 * @route   DELETE /api/v1/rules/:id
 * @desc    Delete rule (soft delete)
 * @access  Private (owner or moderator)
 */
router.delete(
  "/:id",
  authenticate,
  loadRule,
  isOwnerOr("rule:delete:any"),
  ruleController.deleteRule,
);

/**
 * @route   POST /api/v1/rules/:id/fork
 * @desc    Fork/clone a public rule
 * @access  Private
 */
router.post(
  "/:id/fork",
  authenticate,
  requireEmailVerification,
  ruleController.forkRule,
);

/**
 * @route   POST /api/v1/rules/:id/merge
 * @desc    Merge a forked rule back into the original rule
 * @access  Private (only original rule owner or admin)
 */
router.post(
  "/:id/merge",
  authenticate,
  requireEmailVerification,
  ruleController.mergeRule,
);

/**
 * @route   GET /api/v1/rules/:id/versions
 * @desc    Get all versions of a rule
 * @access  Public (owner can see all, others see published only)
 */
router.get("/:id/versions", optionalAuth, async (req, res) => {
  try {
    const RuleVersion = require("../models/RuleVersion");
    const Rule = require("../models/Rule");

    const rule = await Rule.findById(req.params.id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Rule not found",
      });
    }

    const versions = await RuleVersion.find({ rule: req.params.id })
      .populate("createdBy", "username")
      .sort("-createdAt");

    res.json({
      success: true,
      data: { versions },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch versions",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/v1/rules/:id/download
 * @desc    Download rule content
 * @access  Private (must own or purchase)
 */
router.post("/:id/download", authenticate, async (req, res) => {
  try {
    const Rule = require("../models/Rule");
    const Purchase = require("../models/Purchase");
    const Activity = require("../models/Activity");

    const rule = await Rule.findById(req.params.id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Rule not found",
      });
    }

    // Check access
    const isOwner = rule.author.toString() === req.user._id.toString();
    let canAccess = isOwner || !rule.pricing.isPaid;

    if (rule.pricing.isPaid && !isOwner) {
      const purchase = await Purchase.findOne({
        user: req.user._id,
        rule: rule._id,
        isActive: true,
      });

      if (!purchase) {
        return res.status(403).json({
          success: false,
          message: "Purchase required to download this rule",
        });
      }

      // Update purchase download stats
      purchase.downloads.count += 1;
      purchase.downloads.lastDownloadedAt = new Date();
      purchase.downloads.history.push({
        downloadedAt: new Date(),
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
      await purchase.save();
    }

    // Update rule download stats
    rule.statistics.downloads += 1;
    await rule.save();

    // Log activity
    await Activity.create({
      user: req.user._id,
      type: "RULE_DOWNLOADED",
      target: rule._id,
      targetModel: "Rule",
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({
      success: true,
      data: {
        rule: {
          id: rule._id,
          title: rule.title,
          description: rule.description,
          queryLanguage: rule.queryLanguage,
          vendor: rule.vendor,
          category: rule.category,
          severity: rule.severity,
          tags: rule.tags,
          mitreAttack: rule.mitreAttack,
          ruleContent: rule.ruleContent,
          version: rule.version.current,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Download failed",
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/v1/rules/:id/purchase
 * @desc    Purchase a paid rule (mock payment)
 * @access  Private
 */
router.post("/:id/purchase", authenticate, ruleController.purchaseRule);

/**
 * @route   POST /api/v1/rules/:id/like
 * @desc    Like or unlike a rule
 * @access  Private
 */
router.post("/:id/like", authenticate, ruleController.likeRule);

/**
 * @route   GET /api/v1/rules/:id/analytics
 * @desc    Get rule analytics (downloads, views, earnings)
 * @access  Private (owner or admin)
 */
router.get("/:id/analytics", authenticate, ruleController.getRuleAnalytics);

module.exports = router;
