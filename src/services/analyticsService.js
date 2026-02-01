// src/services/analyticsService.js
const User = require("../models/User");
const Rule = require("../models/Rule");
const Review = require("../models/Review");
const Transaction = require("../models/Transaction");
const Activity = require("../models/Activity");

/**
 * Build date filter for queries
 */
exports.buildDateFilter = (startDate, endDate) => {
  return {
    createdAt: {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    },
  };
};

/**
 * Get platform metrics for date range
 */
exports.getPlatformMetrics = async (dateFilter) => {
  const [newUsers, newRules, newReviews, newTransactions] = await Promise.all([
    User.countDocuments(dateFilter),
    Rule.countDocuments(dateFilter),
    Review.countDocuments(dateFilter),
    Transaction.countDocuments({ ...dateFilter, status: "COMPLETED" }),
  ]);

  return { newUsers, newRules, newReviews, newTransactions };
};

/**
 * Get revenue aggregation
 */
exports.getRevenueMetrics = async (dateFilter) => {
  const revenueData = await Transaction.aggregate([
    {
      $match: {
        status: "COMPLETED",
        ...dateFilter,
      },
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$amount" },
        platformFees: { $sum: "$platformFee" },
        sellerPayouts: { $sum: "$sellerEarnings" },
        avgTransaction: { $avg: "$amount" },
      },
    },
  ]);

  return revenueData[0] || {
    totalRevenue: 0,
    platformFees: 0,
    sellerPayouts: 0,
    avgTransaction: 0,
  };
};

/**
 * Get user growth trend
 */
exports.getUserGrowthTrend = async (dateFilter) => {
  return await User.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
};

/**
 * Get activity distribution
 */
