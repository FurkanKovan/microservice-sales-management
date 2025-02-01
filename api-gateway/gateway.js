const express = require('express');
const cors = require('cors');
const routes = require('./routes/index');
const dotenv = require('dotenv');
const helmet = require('helmet');
const morgan = require('morgan');
const logger = require('./middleware/logger');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

// Handle Microservice Failures
const errorHandler = (err, req, res, next) => {
    logger.error(`Error processing request to ${req.originalUrl}: ${err.message}`);
    res.status(500).json({ error: 'Internal Server Error. Please try again later.' });
};

// Security Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('combined'));

// app.use(bodyParser.json());
app.use(express.json());
app.use('/', routes);

// Global Error Handler
app.use(errorHandler);

// Start API Gateway
app.listen(PORT, () => {
    logger.info(`API Gateway running on port ${PORT}`);
    console.log(`API Gateway running on port ${PORT}`);
});
