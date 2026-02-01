// src/controllers/chatController.js
const mongoose = require("mongoose");
const User = require("../models/User");
const DirectChat = require("../models/DirectChat");
const DirectMessage = require("../models/DirectMessage");
const { asyncHandler, errors } = require("../middleware/errorHandler");
const { getPagination } = require("../utils/pagination");

/**
 * Search for public users by exact username
 * POST /api/v1/chat/search-users
 */
exports.searchUsers = asyncHandler(async (req, res) => {
  const { username } = req.body;
  const currentUserId = req.user._id;

  if (!username || !username.trim()) {
    return res.status(400).json({
      success: false,
      message: "Username is required",
    });
  }

  // Exact match search
  const users = await User.find(
    {
      username: new RegExp(`^${username}$`, "i"),
      _id: { $ne: currentUserId },
      isActive: true,
      isBanned: false,
    },
    {
      _id: 1,
      username: 1,
      email: 1,
      profile: 1,
      role: 1,
    }
  );

  res.json({
    success: true,
    data: { users },
  });
});

/**
 * Get list of all direct chats for current user
 * GET /api/v1/chat/chats
 */
exports.getChatList = asyncHandler(async (req, res) => {
  const currentUserId = req.user._id;
  const { page = 1, limit = 50 } = req.query;
  const { skip, pageLimit } = getPagination(page, limit);

  const chats = await DirectChat.find(
    {
      participants: currentUserId,
    }
  )
    .populate({
      path: "participants",
      select: "_id username profile.avatar profile.firstName profile.lastName",
    })
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(pageLimit)
    .lean();

  // Get total count for pagination
  const total = await DirectChat.countDocuments({
    participants: currentUserId,
  });

  // Enrich with unread count for current user
  const enrichedChats = chats
    .map((chat) => {
      // Safely access participants
      if (!chat.participants || !Array.isArray(chat.participants)) {
        return null;
      }

      const otherParticipant = chat.participants.find(
        (p) => p._id.toString() !== currentUserId.toString()
      );

      if (!otherParticipant) {
        return null;
      }

      // Safely access unreadCount
      let unreadCount = 0;
      if (chat.unreadCount && Array.isArray(chat.unreadCount)) {
        const unread = chat.unreadCount.find(
          (u) => u && u.userId && u.userId.toString() === currentUserId.toString()
        );
        unreadCount = unread ? unread.count : 0;
      }

      return {
        _id: chat._id,
        participant: otherParticipant,
        lastMessage: chat.lastMessage || null,
        unreadCount,
        updatedAt: chat.updatedAt,
      };
    })
    .filter(Boolean); // Filter out null values

  res.json({
    success: true,
    data: {
      chats: enrichedChats,
      pagination: {
        page: parseInt(page),
        limit: pageLimit,
        total,
        pages: Math.ceil(total / pageLimit),
      },
    },
  });
});

/**
 * Get or create a direct chat with a user
 * POST /api/v1/chat/direct/:userId
 */
exports.getOrCreateDirectChat = asyncHandler(async (req, res) => {
  const currentUserId = req.user._id;
  const { userId } = req.params;

  if (currentUserId.toString() === userId) {
    throw errors.badRequest("Cannot create chat with yourself");
  }

  // Verify the user exists
  const otherUser = await User.findById(userId).select(
    "_id username profile.avatar profile.firstName profile.lastName isActive isBanned"
  );

  if (!otherUser) {
    throw errors.notFound("User not found");
  }

  // Log for debugging
  console.log(`Creating chat with user ${userId}:`, {
    isActive: otherUser.isActive,
    isBanned: otherUser.isBanned,
  });

  // Find or create the direct chat
  const chat = await DirectChat.findOrCreateDirectChat(
    currentUserId,
    userId
  );

  // Populate participants
  await chat.populate({
    path: "participants",
    select:
      "_id username profile.avatar profile.firstName profile.lastName",
  });

  const otherParticipant = chat.getOtherParticipant(currentUserId);

  res.json({
    success: true,
    data: {
      chat: {
        _id: chat._id,
        participant: otherParticipant,
        lastMessage: chat.lastMessage,
        unreadCount: chat.getUnreadCount(currentUserId),
      },
    },
  });
});

/**
 * Get messages in a direct chat
 * GET /api/v1/chat/:chatId/messages
 */
