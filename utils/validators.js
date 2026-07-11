function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6;
}

function isValidPhone(phone) {
  if (!phone) return true; // optional field
  return /^[0-9+\-\s()]{7,15}$/.test(phone.trim());
}

module.exports = { isValidEmail, isValidPassword, isValidPhone };
