const express = require('express');
const axios = require('axios');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { authenticateToken, authorizeRole, authorizeSelfOrRole } = require('./middleware/auth');
const { rateLimiter, securityMiddleware, requestLogger } = require('./middleware/security');
const { validateName, validateEmail, validatePassword } = require('./utils/validators');
const logger = require('./middleware/logger');
const db = require('./utils/db');
require('dotenv').config();
const app = express();
const PROTOCOL = process.env.PROTOCOL || 'http';
const HOST = process.env.HOST || 'localhost';
const PORT = process.env.PORT || 3001;
const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:3000';
const SECRET_KEY = process.env.SECRET_KEY;
const BCRYPT_SALT = Number(process.env.BCRYPT_SALT) || 10;

// Security Middleware
app.use(cors());
app.use(securityMiddleware);
app.use(requestLogger);
app.use(rateLimiter);

app.use(express.json());

// Create New User
app.post('/create', async (req, res) => {
    const { name, email, password, role } = req.body;

    // Check all required fields are filled in
    if (!name || !email || !password || !role) {
        logger.warn('User creation failed: Missing required fields');
        return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Validate name format
    const nameError = validateName(name);
    if (nameError) {
        logger.warn(`User creation failed: ${nameError}`);
        return res.status(400).json({ error: nameError });
    }

    // Validate email format
    const emailError = validateEmail(email);
    if (emailError) {
        logger.warn(`User creation failed: ${emailError}`);
        return res.status(400).json({ error: emailError });
    }

    // Validate password format
    const passwordError = validatePassword(password);
    if (passwordError) {
        logger.warn(`User creation failed: ${passwordError}`);
        return res.status(400).json({ error: passwordError });
    }

    // Check if role is valid
    const roles = ['admin', 'manager', 'sales_rep', 'customer']
    if (!roles.includes(role)) {
        logger.warn('User creation failed: Invalid role specified');
        return res.status(400).json({ error: 'Invalid role specified' });
    }
    
    // Test if user already exists in db with same email
    db.get('SELECT id, name, email, role FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) {
            logger.error(`Database Error: ${err.message}`);
            return res.status(500).json({ error: 'Database error' });
        } else if (user) {
            logger.warn('User creation failed: A user already exists in db with same email');
            return res.status(400).json({ error: 'Another user already exists with this email' });
        }
        // Create the new user in db
        const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT);
        const query = 'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)';
        db.run(query, [name, email, hashedPassword, role], function(err) {
            if (err) {
                logger.error(`Database Error: ${err.message}`);
                return res.status(500).json({ error: err.message });
            }
            logger.info(`User created: ID ${this.lastID}, Name: ${name}, Role: ${role}`);
            res.status(201).json({ message: "User creation successful", 
                                   user: { id: this.lastID, name, email, role }
                                });
        });
    });
});

