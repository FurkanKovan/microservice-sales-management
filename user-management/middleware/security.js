const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');

// Security headers
const securityMiddleware = helmet();

// Logging middleware
const requestLogger = morgan('combined');

// Rate Limiting middleware
const rateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});

module.exports = { securityMiddleware, requestLogger, rateLimiter };
