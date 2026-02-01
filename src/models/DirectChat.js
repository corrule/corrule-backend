// src/models/DirectChat.js
const mongoose = require("mongoose");

const directChatSchema = new mongoose.Schema(
  {
    // Participants in the direct chat (always exactly 2 users)
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],

    // Last message info for quick display in chat list
    lastMessage: {
      _id: mongoose.Schema.Types.ObjectId,
      senderId: mongoose.Schema.Types.ObjectId,
      content: String,
      timestamp: Date,
      messageType: {
        type: String,
        enum: ["text", "system"],
        default: "text",
      },
    },

    // Track unread messages per user
    unreadCount: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        count: { type: Number, default: 0 },
      },
    ],

    // Archive status per user
    archivedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // Mute status per user
    mutedBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        mutedUntil: Date, // null means permanently muted
      },
    ],

    // Chat status
    isActive: {
      type: Boolean,
      default: true,
    },

    // Timestamps
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index for faster queries
directChatSchema.index({ participants: 1 });
directChatSchema.index({ "lastMessage.timestamp": -1 });
directChatSchema.index({ updatedAt: -1 });

// Ensure exactly 2 participants
directChatSchema.pre("save", function (next) {
  if (this.participants.length !== 2) {
    return next(new Error("Direct chat must have exactly 2 participants"));
  }
  // Sort participants to ensure consistent document lookup
  this.participants.sort((a, b) =>
    a.toString().localeCompare(b.toString())
  );

  // Initialize unreadCount if not set
  if (!this.unreadCount || this.unreadCount.length === 0) {
    this.unreadCount = this.participants.map((userId) => ({
      userId,
      count: 0,
    }));
  }

  next();
});

// Static method to find or create a direct chat between two users
directChatSchema.statics.findOrCreateDirectChat = async function (
  userId1,
  userId2
) {
  const participants = [userId1, userId2].sort((a, b) =>
    a.toString().localeCompare(b.toString())
  );

  let chat = await this.findOne({ participants });

  if (!chat) {
    chat = await this.create({
      participants,
      unreadCount: [
        { userId: userId1, count: 0 },
        { userId: userId2, count: 0 },
      ],
    });
  }

  return chat;
};

// Post-find hook to ensure unreadCount is initialized
directChatSchema.post("find", function (docs) {
  if (!Array.isArray(docs)) return;
  
  docs.forEach((doc) => {
    if (!doc.unreadCount || !Array.isArray(doc.unreadCount) || doc.unreadCount.length === 0) {
      doc.unreadCount = doc.participants.map((userId) => ({
        userId,
        count: 0,
      }));
    }
  });
});

// Post-findOne hook to ensure unreadCount is initialized
directChatSchema.post("findOne", function (doc) {
  if (!doc) return;
  
  if (!doc.unreadCount || !Array.isArray(doc.unreadCount) || doc.unreadCount.length === 0) {
    doc.unreadCount = doc.participants.map((userId) => ({
      userId,
      count: 0,
    }));
  }
});

// Instance method to get the other participant
directChatSchema.methods.getOtherParticipant = function (userId) {
  return this.participants.find((id) => id.toString() !== userId.toString());
};

// Instance method to get unread count for a user
directChatSchema.methods.getUnreadCount = function (userId) {
  const unread = this.unreadCount.find(
    (u) => u.userId.toString() === userId.toString()
  );
  return unread ? unread.count : 0;
};

// Instance method to increment unread count for a user
directChatSchema.methods.incrementUnreadCount = async function (userId) {
  const unreadIndex = this.unreadCount.findIndex(
    (u) => u.userId.toString() === userId.toString()
  );

  if (unreadIndex !== -1) {
    this.unreadCount[unreadIndex].count += 1;
  } else {
    this.unreadCount.push({ userId, count: 1 });
  }

  await this.save();
};

// Instance method to reset unread count for a user
directChatSchema.methods.resetUnreadCount = async function (userId) {
  const unreadIndex = this.unreadCount.findIndex(
    (u) => u.userId.toString() === userId.toString()
  );

  if (unreadIndex !== -1) {
    this.unreadCount[unreadIndex].count = 0;
  }

  await this.save();
};

module.exports = mongoose.model("DirectChat", directChatSchema);
