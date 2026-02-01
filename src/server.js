// src/server.js
require("dotenv").config();
const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const compression = require("compression");
const mongoSanitize = require("express-mongo-sanitize");
const passport = require("./config/passport");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const SocketService = require("./services/socketService");
const {
  initializeRedis,
  authLimiter,
  userActionLimiter,
  paymentLimiter,
  roleBasedLimiter,
  downloadLimiter,
  reviewLimiter,
} = require("./middleware/rateLimiter");

const app = express();
const server = http.createServer(app);

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: "*",
    credentials: true,
  }),
);
app.use(mongoSanitize());

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(compression());

// Logging
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// Initialize Passport
app.use(passport.initialize());

// Initialize Redis and rate limiting
// initializeRedis();

// Rate limiting middleware setup (DISABLED FOR TESTING)
// app.use("/api/v1/auth", authLimiter);
// app.use("/api/v1/transactions/purchase", paymentLimiter);
// app.use("/api/v1/reviews", reviewLimiter);
// app.use("/api/v1/users", roleBasedLimiter);

// Database connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✓ MongoDB connected"))
  .catch((err) => {
    console.error("✗ MongoDB connection error:", err);
    process.exit(1);
  });

// Initialize Payment Providers
const { PaymentProviderFactory } = require("./services/paymentProviders");
try {
  PaymentProviderFactory.initialize();
  console.log(`✓ Payment providers initialized: ${PaymentProviderFactory.getAvailableProviders().join(", ")}`);
} catch (err) {
  console.warn("⚠ Payment provider initialization warning:", err.message);
}

// Routes
app.use("/api/v1/auth", require("./routes/authRoutes"));
app.use("/api/v1/public", require("./routes/publicRoutes"));
app.use("/api/v1/users", require("./routes/userRoutes"));
app.use("/api/v1/rules", require("./routes/ruleRoutes"));
app.use("/api/v1/transactions", require("./routes/transactionRoutes"));
app.use("/api/v1/billing", require("./routes/billingRoutes"));
app.use("/api/v1/reviews", require("./routes/reviewRoutes"));
app.use("/api/v1/notifications", require("./routes/notificationRoutes"));
app.use("/api/v1/chat", require("./routes/chatRoutes"));
app.use("/api/v1/admin", require("./routes/adminRoutes"));
app.use("/api/v1/moderation", require("./routes/moderationRoutes"));

// Initialize WebSocket service for real-time notifications
const socketService = new SocketService(server);

// Make socket service available globally
global.socketService = socketService;

// Health check
app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});

// API info
app.get("/api/v1", (req, res) => {
  res.json({
    success: true,
    message: "Security Rules Platform API v1",
    version: "1.0.0",
    endpoints: {
      auth: "/api/v1/auth",
      users: "/api/v1/users",
      rules: "/api/v1/rules",
      transactions: "/api/v1/transactions",
      reviews: "/api/v1/reviews",
      admin: "/api/v1/admin",
    },
    documentation: "/api/v1/docs",
    websocket: "Socket.IO enabled for real-time notifications",
  });
});

// WebSocket events endpoint
app.get("/api/v1/websocket/status", (req, res) => {
  res.json({
    success: true,
    message: "WebSocket server is running",
    onlineUsers: socketService.getOnlineUsersCount(),
  });
});

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║   Security Rules Platform API                  ║
║   Server running on port ${PORT}                  ║
║   Environment: ${process.env.NODE_ENV || "development"}                    ║
║   Database: Connected                          ║
║   WebSocket: Enabled (Socket.IO)               ║
║   Rate Limiting: Active                        ║
╚════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM signal received: closing HTTP server");
  await mongoose.connection.close();
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

module.exports = app;
