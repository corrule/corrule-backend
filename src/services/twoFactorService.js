// src/services/twoFactorService.js
const crypto = require("crypto");
const { errors } = require("../middleware/errorHandler");

const TWO_FACTOR_CONFIG = {
  CODE_LENGTH: 6,
  CODE_EXPIRY_MINUTES: 2, // Code valid for 2 minutes
  MAX_FAILED_ATTEMPTS: 5,
  LOCKOUT_MINUTES: 15,
  RESEND_COOLDOWN_SECONDS: 30, // Minimum seconds between resend requests
};

/**
 * Generate a secure 6-digit verification code
 * @returns {string} 6-digit code
 */
exports.generateVerificationCode = () => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  return code;
};

/**
 * Validate a verification code against the user's stored code
 * @param {string} providedCode - Code provided by user
 * @param {string} storedCode - Code stored in database
 * @param {Date} expiresAt - Code expiration timestamp
 * @param {number} failedAttempts - Number of failed attempts
 * @param {Date} lockedUntil - Lock expiration time
 * @returns {Object} { valid: boolean, error: string | null }
 */
exports.validateVerificationCode = (
  providedCode,
  storedCode,
  expiresAt,
  failedAttempts = 0,
  lockedUntil = null
) => {
  // Check if account is locked
  if (lockedUntil && new Date() < lockedUntil) {
    const minutesRemaining = Math.ceil(
      (lockedUntil - new Date()) / (1000 * 60)
    );
    return {
      valid: false,
      error: `Account temporarily locked. Try again in ${minutesRemaining} minutes.`,
      locked: true,
    };
  }

  // Check if code has expired
  if (!expiresAt || new Date() > expiresAt) {
    return {
      valid: false,
      error: "Verification code has expired. Please request a new code.",
      expired: true,
    };
  }

  // Check if code matches
  if (providedCode !== storedCode) {
    const attemptsLeft = TWO_FACTOR_CONFIG.MAX_FAILED_ATTEMPTS - failedAttempts - 1;
    if (attemptsLeft <= 0) {
      return {
        valid: false,
        error: "Too many failed attempts. Account temporarily locked.",
        shouldLock: true,
      };
    }
    return {
      valid: false,
      error: `Invalid code. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`,
      attemptsRemaining: attemptsLeft,
    };
  }

  return { valid: true, error: null };
};

/**
 * Calculate lock expiration time
 * @returns {Date} Lockout expiration time
 */
exports.calculateLockoutTime = () => {
  return new Date(Date.now() + TWO_FACTOR_CONFIG.LOCKOUT_MINUTES * 60 * 1000);
};

/**
 * Calculate code expiration time
 * @returns {Date} Code expiration time
 */
exports.calculateCodeExpiration = () => {
  return new Date(Date.now() + TWO_FACTOR_CONFIG.CODE_EXPIRY_MINUTES * 60 * 1000);
};

/**
 * Check if enough time has passed for a resend request
 * @param {Date} lastCodeSentAt - When the last code was sent
 * @returns {Object} { canResend: boolean, secondsRemaining: number }
 */
exports.canResendCode = (lastCodeSentAt) => {
  if (!lastCodeSentAt) {
    return { canResend: true, secondsRemaining: 0 };
  }

  const secondsElapsed = Math.floor(
    (new Date() - lastCodeSentAt) / 1000
  );
  const secondsRemaining = Math.max(
    0,
    TWO_FACTOR_CONFIG.RESEND_COOLDOWN_SECONDS - secondsElapsed
  );

  return {
    canResend: secondsRemaining === 0,
    secondsRemaining,
  };
};

/**
 * Reset failed attempts and lockout
 * @param {Object} user - User document
 */
exports.resetFailedAttempts = (user) => {
  if (user.twoFactorEmail) {
    user.twoFactorEmail.failedAttempts = 0;
    user.twoFactorEmail.lockedUntil = null;
  }
};

/**
 * Increment failed attempts and potentially lock the account
 * @param {Object} user - User document
 */
exports.incrementFailedAttempts = (user) => {
  if (!user.twoFactorEmail) {
    user.twoFactorEmail = {};
  }

  user.twoFactorEmail.failedAttempts =
    (user.twoFactorEmail.failedAttempts || 0) + 1;

  // Lock account if max attempts reached
  if (
    user.twoFactorEmail.failedAttempts >=
    TWO_FACTOR_CONFIG.MAX_FAILED_ATTEMPTS
  ) {
    user.twoFactorEmail.lockedUntil = exports.calculateLockoutTime();
  }
};

/**
 * Generate and store 2FA code
 * @param {Object} user - User document
 * @returns {string} Generated verification code
 */
exports.generateAndStoreCode = (user) => {
  const code = exports.generateVerificationCode();
  const expiresAt = exports.calculateCodeExpiration();

  if (!user.twoFactorEmail) {
    user.twoFactorEmail = {};
  }

  user.twoFactorEmail.verificationCode = code;
  user.twoFactorEmail.codeExpiresAt = expiresAt;
  user.twoFactorEmail.lastCodeSentAt = new Date();
  // Reset failed attempts on new code generation
  user.twoFactorEmail.failedAttempts = 0;

  return code;
};

/**
 * Clear 2FA code from user
 * @param {Object} user - User document
 */
exports.clearVerificationCode = (user) => {
  if (user.twoFactorEmail) {
    user.twoFactorEmail.verificationCode = null;
    user.twoFactorEmail.codeExpiresAt = null;
    user.twoFactorEmail.failedAttempts = 0;
    user.twoFactorEmail.lockedUntil = null;
  }
};

/**
 * Enable 2FA for a user
 * @param {Object} user - User document
 */
exports.enable2FA = (user) => {
  if (!user.twoFactorEmail) {
    user.twoFactorEmail = {};
  }
  user.twoFactorEmail.enabled = true;
  user.twoFactorEmail.setupVerified = true;
};

/**
 * Disable 2FA for a user
 * @param {Object} user - User document
 */
exports.disable2FA = (user) => {
  if (user.twoFactorEmail) {
    user.twoFactorEmail = {
      enabled: false,
      setupVerified: false,
      failedAttempts: 0,
    };
  }
};

/**
 * Get 2FA configuration
 * @returns {Object} 2FA configuration
 */
exports.getConfig = () => {
  return { ...TWO_FACTOR_CONFIG };
};
