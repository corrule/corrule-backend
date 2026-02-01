// src/controllers/authController.js
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require("../utils/email");
const { asyncHandler, errors } = require("../middleware/errorHandler");
const {
  generateTokens,
  saveRefreshToken,
  removeRefreshToken,
  verifyJWT,
  generateCryptoToken,
  validatePassword,
  generateUsernameFromEmail,
  extractNameParts,
  linkGoogleAccount,
  clearAllRefreshTokens,
  buildTokenResponse,
  formatGoogleAuthResponse,
} = require("../services/authService");

// Initialize Google OAuth client (for ID token verification only on localhost)
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Register new user
exports.register = asyncHandler(async (req, res) => {
  const { email, password, username, firstName, lastName } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({
    $or: [{ email: email.toLowerCase() }, { username }],
  });

  if (existingUser) {
    throw existingUser.email === email.toLowerCase()
      ? errors.conflict("Email already registered")
      : errors.conflict("Username already taken");
  }

  // Validate password
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    throw errors.badRequest(passwordValidation.message);
  }

  // Generate verification token
  const verificationToken = generateCryptoToken();
  const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Create user
  const user = new User({
    email: email.toLowerCase(),
    password,
    username,
    profile: { firstName, lastName },
    emailVerificationToken: verificationToken,
    emailVerificationExpires: verificationExpires,
  });

  await user.save();

  // Send verification email (non-blocking)
  sendVerificationEmail(user.email, verificationToken).catch((err) => {
    console.error("Failed to send verification email:", err.message);
  });

  res.status(201).json({
    success: true,
    message:
      "Registration successful. Please check your email to verify your account.",
    data: {
      userId: user._id,
      email: user.email,
      username: user.username,
    },
  });
});

// Login user
exports.login = asyncHandler(async (req, res, next) => {
  const passport = require("passport");

  passport.authenticate(
    "local",
    { session: false },
    async (err, user, info) => {
      try {
        if (err) {
          throw errors.internal("Authentication error");
        }

        if (!user) {
          throw errors.unauthorized(info?.message || "Authentication failed");
        }

        // Check if 2FA is required
        if (user.requires2FA) {
          return res.status(200).json({
            success: true,
            requires2FA: true,
            userId: user.userId,
            message: "Please provide 2FA token",
          });
        }

        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user._id);

        // Store refresh token in database
        user.refreshTokens.push({
          token: refreshToken,
          deviceInfo: req.get("user-agent"),
          ipAddress: req.ip,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        if (user.refreshTokens.length > 5) {
          user.refreshTokens = user.refreshTokens.slice(-5);
        }

        await user.save();

        res.json({
          success: true,
          message: "Login successful",
          data: {
            user: {
              id: user._id,
              email: user.email,
              username: user.username,
              role: user.role,
              emailVerified: user.emailVerified,
            },
            tokens: {
              accessToken,
              refreshToken,
              expiresIn: 900,
            },
          },
        });
      } catch (error) {
        next(error);
      }
    },
  )(req, res, next);
});

// Verify 2FA token and complete login
exports.verify2FA = asyncHandler(async (req, res) => {
  const { userId, token } = req.body;

  const user = await User.findById(userId).select("+twoFactorAuth.secret");

  if (!user || !user.twoFactorAuth.enabled) {
    throw errors.badRequest("Invalid request");
  }

  // Verify token
  const verified = speakeasy.totp.verify({
    secret: user.twoFactorAuth.secret,
    encoding: "base32",
    token,
    window: 2,
  });

  if (!verified) {
    throw errors.unauthorized("Invalid 2FA token");
  }

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user._id);

  // Save refresh token
  await saveRefreshToken(user, refreshToken, req.get("user-agent"), req.ip);

  user.lastLogin = new Date();
  await user.save();

  res.json({
    success: true,
    message: "Login successful",
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
  });
});

