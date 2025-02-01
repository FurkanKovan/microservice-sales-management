const express = require('express');
const axios = require('axios');
const router = express.Router();
const registry = require('./registry.json');
const fs = require('fs');
const logger = require('../middleware/logger');
const loadbalancer = require('../utils/loadbalancer');

// Enable or disable api endpoint
router.post('/enableOrDisable/:apiName', (req, res) => {
    const apiName = req.params.apiName;
    const requestBody = req.body;
    // Check if instances exist under registry services and get instance index, if not found index = -1
    const instances = registry.services[apiName].instances;
    const index = instances.findIndex((s) => { return s.url === requestBody.url })
    if (index == -1) {
        res.status(404).json({ status: 'error', message: `Could not find '${requestBody.url}' for service '${apiName}'` });
    } else {
        instances[index].enabled = requestBody.enabled;
        // Update local record of the current service registrations
        fs.writeFile('./routes/registry.json', JSON.stringify(registry), (error) => {
            if (error) {
                logger.error(`Could not enable/disable '${requestBody.url}' for service '${apiName}'\n${error}`);
                res.status(500).json({
                    message: `Could not enable/disable '${requestBody.url}' for service '${apiName}'\n${error}`
                });
            } else {
                logger.info(`Successfully enable/disable '${requestBody.url}' for service '${apiName}'`);
                res.status(200).json({ message: `Successfully enable/disable '${requestBody.url}' for service '${apiName}'` });
            }
        });
    }
});

// Handle requests
router.all('/:apiName/*', async (req, res) => {
    const service = registry.services[req.params.apiName];
    const path = req.params[0];
    console.log(`Router matched: ${req.method} ${req.params.apiName}/${path}`);

    if (service) {
        // Assign default loadbalancing to ROUND_ROBIN if not specified
        if (!service.loadBalanceStrategy) {
            service.loadBalanceStrategy = 'ROUND_ROBIN';
            fs.writeFile('./routes/registry.json', JSON.stringify(registry), (error) => {
                if (error) {
                    logger.error(`Could not write load balance strategy for '${registrationInfo.apiName}'\n${error}`);
                    res.status(500).json({
                        message: `Could not write load balance strategy for '${registrationInfo.apiName}'\n${error}`
                    });
                }
            });
        }
        // Get index of service for load balancing
        const newIndex = loadbalancer[service.loadBalanceStrategy](service);
        const url = service.instances[newIndex].url;

        try {
            const response = await axios({
                method: req.method,
                url: `${url}${path}`,
                headers: req.headers,
                data: req.body,
                params: req.query
            });

            res.status(response.status).json(response.data);
        } catch (error) {
            logger.error(`Error request from ${url}`);
            if (error.response) {
                // Forward the error status and message from the API
                res.status(error.response.status).json({
                    message: error.response.data.message || 'An error occurred',
                    error: error.response.data
                });
            } else if (error.request) {
                // Handle cases where no response was received from the API
                logger.error('No response received from the API');
                res.status(502).json({ message: 'No response received from the API', error: error.message });
            } else {
                // Handle other errors (e.g., request setup errors)
                logger.error(`Request setup error: ${error.message}`);
                res.status(500).json({ message: `Request setup error: ${error.message}` });
            }
        }
    } else {
        res.status(400).json({ message: 'Service name does not exist' });
    }
});

// Register service
router.post('/register', (req, res) => {
    const registrationInfo = req.body;

    // Create url for registration
    registrationInfo.url = registrationInfo.protocol + "://" + registrationInfo.host + ":" + registrationInfo.port + "/";

    if (apiAlreadyExists(registrationInfo)) {
        logger.warn(`Configuration already exists for '${registrationInfo.apiName}' at '${registrationInfo.url}'`);
        res.status(400).json({ 
            message: `Configuration already exists for '${registrationInfo.apiName}' at '${registrationInfo.url}'` 
        });
    } else {
        // Append service to services under registry
        registry.services[registrationInfo.apiName].instances.push({ ...registrationInfo });
    
        // Update local record of the current service registrations
        fs.writeFile('./routes/registry.json', JSON.stringify(registry), (error) => {
            if (error) {
                logger.error(`Could not register '${registrationInfo.apiName}'\n${error}`);
                res.status(500).json({ message: `Could not register '${registrationInfo.apiName}'\n${error}` });
            } else {
                logger.info(`Successfully registered '${registrationInfo.apiName}'`);
                res.json({ message: `Successfully registered '${registrationInfo.apiName}'` });
            }
        });
    }
});

// Unregister service
router.post('/unregister', (req, res) => {
    const registrationInfo = req.body;

    if (apiAlreadyExists(registrationInfo)) {
        // Get index of the server instance from registry
        const index = registry.services[registrationInfo.apiName].instances.findIndex((instance) => {
            return registrationInfo.url === instance.url;
        });
        // Remove server instance by found index
        registry.services[registrationInfo.apiName].instances.splice(index, 1);
        // Update local record of the current service registrations
        fs.writeFile('./routes/registry.json', JSON.stringify(registry), (error) => {
            if (error) {
                logger.error(`Could not unregister '${registrationInfo.apiName}'\n${error}`);
                res.status(500).json({ message: `Could not unregister '${registrationInfo.apiName}'\n${error}` });
            } else {
                logger.info(`Successfully unregistered '${registrationInfo.apiName}'`);
                res.status(201).json({ message: `Successfully unregistered '${registrationInfo.apiName}'` });
            }
        });
    } else {
        logger.warn(`Configuration does not exist for '${registrationInfo.apiName}' at '${registrationInfo.url}'`);
        res.status(404).json({ 
            message: `Configuration does not exist for '${registrationInfo.apiName}' at '${registrationInfo.url}'` 
        });
    }
});

// Check if API service already exist under registry services
const apiAlreadyExists = (registrationInfo) => {
    let exists = false;

    registry.services[registrationInfo.apiName].instances.forEach(instance => {
        if (instance.url === registrationInfo.url) {
            exists = true
            return
        }
    });
    return exists;
}

module.exports = router
