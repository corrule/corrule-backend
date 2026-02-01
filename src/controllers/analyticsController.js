// src/controllers/analyticsController.js
const User = require("../models/User");
const Rule = require("../models/Rule");
const Review = require("../models/Review");
const Transaction = require("../models/Transaction");
const { asyncHandler, errors } = require("../middleware/errorHandler");
const analyticsService = require("../services/analyticsService");

/**
 * Get platform analytics overview
 */
exports.getPlatformAnalytics = asyncHandler(async (req, res) => {
  const { startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), endDate = new Date() } = req.query;

  const dateFilter = analyticsService.buildDateFilter(startDate, endDate);

  const [metrics, revenue, userGrowth] = await Promise.all([
    analyticsService.getPlatformMetrics(dateFilter),
    analyticsService.getRevenueMetrics(dateFilter),
    analyticsService.getUserGrowthTrend(dateFilter),
  ]);

  res.json({
    success: true,
    data: {
      period: { startDate, endDate },
      metrics,
      revenue,
      userGrowth,
    },
  });
});

/**
 * Get user behavior analytics
 */
exports.getUserBehaviorAnalytics = asyncHandler(async (req, res) => {
  const { startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), endDate = new Date() } = req.query;

  const dateFilter = analyticsService.buildDateFilter(startDate, endDate);

  const [activityDistribution, userRetention, ruleEngagement, topUserActivities] = await Promise.all([
    analyticsService.getActivityDistribution(dateFilter),
    analyticsService.getUserRetention(),
    analyticsService.getRuleEngagement(),
    analyticsService.getTopUserActivities(dateFilter),
  ]);

  res.json({
    success: true,
    data: {
      period: { startDate, endDate },
      activityDistribution,
      userRetention: userRetention[0] || { totalUsers: 0, activeUsers: 0 },
      ruleEngagement: ruleEngagement[0] || {
        avgDownloads: 0,
        avgRating: 0,
        avgReviews: 0,
        avgPurchases: 0,
      },
      topUserActivities,
    },
  });
});

/**
 * Get rule analytics
 */
exports.getRuleAnalytics = asyncHandler(async (req, res) => {
  const { startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), endDate = new Date() } = req.query;

  const dateFilter = analyticsService.buildDateFilter(startDate, endDate);

  const [topRulesByDownloads, topRulesByRating, rulesByStatus, newRulesTrend, pricingDistribution] = await Promise.all([
    analyticsService.getTopRulesByDownloads(),
    analyticsService.getTopRulesByRating(),
    analyticsService.getRulesByStatus(),
    analyticsService.getNewRulesTrend(dateFilter),
    analyticsService.getPricingDistribution(),
  ]);

  res.json({
    success: true,
    data: {
      period: { startDate, endDate },
      topRulesByDownloads,
      topRulesByRating,
      rulesByStatus,
      newRulesTrend,
      pricingDistribution,
    },
  });
});

/**
 * Get transaction and revenue analytics
 */
exports.getRevenueAnalytics = asyncHandler(async (req, res) => {
  const { startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), endDate = new Date() } = req.query;

  const dateFilter = analyticsService.buildDateFilter(startDate, endDate);

  const [revenueTrend, paymentMethodDistribution, refundStats, topSellers] = await Promise.all([
    analyticsService.getRevenueTrend(dateFilter),
    analyticsService.getPaymentMethodDistribution(dateFilter),
    analyticsService.getRefundStats(dateFilter),
    analyticsService.getTopSellers(dateFilter),
  ]);

  res.json({
    success: true,
    data: {
      period: { startDate, endDate },
      revenueTrend,
      paymentMethodDistribution,
      refundStats,
      topSellers,
    },
  });
});

/**
 * Get review analytics
 */
