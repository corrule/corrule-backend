// src/controllers/ruleController.js
const Rule = require("../models/Rule");
const RuleVersion = require("../models/RuleVersion");
const Purchase = require("../models/Purchase");
const Activity = require("../models/Activity");
const Transaction = require("../models/Transaction");
const Review = require("../models/Review");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { asyncHandler, errors } = require("../middleware/errorHandler");
const { getPagination } = require("../utils/pagination");
const { RULE_STATUS, ACTIVITY_TYPE, RULE_VISIBILITY } = require("../constants/enums");
const {
  checkRuleOwnership,
  logActivity,
  enrichRule,
  incrementVersion,
  createRuleVersion,
  getRuleVersions,
  validateStatusTransition,
  getVisibilityLabel,
  calculateEarnings,
} = require("../services/ruleService");

// Create new rule (draft)
exports.createRule = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    queryLanguage,
    vendor,
    category,
    tags,
    mitreAttack,
    severity,
    ruleContent,
    visibility,
    pricing,
  } = req.body;

  try {
    const rule = new Rule({
      title,
      description,
      author: req.user._id,
      queryLanguage,
      vendor,
      category,
      tags,
      mitreAttack,
      severity,
      ruleContent,
      visibility: visibility || RULE_VISIBILITY.PRIVATE,
      pricing,
      status: RULE_STATUS.DRAFT,
    });

    await rule.save();

    // Create initial version
    await createRuleVersion(rule._id, {
      version: "1.0.0",
      title,
      description,
      ruleContent,
      createdBy: req.user._id,
    });

    // Log activity
    await logActivity(req.user._id, ACTIVITY_TYPE.RULE_CREATED, rule._id, {}, req);

    // Update user statistics
    req.user.statistics.totalRules += 1;
    await req.user.save();

    res.status(201).json({
      success: true,
      message: "Rule created successfully",
      data: { rule },
    });
  } catch (error) {
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      let message = "Validation failed";
      let fieldPath = field;
      let errorMsg = "";

      if (field === "title") {
        errorMsg = "A rule with this title already exists";
      } else if (field === "ruleContent.query") {
        errorMsg = "A rule with this content already exists";
      }

      return res.status(400).json({
        success: false,
        message: message,
        errors: [
          {
            type: "field",
            value: req.body[field === "ruleContent.query" ? "ruleContent" : field],
            msg: errorMsg,
            path: fieldPath,
            location: "body",
          },
        ],
      });
    }

    // Re-throw other errors to be handled by asyncHandler
    throw error;
  }
});

// Get all rules with filters
exports.getRules = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    sort = "-createdAt",
    queryLanguage,
    vendor,
    category,
    severity,
    isPaid,
    minRating,
    search,
    tags,
    mitreTactics,
    mitreTechniques,
  } = req.query;

  // Build filter
  const filter = {
    status: RULE_STATUS.APPROVED,
    isActive: true,
  };

  // Show public and paid rules to all users
  // Users can see their own rules regardless of visibility
  if (!req.user) {
    // Non-authenticated users see PUBLIC and PAID rules
    filter.$or = [{ visibility: RULE_VISIBILITY.PUBLIC }, { visibility: RULE_VISIBILITY.PAID }];
  } else {
    // Authenticated users see:
    // - All PUBLIC and PAID rules
    // - Their own rules (regardless of visibility)
    filter.$or = [
      { visibility: RULE_VISIBILITY.PUBLIC },
      { visibility: RULE_VISIBILITY.PAID },
      { author: req.user._id }
    ];
  }

  // Apply filters
  if (queryLanguage) filter.queryLanguage = queryLanguage;
  if (vendor) filter.vendor = vendor;
  if (category) filter.category = category;
  if (severity) filter.severity = severity;
  if (isPaid !== undefined) filter["pricing.isPaid"] = isPaid === "true";
  if (minRating)
    filter["statistics.rating"] = { $gte: parseFloat(minRating) };
  if (tags) filter.tags = { $in: tags.split(",") };
  if (mitreTactics)
    filter["mitreAttack.tactics"] = { $in: mitreTactics.split(",") };
  if (mitreTechniques)
    filter["mitreAttack.techniques"] = { $in: mitreTechniques.split(",") };

  // Text search
  if (search) {
    filter.$text = { $search: search };
  }

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Execute query
  const rules = await Rule.find(filter)
    .populate("author", "username profile.avatar statistics.rating")
    .sort(sort)
    .limit(parseInt(limit))
    .skip(skip)
    .lean();

  const total = await Rule.countDocuments(filter);

  // Mask paid rule content for non-purchasers
  const maskedRules = await Promise.all(
    rules.map(async (rule) => {
      if (rule.pricing.isPaid && req.user) {
        const hasPurchased = await Purchase.exists({
          user: req.user._id,
          rule: rule._id,
          isActive: true,
        });

        if (!hasPurchased) {
          // Mask the query content
          rule.ruleContent.query =
            rule.ruleContent.query.substring(0, 100) +
            "... [Purchase to view full content]";
        }
      } else if (rule.pricing.isPaid && !req.user) {
        rule.ruleContent.query = "[Login and purchase to view content]";
      }

      // Get review count for this rule
      const reviewCount = await Review.countDocuments({ rule: rule._id });
      rule.reviewCount = reviewCount;

      return rule;
    }),
  );

  res.json({
    success: true,
    data: {
      rules: maskedRules,
      pagination: getPagination(total, page, limit),
    },
  });
});

