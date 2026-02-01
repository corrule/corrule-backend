/**
 * Centralized Enums for Corrule Application
 * Single source of truth for all enum values across the application
 */

// ============================================================================
// USER ENUMS
// ============================================================================

/**
 * User Roles - Define access levels and permissions
 * @enum {string}
 */
const USER_ROLES = {
  USER: 'USER',
  VERIFIED_CONTRIBUTOR: 'VERIFIED_CONTRIBUTOR',
  MODERATOR: 'MODERATOR',
  ADMIN: 'ADMIN',
};

// ============================================================================
// RULE ENUMS
// ============================================================================

/**
 * Rule Status - Workflow stages for rules
 * @enum {string}
 */
const RULE_STATUS = {
  DRAFT: 'DRAFT',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  ARCHIVED: 'ARCHIVED',
};

/**
 * Rule Language - Programming/Rule languages supported
 * @enum {string}
 */
const RULE_LANGUAGE = {
  YARA: 'YARA',
  SIGMA: 'SIGMA',
  SNORT: 'SNORT',
  SURICATA: 'SURICATA',
  CUSTOM: 'CUSTOM',
};

/**
 * Rule Type - Classification of rule types
 * @enum {string}
 */
const RULE_TYPE = {
  DETECTION: 'DETECTION',
  PREVENTION: 'PREVENTION',
  HUNTING: 'HUNTING',
  CORRELATION: 'CORRELATION',
};

/**
 * Rule Platform - Target platforms for rules
 * @enum {string}
 */
const RULE_PLATFORM = {
  WINDOWS: 'WINDOWS',
  LINUX: 'LINUX',
  MACOS: 'MACOS',
  NETWORK: 'NETWORK',
  CLOUD: 'CLOUD',
  ENDPOINT: 'ENDPOINT',
};

/**
 * Rule Severity - Risk severity levels
 * @enum {string}
 */
const RULE_SEVERITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
};

/**
 * Rule Visibility - Access control for rules
 * @enum {string}
 */
const RULE_VISIBILITY = {
  PUBLIC: 'PUBLIC',
  PRIVATE: 'PRIVATE',
  UNLISTED: 'UNLISTED',
  PAID: 'PAID',
};

/**
 * Pricing Type - Pricing models for paid rules
 * @enum {string}
 */
const PRICING_TYPE = {
  SINGLE_USE: 'SINGLE_USE',
  UNLIMITED: 'UNLIMITED',
  SUBSCRIPTION: 'SUBSCRIPTION',
  FREE: 'FREE',
};

// ============================================================================
// ACTIVITY ENUMS
// ============================================================================

/**
 * Activity Type - Track user activities in the system
 * @enum {string}
 */
const ACTIVITY_TYPE = {
  RULE_CREATED: 'RULE_CREATED',
  RULE_UPDATED: 'RULE_UPDATED',
  RULE_PUBLISHED: 'RULE_PUBLISHED',
  RULE_APPROVED: 'RULE_APPROVED',
  RULE_REJECTED: 'RULE_REJECTED',
  RULE_PURCHASED: 'RULE_PURCHASED',
  RULE_DOWNLOADED: 'RULE_DOWNLOADED',
  RULE_VIEWED: 'RULE_VIEWED',
  RULE_FORKED: 'RULE_FORKED',
  RULE_MERGED: 'RULE_MERGED',
  RULE_REVIEWED: 'RULE_REVIEWED',
  RULE_LIKED: 'RULE_LIKED',
  RULE_UNLIKED: 'RULE_UNLIKED',
  PROFILE_UPDATED: 'PROFILE_UPDATED',
  ACHIEVEMENT_EARNED: 'ACHIEVEMENT_EARNED',
};

/**
 * Activity Target Model - Types of objects that can be tracked
 * @enum {string}
 */
const ACTIVITY_TARGET_MODEL = {
  RULE: 'Rule',
  USER: 'User',
  REVIEW: 'Review',
};

// ============================================================================
// NOTIFICATION ENUMS
// ============================================================================

/**
 * Notification Type - Different notification categories
 * @enum {string}
 */
