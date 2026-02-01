// src/routes/notificationRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const notificationController = require("../controllers/notificationController");

// All routes require authentication
router.use(authenticate);

// Get all notifications for the user
router.get("/", notificationController.getNotifications);

// Get unread notification count
router.get("/unread/count", notificationController.getUnreadCount);

// Get single notification by ID
router.get("/:id", notificationController.getNotification);

// Mark notification as read
router.put("/:id/read", notificationController.markAsRead);

// Mark multiple notifications as read
router.put("/read/batch", notificationController.markMultipleAsRead);

// Delete single notification
router.delete("/:id", notificationController.deleteNotification);

// Delete multiple notifications
router.delete("/delete/batch", notificationController.deleteMultiple);

// Clear all notifications
router.delete("/clear/all", notificationController.clearAll);

module.exports = router;