// Get single rule by ID
exports.getRuleById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Helper function to check if string is valid MongoDB ObjectId
  const isValidObjectId = (str) => /^[0-9a-f]{24}$/.test(str);
  
  // Helper function to convert title to slug (same as frontend)
  const titleToSlug = (title) => {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  };
  
  let rule;
  
  if (isValidObjectId(id)) {
    // Try to find by ID first
    rule = await Rule.findById(id)
      .populate("author", "username profile statistics.rating")
      .populate("reviews");
  } else {
    // If not a valid ID, try to find by title slug
    // Fetch approved rules and find the one with matching slug
    const allRules = await Rule.find({ status: "APPROVED" })
      .select("_id title")
      .lean();
    
    // Find rule where the generated slug matches or is a prefix of the requested slug
    let matchedRule = null;
    
    for (const r of allRules) {
      const ruleSlug = titleToSlug(r.title);
      
      // Check for perfect match
      if (ruleSlug === id) {
        matchedRule = r;
        break;
      }
      
      // Check if rule slug is a prefix of the requested id
      // This handles cases where extra text is appended to the slug
      if (id.startsWith(ruleSlug + '-') || id.startsWith(ruleSlug)) {
        matchedRule = r;
        break;
      }
    }
    
    if (matchedRule) {
      rule = await Rule.findById(matchedRule._id)
        .populate("author", "username profile statistics.rating")
        .populate("reviews");
    }
  }

  if (!rule) {
    throw errors.notFound("Rule not found");
  }

  // Check visibility permissions
  if (
    rule.visibility === RULE_VISIBILITY.PRIVATE &&
    (!req.user || rule.author._id.toString() !== req.user._id.toString())
  ) {
    throw errors.forbidden("Access denied");
  }

  // Increment view count (max 5 views per user per rule)
  if (req.user) {
    // Check how many times this user has viewed this rule
    const Activity = require("../models/Activity");
    const userViewCount = await Activity.countDocuments({
      user: req.user._id,
      target: rule._id,
      type: 'RULE_VIEWED',
    });

    // Only increment view count if user has viewed less than 5 times
    if (userViewCount < 5) {
      rule.statistics.views += 1;
      await rule.save();

      // Log view activity
      await Activity.create({
        user: req.user._id,
        type: 'RULE_VIEWED',
        target: rule._id,
        targetModel: 'Rule',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }
  } else {
    // For anonymous users, always increment (no user to track)
    rule.statistics.views += 1;
    await rule.save();
  }

  // Check if user has purchased (for paid rules)
  let hasPurchased = false;
  const isPaidRule = rule.visibility && (rule.visibility.toUpperCase() === 'PAID' || rule.pricing.isPaid);
  
  if (isPaidRule) {
    if (req.user) {
      // User has purchased if they are the author or have the rule in their purchasedRules array
      hasPurchased = 
        rule.author._id.toString() === req.user._id.toString() ||
        (req.user.purchasedRules && 
         req.user.purchasedRules.some(id => id.toString() === rule._id.toString()));
    }
    
    // Mask content if not purchased
    if (!hasPurchased) {
      rule.ruleContent.query =
        rule.ruleContent.query.substring(0, 150) +
        "... [Purchase to view full content]";
    }
  } else if (!req.user && rule.visibility === RULE_VISIBILITY.PRIVATE) {
    rule.ruleContent.query = "[Login to view content]";
  }

  res.json({
    success: true,
    data: {
      rule,
      hasPurchased,
    },
  });
});

