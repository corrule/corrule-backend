// src/services/authService.js
// Centralized authentication service utilities

const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const User = require("../models/User");
const { errors } = require("../middleware/errorHandler");

/**
 * Generate JWT access and refresh tokens
 * @param {string} userId - User ID
 * @param {string} jti - JWT ID (optional, auto-generated if not provided)
 * @returns {Object} { accessToken, refreshToken, jti }
 */
exports.generateTokens = (userId, jti = uuidv4()) => {
  const accessToken = jwt.sign(
    { userId, jti, type: "access" },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRATION || "24h" }
  );

  const refreshToken = jwt.sign(
    { userId, jti, type: "refresh" },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRATION || "7d" }
  );

  return { accessToken, refreshToken, jti };
};

/**
 * Save refresh token to user's token list
 * Keeps only the 5 most recent tokens
 * @param {Object} user - User document
 * @param {string} refreshToken - Refresh token to save
 * @param {string} userAgent - Device info from request
 * @param {string} ipAddress - IP address from request
 */
exports.saveRefreshToken = async (user, refreshToken, userAgent, ipAddress) => {
  user.refreshTokens.push({
    token: refreshToken,
    deviceInfo: userAgent,
    ipAddress: ipAddress,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  // Keep only the 5 most recent refresh tokens
  if (user.refreshTokens.length > 5) {
    user.refreshTokens = user.refreshTokens.slice(-5);
  }

  await user.save();
};

/**
 * Remove refresh token from user's token list (for logout)
 * @param {Object} user - User document
 * @param {string} refreshToken - Refresh token to remove
 */
exports.removeRefreshToken = async (user, refreshToken) => {
  user.refreshTokens = user.refreshTokens.filter(
    (t) => t.token !== refreshToken
  );
  await user.save();
};

/**
 * Verify JWT token and return decoded payload
 * @param {string} token - JWT token to verify
 * @param {string} secret - JWT secret (either ACCESS or REFRESH)
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
exports.verifyJWT = (token, secret) => {
  try {
    return jwt.verify(token, secret);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw errors.unauthorized("Token expired");
    }
    throw errors.unauthorized("Invalid token");
  }
};

/**
 * Generate cryptographic token for email verification or password reset
 * @returns {string} 64-character hex token
 */
exports.generateCryptoToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

/**
 * Create response object for successful login/registration
 * @param {Object} user - User document
 * @param {string} accessToken - JWT access token
 * @param {string} refreshToken - JWT refresh token
 * @returns {Object} Formatted user data for response
 */
exports.formatAuthResponse = (user) => {
  return {
    user: {
      id: user._id,
      email: user.email,
      username: user.username,
      role: user.role,
      emailVerified: user.emailVerified,
    },
    tokens: {
      accessToken: null, // Will be filled by caller
      refreshToken: null, // Will be filled by caller
      expiresIn: 900, // 15 minutes
    },
  };
};

/**
 * Format Google OAuth user response
 * @param {Object} user - User document
 * @param {string} accessToken - JWT access token
 * @param {string} refreshToken - JWT refresh token
 * @returns {Object} Formatted user data for OAuth response
 */
exports.formatGoogleAuthResponse = (user, accessToken, refreshToken) => {
  return {
    user: {
      _id: user._id,
      email: user.email,
      username: user.username,
      role: user.role,
      profile: user.profile,
    },
    token: accessToken,
    refreshToken,
  };
};

/**
 * Check if email is valid format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid, false otherwise
 */
exports.isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Check if password meets minimum requirements
 * @param {string} password - Password to validate
 * @returns {Object} { valid, message }
 */
exports.validatePassword = (password) => {
  if (!password || password.length < 8) {
    return {
      valid: false,
      message: "Password must be at least 8 characters long",
    };
  }

  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      message: "Password must contain at least one uppercase letter",
    };
  }

  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      message: "Password must contain at least one lowercase letter",
    };
  }

  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      message: "Password must contain at least one number",
    };
  }

  return { valid: true, message: null };
};

/**
 * Generate unique username from email (for OAuth signup)
 * @param {string} email - Email address
 * @returns {string} Generated username
 */
exports.generateUsernameFromEmail = (email) => {
  const baseName = email.split("@")[0];
  const randomSuffix = Math.random().toString(36).substr(2, 9);
  const username = `${baseName}_${randomSuffix}`;
  
  // Max username length is 30 characters
  if (username.length > 30) {
    // Truncate baseName to fit: 30 - 1 (underscore) - 9 (suffix) = 20 characters max for baseName
    const truncatedBaseName = baseName.substring(0, 20);
    return `${truncatedBaseName}_${randomSuffix}`;
  }
  
  return username;
};

/**
 * Extract name parts from full name string
 * @param {string} fullName - Full name string
 * @returns {Object} { firstName, lastName }
 */
exports.extractNameParts = (fullName) => {
  if (!fullName) return { firstName: "", lastName: "" };

  const parts = fullName.trim().split(" ");
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ") || "";

  return { firstName, lastName };
};

/**
 * Link Google account to existing email account
 * @param {Object} existingUser - User document to link to
 * @param {string} googleId - Google ID
 * @returns {Object} Updated user object
 */
exports.linkGoogleAccount = async (existingUser, googleId) => {
  existingUser.googleId = googleId;
  existingUser.lastLogin = new Date();
  await existingUser.save();
  return existingUser;
};

/**
 * Clear all refresh tokens (for security during password reset)
 * @param {Object} user - User document
 */
exports.clearAllRefreshTokens = async (user) => {
  user.refreshTokens = [];
  await user.save();
};

/**
 * Format response with both access and refresh tokens
 * Used by login and OAuth flows
 * @param {Object} user - User document
 * @param {string} accessToken - JWT access token
 * @param {string} refreshToken - JWT refresh token
 * @returns {Object} Formatted response data
 */
exports.buildTokenResponse = (user, accessToken, refreshToken) => {
  return {
    success: true,
    data: {
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 900,
      },
    },
  };
};