// Login User
app.post('/login', async (req, res) => {
    let { email, password } = req.body;

    // Check required fields for login
    if (!email || !password) {
        logger.warn('User login failed: Missing required fields');
        return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const query = 'SELECT * FROM users WHERE email = ?';
    db.get(query, [email], async (err, user) => {
        if (err || !user) {
            logger.warn('User login failed: Invalid user');
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            logger.warn('User login failed: Invalid password');
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign({ id: user.id, role: user.role }, SECRET_KEY, { expiresIn: '1h' });
        logger.info(`Successful user login: ID ${user.id}, Role: ${user.role}`);
        console.log(`Successful user login: ID ${user.id}, Role: ${user.role}`);
        res.status(200).json({ message: "User login successful",
                   user: { id: user.id, name: user.name, email: user.email, role: user.role },
                   token
                });
    });
});

// Get Users (Admin & Manager Only)
app.get('/users', authenticateToken, authorizeRole(['admin', 'manager']), (req, res) => {
    let { page, limit, role, id, name, sortBy, sortOrder, updated_at, created_at } = req.query;

    // Default pagination values
    page = Math.abs(parseInt(page)) || 1;
    limit = Math.abs(parseInt(limit)) || 10;
    const offset = (page - 1) * limit;

    // Default sorting
    sortBy = sortBy || 'name'; // Default sort field
    sortOrder = sortOrder && sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'; // Default sort order is ascending

    // Validate sortBy field
    const validSortFields = ['id', 'name', 'role', 'created_at', 'updated_at'];
    if (!validSortFields.includes(sortBy.toLocaleLowerCase())) {
        return res.status(400).json({ error: `Invalid sortBy field. Must be one of: ${validSortFields.join(', ')}` });
    }

    // Query with filters
    let baseQuery = 'SELECT id, name, email, role, created_at, updated_at FROM users WHERE 1=1';
    let countQuery = `SELECT COUNT(*) AS total FROM users WHERE 1=1`;
    let filterParams = [];

    // Filtering for role
    if (role) {
        baseQuery += ' AND role = ?';
        countQuery += ' AND role = ?';
        filterParams.push(role);
    }

    // Filtering for name
    if (name) {
        baseQuery += ' AND name LIKE ?';
        countQuery += ' AND name LIKE ?';
        filterParams.push(`%${name}%`);
    }

    // Filtering for updated date-time
    if (updated_at) {
        baseQuery += ' AND updated_at LIKE ?';
        countQuery += ' AND updated_at LIKE ?';
        filterParams.push(`%${updated_at}%`);
    }

    // Filtering for created date-time
    if (created_at) {
        baseQuery += ' AND created_at LIKE ?';
        countQuery += ' AND created_at LIKE ?';
        filterParams.push(`%${created_at}%`);
    }

    // Pagination
    const paginatedQuery = `${baseQuery} ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
    const paginatedParams = [...filterParams, limit, offset];

    // No pagination for count
    const countQueryParams = [...filterParams];

    db.get(countQuery, countQueryParams, (err, countResult) => {
        if (err) {
            logger.error(`Database Error (Count): ${err.message}`);
            return res.status(500).json({ error: err.message });
        }
        db.all(paginatedQuery, paginatedParams, (err, rows) => {
            if (err) {
                logger.error(`Database Error: ${err.message}`);
                return res.status(500).json({ error: err.message });
            }
            logger.info(`Fetched ${rows.length} users`);
            res.json({
                total: countResult.total,
                page,
                limit,
                totalPages: Math.ceil(countResult.total / limit),
                data: rows
            });
        });
    });
});

// Get User by ID (Admin & Manager Only)
app.get('/users/:id', authenticateToken, authorizeRole(['admin', 'manager']), (req, res) => {
    const { id } = req.params;
    const query = 'SELECT id, name, email, role FROM users WHERE id = ?';
    db.get(query, [id], (err, user) => {
        if (err) {
            logger.error(`Database Error: ${err.message}`);
            return res.status(500).json({ error: err.message });
        } else if (!user) {
            logger.warn('Get user by id failed: User not found');
            return res.status(404).json({ error: 'User not found' });
        }
        logger.info(`Fetched user details for ID ${id}`);
        res.json({ message: "User fetch successful", user: user });
    });
});

// Update User (Admin & Manager Only)
app.put('/users/:id', authenticateToken, authorizeRole(['admin', 'manager']), (req, res) => {
    const { id } = req.params;
    let { name, email, role } = req.body;

    // Check user exists in db
    db.get('SELECT id, name, email, role FROM users WHERE id = ?', [id], (err, user) => {
        if (err) {
            logger.error(`Database Error: ${err.message}`);
            return res.status(500).json({ error: 'Database error' });
        } else if (!user) {
            logger.warn(`Delete user failed: User not found in db`);
            return res.status(400).json({ error: 'User not found' });
        }
        // Validate name format
        if (name) {
            const nameError = validateName(name);
            if (nameError) {
                logger.warn(`User update failed: ${nameError}`);
                return res.status(400).json({ error: nameError });
            }
        } else {
            name = user.name
        }
        // Validate email format
        if (email) {
            const emailError = validateEmail(email);
            if (emailError) {
                logger.warn(`User update failed: ${emailError}`);
                return res.status(400).json({ error: emailError });
            }
        } else {
            email = user.email
        }
        // Check if role is valid
        if (role) {
            const roles = ['admin', 'manager', 'sales_rep', 'customer']
            if (!roles.includes(role)) {
                logger.warn('Invalid role specified');
                return res.status(400).json({ error: 'Invalid role specified' });
            }
        } else {
            role = user.role
        }
        // Update user
        const query = 'UPDATE users SET name = ?, email = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
        db.run(query, [name, email, role, id], function(err) {
            if (err) {
                logger.error(`Database Error: ${err.message}`);
                return res.status(500).json({ error: err.message });
            }
            logger.info(`User updated successfully ID ${id} Name: ${name}, Email: ${email}, Role: ${role}`);
            res.json({ message: 'User updated successfully' });
        });
    });
});

// Update Password (Self Only)
app.put('/users/:id/reset-password', authenticateToken, authorizeSelfOrRole([]), async (req, res) => {
    const { id } = req.params;
    const { oldPassword, newPassword } = req.body;
    
    if (!oldPassword || !newPassword) {
        logger.warn('Password update failed: Old and new passwords are required');
        return res.status(400).json({ error: 'Both old and new passwords are required' });
    }

    // Validate password format
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
        logger.warn(`Password update failed: ${passwordError}`);
        return res.status(400).json({ error: passwordError });
    }
    
    // Check user exists in db
    const query = 'SELECT password FROM users WHERE id = ?';
    db.get(query, [id], async (err, user) => {
        if (err) {
            logger.error(`Database Error: ${err.message}`);
            return res.status(500).json({ error: err.message });
        } else if (!user) {
            logger.warn('Password update failed: User not found');
            return res.status(404).json({ error: 'User not found' });
        }
        
        const validPassword = await bcrypt.compare(oldPassword, user.password);
        if (!validPassword) {
            logger.warn('Password update failed: Old password is incorrect');
            return res.status(401).json({ error: 'Old password is incorrect' });
        }
        // Update password
        const hashedNewPassword = await bcrypt.hash(newPassword, BCRYPT_SALT);
        const updateQuery = 'UPDATE users SET password = ? WHERE id = ?';
        db.run(updateQuery, [hashedNewPassword, id], function(err) {
            if (err) {
                logger.error(`Database Error: ${err.message}`);
                return res.status(500).json({ error: err.message });
            }
            logger.info(`Successful password update: ID ${id}`);
            res.json({ message: 'Password updated successfully' });
        });
    });
});

// Delete User (Admin Only)
app.delete('/users/:id', authenticateToken, authorizeRole(['admin']), (req, res) => {
    const { id } = req.params;

    // Check user exists in db
    db.get('SELECT id, name, email, role FROM users WHERE id = ?', [id], (err, user) => {
        if (err) {
            logger.error(`Database Error: ${err.message}`);
            return res.status(500).json({ error: 'Database error' });
        } else if (!user) {
            logger.warn(`Delete user failed: User not found in db`);
            return res.status(400).json({ error: 'User not found' });
        }
        // Delete user
        const query = 'DELETE FROM users WHERE id = ?';
        db.run(query, [id], function(err) {
            if (err) {
                logger.error(`Database Error: ${err.message}`);
                return res.status(500).json({ error: err.message });
            }
            logger.info(`User deleted successfully ID ${id}`);
            res.json({ message: 'User deleted successfully', user: user });
        });
    });
});

// Update User (Self or Admin Only)
app.put('/users/:id', authenticateToken, authorizeSelfOrRole(['admin']), (req, res) => {
    const { id } = req.params;
    let { name, email, role } = req.body;

    // Check user exists in db
    db.get('SELECT id, name, email, role FROM users WHERE id = ?', [id], (err, user) => {
        if (err) {
            logger.error(`Database Error: ${err.message}`);
            return res.status(500).json({ error: 'Database error' });
        } else if (!user) {
            logger.warn(`Delete user failed: User not found in db`);
            return res.status(400).json({ error: 'User not found' });
        }
        // Validate name format
        if (name) {
            const nameError = validateName(name);
            if (nameError) {
                logger.warn(`User update failed: ${nameError}`);
                return res.status(400).json({ error: nameError });
            }
        } else {
            name = user.name
        }
        // Validate email format
        if (email) {
            const emailError = validateEmail(email);
            if (emailError) {
                logger.warn(`User update failed: ${emailError}`);
                return res.status(400).json({ error: emailError });
            }
        } else {
            email = user.email
        }
        // Check if role is valid
        if (role) {
            const roles = ['admin', 'manager', 'sales_rep', 'customer']
            if (!roles.includes(role)) {
                logger.warn('Invalid role specified');
                return res.status(400).json({ error: 'Invalid role specified' });
            }
        } else {
            role = user.role
        }
        // Update user
        const query = 'UPDATE users SET name = ?, email = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
        db.run(query, [name, email, role, id], function(err) {
            if (err) {
                logger.error(`Database Error: ${err.message}`);
                return res.status(500).json({ error: err.message });
            }
            logger.info(`User updated successfully ID ${id} Name: ${name}, Email: ${email}, Role: ${role}`);
            res.json({ message: 'User updated successfully' });
        });
    });
});

/*
// Delete User (Self or Admin Only)
app.delete('/users/:id', authenticateToken, authorizeSelfOrRole(['admin']), (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM users WHERE id = ?';

    // Check user exists in db
    db.get('SELECT id, name, email, role FROM users WHERE id = ?', [id], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }
        // Delete user
        db.run(query, [id], function(err) {
            if (err) {
                logger.error(`Database Error: ${err.message}`);
                return res.status(500).json({ error: err.message });
            }
            logger.info(`User deleted successfully ID ${id}`);
            res.json({ message: 'User deleted successfully' });
        });
    });
});
*/

app.listen(PORT, () => {
    // Send a service registration request to gateway which holds record of api services under routes/registry.json
    const url = API_GATEWAY_URL + "/register";
    axios({
        method: 'POST',
        url: url,
        headers: {'Content-Type': 'application/json'},
        data: {
            apiName: "usermanagement",
            protocol: PROTOCOL,
            host: HOST,
            port: PORT
        }
    }).then((response) => {
        logger.info(response.data);
        console.log(response.data);
    }).catch((error) => {
        if (error.response) {
            // Server responded with a status other than 2xx
            logger.error('Response error:', error.response.status, error.response.data);
            console.error('Response error:', error.response.status, error.response.data);
        } else if (error.request) {
            // Request was made but no response received
            logger.error(`No response received from ${url}`);
            console.error(`No response received from ${url}`);
        } else {
            // Something else happened during the request
            logger.error('Error:', error.message);
            console.error('Error:', error.message);
        }
    });
    if (process.env.NODE_ENV !== 'test') {
        logger.info(`User Management Service running on port ${PORT}`);
        console.log(`User Management Service running on port ${PORT}`);
    }
});

module.exports = app;
