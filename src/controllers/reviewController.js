// src/controllers/reviewController.js
const Review = require("../models/Review");
const Rule = require("../models/Rule");
const User = require("../models/User");
const { asyncHandler, errors } = require("../middleware/errorHandler");
const { getPagination } = require("../utils/pagination");
const {
  calculateRuleRating,
  updateRuleRating,
  canReviewRule,
  getUserReviewForRule,
  logReviewActivity,
  checkReviewOwnership,
  toggleReviewHelpful,
  getReviewSortOption,
  validateReviewInput,
  enrichReviewsWithHelpfulStatus,
} = require("../services/reviewService");

/**
 * Get all reviews for a rule
 */
exports.getReviewsByRule = asyncHandler(async (req, res) => {
  const { ruleId } = req.params;
  const { page = 1, limit = 10, sort = "helpful" } = req.query;

  // Verify rule exists
  const rule = await Rule.findById(ruleId);
  if (!rule) {
    throw errors.notFound("Rule not found");
  }

  const sortOption = getReviewSortOption(sort);
  const skip = (page - 1) * limit;

  const reviews = await Review.find({ rule: ruleId, isActive: true })
    .populate("user", "username profile avatar")
    .sort(sortOption)
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  const total = await Review.countDocuments({ rule: ruleId, isActive: true });

  // Enrich with helpful status for current user
  const enrichedReviews = enrichReviewsWithHelpfulStatus(
    reviews,
    req.user?._id
  );

  res.json({
    success: true,
    data: {
      reviews: enrichedReviews,
      pagination: getPagination(total, page, limit),
    },
  });
});

/**
 * Get single review
 */
exports.getReview = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const review = await Review.findById(id)
    .populate("user", "username profile avatar")
    .populate("rule", "title slug");

  if (!review) {
    throw errors.notFound("Review not found");
  }

  res.json({
    success: true,
    data: { review },
  });
});

/**
 * Create a new review
 */
exports.createReview = asyncHandler(async (req, res) => {
  const { ruleId, rating, comment } = req.body;

  // Validate input
  const validation = validateReviewInput(rating, comment);
  if (!validation.valid) {
    throw errors.badRequest(validation.message);
  }

  // Verify rule exists
  const rule = await Rule.findById(ruleId);
  if (!rule) {
    throw errors.notFound("Rule not found");
  }

  // Check if user can review (must be purchaser for paid rules)
  const canReview = await canReviewRule(req.user._id, rule);
  if (!canReview) {
    throw errors.forbidden(
      "You must purchase this rule to leave a review"
    );
  }

  // Check if user already reviewed
  const existingReview = await getUserReviewForRule(req.user._id, ruleId);
  if (existingReview) {
    throw errors.conflict("You have already reviewed this rule");
  }

  // Create review
  const review = new Review({
    rule: ruleId,
    user: req.user._id,
    rating,
    comment,
    verified: canReview,
  });

  await review.save();

  // Log activity
  await logReviewActivity(req.user._id, "RULE_REVIEWED", ruleId, {
    rating,
    reviewId: review._id,
  });

  // Update rule rating
  await updateRuleRating(ruleId);

  await review.populate("user", "username profile avatar");

  res.status(201).json({
    success: true,
    message: "Review created successfully",
    data: { review },
  });
});

/**
 * Update review
 */
exports.updateReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rating, comment } = req.body;

  const review = await Review.findById(id);
  if (!review) {
    throw errors.notFound("Review not found");
  }

  // Check ownership
  checkReviewOwnership(review, req.user);

  // Validate input if provided
  if (rating || comment) {
    const validation = validateReviewInput(
      rating || review.rating,
      comment || review.comment
    );
    if (!validation.valid) {
      throw errors.badRequest(validation.message);
    }
  }

  review.rating = rating || review.rating;
  review.comment = comment || review.comment;

  await review.save();

  // Update rule rating
  await updateRuleRating(review.rule);

  // Log activity
  await logReviewActivity(req.user._id, "REVIEW_UPDATED", review.rule, {
    reviewId: review._id,
  });

  await review.populate("user", "username profile avatar");

  res.json({
    success: true,
    message: "Review updated successfully",
    data: { review },
  });
});

/**
 * Delete review
 */
exports.deleteReview = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const review = await Review.findById(id);
  if (!review) {
    throw errors.notFound("Review not found");
  }

  // Check ownership or admin
  checkReviewOwnership(review, req.user);

  review.isActive = false;
  await review.save();

  // Update rule rating
  await updateRuleRating(review.rule);

  // Log activity
  await logReviewActivity(req.user._id, "REVIEW_DELETED", review.rule, {
    reviewId: review._id,
  });

  res.json({
    success: true,
    message: "Review deleted successfully",
  });
});

/**
 * Mark review as helpful
 */
exports.markHelpful = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { helpful } = req.body;

  const review = await Review.findById(id);
  if (!review) {
    throw errors.notFound("Review not found");
  }

  const result = await toggleReviewHelpful(review, req.user._id, helpful);

  res.json({
    success: true,
    message: helpful ? "Marked as helpful" : "Removed helpful mark",
    data: result,
  });
});

/**
 * Report review
 */
exports.reportReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    throw errors.badRequest("Report reason is required");
  }

  const review = await Review.findById(id);
  if (!review) {
    throw errors.notFound("Review not found");
  }

  review.reported = true;
  review.reportReason = reason;
  await review.save();

  res.json({
    success: true,
    message: "Review reported successfully",
  });
});

/**
 * Get user's reviews
 */
exports.getUserReviews = asyncHandler(async (req, res) => {
  const { username } = req.params;
  const { page = 1, limit = 10 } = req.query;

  const user = await User.findOne({ username });
  if (!user) {
    throw errors.notFound("User not found");
  }

  const skip = (page - 1) * limit;

  const reviews = await Review.find({ user: user._id, isActive: true })
    .populate("rule", "title slug stats")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  const total = await Review.countDocuments({
    user: user._id,
    isActive: true,
  });

  res.json({
    success: true,
    data: {
      reviews,
      pagination: getPagination(total, page, limit),
    },
  });
});
