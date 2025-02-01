const express = require('express');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');
const { authenticateToken, authorizeRole } = require('./middleware/auth');
const { rateLimiter, securityMiddleware, requestLogger } = require('./middleware/security');
const { validateName, validateEmail, validatePhone } = require('./utils/validators');
const logger = require('./middleware/logger');
const db = require('./utils/db');

dotenv.config();
const app = express();
const PROTOCOL = process.env.PROTOCOL || 'http';
const HOST = process.env.HOST || 'localhost';
const PORT = process.env.PORT || 4001;
const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:3000';

// Security Middleware
app.use(cors());
app.use(securityMiddleware);
app.use(requestLogger);
app.use(rateLimiter);

app.use(express.json());

// Create Customer
app.post('/customers', authenticateToken, authorizeRole(['admin', 'manager', 'sales_rep']), (req, res) => {
    const { name, email, phone, company } = req.body;

    // Check all required fields are filled in
    if (!name || !email) {
        logger.warn('Customer creation failed: Missing required fields');
        return res.status(400).json({ error: 'Name and email are required' });
    }

    // Validate name format
    const nameError = validateName(name);
    if (nameError) {
        logger.warn(`Customer creation failed: ${nameError}`);
        return res.status(400).json({ error: nameError });
    }

    // Validate email format
    const emailError = validateEmail(email);
    if (emailError) {
        logger.warn(`Customer creation failed: ${emailError}`);
        return res.status(400).json({ error: emailError });
    }

    // Validate phone format
    if (phone) {
        const phoneError = validatePhone(phone);
        if (phoneError) {
            logger.warn(`Customer creation failed: ${phoneError}`);
            return res.status(400).json({ error: phoneError });
        }
    }
    
    // Test if customer already exists in db with same email
    db.get('SELECT id, name, email FROM customers WHERE email = ?', [email], async (err, customer) => {
        if (err) {
            logger.error(`Database Error: ${err.message}`);
            return res.status(500).json({ error: 'Database error' });
        } else if (customer) {
            logger.warn('Customer creation failed: A customer already exists in db with same email');
            return res.status(400).json({ error: 'Another customer already exists with this email' });
        }
        // Create the new customer in db
        const query = 'INSERT INTO customers (name, email, phone, company) VALUES (?, ?, ?, ?)';
        db.run(query, [name, email, phone, company], function(err) {
            if (err) {
                logger.error(`Database Error: ${err.message}`);
                return res.status(500).json({ error: err.message });
            }
            logger.info(`Customer created: ID ${this.lastID}, Name: ${name}, Email: ${email}, Phone: ${phone}, Company: ${company}`);
            res.status(201).json({ message:"Customer creation succesfull", 
                                   customer: { id: this.lastID, name, email, phone, company } 
                                });
        });
    });
});

