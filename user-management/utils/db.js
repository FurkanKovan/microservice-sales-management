const sqlite3 = require('sqlite3').verbose();
const logger = require('../middleware/logger');

const db = new sqlite3.Database('./database/user-management.db', (err) => {
    if (err) {
        logger.error(`Database Error: ${err.message}`);
        console.error(err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT CHECK(role IN ('admin', 'manager', 'sales_rep', 'customer')) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
    }
});

module.exports = db;