const NOTIFICATION_TYPE = {
  RULE_APPROVED: 'RULE_APPROVED',
  RULE_REJECTED: 'RULE_REJECTED',
  RULE_PURCHASED: 'RULE_PURCHASED',
  NEW_REVIEW: 'NEW_REVIEW',
  COMMENT_REPLY: 'COMMENT_REPLY',
  ACHIEVEMENT: 'ACHIEVEMENT',
  SYSTEM: 'SYSTEM',
};

// ============================================================================
// TRANSACTION ENUMS
// ============================================================================

/**
 * Payment Gateway - Payment providers
 * @enum {string}
 */
const PAYMENT_GATEWAY = {
  STRIPE: 'STRIPE',
  PAYPAL: 'PAYPAL',
  CRYPTO: 'CRYPTO',
  CREDITS: 'CREDITS',
  MOCK: 'MOCK', // For testing
};

/**
 * Transaction Status - Payment transaction states
 * @enum {string}
 */
const TRANSACTION_STATUS = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  DISPUTED: 'DISPUTED',
};

// ============================================================================
// BILLING ENUMS
// ============================================================================

/**
 * Billing Role - Roles in billing context
 * @enum {string}
 */
const BILLING_ROLE = {
  USER: 'USER',
  ADMIN: 'ADMIN',
};

/**
 * Bank Account Type - Bank account classifications
 * @enum {string}
 */
const BANK_ACCOUNT_TYPE = {
  CHECKING: 'CHECKING',
  SAVINGS: 'SAVINGS',
};

/**
 * Billing Transaction Type - Types of billing transactions
 * @enum {string}
 */
const BILLING_TRANSACTION_TYPE = {
  PURCHASE: 'PURCHASE',
  REFUND: 'REFUND',
  COMMISSION: 'COMMISSION',
  WITHDRAWAL: 'WITHDRAWAL',
};

/**
 * Billing Transaction Status - Billing transaction states
 * @enum {string}
 */
const BILLING_TRANSACTION_STATUS = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REVERSED: 'REVERSED',
};

/**
 * Withdrawal Request Status - Withdrawal workflow states
 * @enum {string}
 */
const WITHDRAWAL_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
};

/**
 * Withdrawal Request Method - Withdrawal payment methods
 * @enum {string}
 */
const WITHDRAWAL_METHOD = {
  BANK_TRANSFER: 'BANK_TRANSFER',
  PAYPAL: 'PAYPAL',
  CRYPTO: 'CRYPTO',
};

// ============================================================================
// FRONTEND ENUMS (Types)
// ============================================================================

/**
 * Toast Type - Frontend notification types
 * @enum {string}
 */
const TOAST_TYPE = {
  SUCCESS: 'success',
  ERROR: 'error',
  INFO: 'info',
  WARNING: 'warning',
};

/**
 * Payment Method - Payment methods in modals
 * @enum {string}
 */
const PAYMENT_METHOD = {
  STRIPE: 'stripe',
  BANK: 'bank',
};

/**
 * Warning Severity - User warning severity levels
 * @enum {string}
 */
const WARNING_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
};

/**
 * Period Type - Time period filtering
 * @enum {string}
 */
const PERIOD_TYPE = {
  WEEK: 'week',
  MONTH: 'month',
  YEAR: 'year',
};

// ============================================================================
// EXPORT ALL ENUMS
// ============================================================================

module.exports = {
  // User
  USER_ROLES,

  // Rule
  RULE_STATUS,
  RULE_LANGUAGE,
  RULE_TYPE,
  RULE_PLATFORM,
  RULE_SEVERITY,
  RULE_VISIBILITY,
  PRICING_TYPE,

  // Activity
  ACTIVITY_TYPE,
  ACTIVITY_TARGET_MODEL,

  // Notification
  NOTIFICATION_TYPE,

  // Transaction
  PAYMENT_GATEWAY,
  TRANSACTION_STATUS,

  // Billing
  BILLING_ROLE,
  BANK_ACCOUNT_TYPE,
  BILLING_TRANSACTION_TYPE,
  BILLING_TRANSACTION_STATUS,
  WITHDRAWAL_STATUS,
  WITHDRAWAL_METHOD,

  // Frontend
  TOAST_TYPE,
  PAYMENT_METHOD,
  WARNING_SEVERITY,
  PERIOD_TYPE,
};