exports.getReviewAnalytics = asyncHandler(async (req, res) => {
  const { startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), endDate = new Date() } = req.query;

  const dateFilter = analyticsService.buildDateFilter(startDate, endDate);

  const [ratingDistribution, reviewTrend, reviewStats, mostHelpfulReviews] = await Promise.all([
    analyticsService.getRatingDistribution(dateFilter),
    analyticsService.getReviewTrend(dateFilter),
    analyticsService.getReviewStats(dateFilter),
    analyticsService.getMostHelpfulReviews(dateFilter),
  ]);

  res.json({
    success: true,
    data: {
      period: { startDate, endDate },
      ratingDistribution,
      reviewTrend,
      reviewStats: reviewStats[0] || {
        totalReviews: 0,
        avgRating: 0,
        verifiedReviews: 0,
        reportedReviews: 0,
      },
      mostHelpfulReviews,
    },
  });
});

/**
 * Generate custom report
 */
exports.generateCustomReport = asyncHandler(async (req, res) => {
  const { reportType, startDate, endDate, filters = {} } = req.body;

  if (!reportType) {
    throw errors.badRequest("reportType is required");
  }

  const dateFilter = analyticsService.buildDateFilter(startDate, endDate);

  let report;

  switch (reportType) {
    case "user_activity":
      report = await analyticsService.generateUserActivityReport(dateFilter, filters);
      break;
    case "rule_performance":
      report = await analyticsService.generateRulePerformanceReport(dateFilter, filters);
      break;
    case "revenue_breakdown":
      report = await analyticsService.generateRevenueBreakdownReport(dateFilter, filters);
      break;
    case "user_growth":
      report = await analyticsService.generateUserGrowthReport(dateFilter, filters);
      break;
    default:
      throw errors.badRequest("Invalid reportType");
  }

  res.json({
    success: true,
    data: {
      reportType,
      period: { startDate, endDate },
      generatedAt: new Date(),
      report,
    },
  });
});

/**
 * Export report to CSV
 */
