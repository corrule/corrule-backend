// src/controllers/userController.js
const mongoose = require("mongoose");
const User = require("../models/User");
const Rule = require("../models/Rule");
const Review = require("../models/Review");
const Activity = require("../models/Activity");
const Transaction = require("../models/Transaction");
const Notification = require("../models/Notification");
const { asyncHandler, errors } = require("../middleware/errorHandler");
const { sendPasswordResetEmail } = require("../utils/email");
const { getPagination } = require("../utils/pagination");
const { RULE_STATUS, RULE_VISIBILITY } = require("../constants/enums");
const {
  enrichUserProfile,
  enrichUserWithStats,
  enrichUsersWithStats,
} = require("../services/userProfileService");
const crypto = require("crypto");

/**
 * Get current user profile
 */
exports.getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "-password -refreshTokens -emailVerificationToken -passwordResetToken",
  );

  if (!user) {
    throw errors.notFound("User not found");
  }

  // Calculate statistics from user's approved rules
  const approvedRules = await Rule.find({
    author: req.user._id,
    status: "APPROVED",
  }).select("_id statistics");

  // Calculate total downloads from all approved rules
  let totalDownloads = 0;
  const ruleIds = approvedRules.map((rule) => rule._id);

  approvedRules.forEach((rule) => {
    totalDownloads += rule.statistics?.downloads || 0;
  });

  // Calculate average rating from all reviews of approved rules
  let averageRating = 0;
  if (ruleIds.length > 0) {
    const reviews = await Review.find({
      rule: { $in: ruleIds },
      isActive: true,
    }).select("rating");

    if (reviews.length > 0) {
      const totalRating = reviews.reduce((sum, review) => sum + (review.rating || 0), 0);
      averageRating = parseFloat((totalRating / reviews.length).toFixed(1));
    }
  }

  // Update user statistics
  user.statistics = {
    totalRules: approvedRules.length,
    totalDownloads: totalDownloads,
    totalEarnings: user.statistics?.totalEarnings || 0,
    rating: averageRating,
  };

  res.json({
    success: true,
    data: { user },
  });
});

/**
 * Update user profile
 */
exports.updateProfile = asyncHandler(async (req, res) => {
  const { profile } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) {
    throw errors.notFound("User not found");
  }

  if (profile) {
    Object.assign(user.profile, profile);
  }

  await user.save();

  res.json({
    success: true,
    message: "Profile updated successfully",
    data: { user },
  });
});

/**
 * Get public user profile
 */
exports.getUserProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;

  const user = await User.findOne({ username }).select(
    "username email profile statistics createdAt role workExperience socialMediaAccounts",
  );

  if (!user) {
    throw errors.notFound("User not found");
  }

  // Enrich user with public statistics
  const enrichedUser = await enrichUserProfile(user);

  res.json({
    success: true,
    data: { user: enrichedUser },
  });
});

/**
 * Get user by ID
 */
exports.getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id).select(
    "username email profile statistics createdAt role workExperience socialMediaAccounts",
  );

  if (!user) {
    throw errors.notFound("User not found");
  }

  // Enrich user with public statistics
  const enrichedUser = await enrichUserProfile(user);

  res.json({
    success: true,
    data: { user: enrichedUser },
  });
});

/**
 * Update password
 */
exports.updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw errors.badRequest(
      "Current password and new password are required",
    );
  }

  const user = await User.findById(req.user._id).select("+password");

  // Verify current password
  const isPasswordValid = await user.comparePassword(currentPassword);
  if (!isPasswordValid) {
    throw errors.unauthorized("Current password is incorrect");
  }

  // Update password
  user.password = newPassword;
  await user.save();

  res.json({
    success: true,
    message: "Password updated successfully",
  });
});

/**
 * Request password reset
 */
exports.requestPasswordReset = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    // Don't reveal if email exists
    return res.json({
      success: true,
      message: "If email exists, password reset link has been sent",
    });
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString("hex");
  user.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await user.save();

  // Send email
  await sendPasswordResetEmail(user.email, resetToken).catch((err) => {
    console.error("Failed to send password reset email:", err.message);
  });

  res.json({
    success: true,
    message: "If email exists, password reset link has been sent",
  });
});

/**
 * Reset password with token
 */
exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    throw errors.badRequest("Token and new password are required");
  }

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw errors.badRequest("Invalid or expired reset token");
  }

  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;

  await user.save();

  res.json({
    success: true,
    message: "Password reset successfully",
  });
});

/**
 * Get user's created rules
 */
