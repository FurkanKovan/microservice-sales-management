const jwt = require('jsonwebtoken');
const logger = require('./logger');
require('dotenv').config();

const SECRET_KEY = process.env.SECRET_KEY;

// Middleware to authenticate JWT Token
function authenticateToken(req, res, next) {
    const token = req.header('Authorization');
    if (!token) {
        logger.error(`Access denied. No token provided.`);
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    jwt.verify(token.replace('Bearer ', ''), SECRET_KEY, (err, user) => {
        if (err) {
            logger.error(`Access denied. Invalid or expired token.`);
            return res.status(403).json({ error: 'Invalid or expired token.' });
        }
        req.user = user;
        next();
    });
}

// Middleware to authorize based on role
function authorizeRole(roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            logger.error(`Access denied. Unauthorized role.`);
            return res.status(403).json({ error: 'Access denied. Unauthorized role.' });
        }
        next();
    };
}

module.exports = { authenticateToken, authorizeRole };
