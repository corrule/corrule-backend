// src/routes/reviewRoutes.js
const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const reviewController = require("../controllers/reviewController");
const { authenticate, optionalAuth } = require("../middleware/auth");

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

/**
 * @route   GET /api/v1/reviews/rule/:ruleId
 * @desc    Get all reviews for a rule
 * @access  Public
 */
router.get("/rule/:ruleId", optionalAuth, reviewController.getReviewsByRule);

/**
 * @route   GET /api/v1/reviews/:id
 * @desc    Get single review
 * @access  Public
 */
router.get("/:id", reviewController.getReview);

/**
 * @route   GET /api/v1/reviews/user/:username
 * @desc    Get user's reviews
 * @access  Public
 */
router.get("/user/:username", reviewController.getUserReviews);

/**
 * @route   POST /api/v1/reviews
 * @desc    Create a review for a rule
 * @access  Private
 */
router.post(
  "/",
  authenticate,
  [
    body("ruleId").isMongoId().withMessage("Valid rule ID is required"),
    body("rating")
      .isInt({ min: 1, max: 5 })
      .withMessage("Rating must be between 1 and 5"),
    body("comment").optional().trim().isLength({ max: 1000 }),
  ],
  validate,
  reviewController.createReview,
);

/**
 * @route   PUT /api/v1/reviews/:id
 * @desc    Update own review
 * @access  Private
 */
router.put(
  "/:id",
  authenticate,
  [
    body("rating")
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage("Rating must be between 1 and 5"),
    body("comment").optional().trim().isLength({ max: 1000 }),
  ],
  validate,
  reviewController.updateReview,
);

/**
 * @route   DELETE /api/v1/reviews/:id
 * @desc    Delete own review
 * @access  Private
 */
router.delete("/:id", authenticate, reviewController.deleteReview);

/**
 * @route   POST /api/v1/reviews/:id/helpful
 * @desc    Mark review as helpful
 * @access  Private
 */
router.post(
  "/:id/helpful",
  authenticate,
  [body("helpful").isBoolean().withMessage("helpful must be boolean")],
  validate,
  reviewController.markHelpful,
);

/**
 * @route   POST /api/v1/reviews/:id/report
 * @desc    Report review
 * @access  Private
 */
router.post(
  "/:id/report",
  authenticate,
  [body("reason").trim().notEmpty().withMessage("Report reason is required")],
  validate,
  reviewController.reportReview,
);

module.exports = router;