exports.getUserRules = asyncHandler(async (req, res) => {
  const { username } = req.params;
  const { page = 1, limit = 10, status = "APPROVED" } = req.query;

  const user = await User.findOne({ username });
  if (!user) {
    throw errors.notFound("User not found");
  }

  const skip = (page - 1) * limit;
  let query = { author: user._id };

  // For public access, only show APPROVED rules
  if (!req.user || req.user._id.toString() !== user._id.toString()) {
    query.status = RULE_STATUS.APPROVED;
  } else {
    // For own user, show requested status or all
    if (status && status !== "ALL") {
      query.status = status;
    }
  }

  const rules = await Rule.find(query)
    .select("title description category severity status visibility pricing statistics forkedFrom mergedAt author createdAt updatedAt mitreAttack tags")
    .populate("author", "username profile statistics.rating")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  // Enrich rules with real-time ratings and downloads
  const Purchase = require("../models/Purchase");
  const enrichedRules = await Promise.all(
    rules.map(async (rule) => {
      // Calculate ratings from reviews
      const reviews = await Review.find({ 
        rule: rule._id,
        isActive: true 
      }).select('rating');
      
      if (reviews.length > 0) {
        const totalRating = reviews.reduce((sum, review) => sum + (review.rating || 0), 0);
        const avgRating = parseFloat((totalRating / reviews.length).toFixed(1));
        rule.statistics.rating = avgRating;
        rule.statistics.totalRatings = reviews.length;
      } else {
        rule.statistics.rating = 0;
        rule.statistics.totalRatings = 0;
      }

      // Calculate downloads from Purchase records
      const downloadCount = await Purchase.countDocuments({ rule: rule._id });
      rule.statistics.downloads = downloadCount;

      return rule;
    })
  );

  const total = await Rule.countDocuments(query);

  res.json({
    success: true,
    data: {
      rules: enrichedRules,
      pagination: getPagination(total, page, limit),
    },
  });
});

/**
 * Get user's activities
 */
exports.getUserActivity = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const activities = await Activity.find({ user: req.user._id })
    .populate("target")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  const total = await Activity.countDocuments({ user: req.user._id });

  res.json({
    success: true,
    data: {
      activities,
      pagination: getPagination(total, page, limit),
    },
  });
});

/**
 * Get user's notifications
 */
exports.getNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, unread = null } = req.query;
  const skip = (page - 1) * limit;

  let query = { recipient: req.user._id };
  if (unread === "true") {
    query.isRead = false;
  }

  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  const total = await Notification.countDocuments(query);
  const unreadCount = await Notification.countDocuments({
    recipient: req.user._id,
    isRead: false,
  });

  res.json({
    success: true,
    data: {
      notifications,
      unreadCount,
      pagination: getPagination(total, page, limit),
    },
  });
});

/**
 * Mark notification as read
 */
exports.markNotificationAsRead = asyncHandler(async (req, res) => {
  const { notificationId } = req.params;

  const notification = await Notification.findOne({
    _id: notificationId,
    recipient: req.user._id,
  });

  if (!notification) {
    throw errors.notFound("Notification not found");
  }

  notification.isRead = true;
  notification.readAt = new Date();
  await notification.save();

  res.json({
    success: true,
    message: "Notification marked as read",
  });
});

/**
 * Mark all notifications as read
 */
exports.markAllNotificationsAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { recipient: req.user._id, isRead: false },
    { isRead: true, readAt: new Date() },
  );

  res.json({
    success: true,
    message: "All notifications marked as read",
  });
});

/**
 * Delete notification
 */
exports.deleteNotification = asyncHandler(async (req, res) => {
  const { notificationId } = req.params;

  const result = await Notification.deleteOne({
    _id: notificationId,
    recipient: req.user._id,
  });

  if (result.deletedCount === 0) {
    throw errors.notFound("Notification not found");
  }

  res.json({
    success: true,
    message: "Notification deleted",
  });
});

/**
 * Get earnings (for sellers)
 */
