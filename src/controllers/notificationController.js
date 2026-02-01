// src/controllers/notificationController.js
const Notification = require("../models/Notification");
const { asyncHandler, errors } = require("../middleware/errorHandler");
const { getPagination } = require("../utils/pagination");

/**
 * Get all notifications for the current user
 * @route GET /api/v1/notifications
 * @access Private
 */
exports.getNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, filter = "all" } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  let query = { recipient: req.user._id };

  // Filter by read status
  if (filter === "unread") {
    query.isRead = false;
  } else if (filter === "read") {
    query.isRead = true;
  }

  const total = await Notification.countDocuments(query);
  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  res.json({
    success: true,
    data: {
      notifications,
      pagination: getPagination(total, page, limit),
    },
  });
});

/**
 * Get unread notification count
 * @route GET /api/v1/notifications/unread/count
 * @access Private
 */
exports.getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({
    recipient: req.user._id,
    isRead: false,
  });

  res.json({
    success: true,
    data: { unreadCount: count },
  });
});

/**
 * Get single notification by ID
 * @route GET /api/v1/notifications/:id
 * @access Private
 */
exports.getNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({
    _id: req.params.id,
    recipient: req.user._id,
  });

  if (!notification) {
    return res.status(404).json({
      success: false,
      message: "Notification not found",
    });
  }

  res.json({
    success: true,
    data: { notification },
  });
});

/**
 * Mark notification as read
 * @route PUT /api/v1/notifications/:id/read
 * @access Private
 */
exports.markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    {
      _id: req.params.id,
      recipient: req.user._id,
    },
    {
      isRead: true,
      readAt: new Date(),
    },
    { new: true },
  );

  if (!notification) {
    return res.status(404).json({
      success: false,
      message: "Notification not found",
    });
  }

  res.json({
    success: true,
    data: { notification },
    message: "Notification marked as read",
  });
});

/**
 * Mark multiple notifications as read
 * @route PUT /api/v1/notifications/read/batch
 * @access Private
 */
exports.markMultipleAsRead = asyncHandler(async (req, res) => {
  const { notificationIds } = req.body;

  if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: "notificationIds must be a non-empty array",
    });
  }

  const result = await Notification.updateMany(
    {
      _id: { $in: notificationIds },
      recipient: req.user._id,
    },
    {
      isRead: true,
      readAt: new Date(),
    },
  );

  res.json({
    success: true,
    data: { modifiedCount: result.modifiedCount },
    message: `${result.modifiedCount} notifications marked as read`,
  });
});

/**
 * Delete notification
 * @route DELETE /api/v1/notifications/:id
 * @access Private
 */
exports.deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndDelete({
    _id: req.params.id,
    recipient: req.user._id,
  });

  if (!notification) {
    return res.status(404).json({
      success: false,
      message: "Notification not found",
    });
  }

  res.json({
    success: true,
    data: { notification },
    message: "Notification deleted",
  });
});

/**
 * Delete multiple notifications
 * @route DELETE /api/v1/notifications/delete/batch
 * @access Private
 */
exports.deleteMultiple = asyncHandler(async (req, res) => {
  const { notificationIds } = req.body;

  if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: "notificationIds must be a non-empty array",
    });
  }

  const result = await Notification.deleteMany({
    _id: { $in: notificationIds },
    recipient: req.user._id,
  });

  res.json({
    success: true,
    data: { deletedCount: result.deletedCount },
    message: `${result.deletedCount} notifications deleted`,
  });
});

/**
 * Clear all notifications for the user
 * @route DELETE /api/v1/notifications/clear/all
 * @access Private
 */
exports.clearAll = asyncHandler(async (req, res) => {
  const result = await Notification.deleteMany({
    recipient: req.user._id,
  });

  res.json({
    success: true,
    data: { deletedCount: result.deletedCount },
    message: `All notifications cleared (${result.deletedCount} deleted)`,
  });
});

/**
 * Create a notification (for system/admin use)
 * Used by other controllers to create notifications
 */
exports.createNotification = async ({
  recipient,
  type,
  title,
  message,
  data = {},
  actionUrl = null,
}) => {
  try {
    const notification = new Notification({
      recipient,
      type,
      title,
      message,
      data,
      actionUrl,
    });

    const savedNotification = await notification.save();

    // Emit real-time notification via WebSocket
    if (global.socketService) {
      global.socketService.emitToUser(recipient, "notification:new", {
        notification: savedNotification,
      });
    }

    return savedNotification;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
};

/**
 * Bulk create notifications for multiple users
 */
exports.createBulkNotifications = async (recipients, notificationData) => {
  try {
    const notifications = recipients.map((recipientId) => ({
      ...notificationData,
      recipient: recipientId,
    }));

    const savedNotifications = await Notification.insertMany(notifications);

    // Emit real-time notifications
    if (global.socketService) {
      savedNotifications.forEach((notification) => {
        global.socketService.emitToUser(
          notification.recipient,
          "notification:new",
          {
            notification,
          },
        );
      });
    }

    return savedNotifications;
  } catch (error) {
    console.error("Error creating bulk notifications:", error);
    throw error;
  }
};