// Update rule
exports.updateRule = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const rule = await Rule.findById(id);

    if (!rule) {
      throw errors.notFound("Rule not found");
    }

    // Check ownership or admin permission
    if (
      rule.author.toString() !== req.user._id.toString() &&
      !req.user.hasPermission("rule:update:any")
    ) {
      throw errors.forbidden("Access denied");
    }

    // Don't allow changing status through this endpoint
    delete updates.status;
    delete updates.moderation;

    // Handle version updates - create version history
    if (updates.version && typeof updates.version === 'object' && updates.version.current) {
      const newVersion = updates.version.current;
      const oldVersion = rule.version?.current || '1.0.0';
      
      // If version has changed, create a version history entry
      if (newVersion !== oldVersion) {
        // Check if this version already exists in RuleVersion collection
        const existingVersion = await RuleVersion.findOne({
          rule: rule._id,
          version: oldVersion,
        });

        // Only create a new version entry if it doesn't already exist
        if (!existingVersion) {
          const versionEntry = new RuleVersion({
            rule: rule._id,
            version: oldVersion,
            title: rule.title,
            description: rule.description,
            ruleContent: rule.ruleContent,
            createdBy: req.user._id,
          });
          await versionEntry.save();
        }

        // Update the rule's version and add to changelog
        rule.version = {
          current: newVersion,
          changelog: [
            ...(rule.version?.changelog || []),
            {
              version: oldVersion,
              changes: `Updated to version ${newVersion}`,
              author: req.user._id,
              createdAt: new Date(),
            },
          ],
        };
      } else {
        // If version didn't change, just update the version object structure
        rule.version = updates.version;
      }
      delete updates.version;
    }

    // Update other fields
    Object.assign(rule, updates);
    
    await rule.save();

    // Log activity
    await logActivity(req.user._id, ACTIVITY_TYPE.RULE_UPDATED, rule._id, {}, req);

    res.json({
      success: true,
      message: "Rule updated successfully",
      data: { rule },
    });
  } catch (error) {
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      let errorMsg = "";

      if (field === "title") {
        errorMsg = "A rule with this title already exists";
      } else if (field === "ruleContent.query") {
        errorMsg = "A rule with this content already exists";
      }

      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: [
          {
            type: "field",
            value: req.body[field === "ruleContent.query" ? "ruleContent" : field],
            msg: errorMsg,
            path: field,
            location: "body",
          },
        ],
      });
    }

    // Re-throw other errors to be handled by asyncHandler
    throw error;
  }
});

// Direct publish rule (for VERIFIED_CONTRIBUTOR/ADMIN)
exports.directPublishRule = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const rule = await Rule.findById(id);

  if (!rule) {
    throw errors.notFound("Rule not found");
  }

  if (rule.author.toString() !== req.user._id.toString()) {
    throw errors.forbidden("Access denied");
  }

  if (rule.status !== RULE_STATUS.DRAFT) {
    throw errors.badRequest("Only draft rules can be published");
  }

  if (!req.user.emailVerified) {
    throw errors.forbidden("Email verification required to publish rules");
  }

  // Change status based on user role
  if (req.user.role === "VERIFIED_CONTRIBUTOR" || req.user.role === "ADMIN") {
    rule.status = RULE_STATUS.APPROVED;
    rule.publishedAt = new Date();
  } else {
    rule.status = RULE_STATUS.UNDER_REVIEW;
  }

  await rule.save();

  // Log activity
  await logActivity(req.user._id, ACTIVITY_TYPE.RULE_PUBLISHED, rule._id, {}, req);

  res.json({
    success: true,
    message:
      rule.status === RULE_STATUS.APPROVED
        ? "Rule published successfully"
        : "Rule submitted for review",
    data: { rule },
  });
});

// Delete rule
exports.deleteRule = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const rule = await Rule.findById(id);

  if (!rule) {
    throw errors.notFound("Rule not found");
  }

  // Check ownership or admin
  checkRuleOwnership(rule, req.user);

  // Delete all reviews for this rule
  await Review.deleteMany({ rule: id });

  // Delete the rule
  await Rule.findByIdAndDelete(id);

  res.json({
    success: true,
    message: "Rule deleted successfully",
  });
});