// Refresh access token
exports.refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw errors.badRequest("Refresh token required");
  }

  // Verify refresh token
  const decoded = verifyJWT(refreshToken, process.env.JWT_REFRESH_SECRET);

  if (decoded.type !== "refresh") {
    throw errors.unauthorized("Invalid token type");
  }

  const user = await User.findById(decoded.userId);

  if (!user) {
    throw errors.unauthorized("User not found");
  }

  const tokenExists = user.refreshTokens.some((t) => t.token === refreshToken);

  if (!tokenExists) {
    throw errors.unauthorized("Invalid refresh token");
  }

  // Generate new tokens
  const { accessToken, refreshToken: newRefreshToken } = generateTokens(
    user._id
  );

  // Remove old token and save new one
  await removeRefreshToken(user, refreshToken);
  await saveRefreshToken(user, newRefreshToken, req.get("user-agent"), req.ip);

  res.json({
    success: true,
    data: {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900,
    },
  });
});

// Logout
exports.logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  const user = req.user;

  if (refreshToken) {
    await removeRefreshToken(user, refreshToken);
  }

  res.json({
    success: true,
    message: "Logout successful",
  });
});

// Verify email
exports.verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.params;

  const user = await User.findOne({
    emailVerificationToken: token,
    emailVerificationExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw errors.badRequest("Invalid or expired verification token");
  }

  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();

  res.json({
    success: true,
    message: "Email verified successfully",
  });
});

// Request password reset
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() });

  if (user) {
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);

    await user.save();

    sendPasswordResetEmail(user.email, resetToken).catch((err) => {
      console.error("Failed to send password reset email:", err.message);
    });
  }

  // Always return same message for security
  res.json({
    success: true,
    message: "If that email exists, a password reset link has been sent",
  });
});

// Reset password
exports.resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  // Validate password
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    throw errors.badRequest(passwordValidation.message);
  }

  const user = await User.findOne({
    passwordResetToken: token,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw errors.badRequest("Invalid or expired reset token");
  }

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  
  // Clear all refresh tokens for security
  await clearAllRefreshTokens(user);

  res.json({
    success: true,
    message: "Password reset successful",
  });
});

/**
 * Google OAuth Login/Signup
 * @route POST /api/v1/auth/google
 * @access Public
 */
// Helper function to fetch with retry
const fetchUserInfoWithRetry = async (token, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`[Google Auth Retry ${i + 1}/${maxRetries}] Attempting to fetch user info...`);
      console.log(`Token preview: ${token.substring(0, 20)}...${token.substring(token.length - 20)}`);
      
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log(`[Google Auth Retry ${i + 1}/${maxRetries}] Response status: ${response.status}`);

      if (!response.ok) {
        const responseText = await response.text();
        console.log(`[Google Auth Retry ${i + 1}/${maxRetries}] Error response: ${responseText}`);
        
        if (response.status === 401) {
          throw new Error('Invalid or expired token');
        }
        throw new Error(`HTTP ${response.status}: Failed to fetch user info from Google`);
      }

      const userData = await response.json();
      console.log(`[Google Auth Success] Retrieved user info for: ${userData.email}`);
      return userData;
    } catch (err) {
      console.error(`[Google Auth Retry ${i + 1}/${maxRetries}] failed:`, err.message);
      if (i === maxRetries - 1) {
        throw err;
      }
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 100));
    }
  }
};