exports.getEarnings = asyncHandler(async (req, res) => {
  const { period = "month" } = req.query;

  let dateFilter;
  const now = new Date();

  if (period === "week") {
    dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === "month") {
    dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else if (period === "year") {
    dateFilter = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  } else {
    dateFilter = new Date(0);
  }

  const transactions = await Transaction.find({
    seller: req.user._id,
    status: "COMPLETED",
    createdAt: { $gte: dateFilter },
  }).lean();

  const totalEarnings = transactions.reduce(
    (sum, t) => sum + (t.sellerEarnings || 0),
    0,
  );
  const totalTransactions = transactions.length;

  const earningsByDay = {};
  transactions.forEach((t) => {
    const day = t.createdAt.toISOString().split("T")[0];
    earningsByDay[day] = (earningsByDay[day] || 0) + (t.sellerEarnings || 0);
  });

  res.json({
    success: true,
    data: {
      totalEarnings,
      totalTransactions,
      period,
      earningsByDay,
      transactions: transactions.slice(0, 10),
    },
  });
});

/**
 * Search users
 */
exports.searchUsers = asyncHandler(async (req, res) => {
  const { query = "", limit = 10 } = req.query;

  if (query.length < 2) {
    return res.json({
      success: true,
      data: { users: [] },
    });
  }

  const users = await User.find({
    $or: [
      { username: { $regex: query, $options: "i" } },
      { "profile.firstName": { $regex: query, $options: "i" } },
      { "profile.lastName": { $regex: query, $options: "i" } },
    ],
  })
    .select("username profile avatar _id")
    .limit(parseInt(limit))
    .lean();

  // Enhance each user with actual published rules count and average rating
  const usersWithStats = await enrichUsersWithStats(users);

  res.json({
    success: true,
    data: { users: usersWithStats },
  });
});

/**
 * Get user statistics
 */
exports.getUserStats = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    throw errors.notFound("User not found");
  }

  // Count rules created
  const rulesCreated = await Rule.countDocuments({
    author: req.user._id,
  });

  // Count reviews written
  const reviewsWritten = await Review.countDocuments({
    author: req.user._id,
  });

  // Get total earnings
  const earnings = await Transaction.aggregate([
    {
      $match: {
        seller: req.user._id,
        status: "COMPLETED",
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$sellerEarnings" },
        count: { $sum: 1 },
      },
    },
  ]);

  res.json({
    success: true,
    data: {
      rulesCreated,
      reviewsWritten,
      totalEarnings: earnings[0]?.total || 0,
      totalTransactions: earnings[0]?.count || 0,
    },
  });
});

/**
 * Get current user's rules
 */
exports.getUserOwnRules = asyncHandler(async (req, res) => {
  const rules = await Rule.find({
    author: req.user._id,
  })
    .select("title description category severity status downloads rating statistics createdAt mitreAttack author")
    .populate("author", "username email profile")
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    data: { rules },
  });
});

/**
 * Add work experience
 */
exports.addWorkExperience = asyncHandler(async (req, res) => {
  const { company, job, startDate, endDate, isCurrent } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) {
    throw errors.notFound("User not found");
  }

  // Ensure workExperience array exists
  if (!user.workExperience) {
    user.workExperience = [];
  }

  // Add new work experience
  const newExperience = {
    _id: new (require("mongoose")).Types.ObjectId(),
    company,
    job,
    startDate: new Date(startDate),
    endDate: endDate ? new Date(endDate) : null,
    isCurrent: isCurrent || false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  user.workExperience.push(newExperience);
  await user.save();

  res.status(201).json({
    success: true,
    message: "Work experience added successfully",
    data: { workExperience: user.workExperience },
  });
});

/**
 * Update work experience
 */
exports.updateWorkExperience = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { company, job, startDate, endDate, isCurrent } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) {
    throw errors.notFound("User not found");
  }

  if (!user.workExperience) {
    user.workExperience = [];
  }

  // Find and update the work experience
  const experienceIndex = user.workExperience.findIndex(
    exp => exp._id.toString() === id
  );

  if (experienceIndex === -1) {
    throw errors.notFound("Work experience not found");
  }

  const experience = user.workExperience[experienceIndex];

  // Update fields
  if (company) experience.company = company;
  if (job) experience.job = job;
  if (startDate) experience.startDate = new Date(startDate);
  if (typeof isCurrent === "boolean") experience.isCurrent = isCurrent;
  if (endDate) {
    experience.endDate = new Date(endDate);
  } else if (isCurrent) {
    experience.endDate = null;
  }

  experience.updatedAt = new Date();

  await user.save();

  res.json({
    success: true,
    message: "Work experience updated successfully",
    data: { workExperience: user.workExperience },
  });
});

/**
 * Delete work experience
 */
exports.deleteWorkExperience = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(req.user._id);
  if (!user) {
    throw errors.notFound("User not found");
  }

  if (!user.workExperience) {
    user.workExperience = [];
  }

  // Find and remove the work experience
  const experienceIndex = user.workExperience.findIndex(
    exp => exp._id.toString() === id
  );

  if (experienceIndex === -1) {
    throw errors.notFound("Work experience not found");
  }

  user.workExperience.splice(experienceIndex, 1);
  await user.save();

  res.json({
    success: true,
    message: "Work experience deleted successfully",
    data: { workExperience: user.workExperience },
  });
});

// Social Media endpoints

