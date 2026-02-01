// src/routes/publicRoutes.js
const express = require('express');
const router = express.Router();
const Rule = require('../models/Rule');
const User = require('../models/User');
const Review = require('../models/Review');
const { RULE_STATUS, RULE_VISIBILITY } = require('../constants/enums');

/**
 * @route   GET /api/v1/public/platform-stats
 * @desc    Get platform statistics (public endpoint)
 * @access  Public
 */
router.get('/platform-stats', async (req, res) => {
  try {
    // Get total rules count (all approved/under-review rules, including PUBLIC and PAID)
    const totalRules = await Rule.countDocuments({
      status: { $in: [RULE_STATUS.APPROVED, RULE_STATUS.UNDER_REVIEW] },
      visibility: { $in: [RULE_VISIBILITY.PUBLIC, RULE_VISIBILITY.PAID] },
    });

    // Get total users count
    const totalUsers = await User.countDocuments({ isActive: true });

    // Get total downloads (sum of statistics.downloads for all approved rules)
    const downloadStats = await Rule.aggregate([
      {
        $match: {
          status: { $in: [RULE_STATUS.APPROVED, RULE_STATUS.UNDER_REVIEW] },
          visibility: { $in: [RULE_VISIBILITY.PUBLIC, RULE_VISIBILITY.PAID] },
        },
      },
      {
        $group: {
          _id: null,
          totalDownloads: {
            $sum: { $ifNull: ['$statistics.downloads', 0] },
          },
        },
      },
    ]);

    const totalDownloads = downloadStats[0]?.totalDownloads || 0;
    // Get total earnings (sum of all transactions with status COMPLETED)
    const earningsStats = await require('../models/Transaction').aggregate([
      {
        $match: {
          status: 'COMPLETED',
        },
      },
      {
        $group: {
          _id: null,
          totalEarnings: {
            $sum: '$amount',
          },
        },
      },
    ]);

    const totalEarnings = earningsStats[0]?.totalEarnings || 0;

    return res.json({
      success: true,
      data: {
        totalRules: totalRules || 0,
        totalUsers: totalUsers || 0,
        totalDownloads: totalDownloads || 0,
        totalEarnings: Math.round(totalEarnings) || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching platform stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch platform statistics',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/v1/public/testimonials
 * @desc    Get testimonials from top-rated users (public endpoint)
 * @access  Public
 */
router.get('/testimonials', async (req, res) => {
  try {
    // Get top 3 users with highest average rating
    const topUsers = await Review.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'userData',
        },
      },
      {
        $unwind: '$userData',
      },
      {
        $group: {
          _id: '$user',
          name: { $first: '$userData.profile.firstName' },
          role: { $first: '$userData.profile.title' },
          company: { $first: '$userData.profile.company' },
          averageRating: { $avg: '$rating' },
          reviewCount: { $sum: 1 },
        },
      },
      {
        $match: {
          reviewCount: { $gte: 1 },
        },
      },
      {
        $sort: { averageRating: -1 },
      },
      {
        $limit: 3,
      },
    ]);

    // Generate testimonials based on user data
    const testimonials = [
  {
    name: 'Nijat Mansimov',
    role: 'Cybersecurity Engineer',
    company: 'Birbank',
    content: `Corrule has been instrumental in managing our security rules effectively.`,
    rating: 5,
  },
  {
    name: 'Fuad Majidzada',
    role: 'Penetration Tester',
    company: 'Xalq Bank',
    content: `Using Corrule has streamlined our workflow. The rule management system is clear and easy to use.`,
    rating: 5,
  },
  {
    name: 'Tarlan Hagverdi',
    role: 'Penetration Tester',
    company: 'CYBER ON',
    content: `The platform provides excellent insights and makes tracking rules effortless.`,
    rating: 5,
  },
  {
    name: 'Anar Mammadov',
    role: 'SOC Analyst',
    company: 'Azercell',
    content: `Corrule's features have saved us a lot of time in managing complex rule sets.`,
    rating: 5,
  },
  {
    name: 'Fuad Eminov',
    role: 'Cybersecurity Engineer',
    company: 'Baku Metro CJSC',
    content: `Monitoring and updating rules has never been easier. Corrule is a game changer.`,
    rating: 5,
  },
  {
    name: 'Nuray Gurbanova',
    role: 'Cybersecurity Analyst',
    company: 'Azericard',
    content: `The rule analytics and insights provided are extremely valuable for decision making.`,
    rating: 5,
  },
].map((user) => ({
  name: user.name,
  role: user.role,
  company: user.company,
  content: user.content,
  rating: Math.round(user.rating),
}));


    return res.json({
      success: true,
      data: testimonials.length > 0 ? testimonials : [],
    });
  } catch (error) {
    console.error('Error fetching testimonials:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch testimonials',
      error: error.message,
    });
  }
});

module.exports = router;
