// src/middleware/rateLimiter.js
const rateLimit = require("express-rate-limit");
const RedisStore = require("rate-limit-redis");
const redis = require("redis");

// Create Redis client
let redisClient = null;

// Initialize Redis connection (optional)
const initializeRedis = () => {
  if (process.env.REDIS_URL) {
    try {
      redisClient = redis.createClient({
        url: process.env.REDIS_URL,
      });

      redisClient.on("error", (err) => {
        console.error("Redis error:", err);
        redisClient = null;
      });

      redisClient.connect().catch((err) => {
        console.error("Redis connection failed:", err);
        redisClient = null;
      });

      console.log("Redis rate limiter initialized");
    } catch (error) {
      console.warn("Redis not available, using memory store for rate limiting");
    }
  }
};

/**
 * General API rate limiter
 * 100 requests per 15 minutes per user
 */
const createRateLimiter = (options = {}) => {
  const defaults = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: "Too many requests from this IP, please try again later.",
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skip: (req) => {
      // Skip rate limiting for admin users
      return req.user && req.user.role === "ADMIN";
    },
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise use IP
      return req.user ? req.user._id.toString() : req.ip;
    },
    ...options,
  };

  // Use Redis store if available
  if (redisClient) {
    return rateLimit({
      ...defaults,
      store: new RedisStore({
        client: redisClient,
        prefix: "rate-limit:",
      }),
    });
  }

  // Fallback to memory store
  return rateLimit(defaults);
};

/**
 * Strict rate limiter for authentication endpoints
 * 5 requests per 15 minutes
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many login attempts, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  skip: (req) => req.user && req.user.role === "ADMIN",
});

/**
 * Moderate rate limiter for user actions
 * 30 requests per 15 minutes
 */
const userActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many user actions, please slow down.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? req.user._id.toString() : req.ip),
  skip: (req) => req.user && req.user.role === "ADMIN",
});

/**
 * Strict rate limiter for payments
 * 10 requests per 15 minutes
 */
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many payment attempts, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? req.user._id.toString() : req.ip),
  skip: (req) => req.user && req.user.role === "ADMIN",
});

/**
 * Per-user rate limiter based on user role
 */
const roleBasedLimiter = (req, res, next) => {
  const limiterOptions = {
    windowMs: 15 * 60 * 1000,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user ? req.user._id.toString() : req.ip),
  };

  let maxRequests = 100; // Default

  if (req.user) {
    switch (req.user.role) {
      case "USER":
        maxRequests = 100;
        break;
      case "VERIFIED_CONTRIBUTOR":
        maxRequests = 200;
        break;
      case "MODERATOR":
        maxRequests = 500;
        break;
      case "ADMIN":
        // No limit for admins
        return next();
      default:
        maxRequests = 50;
    }
  } else {
    maxRequests = 50; // Anonymous users get lower limit
  }

  limiterOptions.max = maxRequests;

  const limiter = rateLimit(limiterOptions);
  limiter(req, res, next);
};

/**
 * Download rate limiter
 * 20 downloads per hour
 */
const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: "Download limit exceeded, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? req.user._id.toString() : req.ip),
  skip: (req) => req.user && req.user.role === "ADMIN",
});

/**
 * Review posting rate limiter
 * 5 reviews per hour
 */
const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: "You are posting reviews too frequently. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? req.user._id.toString() : req.ip),
  skip: (req) => req.user && req.user.role === "ADMIN",
});

module.exports = {
  initializeRedis,
  createRateLimiter,
  authLimiter,
  userActionLimiter,
  paymentLimiter,
  roleBasedLimiter,
  downloadLimiter,
  reviewLimiter,
};