exports.addSocialMedia = asyncHandler(async (req, res) => {
  const { platform, url } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) {
    throw errors.notFound("User not found");
  }

  if (!user.socialMediaAccounts) {
    user.socialMediaAccounts = [];
  }

  // Check if account for this platform already exists
  const existingIndex = user.socialMediaAccounts.findIndex(
    acc => acc.platform.toLowerCase() === platform.toLowerCase()
  );

  if (existingIndex !== -1) {
    throw errors.badRequest("An account for this platform already exists");
  }

  // Add new social media account
  user.socialMediaAccounts.push({
    _id: new mongoose.Types.ObjectId(),
    platform,
    url,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await user.save();

  res.status(201).json({
    success: true,
    message: "Social media account added successfully",
    data: { socialMediaAccounts: user.socialMediaAccounts },
  });
});

exports.updateSocialMedia = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { platform, url } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) {
    throw errors.notFound("User not found");
  }

  if (!user.socialMediaAccounts) {
    user.socialMediaAccounts = [];
  }

  // Find the social media account
  const accountIndex = user.socialMediaAccounts.findIndex(
    acc => acc._id.toString() === id
  );

  if (accountIndex === -1) {
    throw errors.notFound("Social media account not found");
  }

  // Check if another account with the same platform exists (if platform is being changed)
  if (platform && platform.toLowerCase() !== user.socialMediaAccounts[accountIndex].platform.toLowerCase()) {
    const existingIndex = user.socialMediaAccounts.findIndex(
      acc => acc.platform.toLowerCase() === platform.toLowerCase() && acc._id.toString() !== id
    );
    if (existingIndex !== -1) {
      throw errors.badRequest("An account for this platform already exists");
    }
  }

  // Update the account
  if (platform) {
    user.socialMediaAccounts[accountIndex].platform = platform;
  }
  if (url) {
    user.socialMediaAccounts[accountIndex].url = url;
  }
  user.socialMediaAccounts[accountIndex].updatedAt = new Date();

  await user.save();

  res.json({
    success: true,
    message: "Social media account updated successfully",
    data: { socialMediaAccounts: user.socialMediaAccounts },
  });
});

exports.deleteSocialMedia = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(req.user._id);
  if (!user) {
    throw errors.notFound("User not found");
  }

  if (!user.socialMediaAccounts) {
    user.socialMediaAccounts = [];
  }

  // Find and remove the social media account
  const accountIndex = user.socialMediaAccounts.findIndex(
    acc => acc._id.toString() === id
  );

  if (accountIndex === -1) {
    throw errors.notFound("Social media account not found");
  }

  user.socialMediaAccounts.splice(accountIndex, 1);
  await user.save();

  res.json({
    success: true,
    message: "Social media account deleted successfully",
    data: { socialMediaAccounts: user.socialMediaAccounts },
  });
});

/**
 * Enable Two-Factor Authentication (Email-based)
 * @route POST /api/v1/users/2fa/enable
 * @access Private
 * @description Send verification code to user's email to enable 2FA
 */
exports.enable2FA = asyncHandler(async (req, res) => {
  const { send2FAEmail } = require("../utils/email");
  const {
    generateAndStoreCode,
    canResendCode,
  } = require("../services/twoFactorService");

  const user = await User.findById(req.user._id);

  if (!user) {
    throw errors.notFound("User not found");
  }

  // Check if 2FA is already enabled
  if (user.twoFactorEmail && user.twoFactorEmail.enabled) {
    throw errors.conflict("2FA is already enabled for this account");
  }

  // Check resend cooldown
  const { canResend, secondsRemaining } = canResendCode(
    user.twoFactorEmail?.lastCodeSentAt
  );

  if (!canResend) {
    throw errors.tooManyRequests(
      `Please wait ${secondsRemaining} seconds before requesting a new code`
    );
  }

  // Initialize 2FA object if it doesn't exist
  if (!user.twoFactorEmail) {
    user.twoFactorEmail = {
      enabled: false,
      setupVerified: false,
      failedAttempts: 0,
    };
  }

  // Generate and store verification code
  const code = generateAndStoreCode(user);

  try {
    await send2FAEmail(user.email, code);
  } catch (error) {
    console.error("Failed to send 2FA code:", error);
    throw errors.internal("Failed to send verification code. Please try again.");
  }

  await user.save();

  res.json({
    success: true,
    message: "Verification code sent to your email",
    data: {
      email: user.email,
      expiresIn: 120, // 2 minutes
    },
  });
});

/**
 * Verify and Complete 2FA Setup
 * @route POST /api/v1/users/2fa/verify-setup
 * @access Private
 * @description Verify the code and complete 2FA setup
 */
