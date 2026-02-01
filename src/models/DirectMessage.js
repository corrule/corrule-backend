// src/models/DirectMessage.js
const mongoose = require("mongoose");

const directMessageSchema = new mongoose.Schema(
  {
    // Reference to the DirectChat this message belongs to
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DirectChat",
      required: true,
      index: true,
    },

    // Message sender
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Message content
    content: {
      type: String,
      required: true,
      trim: true,
    },

    // Message type (text, system, etc.)
    messageType: {
      type: String,
      enum: ["text", "system"],
      default: "text",
    },

    // Reply to another message (optional)
    replyTo: {
      messageId: mongoose.Schema.Types.ObjectId,
      senderName: String,
      senderAvatar: String,
      originalContent: String,
    },

    // Emoji reactions to this message
    reactions: [
      {
        emoji: {
          type: String,
          required: true,
        },
        reactedBy: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
        ],
      },
    ],

    // Read receipts
    readBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        readAt: {
          type: Date,
          required: true,
        },
      },
    ],

    // Edit history
    editedAt: Date,
    editHistory: [
      {
        originalContent: String,
        editedAt: Date,
      },
    ],

    // Soft delete
    deletedAt: Date,
    deletedBy: mongoose.Schema.Types.ObjectId,

    // Timestamps
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
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

// Indexes for performance
directMessageSchema.index({ chatId: 1, createdAt: -1 });
directMessageSchema.index({ senderId: 1 });
directMessageSchema.index({ "readBy.userId": 1 });

// Virtual for checking if message is deleted
directMessageSchema.virtual("isDeleted").get(function () {
  return !!this.deletedAt;
});

// Instance method to add a reaction
directMessageSchema.methods.addReaction = async function (userId, emoji) {
  let reaction = this.reactions.find((r) => r.emoji === emoji);

  if (!reaction) {
    reaction = { emoji, reactedBy: [] };
    this.reactions.push(reaction);
  }

  // Add user if not already reacted
  if (!reaction.reactedBy.includes(userId)) {
    reaction.reactedBy.push(userId);
  }

  await this.save();
  return this;
};

// Instance method to remove a reaction
directMessageSchema.methods.removeReaction = async function (userId, emoji) {
  const reaction = this.reactions.find((r) => r.emoji === emoji);

  if (reaction) {
    reaction.reactedBy = reaction.reactedBy.filter(
      (id) => id.toString() !== userId.toString()
    );

    // Remove reaction if no one has reacted
    if (reaction.reactedBy.length === 0) {
      this.reactions = this.reactions.filter((r) => r.emoji !== emoji);
    }
  }

  await this.save();
  return this;
};

// Instance method to mark as read
directMessageSchema.methods.markAsRead = async function (userId) {
  const alreadyRead = this.readBy.find(
    (r) => r.userId.toString() === userId.toString()
  );

  if (!alreadyRead) {
    this.readBy.push({
      userId,
      readAt: new Date(),
    });
    await this.save();
  }

  return this;
};

// Instance method to check if read by user
directMessageSchema.methods.isReadBy = function (userId) {
  return this.readBy.some(
    (r) => r.userId.toString() === userId.toString()
  );
};

module.exports = mongoose.model("DirectMessage", directMessageSchema);
