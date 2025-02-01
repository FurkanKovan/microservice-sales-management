const sqlite3 = require('sqlite3').verbose();
const logger = require('../middleware/logger');

const db = new sqlite3.Database('./database/sales-tracking.db', (err) => {
    if (err) {
        logger.error(`Database Error: ${err.message}`);
        console.error(err.message);
    } else {
        console.log('Connected to the Sales Tracking SQLite database.');
        db.run(`
            CREATE TABLE IF NOT EXISTS sales (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                status TEXT CHECK(status IN ('new', 'on going', 'deal', 'closed')) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
            );
        `);
        db.run(`
            CREATE TABLE IF NOT EXISTS sales_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sale_id INTEGER NOT NULL,
                note TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
            );
        `);
    }
});

module.exports = db;
