const express = require('express');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');
const { authenticateToken, authorizeRole } = require('./middleware/auth');
const { rateLimiter, securityMiddleware, requestLogger } = require('./middleware/security');
const logger = require('./middleware/logger');
const db = require('./utils/db');

dotenv.config();
const app = express();
const PROTOCOL = process.env.PROTOCOL || 'http';
const HOST = process.env.HOST || 'localhost';
const PORT = process.env.PORT || 5001;
const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:3000';

// Security Middleware
app.use(cors());
app.use(securityMiddleware);
app.use(requestLogger);
app.use(rateLimiter);

app.use(express.json());

// Create Sales Entry
app.post('/sales', authenticateToken, authorizeRole(['admin', 'manager', 'sales_rep']), (req, res) => {
    const { customer_id, amount, status } = req.body;
    const validStatuses = ['new', 'on going', 'deal', 'closed'];
    if (!customer_id || !amount || !status || !validStatuses.includes(status)) {
        logger.warn('Sales creation failed: Missing or invalid fields');
        return res.status(400).json({ error: 'Customer ID, amount, and valid status are required' });
    }
    
    const query = 'INSERT INTO sales (customer_id, amount, status) VALUES (?, ?, ?)';
    db.run(query, [customer_id, amount, status], function(err) {
        if (err) {
            logger.error(`Database Error: ${err.message}`);
            return res.status(500).json({ error: err.message });
        }
        logger.info(`Sales entry created: ID ${this.lastID}, Customer ID: ${customer_id}, Amount: ${amount}, Status: ${status}`);
        res.status(201).json({ message: "Sales entry created successfully", 
                               sales_entry: { id: this.lastID, customer_id, amount, status } 
                            });
    });
});

