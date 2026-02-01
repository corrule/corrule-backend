// src/config/passport.js
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const JwtStrategy = require("passport-jwt").Strategy;
const ExtractJwt = require("passport-jwt").ExtractJwt;
const User = require("../models/User");

// Helper function to check token blacklist (Redis implementation)
async function checkTokenBlacklist(jti) {
  // TODO: Implement Redis check
  // const redis = req.app.locals.redis;
  // const isBlacklisted = await redis.get(`blacklist:${jti}`);
  // return !!isBlacklisted;
  return false;
}

// Local Strategy - Email/Password Login
passport.use(
  "local",
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
      passReqToCallback: true,
    },
    async (req, email, password, done) => {
      try {
        // Find user with password field
        const user = await User.findOne({ email: email.toLowerCase() }).select(
          "+password +twoFactorAuth.secret",
        );

        if (!user) {
          return done(null, false, { message: "Invalid email or password" });
        }

        // Check if user is banned
        if (user.isBanned) {
          return done(null, false, {
            message: "Account has been banned",
            reason: user.banReason,
          });
        }

        // Check if user is active
        if (!user.isActive) {
          return done(null, false, { message: "Account is not active" });
        }

        // Verify password
        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
          return done(null, false, { message: "Invalid email or password" });
        }

        // Check if 2FA is enabled
        if (user.twoFactorAuth.enabled) {
          // Mark that 2FA verification is needed
          return done(null, { userId: user._id, requires2FA: true });
        }

        // Update last login
        user.lastLogin = new Date();
        user.loginHistory.push({
          timestamp: new Date(),
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
          success: true,
        });

        // Keep only last 10 login records
        if (user.loginHistory.length > 10) {
          user.loginHistory = user.loginHistory.slice(-10);
        }

        await user.save();

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    },
  ),
);

// JWT Strategy - Token Authentication
const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET,
  passReqToCallback: true,
};

passport.use(
  "jwt",
  new JwtStrategy(jwtOptions, async (req, jwtPayload, done) => {
    try {
      // Check if token is blacklisted (Redis check would go here)
      const isBlacklisted = await checkTokenBlacklist(jwtPayload.jti);
      if (isBlacklisted) {
        return done(null, false, { message: "Token has been revoked" });
      }

      // Find user
      const user = await User.findById(jwtPayload.userId);

      if (!user) {
        return done(null, false, { message: "User not found" });
      }

      if (user.isBanned) {
        return done(null, false, { message: "Account has been banned" });
      }

      if (!user.isActive) {
        return done(null, false, { message: "Account is not active" });
      }

      // Attach user to request
      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }),
);

module.exports = passport;