// Fork rule
exports.forkRule = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const originalRule = await Rule.findById(id);

  if (!originalRule) {
    throw errors.notFound("Rule not found");
  }

  // Allow forking of PUBLIC rules. For PAID rules only allow fork if
  // the requester is the author, has purchased the rule, or is an ADMIN.
  if (originalRule.visibility === RULE_VISIBILITY.PRIVATE) {
    throw errors.forbidden("Cannot fork private rules");
  }

  if (originalRule.visibility === RULE_VISIBILITY.PAID) {
    const isAuthor = originalRule.author &&
      ((originalRule.author._id && originalRule.author._id.toString()) || originalRule.author.toString()) === req.user._id.toString();

    const hasPurchased = await Purchase.exists({
      user: req.user._id,
      rule: originalRule._id,
      isActive: true,
    });

    if (!isAuthor && !hasPurchased && req.user.role !== "ADMIN") {
      throw errors.forbidden("Purchase required to fork paid rules");
    }
  }

  // Create forked rule - always create as PRIVATE initially
  // Visibility will be determined when the user publishes the rule
  // Generate a unique placeholder query so the fork can be created
  // User will update this query when editing the forked rule
  const forkedRule = new Rule({
    title: `${originalRule.title} (Fork)`,
    description: originalRule.description,
    author: req.user._id,
    queryLanguage: originalRule.queryLanguage,
    vendor: originalRule.vendor,
    category: originalRule.category,
    tags: originalRule.tags,
    mitreAttack: originalRule.mitreAttack,
    severity: originalRule.severity,
    ruleContent: {
      query: originalRule.ruleContent.query,
      metadata: originalRule.ruleContent.metadata,
      dependencies: originalRule.ruleContent.dependencies,
      references: originalRule.ruleContent.references,
    },
    forkedFrom: originalRule._id,
    status: RULE_STATUS.DRAFT,
    visibility: RULE_VISIBILITY.PRIVATE,
  });

  await forkedRule.save();

  // Update fork count
  originalRule.statistics.forks += 1;
  await originalRule.save();

  // Log activity
  await logActivity(
    req.user._id,
    ACTIVITY_TYPE.RULE_FORKED,
    forkedRule._id,
    { originalRule: originalRule._id },
    req
  );

  res.status(201).json({
    success: true,
    message: "Rule forked successfully",
    data: { rule: forkedRule },
  });
});

