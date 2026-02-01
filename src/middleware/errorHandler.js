// src/middleware/errorHandler.js

/**
 * Custom Error Class
 */
class ApiError extends Error {
  constructor(statusCode, message, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error Response Builder
 */
const errorResponse = (err, req, res) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";

  const response = {
    success: false,
    message,
    statusCode,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method,
  };

  // Add validation errors if present
  if (err.errors) {
    response.errors = err.errors;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV === "development") {
    response.stack = err.stack;
  }

  return response;
};

/**
 * MongoDB Error Handler
 */
const handleMongoError = (err) => {
  // Duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return new ApiError(400, `${field} already exists`);
  }

  // Validation error
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return new ApiError(400, "Validation failed", errors);
  }

  // Cast error (invalid ObjectId)
  if (err.name === "CastError") {
    return new ApiError(400, `Invalid ${err.path}: ${err.value}`);
  }

  return err;
};

/**
 * JWT Error Handler
 */
const handleJWTError = (err) => {
  if (err.name === "JsonWebTokenError") {
    return new ApiError(401, "Invalid token");
  }

  if (err.name === "TokenExpiredError") {
    return new ApiError(401, "Token expired");
  }

  return err;
};

/**
 * Global Error Handler Middleware
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode;

  // Log error for debugging
  console.error("Error:", {
    message: err.message,
    statusCode: err.statusCode,
    path: req.originalUrl,
    method: req.method,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });

  // Handle different error types
  if (
    err.name === "ValidationError" ||
    err.code === 11000 ||
    err.name === "CastError"
  ) {
    error = handleMongoError(err);
  }

  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    error = handleJWTError(err);
  }

  // Send error response
  res.status(error.statusCode || 500).json(errorResponse(error, req, res));
};

/**
 * Async Error Wrapper
 * Wraps async route handlers to catch errors
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 Not Found Handler
 */
const notFound = (req, res, next) => {
  const error = new ApiError(404, `Route ${req.originalUrl} not found`);
  next(error);
};

/**
 * Common Error Creators
 */
const errors = {
  badRequest: (message = "Bad request", errors = null) =>
    new ApiError(400, message, errors),

  unauthorized: (message = "Unauthorized") => new ApiError(401, message),

  forbidden: (message = "Forbidden") => new ApiError(403, message),

  notFound: (message = "Resource not found") => new ApiError(404, message),

  conflict: (message = "Conflict") => new ApiError(409, message),

  unprocessable: (message = "Unprocessable entity", errors = null) =>
    new ApiError(422, message, errors),

  internal: (message = "Internal server error") => new ApiError(500, message),

  notImplemented: (message = "Not implemented") => new ApiError(501, message),
};

module.exports = {
  ApiError,
  errorHandler,
  asyncHandler,
  notFound,
  errors,
};
