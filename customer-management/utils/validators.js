// Validates the name format - Returns an error message if invalid, or null if valid
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

// Check if the phone format is valid - Returns an error message if invalid, or null if valid
function validatePhone(phone) {
    // Regex for different phone number formats (e.g., +1234567890, (123) 456-7890, 123-456-7890, etc.)
    const phoneRegex = /^(\+\d{1,3}[- ]?)?(\(\d{1,4}\)|\d{1,4})[- ]?\d{1,4}[- ]?\d{1,9}$/;

    if (!phoneRegex.test(phone)) {
        return 'Invalid phone number format';
    }

    return null;
}

module.exports = {
    validateName,
    validateEmail,
    validatePhone
};
