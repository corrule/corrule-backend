// src/utils/notificationHelper.js
/**
 * Helper utility to create and send notifications from any controller
 * Usage: const { createNotification } = require('../utils/notificationHelper');
 */

const notificationController = require('../controllers/notificationController');
const { NOTIFICATION_TYPE } = require('../constants/enums');

/**
 * Create and send a single notification
 * @param {string} recipientId - The user ID to receive the notification
 * @param {string} type - Notification type (RULE_APPROVED, NEW_REVIEW, etc.)
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} data - Additional data for the notification
 * @param {string} actionUrl - Optional URL for action button
 */
async function createNotification(
  recipientId,
  type,
  title,
  message,
  data = {},
  actionUrl = null
) {
  try {
    return await notificationController.createNotification({
      recipient: recipientId,
      type,
      title,
      message,
      data,
      actionUrl,
    });
  } catch (error) {
    console.error('Failed to create notification:', error);
    throw error;
  }
}

/**
 * Create and send notifications to multiple users
 * @param {string[]} recipientIds - Array of user IDs
 * @param {string} type - Notification type
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} data - Additional data
 */
async function createBulkNotifications(
  recipientIds,
  type,
  title,
  message,
  data = {}
) {
  try {
    return await notificationController.createBulkNotifications(recipientIds, {
      type,
      title,
      message,
      data,
    });
  } catch (error) {
    console.error('Failed to create bulk notifications:', error);
    throw error;
  }
}

/**
 * Notify user that their rule was approved
 */
async function notifyRuleApproved(userId, ruleTitle, ruleId) {
  return createNotification(
    userId,
    NOTIFICATION_TYPE.RULE_APPROVED,
    'Rule Approved! 🎉',
    `Your rule "${ruleTitle}" has been approved and is now live!`,
    { ruleId, ruleTitle },
    `/rules/${ruleId}`
  );
}

/**
 * Notify user that their rule was rejected
 */
async function notifyRuleRejected(userId, ruleTitle, reason) {
  return createNotification(
    userId,
    NOTIFICATION_TYPE.RULE_REJECTED,
    'Rule Review Complete',
    `Your rule "${ruleTitle}" was not approved. Reason: ${reason}`,
    { ruleTitle, reason }
  );
}

/**
 * Notify rule author about a new review
 */
async function notifyNewReview(
  ruleAuthorId,
  reviewerName,
  ruleTitle,
  ruleId,
  rating
) {
  return createNotification(
    ruleAuthorId,
    'NEW_REVIEW',
    'New Review ⭐',
    `${reviewerName} left a ${rating}-star review on "${ruleTitle}"`,
    { reviewerName, ruleTitle, ruleId, rating },
    `/rules/${ruleId}`
  );
}

/**
 * Notify seller about a rule purchase
 */
async function notifyRulePurchased(
  sellerId,
  buyerName,
  ruleTitle,
  ruleId,
  amount
) {
  return createNotification(
    sellerId,
    'RULE_PURCHASED',
    'Rule Purchased! 💰',
    `${buyerName} purchased your rule "${ruleTitle}" for $${amount}`,
    { buyerName, ruleTitle, ruleId, amount },
    `/rules/${ruleId}`
  );
}

/**
 * Notify buyer about successful purchase
 */
async function notifyPurchaseSuccess(buyerId, ruleTitle, ruleId) {
  return createNotification(
    buyerId,
    'PURCHASE_SUCCESS',
    'Purchase Successful ✓',
    `You successfully purchased "${ruleTitle}"`,
    { ruleTitle, ruleId },
    `/rules/${ruleId}`
  );
}

/**
 * Send system announcement to specific users
 */
async function sendSystemNotification(userIds, title, message, actionUrl = null) {
  return createBulkNotifications(
    userIds,
    'SYSTEM',
    title,
    message,
    { actionUrl }
  );
}

/**
 * Notify user of achievement/badge
 */
async function notifyAchievement(userId, achievementTitle, description) {
  return createNotification(
    userId,
    'ACHIEVEMENT',
    `Achievement Unlocked! 🏆`,
    `${achievementTitle}: ${description}`,
    { achievementTitle, description }
  );
}

module.exports = {
  createNotification,
  createBulkNotifications,
  notifyRuleApproved,
  notifyRuleRejected,
  notifyNewReview,
  notifyRulePurchased,
  notifyPurchaseSuccess,
  sendSystemNotification,
  notifyAchievement,
};
