const jwt = require('jsonwebtoken');
const logger = require('./logger');
require('dotenv').config();

const SECRET_KEY = process.env.SECRET_KEY;

// Authenticate JWT Token
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

// Authorize based on role
function authorizeRole(roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            logger.error(`Access denied. Unauthorized role.`);
            return res.status(403).json({ error: 'Access denied. Unauthorized role.' });
        }
        next();
    };
}

// Check if the user is updating their own account
function authorizeSelfOrRole(roles) {
    return (req, res, next) => {
        const userId = parseInt(req.params.id, 10);
        if (!req.user || (req.user.id !== userId && !roles.includes(req.user.role))) {
            logger.error(`Access denied. Unauthorized action.`);
            return res.status(403).json({ error: 'Access denied. Unauthorized action.' });
        }
        next();
    };
}

module.exports = { authenticateToken, authorizeRole, authorizeSelfOrRole };
