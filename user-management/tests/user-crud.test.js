const request = require('supertest');
const app = require('../index');
const { db } = require('../database/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const SECRET_KEY = process.env.SECRET_KEY;
const BCRYPT_SALT = 10;

// Mock JWT token generation for test users
const generateToken = (role) => {
    return jwt.sign({ id: 1, username: 'testuser', role }, SECRET_KEY, { expiresIn: '1h' });
};

describe('User Management Service Tests', () => {
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

    // User Authentication Tests
    describe('POST /login', () => {
        it('should return 400 if no credentials are provided', async () => {
            const res = await request(app).post('/login').send({});
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Email and password are required');
        });

        it('should return 401 for invalid credentials', async () => {
            const res = await request(app).post('/login').send({ email: 'wrong', password: 'wrong' });
            expect(res.status).toBe(401);
            expect(res.body.error).toBe('Invalid credentials');
        });
    });

    // Fetch Users Tests
    describe('GET /users', () => {
        it('should return 401 if no token is provided', async () => {
            const res = await request(app).get('/users');
            expect(res.status).toBe(401);
            expect(res.body.error).toBe('Access denied. No token provided.');
        });

        it('should return 403 if user is unauthorized', async () => {
            const res = await request(app).get('/users').set('Authorization', `Bearer ${customerToken}`);
            expect(res.status).toBe(403);
            expect(res.body.error).toBe('Access denied. Unauthorized role.');
        });

        it('should return user list for an admin', async () => {
            const res = await request(app).get('/users').set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBeTruthy();
        });
    });

    // Register User Tests
    describe('POST /register', () => {
        it('should return 400 if required fields are missing', async () => {
            const res = await request(app)
                .post('/register')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ email: 'test@example.com' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('All fields are required');
        });

        it('should return 400 if name format is invalid', async () => {
            const res = await request(app)
                .post('/register')
                .set('Authorization', `Bearer ${customerToken}`)
                .send({ name:'New User55', email: 'test@example.com', password: 'Pass123*', role: 'customer' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Name must contain only alphabetic characters and spaces');
        });

        it('should return 400 if email format is invalid', async () => {
            const res = await request(app)
                .post('/register')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name:'New User', email: 'invalid-email', password: 'Pass123*', role: 'customer' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Invalid email format');
        });

        it('should return 400 if password format is invalid: 3 and 16 characters long', async () => {
            const res = await request(app)
                .post('/register')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ name:'New User', email: 'test@example.com', password: 'P1*', role: 'manager' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Password must be between 3 and 16 characters long');
        });

        it('should return 400 if password format is invalid: at least one uppercase character', async () => {
            const res = await request(app)
                .post('/register')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ name:'New User', email: 'test@example.com', password: 'pass1*', role: 'manager' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Password must contain at least one lower and one uppercase character');
        });

        it('should return 400 if password format is invalid: only certain non-alphanumeric characters', async () => {
            const res = await request(app)
                .post('/register')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ name:'New User', email: 'test@example.com', password: 'Pass/123*', role: 'manager' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Password must contain only letters, numbers and the following characters ! # $ % & * + - _ . ,');
        });
    });

    // Update User Tests
    describe('PUT /users/:id', () => {
        it('should return 403 if a non-admin tries to update a user role', async () => {
            const res = await request(app)
                .put('/users/1')
                .set('Authorization', `Bearer ${salesRepToken}`)
                .send({ role: 'customer' });
            expect(res.status).toBe(403);
            expect(res.body.error).toBe('Access denied. Unauthorized role.');
        });

        it('should return 400 if trying to update role to an invalid role', async () => {
            const res = await request(app)
                .put('/users/1')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name:'Test User', email: 'test@example.com', role: 'superadmin' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Invalid role specified');
        });
    });

    // Password Update Tests
    describe('PUT /users/:id/reset-password', () => {
        it('should return 400 if old or new password is missing', async () => {
            const res = await request(app)
                .put('/users/1/reset-password')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ oldPassword: 'oldPass' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Both old and new passwords are required');
        });

        it('should return 404 if user is not found', async () => {
            const res = await request(app)
                .put('/users/9999/reset-password')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ oldPassword: 'oldPass', newPassword: 'newPass123' });
            expect(res.status).toBe(404);
            expect(res.body.error).toBe('User not found');
        });

        it('should return 401 if old password is incorrect', async () => {
            const res = await request(app)
                .put('/users/1/reset-password')
                .set('Authorization', `Bearer ${customerToken}`)
                .send({ oldPassword: 'wrongPass', newPassword: 'newPass123' });
            expect(res.status).toBe(401);
            expect(res.body.error).toBe('Old password is incorrect');
        });
    });

    // Delete User Tests
    describe('DELETE /users/:id', () => {
        it('should return 403 if a non-admin tries to delete a user', async () => {
            const res = await request(app)
                .delete('/users/1')
                .set('Authorization', `Bearer ${salesRepToken}`);
            expect(res.status).toBe(403);
            expect(res.body.error).toBe('Access denied. Unauthorized role.');
        });

        it('should return 400 if trying to delete a non-existent user', async () => {
            const res = await request(app)
                .delete('/users/9999')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('User not found');
        });
    });
});
