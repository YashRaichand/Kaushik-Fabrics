const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../utils/config');

function requireAuth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.redirect('/login');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.clearCookie('token');
    return res.redirect('/login');
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).send('Forbidden: Admins only.');
    }
    next();
  });
}

module.exports = { requireAuth, requireAdmin };