exports.verify2FASetup = asyncHandler(async (req, res) => {
  const {
    validateVerificationCode,
    enable2FA,
    clearVerificationCode,
    incrementFailedAttempts,
  } = require("../services/twoFactorService");

  const { code } = req.body;

  if (!code) {
    throw errors.badRequest("Verification code is required");
  }

  const user = await User.findById(req.user._id).select(
    "+twoFactorEmail.verificationCode +twoFactorEmail.codeExpiresAt +twoFactorEmail.failedAttempts +twoFactorEmail.lockedUntil"
  );

  if (!user) {
    throw errors.notFound("User not found");
  }

  if (!user.twoFactorEmail) {
    throw errors.badRequest("2FA setup not initiated");
  }

  // Validate the code
  const validation = validateVerificationCode(
    code,
    user.twoFactorEmail.verificationCode,
    user.twoFactorEmail.codeExpiresAt,
    user.twoFactorEmail.failedAttempts,
    user.twoFactorEmail.lockedUntil
  );

  if (!validation.valid) {
    if (validation.shouldLock) {
      incrementFailedAttempts(user);
      await user.save();
    } else if (validation.attemptsRemaining !== undefined) {
      incrementFailedAttempts(user);
      await user.save();
    }

    throw errors.unauthorized(validation.error);
  }

  // Code is valid - enable 2FA
  enable2FA(user);
  clearVerificationCode(user);
  await user.save();

  res.json({
    success: true,
    message: "Two-Factor Authentication enabled successfully",
    data: {
      twoFactorEnabled: user.twoFactorEmail.enabled,
    },
  });
});

/**
 * Disable Two-Factor Authentication
 * @route POST /api/v1/users/2fa/disable
 * @access Private
 * @description Disable 2FA for the user (requires password confirmation)
 */
exports.disable2FA = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const { disable2FA } = require("../services/twoFactorService");

  if (!password) {
    throw errors.badRequest("Password is required to disable 2FA");
  }

  // Fetch user with password
  const user = await User.findById(req.user._id).select("+password");

  if (!user) {
    throw errors.notFound("User not found");
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw errors.unauthorized("Incorrect password");
  }

  // Check if 2FA is enabled
  if (!user.twoFactorEmail || !user.twoFactorEmail.enabled) {
    throw errors.badRequest("2FA is not enabled for this account");
  }

  // Disable 2FA
  disable2FA(user);
  await user.save();

  res.json({
    success: true,
    message: "Two-Factor Authentication disabled successfully",
    data: {
      twoFactorEnabled: false,
    },
  });
});

/**
 * Resend 2FA Verification Code
 * @route POST /api/v1/users/2fa/resend-code
 * @access Private
 * @description Resend the verification code during login or setup
 */
exports.resend2FACode = asyncHandler(async (req, res) => {
  const { send2FAEmail } = require("../utils/email");
  const {
    generateAndStoreCode,
    canResendCode,
  } = require("../services/twoFactorService");

  const user = await User.findById(req.user._id);

  if (!user) {
    throw errors.notFound("User not found");
  }

  // Check resend cooldown
  const { canResend, secondsRemaining } = canResendCode(
    user.twoFactorEmail?.lastCodeSentAt
  );

  if (!canResend) {
    throw errors.tooManyRequests(
      `Please wait ${secondsRemaining} seconds before requesting a new code`
    );
  }

  // Initialize 2FA object if it doesn't exist
  if (!user.twoFactorEmail) {
    user.twoFactorEmail = {
      enabled: false,
      setupVerified: false,
      failedAttempts: 0,
    };
  }

  // Generate and store new verification code
  const code = generateAndStoreCode(user);

  try {
    await send2FAEmail(user.email, code);
  } catch (error) {
    console.error("Failed to send 2FA code:", error);
    throw errors.internal("Failed to send verification code. Please try again.");
  }

  await user.save();

  res.json({
    success: true,
    message: "Verification code resent to your email",
    data: {
      email: user.email,
      expiresIn: 120, // 2 minutes
    },
  });
});

/**
 * Get 2FA Status
 * @route GET /api/v1/users/2fa/status
 * @access Private
 * @description Get the current 2FA status
 */
exports.get2FAStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "twoFactorEmail.enabled twoFactorAuth.enabled"
  );

  if (!user) {
    throw errors.notFound("User not found");
  }

  res.json({
    success: true,
    data: {
      emailBased2FA: {
        enabled: user.twoFactorEmail?.enabled || false,
      },
      totpBased2FA: {
        enabled: user.twoFactorAuth?.enabled || false,
      },
    },
  });
});