// Get Sales Entries
app.get('/sales', authenticateToken, authorizeRole(['admin', 'manager', 'sales_rep']), (req, res) => {
    let { status, customer_id, sortBy, order, page, limit } = req.query;

    // Default values for pagination
    page = Math.abs(parseInt(page)) || 1;
    limit = Math.abs(parseInt(limit)) || 10;
    const offset = (page - 1) * limit;

    // Default sorting
    sortBy = sortBy || 'created_at'; // Default sort field
    order = order && order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'; // Default sort order is ascending
 
    // Validate sortBy field
    const validSortFields = ['amount', 'created_at', 'updated_at'];
    if (!validSortFields.includes(sortBy)) {
        return res.status(400).json({ error: `Invalid sortBy field. Must be one of: ${validSortFields.join(', ')}` });
    }

    // Base query and parameters for filtering
    let baseQuery = 'SELECT * FROM sales WHERE 1=1';
    const filterParams = [];

    if (status) {
        baseQuery += ' AND status = ?';
        filterParams.push(status);
    }

    if (customer_id) {
        baseQuery += ' AND customer_id = ?';
        filterParams.push(customer_id);
    }

    // Add sorting and pagination to the query
    const paginatedQuery = `${baseQuery} ORDER BY ${sortBy} ${order} LIMIT ? OFFSET ?`;
    const paginatedParams = [...filterParams, limit, offset];

    // Count query for total sales (ignores pagination)
    const countQuery = 'SELECT COUNT(*) AS total FROM sales WHERE 1=1';
    const countQueryParams = [...filterParams];

    // Get Sales
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
            logger.info(`Fetched ${rows.length} sales entries`);
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

// Update Sales Entry
app.put('/sales/:id', authenticateToken, authorizeRole(['admin', 'manager', 'sales_rep']), (req, res) => {
    const { id } = req.params;
    const { amount, status } = req.body;
    const validStatuses = ['new', 'on going', 'deal', 'closed'];
    if (!amount || !status || !validStatuses.includes(status)) {
        logger.warn('Sales update failed: Missing or invalid fields');
        return res.status(400).json({ error: 'Amount and a valid status are required' });
    }
    
    // Check if sales entry exists in db
    db.get('SELECT id, customer_id, amount, status FROM sales WHERE id = ?', [id], (err, sale) => {
        if (err) {
            logger.error(`Database Error: ${err.message}`);
            return res.status(500).json({ error: 'Database error' });
        } else if (!sale) {
            logger.warn(`Update sales entry failed: Sales entry not found in db`);
            return res.status(400).json({ error: 'Sales entry not found' });
        }
        // Update sales entry
        const query = 'UPDATE sales SET amount = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
        db.run(query, [amount, status, id], function(err) {
            if (err) {
                logger.error(`Database Error: ${err.message}`);
                return res.status(500).json({ error: err.message });
            }
            logger.info(`Sales entry updated: ID ${id}, Amount: ${amount}, Status: ${status}`);
            res.json({ message: 'Sales entry updated successfully' });
        });
    });
});

// Delete Sales Entry
app.delete('/sales/:id', authenticateToken, authorizeRole(['admin', 'manager']), (req, res) => {
    const { id } = req.params;

    // Check if sales entry exists in db
    db.get('SELECT id, customer_id, amount, status FROM sales WHERE id = ?', [id], (err, sale) => {
        if (err) {
            logger.error(`Database Error: ${err.message}`);
            return res.status(500).json({ error: 'Database error' });
        } else if (!sale) {
            logger.warn(`Delete sales entry failed: Sales entry not found in db`);
            return res.status(400).json({ error: 'Sales entry not found' });
        }
        // Delete sales entry
        const query = 'DELETE FROM sales WHERE id = ?';
        db.run(query, [id], function(err) {
            if (err) {
                logger.error(`Database Error: ${err.message}`);
                return res.status(500).json({ error: err.message });
            }
            logger.info(`Sales entry deleted: ID ${id}`);
            res.json({ message: 'Sales entry deleted successfully' });
        });
    });
});

// Add Note to Sale
app.post('/sales/:id/notes', authenticateToken, authorizeRole(['admin', 'manager', 'sales_rep']), (req, res) => {
    const { id } = req.params;
    const { note } = req.body;
    
    if (!note) {
        logger.warn(`Sale note creation failed for Sale ID ${id}: Missing note content`);
        return res.status(400).json({ error: 'Note content is required' });
    }

    // Check if sales entry exists in db
    db.get('SELECT id, customer_id, amount, status FROM sales WHERE id = ?', [id], (err, sale) => {
        if (err) {
            logger.error(`Database Error: ${err.message}`);
            return res.status(500).json({ error: 'Database error' });
        } else if (!sale) {
            logger.warn(`Add note to sales entry failed: Sales entry not found in db`);
            return res.status(400).json({ error: 'Sales entry not found' });
        }
        // Add note
        const query = 'INSERT INTO sales_notes (sale_id, note) VALUES (?, ?)';
        db.run(query, [id, note], function(err) {
            if (err) {
                logger.error(`Database Error: ${err.message}`);
                return res.status(500).json({ error: err.message });
            }
            logger.info(`Note added to Sale ID ${id}: Note ID ${this.lastID}`);
            res.status(201).json({ message: "Note added successfully", id: this.lastID, sale_id: id, note: note });
        });
    });
});

// Get Sales Notes
app.get('/sales/:id/notes', authenticateToken, authorizeRole(['admin', 'manager', 'sales_rep']), (req, res) => {
    const { id } = req.params;
    let { page, limit, sortBy, order, content } = req.query;

    // Default pagination values
    page = Math.abs(parseInt(page)) || 1;
    limit = Math.abs(parseInt(limit)) || 10;
    const offset = (page - 1) * limit;

    // Default sorting
    sortBy = sortBy || 'created_at'; // Default sort field
    order = order && order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'; // Default sort order is ascending

    // Validate sortBy field
    const validSortFields = ['created_at', 'updated_at', 'content'];
    if (!validSortFields.includes(sortBy)) {
        return res.status(400).json({ error: `Invalid sortBy field. Must be one of: ${validSortFields.join(', ')}` });
    }
    
    // Build base query and parameters for filtering
    let baseQuery = 'SELECT * FROM sales_notes WHERE sale_id = ?';
    let countQuery = 'SELECT COUNT(*) AS total FROM sales_notes WHERE sale_id = ?';
    let filterParams = [id];

    if (content) {
        baseQuery += ' AND note LIKE ?';
        countQuery += ' AND note LIKE ?';
        filterParams.push(`%${content}%`);
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

    // Pagination
    const paginatedQuery = `${baseQuery} ORDER BY ${sortBy} ${order} LIMIT ? OFFSET ?`;
    const paginatedParams = [...filterParams, limit, offset];

    // No pagination for count
    const countQueryParams = [...filterParams];
    
    // Get sales notes
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
            logger.info(`Fetched ${rows.length} notes for Sale ID ${id}`);
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

// Update a Sales Note
app.put('/sales/:id/notes/:noteId', authenticateToken, authorizeRole(['admin', 'manager', 'sales_rep']), (req, res) => {
    const { id, noteId } = req.params;
    const { note } = req.body;

    if (!note) {
        logger.warn(`Sales note update failed: Missing note content for Note ID ${noteId}`);
        return res.status(400).json({ error: 'Updated note content is required' });
    }

    // Check if sales entry exists in db
    db.get('SELECT id, customer_id, amount, status FROM sales WHERE id = ?', [id], (err, sale) => {
        if (err) {
            logger.error(`Database Error: ${err.message}`);
            return res.status(500).json({ error: 'Database error' });
        } else if (!sale) {
            logger.warn(`Update note failed: Sales entry not found in db`);
            return res.status(400).json({ error: 'Sales entry not found' });
        }
        // Check if note exists for the sales entry
        db.get('SELECT id FROM sales_notes WHERE id = ? AND sale_id = ?', [noteId, id], (err, oldNote) => {
            if (err) {
                logger.error(`Database Error: ${err.message}`);
                return res.status(500).json({ error: 'Database error' });
            } else if (!oldNote) {
                logger.warn(`Update note failed: Note not found for sales entry ID ${id}`);
                return res.status(400).json({ error: `Note not found for the specified sales entry ID ${id}` });
            }
            // Update note
            const query = 'UPDATE sales_notes SET note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
            db.run(query, [note, noteId], function(err) {
                if (err) {
                    logger.error(`Database Error: ${err.message}`);
                    return res.status(500).json({ error: err.message });
                }
                logger.info(`Sales note updated: Note ID ${noteId} for sales entry ${id}`);
                res.json({ message: 'Sales note updated successfully' });
            });
        });
    });
});

// Delete a Sales Note
app.delete('/sales/:id/notes/:noteId', authenticateToken, authorizeRole(['admin', 'manager']), (req, res) => {
    const { id, noteId } = req.params;

    // Check if sales entry exists in db
    db.get('SELECT id, customer_id, amount, status FROM sales WHERE id = ?', [id], (err, sale) => {
        if (err) {
            logger.error(`Database Error: ${err.message}`);
            return res.status(500).json({ error: 'Database error' });
        } else if (!sale) {
            logger.warn(`Delete note failed: Sales entry not found in db`);
            return res.status(400).json({ error: 'Sales entry not found' });
        }
        // Check if note exists for the sales entry
        db.get('SELECT id FROM sales_notes WHERE id = ? AND sale_id = ?', [noteId, id], (err, oldNote) => {
            if (err) {
                logger.error(`Database Error: ${err.message}`);
                return res.status(500).json({ error: 'Database error' });
            } else if (!oldNote) {
                logger.warn(`Delete note failed: Note not found for sales entry ID ${id}`);
                return res.status(400).json({ error: `Note not found for the specified sales entry ID ${id}` });
            }
            // Delete note
            const query = 'DELETE FROM sales_notes WHERE id = ?';
            db.run(query, [noteId], function(err) {
                if (err) {
                    logger.error(`Database Error: ${err.message}`);
                    return res.status(500).json({ error: err.message });
                }
                logger.info(`Sales note deleted: Note ID ${noteId}`);
                res.json({ message: 'Sales note deleted successfully' });
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
            apiName: "salestracking",
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
        logger.info(`Sales Tracking Service running on port ${PORT}`);
        console.log(`Sales Tracking Service running on port ${PORT}`);
    }
});
