// user-management/tests/userManagement.test.js
const request = require('supertest');
const app = require('../index');
const { db } = require('../database/db');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const SECRET_KEY = process.env.SECRET_KEY;

// Mock JWT token generation for test users
const generateToken = (role) => {
    return jwt.sign({ id: 1, username: 'testuser', role }, SECRET_KEY, { expiresIn: '1h' });
};

describe('User Management Service Security Tests', () => {
    let adminToken, managerToken, salesRepToken, customerToken;

    beforeAll(() => {
        adminToken = generateToken('admin');
        managerToken = generateToken('manager');
        salesRepToken = generateToken('sales_rep');
        customerToken = generateToken('customer');
    });

    afterAll((done) => {
        if (db && db.close) {
            db.close(() => {
                console.log('Database connection closed.');
                done();
            });
        } else {
            // console.warn('Database connection was already closed or not initialized.');
            done();
        }
    });

    // Authentication Security Tests
    describe('Authentication Edge Cases', () => {
        it('should return 403 for a tampered JWT token', async () => {
            const tamperedToken = adminToken.slice(0, -1) + 'x';
            const res = await request(app).get('/users').set('Authorization', `Bearer ${tamperedToken}`);
            expect(res.status).toBe(403);
            expect(res.body.error).toBe('Invalid or expired token.');
        });

        it('should return 403 for a JWT signed with a wrong secret key', async () => {
            const fakeToken = jwt.sign({ id: 1, username: 'testuser', role: 'admin' }, 'wrong_secret', { expiresIn: '1h' });
            const res = await request(app).get('/users').set('Authorization', `Bearer ${fakeToken}`);
            expect(res.status).toBe(403);
            expect(res.body.error).toBe('Invalid or expired token.');
        });
    });

    // Brute Force & Rate-Limiting Tests
    describe('Brute Force & Rate-Limiting', () => {
        it('should return 401 after multiple failed login attempts', async () => {
            for (let i = 0; i < 5; i++) {
                await request(app).post('/login').send({ email: 'wrong', password: 'wrong' });
            }
            const res = await request(app).post('/login').send({ email: 'wrong', password: 'wrong' });
            expect(res.status).toBe(401);
        });
    });

    // Data Exposure Prevention
    describe('Sensitive Data Exposure Tests', () => {
        it('should not expose password hashes in API responses', async () => {
            const res = await request(app).get('/users').set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(200);
            res.body.forEach(user => {
                expect(user).not.toHaveProperty('password');
            });
        });
    });

    // Access Control Edge Cases
    describe('Access Control Tests', () => {
        it('should prevent a user from escalating their own privileges', async () => {
            const res = await request(app)
                .put('/users/3')
                .set('Authorization', `Bearer ${salesRepToken}`)
                .send({ role: 'admin' });
            expect(res.status).toBe(403);
            expect(res.body.error).toBe('Access denied. Unauthorized role.');
        });
    });

    // SQL Injection & Input Validation Tests
    describe('SQL Injection & Input Validation', () => {
        it('should return 401 for SQL injection attempt in login', async () => {
            const res = await request(app).post('/login').send({ email: "' OR 1=1 --", password: "anything" });
            expect(res.status).toBe(401);
        });
    });
});
