// src/middleware/auth.js
const passport = require("passport");

// Authenticate with JWT
const authenticate = (req, res, next) => {
  passport.authenticate("jwt", { session: false }, (err, user, info) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: "Authentication error",
        error: err.message,
      });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: info?.message || "Unauthorized",
        code: "UNAUTHORIZED",
      });
    }

    req.user = user;
    next();
  })(req, res, next);
};

// Check if user has specific role
const hasRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "UNAUTHORIZED",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
        code: "FORBIDDEN",
        requiredRoles: roles,
        userRole: req.user.role,
      });
    }

    next();
  };
};

// Check if user has specific permission
const hasPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "UNAUTHORIZED",
      });
    }

    if (!req.user.hasPermission(permission)) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
        code: "FORBIDDEN",
        requiredPermission: permission,
      });
    }

    next();
  };
};

// Check if user is owner of resource or has override permission
const isOwnerOr = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "UNAUTHORIZED",
      });
    }

    // Check if user is owner
    const resourceOwnerId = req.resource?.author?._id || req.resource?.author;
    const isOwner =
      resourceOwnerId && resourceOwnerId.toString() === req.user._id.toString();

    // Check if user has override permission
    const hasOverride = req.user.hasPermission(permission);

    if (!isOwner && !hasOverride) {
      return res.status(403).json({
        success: false,
        message: "You can only modify your own resources",
        code: "FORBIDDEN",
      });
    }

    next();
  };
};

// Optional authentication - doesn't fail if no token
const optionalAuth = (req, res, next) => {
  passport.authenticate("jwt", { session: false }, (err, user) => {
    if (user) {
      req.user = user;
    }
    next();
  })(req, res, next);
};

// Email verification required
const requireEmailVerification = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      code: "UNAUTHORIZED",
    });
  }

  if (!req.user.emailVerified) {
    return res.status(403).json({
      success: false,
      message: "Email verification required",
      code: "EMAIL_NOT_VERIFIED",
    });
  }

  next();
};

module.exports = {
  authenticate,
  hasRole,
  hasPermission,
  isOwnerOr,
  optionalAuth,
  requireEmailVerification,
};