// Merge a forked rule back into the original rule
exports.mergeRule = asyncHandler(async (req, res) => {
  const { id: originalRuleId } = req.params;
  const { forkedRuleId } = req.body;

  if (!forkedRuleId) {
    throw errors.badRequest("Forked rule ID is required");
  }

  // Fetch the original rule
  const originalRule = await Rule.findById(originalRuleId);
  if (!originalRule) {
    throw errors.notFound("Original rule not found");
  }

  // Fetch the forked rule
  const forkedRule = await Rule.findById(forkedRuleId);
  if (!forkedRule) {
    throw errors.notFound("Forked rule not found");
  }

  // Verify the forked rule is actually a fork of the original
  if (forkedRule.forkedFrom?.toString() !== originalRuleId.toString()) {
    throw errors.forbidden("This rule is not a fork of the original rule");
  }

  // Verify permissions - only original rule owner or admin can merge
  if (req.user._id.toString() !== originalRule.author.toString() && req.user.role !== "ADMIN") {
    throw errors.forbidden("Only the original rule owner can merge forks");
  }

  // Verify forked rule is approved and public
  if (forkedRule.status !== RULE_STATUS.APPROVED || forkedRule.visibility !== RULE_VISIBILITY.PUBLIC) {
    throw errors.forbidden("Only approved and public forks can be merged");
  }

  // Save the current version before merging
  // Version can be either a string or an object with 'current' property
  let currentVersionString = "1.0.0";
  if (typeof originalRule.version === "string") {
    currentVersionString = originalRule.version;
  } else if (originalRule.version && originalRule.version.current) {
    currentVersionString = originalRule.version.current;
  }
  const newVersion = incrementVersion(currentVersionString);

  // Create a version record of the original rule before merge
  await RuleVersion.create({
    rule: originalRuleId,
    version: newVersion,
    content: originalRule.content || originalRule.ruleContent?.query || "",
    ruleContent: originalRule.ruleContent,
    changelog: `Merged changes from fork: "${forkedRule.title}" by ${forkedRule.author.username || "Unknown"}`,
    author: req.user._id,
    createdBy: req.user._id,
  });

  // Merge the forked rule's content into the original rule
  originalRule.ruleContent = forkedRule.ruleContent;
  originalRule.content = forkedRule.content;
  originalRule.description = forkedRule.description;
  originalRule.tags = Array.from(new Set([...originalRule.tags, ...forkedRule.tags]));
  
  // Update version - handle both string and object formats
  if (typeof originalRule.version === "string") {
    originalRule.version = newVersion;
  } else if (originalRule.version) {
    // If version is an object, update current and add to changelog
    const previousVersion = originalRule.version.current || "1.0.0";
    originalRule.version.current = newVersion;
    
    // Add to changelog if not already there
    if (!originalRule.version.changelog) {
      originalRule.version.changelog = [];
    }
    originalRule.version.changelog.push({
      version: newVersion,
      changes: `Merged changes from fork: "${forkedRule.title}" by ${forkedRule.author.username || "Unknown"}`,
      author: req.user._id,
      createdAt: new Date(),
    });
  } else {
    originalRule.version = { 
      current: newVersion,
      changelog: [{
        version: newVersion,
        changes: `Merged changes from fork: "${forkedRule.title}" by ${forkedRule.author.username || "Unknown"}`,
        author: req.user._id,
        createdAt: new Date(),
      }]
    };
  }

  // Only update metadata if it's significantly different
  if (forkedRule.severity) {
    originalRule.severity = forkedRule.severity;
  }
  if (forkedRule.dataSource && forkedRule.dataSource.length > 0) {
    originalRule.dataSource = Array.from(new Set([...originalRule.dataSource, ...forkedRule.dataSource]));
  }

  await originalRule.save();

  // Mark the fork as merged (so it doesn't appear in the Forks list anymore)
  forkedRule.mergedAt = new Date();
  forkedRule.mergedIntoRule = originalRuleId;
  await forkedRule.save();

  // Log the merge activity
  await logActivity(
    req.user._id,
    ACTIVITY_TYPE.RULE_MERGED,
    originalRuleId,
    {
      mergedFromFork: forkedRuleId,
      forkTitle: forkedRule.title,
      forkAuthor: forkedRule.author,
      newVersion: newVersion,
    },
    req
  );

  res.status(200).json({
    success: true,
    message: "Fork merged successfully",
    data: { rule: originalRule },
  });
});

// Get user's own rules (all statuses)
exports.getMyRules = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status = "all",
    sort = "-createdAt",
    search,
  } = req.query;

  const filter = {
    author: req.user._id,
  };

  // Filter by status if specified
  if (status && status !== "all") {
    filter.status = status.toUpperCase();
  }

  // Search by title or description
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Fetch rules
  const rules = await Rule.find(filter)
    .sort(sort)
    .limit(parseInt(limit))
    .skip(skip)
    .lean();

  const total = await Rule.countDocuments(filter);

  res.json({
    success: true,
    data: {
      rules,
      pagination: getPagination(total, page, limit),
    },
  });
});

// Mock purchase rule - simulates payment
exports.purchaseRule = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  const rule = await Rule.findById(id);
  if (!rule) {
    throw errors.notFound("Rule not found");
  }

  // Check if rule is not paid
  if (rule.visibility !== RULE_VISIBILITY.PAID) {
    throw errors.badRequest("This rule is not a paid rule");
  }

  // Check if user already has purchase record
  const existingPurchase = await Purchase.findOne({
    user: userId,
    rule: id,
  });

  if (existingPurchase) {
    throw errors.badRequest("You have already purchased this rule");
  }

  // Create transaction record
  const amount = rule.pricing?.price || 0;
  const currency = rule.pricing?.currency || "USD";

  const { platformFee, sellerEarnings } = calculateEarnings(amount, 10);

  const transaction = new Transaction({
    buyer: userId,
    seller: rule.author,
    rule: id,
    amount,
    currency,
    paymentMethod: "MOCK",
    status: "COMPLETED",
    platformFee,
    sellerEarnings,
    metadata: {
      mockPayment: true,
      processedAt: new Date(),
    },
  });

  await transaction.save();

  // Create purchase record
  const purchase = new Purchase({
    user: userId,
    rule: id,
    transaction: transaction._id,
    accessGrantedAt: new Date(),
    isActive: true,
  });

  await purchase.save();

  // Update user's purchased rules list
  const user = await User.findById(userId);
  if (!user.purchasedRules) {
    user.purchasedRules = [];
  }
  user.purchasedRules.push(rule._id);
  await user.save();

  // Log activity
  await logActivity(
    userId,
    ACTIVITY_TYPE.RULE_PURCHASED,
    rule._id,
    {
      transactionId: transaction._id,
      amount,
    },
    req
  );

  res.json({
    success: true,
    message: "Rule purchased successfully",
    data: {
      ruleId: rule._id,
      purchased: true,
      transactionId: transaction._id,
    },
  });
});