// Get All Customers
app.get('/customers', authenticateToken, authorizeRole(['admin', 'manager', 'sales_rep']), (req, res) => {
    let { page, limit, name, email, phone, company, sortBy, sortOrder, updated_at, created_at } = req.query;

    // Default pagination values
    page = Math.abs(parseInt(page)) || 1;
    limit = Math.abs(parseInt(limit)) || 10;
    const offset = (page - 1) * limit;

    // Default sorting
    sortBy = sortBy || 'name'; // Default sort field
    sortOrder = sortOrder && sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'; // Default sort order is ascending

    // Validate sortBy field
    const validSortFields = ['id', 'name', 'email', 'phone', 'company', 'created_at', 'updated_at'];
    if (!validSortFields.includes(sortBy.toLocaleLowerCase())) {
        return res.status(400).json({ error: `Invalid sortBy field. Must be one of: ${validSortFields.join(', ')}` });
    }
    
    // Query and parameters
    let baseQuery = 'SELECT id, name, email, phone, company, created_at, updated_at FROM customers WHERE 1=1';
    let countQuery = `SELECT COUNT(*) AS total FROM customers WHERE 1=1`;
    let filterParams = [];

    if (name) {
        baseQuery += ' AND name LIKE ?';
        countQuery += ' AND name LIKE ?';
        filterParams.push(`%${name}%`);
    }

    if (email) {
        baseQuery += ' AND email LIKE ?';
        countQuery += ' AND email LIKE ?';
        filterParams.push(`%${email}%`);
    }

    if (phone) {
        baseQuery += ' AND phone LIKE ?';
        countQuery += ' AND phone LIKE ?';
        filterParams.push(`%${phone}%`);
    }

    if (company) {
        baseQuery += ' AND company LIKE ?';
        countQuery += ' AND company LIKE ?';
        filterParams.push(`%${company}%`);
    }
    
    if (updated_at) {
        baseQuery += ' AND updated_at LIKE ?';
        countQuery += ' AND updated_at LIKE ?';
        filterParams.push(`%${updated_at}%`);
    }

    if (created_at) {
        baseQuery += ' AND created_at LIKE ?';
        countQuery += ' AND created_at LIKE ?';
        filterParams.push(`%${created_at}%`);
    }

    // Sorting and pagination
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
            logger.info(`Fetched ${rows.length} customers`);
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

// Get Customer by ID
app.get('/customers/:id', authenticateToken, authorizeRole(['admin', 'manager', 'sales_rep']), (req, res) => {
    const { id } = req.params;
    const query = 'SELECT id, name, email, phone, company FROM customers WHERE id = ?';
    db.get(query, [id], (err, customer) => {
        if (err) {
            logger.error(`Database Error: ${err.message}`);
            return res.status(500).json({ error: err.message });
        } else if (!customer) {
            logger.warn(`Customer with ID ${id} not found`);
            return res.status(404).json({ error: 'Customer not found' });
        }
        logger.info(`Fetched customer details for ID ${id}`);
        res.json({ message: "Customer fetch successful", customer: customer });
    });
});

// Update Customer
app.put('/customers/:id', authenticateToken, authorizeRole(['admin', 'manager', 'sales_rep']), (req, res) => {
    const { id } = req.params;
    let { name, email, phone, company } = req.body;
    
    // Check customer exists in db
    db.get('SELECT id, name, email, phone, company FROM customers WHERE id = ?', [id], (err, customer) => {
        if (err) {
            logger.error(`Database Error: ${err.message}`);
            return res.status(500).json({ error: 'Database error' });
        } else if (!customer) {
            logger.warn(`Update customer failed: Customer not found in db`);
            return res.status(400).json({ error: 'Customer not found' });
        }
        // Validate name format
        if (name) {
            const nameError = validateName(name);
            if (nameError) {
                logger.warn(`Customer creation failed: ${nameError}`);
                return res.status(400).json({ error: nameError });
            }
        } else {
            name = customer.name
        }
        // Validate email format
        if (email) {
            const emailError = validateEmail(email);
            if (emailError) {
                logger.warn(`Customer creation failed: ${emailError}`);
                return res.status(400).json({ error: emailError });
            }
        } else {
            email = customer.email
        }
        // Validate phone format
        if (phone) {
            const phoneError = validatePhone(phone);
            if (phoneError) {
                logger.warn(`Customer creation failed: ${phoneError}`);
                return res.status(400).json({ error: phoneError });
            }
        } else {
            phone = customer.phone
        }
        // Check company field provided 
        if (!company) {
            company = customer.company
        }

        // Update customer
        const query = 'UPDATE customers SET name = ?, email = ?, phone = ?, company = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
        db.run(query, [name, email, phone, company, id], function(err) {
            if (err) {
                logger.error(`Database Error: ${err.message}`);
                return res.status(500).json({ error: err.message });
            }
            logger.info(`Customer updated: ID ${id}, Name: ${name}, Email: ${email}, Phone: ${phone}, Company: ${company}`);
            res.json({ message: 'Customer updated successfully', customer: customer });
        });
    });
    
});

// Delete Customer
app.delete('/customers/:id', authenticateToken, authorizeRole(['admin', 'manager']), (req, res) => {
    const { id } = req.params;

    // Check customer exists in db
    db.get('SELECT id, name, email, phone, company FROM customers WHERE id = ?', [id], (err, customer) => {
        if (err) {
            logger.error(`Database Error: ${err.message}`);
            return res.status(500).json({ error: 'Database error' });
        } else if (!customer) {
            logger.warn(`Delete customer failed: Customer not found in db`);
            return res.status(400).json({ error: 'Customer not found' });
        }
        // Delete customer
        const query = 'DELETE FROM customers WHERE id = ?';
        db.run(query, [id], function(err) {
            if (err) {
                logger.error(`Database Error: ${err.message}`);
                return res.status(500).json({ error: err.message });
            }
            logger.info(`Customer deleted successfully ID ${id}`);
            res.json({ message: 'Customer deleted successfully', customer: customer });
        });
    });
});

// Add Note to Customer
app.post('/customers/:id/notes', authenticateToken, authorizeRole(['admin', 'manager', 'sales_rep']), (req, res) => {
    const { id } = req.params;
    const { note } = req.body;

    if (!note) {
        logger.warn(`Note creation failed for customer ID ${id}: Missing note content`);
        return res.status(400).json({ error: 'Note content is required' });
    }
    
    // Check customer exists in db
    db.get('SELECT id, name, email, phone, company FROM customers WHERE id = ?', [id], (err, customer) => {
        if (err) {
            logger.error(`Database Error: ${err.message}`);
            return res.status(500).json({ error: 'Database error' });
        } else if (!customer) {
            logger.warn(`Add note failed: Customer not found in db`);
            return res.status(400).json({ error: 'Customer not found' });
        }
        // Add note
        const query = 'INSERT INTO customer_notes (customer_id, note) VALUES (?, ?)';
        db.run(query, [id, note], function(err) {
            if (err) {
                logger.error(`Database Error: ${err.message}`);
                return res.status(500).json({ error: err.message });
            }
            logger.info(`Note added for customer ID ${id}: Note ID ${this.lastID}`);
            res.status(201).json({ message: "Note added successfully", id: this.lastID, customer_id: id, note: note });
        });

    }); 
});

// Get Notes for a Customer
app.get('/customers/:id/notes', authenticateToken, authorizeRole(['admin', 'manager', 'sales_rep']), (req, res) => {
    const { id } = req.params;
    let { page, limit, sortBy, sortOrder, content } = req.query;

    // Default pagination values
    page = Math.abs(parseInt(page)) || 1;
    limit = Math.abs(parseInt(limit)) || 10;
    const offset = (page - 1) * limit;
    
    // Default sorting
    sortBy = sortBy || 'created_at'; // Default sort field
    sortOrder = sortOrder === 'desc' ? 'DESC' : 'ASC'; // Default sort order is ascending

    // Validate sortBy field
    const validSortFields = ['created_at', 'updated_at', 'content'];
    if (!validSortFields.includes(sortBy)) {
        return res.status(400).json({ error: `Invalid sortBy field. Must be one of: ${validSortFields.join(', ')}` });
    }

    // Base query and parameters for filtering
    let baseQuery = 'SELECT * FROM customer_notes WHERE customer_id = ?';
    const filterParams = [id];

    if (content) {
        baseQuery += ' AND note LIKE ?';
        filterParams.push(`%${content}%`);
    }

    // Sorting and pagination
    const paginatedQuery = `${baseQuery} ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
    const paginatedParams = [...filterParams, limit, offset];

    // No pagination for count
    const countQuery = 'SELECT COUNT(*) AS total FROM customer_notes WHERE customer_id = ?';
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
            logger.info(`Fetched ${rows.length} notes for customer ID ${id}`);
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

// Update a Note
app.put('/customers/:id/notes/:noteId', authenticateToken, authorizeRole(['admin', 'manager', 'sales_rep']), (req, res) => {
    const { id, noteId } = req.params;
    const { note } = req.body;

    if (!note) {
        logger.warn(`Note update failed: Missing updated content for Note ID ${noteId}`);
        return res.status(400).json({ error: 'Updated note content is required' });
    }

    // Check customer exists in db
    db.get('SELECT id, name, email, phone, company FROM customers WHERE id = ?', [id], (err, customer) => {
        if (err) {
            logger.error(`Database Error: ${err.message}`);
            return res.status(500).json({ error: 'Database error' });
        } else if (!customer) {
            logger.warn(`Delete customer failed: Customer not found in db`);
            return res.status(400).json({ error: 'Customer not found' });
        }
        // Check if the note exists for the customer
        db.get('SELECT id FROM customer_notes WHERE id = ? AND customer_id = ?', [noteId, id], (err, oldNote) => {
            if (err) {
                logger.error(`Database Error: ${err.message}`);
                return res.status(500).json({ error: 'Database error' });
            } else if (!oldNote) {
                logger.warn(`Update note failed: Note not found for customer ID ${id}`);
                return res.status(400).json({ error: `Note not found for the specified customer ID ${id}` });
            }
            // Update note
            const query = 'UPDATE customer_notes SET note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
            db.run(query, [note, noteId], function(err) {
                if (err) {
                    logger.error(`Database Error: ${err.message}`);
                    return res.status(500).json({ error: err.message });
                }
                logger.info(`Note updated: Note ID ${noteId}`);
                res.json({ message: 'Note updated successfully' });
            });
        });
    });
});

// Delete a Note
app.delete('/customers/:id/notes/:noteId', authenticateToken, authorizeRole(['admin', 'manager']), (req, res) => {
    const { id, noteId } = req.params;

    // Check customer exists in db
    db.get('SELECT id, name, email, phone, company FROM customers WHERE id = ?', [id], (err, customer) => {
        if (err) {
            logger.error(`Database Error: ${err.message}`);
            return res.status(500).json({ error: 'Database error' });
        } else if (!customer) {
            logger.warn(`Delete customer failed: Customer not found in db`);
            return res.status(400).json({ error: 'Customer not found' });
        }
        // Check if the note exists for the customer
        db.get('SELECT id FROM customer_notes WHERE id = ? AND customer_id = ?', [noteId, id], (err, oldNote) => {
            if (err) {
                logger.error(`Database Error: ${err.message}`);
                return res.status(500).json({ error: 'Database error' });
            } else if (!oldNote) {
                logger.warn(`Delete note failed: Note not found for customer ID ${id}`);
                return res.status(400).json({ error: `Note not found for the specified customer ID ${id}` });
            }
            const query = 'DELETE FROM customer_notes WHERE id = ?';
            db.run(query, [noteId], function(err) {
                if (err) {
                    logger.error(`Database Error: ${err.message}`);
                    return res.status(500).json({ error: err.message });
                }
                logger.info(`Note deleted: Note ID ${noteId} for customer ID ${id}`);
                res.json({ message: 'Note deleted successfully' });
            });
        });
    });
});

app.listen(PORT, () => {
    const url = API_GATEWAY_URL + "/register";

    axios({
        method: 'POST',
        url: url,
        headers: {'Content-Type': 'application/json'},
        data: {
            apiName: "customermanagement",
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
        logger.info(`Customer Management Service running on port ${PORT}`);
        console.log(`Customer Management Service running on port ${PORT}`);
    }
});
