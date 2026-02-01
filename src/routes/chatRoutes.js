// src/routes/chatRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const {
  searchUsers,
  getChatList,
  getOrCreateDirectChat,
  getMessages,
  sendMessage,
  markMessagesAsRead,
  addReaction,
  removeReaction,
} = require("../controllers/chatController");

// All routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/v1/chat/search-users
 * @desc    Search for public users by exact username
 * @access  Private
 */
router.post("/search-users", searchUsers);

/**
 * @route   GET /api/v1/chat/chats
 * @desc    Get list of all direct chats for current user
 * @access  Private
 */
router.get("/chats", getChatList);

/**
 * @route   POST /api/v1/chat/direct/:userId
 * @desc    Get or create a direct chat with a user
 * @access  Private
 */
router.post("/direct/:userId", getOrCreateDirectChat);

/**
 * @route   GET /api/v1/chat/:chatId/messages
 * @desc    Get messages in a direct chat (paginated)
 * @access  Private
 */
router.get("/:chatId/messages", getMessages);

/**
 * @route   POST /api/v1/chat/:chatId/send
 * @desc    Send a message in a direct chat
 * @access  Private
 */
router.post("/:chatId/send", sendMessage);

/**
 * @route   POST /api/v1/chat/:chatId/mark-read
 * @desc    Mark messages as read in a chat
 * @access  Private
 */
router.post("/:chatId/mark-read", markMessagesAsRead);

/**
 * @route   POST /api/v1/chat/:chatId/:messageId/react
 * @desc    Add reaction to a message
 * @access  Private
 */
router.post("/:chatId/:messageId/react", addReaction);

/**
 * @route   DELETE /api/v1/chat/:chatId/:messageId/react
 * @desc    Remove reaction from a message
 * @access  Private
 */
router.delete("/:chatId/:messageId/react", removeReaction);

module.exports = router;
