// src/models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },
    password: {
      type: String,
      minlength: 8,
      select: false,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    role: {
      type: String,
      enum: ["USER", "VERIFIED_CONTRIBUTOR", "MODERATOR", "ADMIN"],
      default: "USER",
    },
    profile: {
      firstName: String,
      lastName: String,
      avatar: String,
      bio: { type: String, maxlength: 500 },
      organization: String,
      location: String,
      website: String,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    twoFactorAuth: {
      enabled: { type: Boolean, default: false },
      secret: { type: String, select: false },
      backupCodes: { type: [String], select: false },
    },
    refreshTokens: [
      {
        token: { type: String, required: true },
        deviceInfo: String,
        ipAddress: String,
        createdAt: { type: Date, default: Date.now },
        expiresAt: Date,
      },
    ],
    statistics: {
      totalRules: { type: Number, default: 0 },
      totalDownloads: { type: Number, default: 0 },
      totalEarnings: { type: Number, default: 0 },
      rating: { type: Number, default: 0, min: 0, max: 5 },
    },
    billing: {
      stripeCustomerId: String,
      paypalCustomerId: String,
      balance: { type: Number, default: 0 },
      currency: { type: String, default: "USD" },
    },
    paymentMethods: [
      {
        // Payment provider that manages this payment method (stripe, paypal, etc.)
        provider: { type: String, enum: ["stripe", "paypal"], required: true },
        // Token/ID from the payment provider - NEVER raw card data
        providerPaymentMethodId: { type: String, required: true },
        // Display info only - extracted from provider, NOT from user
        last4: String, // Last 4 digits for display
        brand: { type: String, required: true }, // VISA, MASTERCARD, PAYPAL, etc.
        expiryMonth: Number,
        expiryYear: Number,
        paymentType: { type: String, enum: ["card", "paypal", "bank"], default: "card" },
        isDefault: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    isBanned: {
      type: Boolean,
      default: false,
    },
    banReason: String,
    lastLogin: Date,
    loginHistory: [
      {
        timestamp: Date,
        ipAddress: String,
        userAgent: String,
        success: Boolean,
      },
    ],
    likedRules: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Rule",
      },
    ],
    purchasedRules: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Rule",
      },
    ],
    workExperience: [
      {
        _id: mongoose.Schema.Types.ObjectId,
        company: {
          name: { type: String, required: true },
          isCustom: { type: Boolean, default: false },
        },
        job: {
          title: { type: String, required: true },
          isCustom: { type: Boolean, default: false },
        },
        startDate: { type: Date, required: true },
        endDate: { type: Date, default: null },
        isCurrent: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    socialMediaAccounts: [
      {
        _id: mongoose.Schema.Types.ObjectId,
        platform: { type: String, required: true, maxlength: 50 },
        url: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ role: 1 });
userSchema.index({ "statistics.rating": -1 });

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check if user has permission
userSchema.methods.hasPermission = function (permission) {
  const rolePermissions = {
    USER: ["rule:create", "rule:read", "rule:update:own", "rule:delete:own"],
    VERIFIED_CONTRIBUTOR: [
      "rule:create",
      "rule:read",
      "rule:update:own",
      "rule:delete:own",
      "rule:publish",
    ],
    MODERATOR: [
      "rule:create",
      "rule:read",
      "rule:update:any",
      "rule:delete:any",
      "rule:approve",
      "rule:reject",
      "user:moderate",
    ],
    ADMIN: ["*"],
  };

  const permissions = rolePermissions[this.role] || [];
  return permissions.includes("*") || permissions.includes(permission);
};

module.exports = mongoose.model("User", userSchema);