exports.googleLogin = asyncHandler(async (req, res) => {
  const { token, credential } = req.body;

  console.log('[Google Auth] Request received');
  console.log('[Google Auth] Has token:', !!token);
  console.log('[Google Auth] Has credential:', !!credential);
  if (token) {
    console.log('[Google Auth] Token preview:', token.substring(0, 20) + '...' + token.substring(token.length - 20));
  }

  if (!token && !credential) {
    throw errors.badRequest("Google token or credential is required");
  }

  let googleUser;
  let googleId, email, name, picture;

  try {
    // Try to use ID token (credential) first for better reliability
    if (credential) {
      console.log('[Google Auth] Attempting to verify ID token (credential)...');
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: credential,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        googleId = payload.sub;
        email = payload.email;
        name = payload.name;
        picture = payload.picture;
        console.log('[Google Auth] ID token verified successfully for:', email);
      } catch (err) {
        console.error("[Google Auth] ID token verification failed, falling back to access token:", err.message);
        // Fall through to access token method
        googleUser = null;
      }
    }

    // Fall back to access token if credential not provided or invalid
    if (!googleUser && token) {
      console.log('[Google Auth] Attempting to fetch user info with access token...');
      try {
        googleUser = await fetchUserInfoWithRetry(token);
        googleId = googleUser.id;
        email = googleUser.email;
        name = googleUser.name;
        picture = googleUser.picture;
      } catch (err) {
        throw new Error('Failed to fetch user info from Google: ' + err.message);
      }
    }

    if (!googleId || !email) {
      throw new Error('Failed to get user info from Google');
    }

    // Check if user exists with this Google ID
    let user = await User.findOne({ googleId });

    if (user) {
      // User exists, update last login
      user.lastLogin = new Date();
      await user.save();
    } else {
      // Check if email already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });

      if (existingUser) {
        // Email exists but no Google ID, link it
        user = await linkGoogleAccount(existingUser, googleId);
      } else {
        // Create new user with generated username
        const username = generateUsernameFromEmail(email);
        const { firstName, lastName } = extractNameParts(name);

        user = await User.create({
          email: email.toLowerCase(),
          googleId,
          username,
          profile: {
            avatar: picture,
            firstName,
            lastName,
          },
          emailVerified: true,
          lastLogin: new Date(),
        });
      }
    }

    // Generate JWT tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Save refresh token
    await saveRefreshToken(user, refreshToken, req.get("user-agent"), req.ip);

    res.json({
      success: true,
      message: "Logged in successfully",
      data: formatGoogleAuthResponse(user, accessToken, refreshToken),
    });
  } catch (error) {
    console.error("Google OAuth error:", error);
    throw errors.unauthorized("Invalid or expired Google token");
  }
});

/**
 * Google OAuth Register
 * @route POST /api/v1/auth/google/register
 * @access Public
 */
exports.googleRegister = asyncHandler(async (req, res) => {
  const { token, credential } = req.body;

  if (!token && !credential) {
    throw errors.badRequest("Google token or credential is required");
  }

  let googleUser;
  let googleId, email, name, picture;

  try {
    // Try to use ID token (credential) first for better reliability
    if (credential) {
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: credential,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        googleId = payload.sub;
        email = payload.email;
        name = payload.name;
        picture = payload.picture;
      } catch (err) {
        console.error("ID token verification failed, falling back to access token:", err.message);
        // Fall through to access token method
        googleUser = null;
      }
    }

    // Fall back to access token if credential not provided or invalid
    if (!googleUser && token) {
      try {
        googleUser = await fetchUserInfoWithRetry(token);
        googleId = googleUser.id;
        email = googleUser.email;
        name = googleUser.name;
        picture = googleUser.picture;
      } catch (err) {
        throw new Error('Failed to fetch user info from Google: ' + err.message);
      }
    }

    if (!googleId || !email) {
      throw new Error('Failed to get user info from Google');
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { googleId }],
    });

    if (existingUser) {
      if (existingUser.googleId) {
        throw errors.conflict("Account already registered with Google");
      } else {
        // Email exists but no Google ID, link it
        const linkedUser = await linkGoogleAccount(existingUser, googleId);

        // Generate JWT tokens
        const { accessToken, refreshToken } = generateTokens(linkedUser._id);

        // Save refresh token
        await saveRefreshToken(linkedUser, refreshToken, req.get("user-agent"), req.ip);

        return res.json({
          success: true,
          message: "Account linked successfully",
          data: formatGoogleAuthResponse(linkedUser, accessToken, refreshToken),
        });
      }
    }

    // Create new user with generated username
    const username = generateUsernameFromEmail(email);
    const { firstName, lastName } = extractNameParts(name);

    const user = await User.create({
      email: email.toLowerCase(),
      googleId,
      username,
      profile: {
        avatar: picture,
        firstName,
        lastName,
      },
      emailVerified: true,
      lastLogin: new Date(),
    });

    // Generate JWT tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Save refresh token
    await saveRefreshToken(user, refreshToken, req.get("user-agent"), req.ip);

    res.json({
      success: true,
      message: "Account created successfully",
      data: formatGoogleAuthResponse(user, accessToken, refreshToken),
    });
  } catch (error) {
    console.error("Google OAuth register error:", error);
    throw errors.unauthorized("Invalid or expired Google token");
  }
});