exports.likeRule = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  const rule = await Rule.findById(id);
  if (!rule) {
    throw errors.notFound("Rule not found");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw errors.notFound("User not found");
  }

  // Check if user already liked this rule
  const alreadyLiked = user.likedRules.includes(rule._id);

  if (alreadyLiked) {
    // Unlike the rule
    user.likedRules = user.likedRules.filter(id => !id.equals(rule._id));
    rule.statistics.likes = Math.max(0, (rule.statistics?.likes || 0) - 1);
  } else {
    // Like the rule
    user.likedRules.push(rule._id);
    rule.statistics.likes = (rule.statistics?.likes || 0) + 1;
  }

  await user.save();
  await rule.save();

  // Log activity
  await logActivity(
    userId,
    alreadyLiked ? ACTIVITY_TYPE.RULE_UNLIKED : ACTIVITY_TYPE.RULE_LIKED,
    rule._id,
    {},
    req
  );

  // Populate author before returning (important for frontend)
  await rule.populate("author", "username profile statistics.rating");

  res.json({
    success: true,
    message: alreadyLiked ? "Rule unliked" : "Rule liked",
    data: {
      rule,
      liked: !alreadyLiked,
    },
  });
});

// Publish rule with visibility and pricing
exports.publishRule = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { visibility, pricing } = req.body;

  const rule = await Rule.findById(id).populate("author");

  if (!rule) {
    throw errors.notFound("Rule not found");
  }

  // Check ownership BEFORE any modifications
  checkRuleOwnership(rule, req.user);

  // Check status BEFORE any modifications
  if (rule.status !== RULE_STATUS.DRAFT) {
    throw errors.conflict("Only draft rules can be published");
  }

  // Proceed with modifications
  rule.status = RULE_STATUS.UNDER_REVIEW;
  rule.visibility = visibility || RULE_VISIBILITY.PUBLIC;
  if (pricing) {
    rule.pricing = pricing;
  }

  await rule.save();

  // Log activity
  await logActivity(req.user._id, ACTIVITY_TYPE.RULE_PUBLISHED, rule._id, {}, req);

  // Create notifications for managers
  const managers = await User.find({ role: "MANAGER" });

  if (managers.length > 0) {
    await Notification.insertMany(
      managers.map((manager) => ({
        recipient: manager._id,
        type: "SYSTEM",
        title: "New Rule Submitted for Review",
        message: `A new rule "${rule.title}" by @${rule.author.username} has been submitted for review.`,
        data: { ruleId: rule._id },
      }))
    );
  }

  res.json({
    success: true,
    message: "Rule submitted for review successfully",
    data: { rule },
  });
});

// Get rule analytics (for owner or admin)
exports.getRuleAnalytics = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const rule = await Rule.findById(id).populate("author");

  if (!rule) {
    throw errors.notFound("Rule not found");
  }

  // Check ownership or admin
  checkRuleOwnership(rule, req.user);

  // Calculate earnings
  const purchases = await Purchase.countDocuments({ rule: id });
  const earnings = purchases * (rule.pricing?.price || 0) * 0.1;

  const analytics = {
    downloads: rule.statistics?.downloads || 0,
    views: rule.statistics?.views || 0,
    rating: rule.statistics?.rating || 0,
    totalRatings: rule.statistics?.totalRatings || 0,
    likes: rule.statistics?.likes || 0,
    forks: rule.statistics?.forks || 0,
    purchases,
    earnings,
  };

  res.json({
    success: true,
    data: { analytics },
  });
});

module.exports = exports;