exports.exportReport = asyncHandler(async (req, res) => {
  const { reportType, startDate, endDate } = req.query;

  if (!reportType) {
    throw errors.badRequest("reportType is required");
  }

  const dateFilter = {
    createdAt: {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    },
  };

  let data;
  let filename;

  switch (reportType) {
    case "transactions":
      data = await Transaction.find(dateFilter)
        .select("buyer seller rule amount status createdAt")
        .populate("buyer", "username email")
        .populate("seller", "username email")
        .populate("rule", "title")
        .lean();
      filename = `transactions_${startDate}_${endDate}.csv`;
      break;
    case "users":
      data = await User.find(dateFilter)
        .select("username email role createdAt statistics")
        .lean();
      filename = `users_${startDate}_${endDate}.csv`;
      break;
    case "rules":
      data = await Rule.find(dateFilter)
        .select("title status stats creator createdAt")
        .populate("creator", "username")
        .lean();
      filename = `rules_${startDate}_${endDate}.csv`;
      break;
    default:
      throw errors.badRequest("Invalid reportType");
  }

  // Convert to CSV
  const csv = convertToCSV(data);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

function convertToCSV(data) {
  if (!data || data.length === 0) return "";

  const keys = Object.keys(data[0]);
  const csv = [
    keys.join(","),
    ...data.map((row) =>
      keys
        .map((key) => {
          const value = row[key];
          if (typeof value === "object") {
            return JSON.stringify(value);
          }
          return String(value).includes(",") ? `"${value}"` : value;
        })
        .join(",")
    ),
  ];

  return csv.join("\n");
}

/**
 * Get user's downloads and views analytics by time period
 */
exports.getUserDownloadsViewsAnalytics = asyncHandler(async (req, res) => {
  const { period = 'monthly' } = req.query;
  const Activity = require("../models/Activity");

  // Get user's rules
  const userRules = await Rule.find({
    author: req.user._id,
  }).select('_id');

  if (userRules.length === 0) {
    return res.json({
      success: true,
      data: {
        analytics: [],
      },
    });
  }

  const ruleIds = userRules.map(rule => rule._id);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Query Activity records for downloads and views
  const activities = await Activity.find({
    target: { $in: ruleIds },
    type: { $in: ['RULE_DOWNLOADED', 'RULE_VIEWED'] },
  }).select('type createdAt');

  let analytics = [];

  if (period === 'daily') {
    // Last 30 days with daily breakdown
    const dailyStats = {};
    
    // Initialize all dates with 0 counts
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      dailyStats[dateKey] = { downloads: 0, views: 0 };
    }

    // Count activities by date and type
    activities.forEach((activity) => {
      const activityDate = new Date(activity.createdAt);
      activityDate.setHours(0, 0, 0, 0);
      const dateKey = activityDate.toISOString().split('T')[0];
      
      if (dailyStats[dateKey]) {
        if (activity.type === 'RULE_DOWNLOADED') {
          dailyStats[dateKey].downloads += 1;
        } else if (activity.type === 'RULE_VIEWED') {
          dailyStats[dateKey].views += 1;
        }
      }
    });

    analytics = Object.entries(dailyStats).map(([date, stats]) => {
      const d = new Date(date);
      return {
        name: d.toLocaleString('default', { month: 'short', day: 'numeric' }),
        downloads: stats.downloads,
        views: stats.views,
      };
    });

  } else if (period === 'weekly') {
    // Last 12 weeks with weekly breakdown
    const weeklyStats = {};
    
    for (let i = 11; i >= 0; i--) {
      weeklyStats[i] = { downloads: 0, views: 0 };
    }

    activities.forEach((activity) => {
      const activityDate = new Date(activity.createdAt);
      const daysDiff = Math.floor((today.getTime() - activityDate.getTime()) / (1000 * 60 * 60 * 24));
      const weekIndex = Math.floor(daysDiff / 7);
      
      if (weekIndex >= 0 && weekIndex < 12) {
        const adjustedIndex = 11 - weekIndex;
        if (activity.type === 'RULE_DOWNLOADED') {
          weeklyStats[adjustedIndex].downloads += 1;
        } else if (activity.type === 'RULE_VIEWED') {
          weeklyStats[adjustedIndex].views += 1;
        }
      }
    });

    analytics = Object.entries(weeklyStats).map(([week, stats]) => ({
      name: `W${parseInt(week) + 1}`,
      downloads: stats.downloads,
      views: stats.views,
    }));

  } else {
    // monthly (default)
    const monthlyStats = {};
    
    for (let i = 5; i >= 0; i--) {
      monthlyStats[i] = { downloads: 0, views: 0 };
    }

    activities.forEach((activity) => {
      const activityDate = new Date(activity.createdAt);
      const monthsDiff = 
        (today.getFullYear() - activityDate.getFullYear()) * 12 +
        (today.getMonth() - activityDate.getMonth());
      
      if (monthsDiff >= 0 && monthsDiff < 6) {
        const adjustedIndex = 5 - monthsDiff;
        if (activity.type === 'RULE_DOWNLOADED') {
          monthlyStats[adjustedIndex].downloads += 1;
        } else if (activity.type === 'RULE_VIEWED') {
          monthlyStats[adjustedIndex].views += 1;
        }
      }
    });

    analytics = Object.entries(monthlyStats).map(([month, stats]) => {
      const d = new Date(today);
      d.setMonth(d.getMonth() - (5 - parseInt(month)));
      return {
        name: d.toLocaleString('default', { month: 'short' }),
        downloads: stats.downloads,
        views: stats.views,
      };
    });
  }

  res.json({
    success: true,
    data: {
      analytics,
    },
  });
});

/**
 * Get all reviews for user's rules
 */
exports.getUserRuleReviews = asyncHandler(async (req, res) => {
  // Get user's PUBLIC rules only (for consistency with public profile)
  const userRules = await Rule.find({
    author: req.user._id,
    visibility: 'PUBLIC',
  }).select('_id');

  if (userRules.length === 0) {
    return res.json({
      success: true,
      data: {
        reviews: [],
      },
    });
  }

  const ruleIds = userRules.map(rule => rule._id);

  // Get all reviews for these PUBLIC rules
  const reviews = await Review.find({
    rule: { $in: ruleIds },
    isActive: true,
  })
    .select('rating comment user rule createdAt helpful')
    .populate('user', 'username avatar profile')
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    data: {
      reviews,
    },
  });
});