exports.getMessages = asyncHandler(async (req, res) => {
  const currentUserId = req.user._id;
  const { chatId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const { skip, pageLimit } = getPagination(page, limit);

  // Verify user is a participant
  const chat = await DirectChat.findById(chatId);
  if (!chat) {
    throw errors.notFound("Chat not found");
  }

  if (!chat.participants.includes(currentUserId)) {
    throw errors.forbidden("Access denied");
  }

  // Get messages (paginated, newer first)
  const messages = await DirectMessage.find(
    {
      chatId,
      deletedAt: null,
    },
    {
      chatId: 1,
      senderId: 1,
      content: 1,
      messageType: 1,
      replyTo: 1,
      reactions: 1,
      readBy: 1,
      createdAt: 1,
      updatedAt: 1,
    }
  )
    .populate({
      path: "senderId",
      select: "_id username profile.avatar profile.firstName profile.lastName",
    })
    .populate({
      path: "reactions.reactedBy",
      select: "_id username",
    })
    .populate({
      path: "readBy.userId",
      select: "_id username",
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(pageLimit)
    .lean();

  // Reverse to show oldest first
  messages.reverse();

  // Get total count
  const total = await DirectMessage.countDocuments({
    chatId,
    deletedAt: null,
  });

  res.json({
    success: true,
    data: {
      messages,
      pagination: {
        page: parseInt(page),
        limit: pageLimit,
        total,
        pages: Math.ceil(total / pageLimit),
      },
    },
  });
});

/**
 * Send a message in a direct chat
 * POST /api/v1/chat/:chatId/send
 */
exports.sendMessage = asyncHandler(async (req, res) => {
  const currentUserId = req.user._id;
  const { chatId } = req.params;
  const { content, replyTo } = req.body;

  if (!content || !content.trim()) {
    throw errors.badRequest("Message content is required");
  }

  // Verify chat exists and user is participant
  const chat = await DirectChat.findById(chatId);
  if (!chat) {
    throw errors.notFound("Chat not found");
  }

  if (!chat.participants.includes(currentUserId)) {
    throw errors.forbidden("Access denied");
  }

  // Create message
  let messageData = {
    chatId,
    senderId: currentUserId,
    content: content.trim(),
    messageType: "text",
    readBy: [{ userId: currentUserId, readAt: new Date() }],
  };

  // Handle reply if provided
  if (replyTo) {
    const originalMessage = await DirectMessage.findById(replyTo);
    if (originalMessage) {
      const originalSender = await User.findById(originalMessage.senderId).select(
        "username profile.avatar"
      );
      messageData.replyTo = {
        messageId: originalMessage._id,
        senderName: originalSender.username,
        senderAvatar: originalSender.profile.avatar,
        originalContent: originalMessage.content,
      };
    }
  }

  const message = await DirectMessage.create(messageData);

  // Update chat's last message
  chat.lastMessage = {
    _id: message._id,
    senderId: currentUserId,
    content: message.content,
    timestamp: message.createdAt,
    messageType: "text",
  };
  await chat.save();

  // Increment unread count for other participant
  const otherUserId = chat.getOtherParticipant(currentUserId);
  await chat.incrementUnreadCount(otherUserId);

  // Populate and return
  await message.populate({
    path: "senderId",
    select: "_id username profile.avatar profile.firstName profile.lastName",
  });

  // Emit message via socket in real-time
  if (global.socketService) {
    global.socketService.emitToChat(chatId, "direct_message_received", {
      _id: message._id,
      chatId,
      senderId: message.senderId,
      content: message.content,
      messageType: message.messageType,
      replyTo: message.replyTo,
      reactions: message.reactions,
      readBy: message.readBy,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    });
  }

  res.status(201).json({
    success: true,
    data: { message },
  });
});

/**
 * Mark messages as read
 * POST /api/v1/chat/:chatId/mark-read
 */
exports.markMessagesAsRead = asyncHandler(async (req, res) => {
  const currentUserId = req.user._id;
  const { chatId } = req.params;
  const { messageIds } = req.body;

  // Verify chat exists
  const chat = await DirectChat.findById(chatId);
  if (!chat) {
    throw errors.notFound("Chat not found");
  }

  if (!chat.participants.includes(currentUserId)) {
    throw errors.forbidden("Access denied");
  }

  // Mark messages as read
  if (messageIds && messageIds.length > 0) {
    await DirectMessage.updateMany(
      { _id: { $in: messageIds }, chatId },
      {
        $addToSet: {
          readBy: { userId: currentUserId, readAt: new Date() },
        },
      }
    );
  } else {
    // Mark all messages as read
    await DirectMessage.updateMany(
      { chatId, "readBy.userId": { $ne: currentUserId } },
      {
        $addToSet: {
          readBy: { userId: currentUserId, readAt: new Date() },
        },
      }
    );
  }

  // Reset unread count for current user
  await chat.resetUnreadCount(currentUserId);

  res.json({
    success: true,
    message: "Messages marked as read",
  });
});

/**
 * Add reaction to a message
 * POST /api/v1/chat/:chatId/:messageId/react
 */
exports.addReaction = asyncHandler(async (req, res) => {
  const currentUserId = req.user._id;
  const { chatId, messageId } = req.params;
  const { emoji } = req.body;

  if (!emoji) {
    throw errors.badRequest("Emoji is required");
  }

  // Verify chat and message exist
  const chat = await DirectChat.findById(chatId);
  if (!chat) {
    throw errors.notFound("Chat not found");
  }

  if (!chat.participants.includes(currentUserId)) {
    throw errors.forbidden("Access denied");
  }

  const message = await DirectMessage.findById(messageId);
  if (!message) {
    throw errors.notFound("Message not found");
  }

  if (message.chatId.toString() !== chatId) {
    throw errors.badRequest("Message does not belong to this chat");
  }

  await message.addReaction(currentUserId, emoji);

  await message.populate({
    path: "reactions.reactedBy",
    select: "_id username",
  });

  res.json({
    success: true,
    data: { message },
  });
});

/**
 * Remove reaction from a message
 * DELETE /api/v1/chat/:chatId/:messageId/react
 */
exports.removeReaction = asyncHandler(async (req, res) => {
  const currentUserId = req.user._id;
  const { chatId, messageId } = req.params;
  const { emoji } = req.body;

  if (!emoji) {
    throw errors.badRequest("Emoji is required");
  }

  // Verify chat and message exist
  const chat = await DirectChat.findById(chatId);
  if (!chat) {
    throw errors.notFound("Chat not found");
  }

  if (!chat.participants.includes(currentUserId)) {
    throw errors.forbidden("Access denied");
  }

  const message = await DirectMessage.findById(messageId);
  if (!message) {
    throw errors.notFound("Message not found");
  }

  if (message.chatId.toString() !== chatId) {
    throw errors.badRequest("Message does not belong to this chat");
  }

  await message.removeReaction(currentUserId, emoji);

  await message.populate({
    path: "reactions.reactedBy",
    select: "_id username",
  });

  res.json({
    success: true,
    data: { message },
  });
});
