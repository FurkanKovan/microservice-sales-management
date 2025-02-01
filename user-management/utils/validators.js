// Validates the name format  - Returns an error message if invalid, or null if valid
function validateName(name) {
    if (!/^[a-zA-Z\s]+$/.test(name)) {
        return 'Name must contain only alphabetic characters and spaces';
    }
    return null;
}

// Check if the email format is valid - Returns an error message if invalid, or null if valid
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return 'Invalid email format';
    }
    return null;
}

// Check if the password format is valid - Returns an error message if invalid, or null if valid
function validatePassword(password) {
    if (password.length < 3 || password.length > 16) {
        return 'Password must be between 3 and 16 characters long';
    } else if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)) {
        return 'Password must contain at least one lower and one uppercase character';
    } else if (!/^[a-zA-Z0-9!#$%&*+-_.,]+$/.test(password)) {
        return 'Password must contain only letters, numbers and the following characters ! # $ % & * + - _ . ,';
    }
    return null;
}

module.exports = {
    validateName,
    validateEmail,
    validatePassword
};