exports.getActivityDistribution = async (dateFilter) => {
  return await Activity.aggregate([
    { $match: { createdAt: dateFilter.createdAt } },
    {
      $group: {
        _id: "$type",
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);
};

/**
 * Get user retention metrics
 */
exports.getUserRetention = async () => {
  return await User.aggregate([
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        activeUsers: {
          $sum: {
            $cond: [
              {
                $gte: [
                  "$lastLogin",
                  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);
};

/**
 * Get rule engagement metrics
 */
exports.getRuleEngagement = async () => {
  return await Rule.aggregate([
    {
      $group: {
        _id: null,
        avgDownloads: { $avg: "$statistics.downloads" },
        avgRating: { $avg: "$statistics.rating" },
        avgReviews: { $avg: "$statistics.totalRatings" },
        avgPurchases: { $avg: "$statistics.purchases" },
      },
    },
  ]);
};

/**
 * Get top user activities
 */
exports.getTopUserActivities = async (dateFilter) => {
  return await Activity.aggregate([
    { $match: { createdAt: dateFilter.createdAt } },
    {
      $group: {
        _id: "$user",
        activityCount: { $sum: 1 },
      },
    },
    { $sort: { activityCount: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
  ]);
};

/**
 * Get top rules by downloads
 */
exports.getTopRulesByDownloads = async () => {
  return await Rule.find()
    .select("title slug statistics author")
    .populate("author", "username")
    .sort({ "statistics.downloads": -1 })
    .limit(10)
    .lean();
};

/**
 * Get top rules by rating
 */
exports.getTopRulesByRating = async () => {
  return await Rule.find({ "statistics.totalRatings": { $gt: 0 } })
    .select("title slug statistics author")
    .populate("author", "username")
    .sort({ "statistics.rating": -1 })
    .limit(10)
    .lean();
};

/**
 * Get rules by status distribution
 */
exports.getRulesByStatus = async () => {
  return await Rule.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);
};

/**
 * Get new rules trend
 */
exports.getNewRulesTrend = async (dateFilter) => {
  return await Rule.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
};

/**
 * Get pricing distribution
 */
exports.getPricingDistribution = async () => {
  return await Rule.aggregate([
    {
      $group: {
        _id: "$pricing.type",
        count: { $sum: 1 },
        avgPrice: {
          $avg: {
            $cond: [{ $eq: ["$pricing.type", "PAID"] }, "$pricing.amount", 0],
          },
        },
      },
    },
  ]);
};

/**
 * Get revenue trend
 */
exports.getRevenueTrend = async (dateFilter) => {
  return await Transaction.aggregate([
    {
      $match: {
        ...dateFilter,
        status: "COMPLETED",
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        revenue: { $sum: "$amount" },
        platformFees: { $sum: "$platformFee" },
        sellerPayouts: { $sum: "$sellerEarnings" },
        transactions: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
};

/**
 * Get payment method distribution
 */
exports.getPaymentMethodDistribution = async (dateFilter) => {
  return await Transaction.aggregate([
    {
      $match: {
        ...dateFilter,
        status: "COMPLETED",
      },
    },
    {
      $group: {
        _id: "$paymentMethod",
        count: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
      },
    },
  ]);
};

/**
 * Get refund statistics
 */
exports.getRefundStats = async (dateFilter) => {
  return await Transaction.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: {
          $sum: { $cond: [{ $eq: ["$status", "REFUNDED"] }, "$amount", 0] },
        },
      },
    },
  ]);
};

/**
 * Get top sellers
 */
exports.getTopSellers = async (dateFilter) => {
  return await Transaction.aggregate([
    {
      $match: {
        ...dateFilter,
        status: "COMPLETED",
      },
    },
    {
      $group: {
        _id: "$seller",
        totalEarnings: { $sum: "$sellerEarnings" },
        transactionCount: { $sum: 1 },
      },
    },
    { $sort: { totalEarnings: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
  ]);
};

/**
 * Get rating distribution
 */
exports.getRatingDistribution = async (dateFilter) => {
  return await Review.aggregate([
    {
      $match: {
        ...dateFilter,
        isActive: true,
      },
    },
    {
      $group: {
        _id: "$rating",
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
};

/**
 * Get review trend
 */
exports.getReviewTrend = async (dateFilter) => {
  return await Review.aggregate([
    {
      $match: {
        ...dateFilter,
        isActive: true,
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
};

/**
 * Get review statistics
 */
exports.getReviewStats = async (dateFilter) => {
  return await Review.aggregate([
    {
      $match: {
        ...dateFilter,
        isActive: true,
      },
    },
    {
      $group: {
        _id: null,
        totalReviews: { $sum: 1 },
        avgRating: { $avg: "$rating" },
        verifiedReviews: {
          $sum: { $cond: ["$verified", 1, 0] },
        },
        reportedReviews: {
          $sum: { $cond: ["$reported", 1, 0] },
        },
      },
    },
  ]);
};

/**
 * Get most helpful reviews
 */
exports.getMostHelpfulReviews = async (dateFilter) => {
  return await Review.find({
    ...dateFilter,
    isActive: true,
  })
    .select("comment rating helpful rule user")
    .populate("user", "username")
    .populate("rule", "title")
    .sort({ "helpful.count": -1 })
    .limit(10)
    .lean();
};

/**
 * Generate user activity report
 */
exports.generateUserActivityReport = async (dateFilter, filters) => {
  return await Activity.aggregate([
    {
      $match: {
        ...dateFilter,
        ...(filters.userId && { user: filters.userId }),
      },
    },
    {
      $group: {
        _id: "$type",
        count: { $sum: 1 },
      },
    },
  ]);
};

/**
 * Generate rule performance report
 */
exports.generateRulePerformanceReport = async (dateFilter, filters) => {
  return await Rule.aggregate([
    {
      $match: {
        ...dateFilter,
        ...(filters.creator && { creator: filters.creator }),
      },
    },
    {
      $project: {
        title: 1,
        downloads: "$statistics.downloads",
        purchases: "$statistics.purchases",
        rating: "$statistics.rating",
        reviews: "$statistics.totalRatings",
        revenue: "$statistics.revenue",
      },
    },
    { $sort: { revenue: -1 } },
  ]);
};

/**
 * Generate revenue breakdown report
 */
exports.generateRevenueBreakdownReport = async (dateFilter, filters) => {
  return await Transaction.aggregate([
    {
      $match: {
        ...dateFilter,
        status: "COMPLETED",
        ...(filters.paymentMethod && { paymentMethod: filters.paymentMethod }),
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          method: "$paymentMethod",
        },
        revenue: { $sum: "$amount" },
        platformFees: { $sum: "$platformFee" },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.date": 1 } },
  ]);
};

/**
 * Generate user growth report
 */
exports.generateUserGrowthReport = async (dateFilter, filters) => {
  return await User.aggregate([
    {
      $match: {
        ...dateFilter,
        ...(filters.role && { role: filters.role }),
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        newUsers: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
};
