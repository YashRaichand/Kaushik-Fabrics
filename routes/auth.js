const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/db');
const { isValidEmail, isValidPassword, isValidPhone } = require('../utils/validators');
const { rateLimit } = require('../utils/rateLimit');
const { JWT_SECRET } = require('../utils/config');
const { readPendingListing, clearPendingListing } = require('../utils/pendingListing');
const { createStructuredGarment, createNlpGarments } = require('../utils/garmentActions');
const { parseFreeText } = require('../utils/nlp');

const router = express.Router();

// If the person got a quote before creating an account, this turns that
// quote into a real listing right after signup/login - re-deriving price
// (and, for NLP, re-parsing the description) fresh rather than trusting
// anything stored in the cookie. Returns null if there was nothing pending.
async function redeemPendingListing(req, res, userId) {
  const pending = readPendingListing(req);
  if (!pending) return null;
  try {
    if (pending.type === 'structured') {
      const result = await createStructuredGarment(userId, pending, []);
      clearPendingListing(res);
      return { type: 'structured', garmentId: result.garmentId };
    }
    if (pending.type === 'nlp' && pending.description) {
      const parsed = parseFreeText(pending.description);
      const created = await createNlpGarments(userId, pending.description, parsed);
      clearPendingListing(res);
      return { type: 'nlp', created };
    }
  } catch (err) {
    console.error('Pending listing redemption error:', err);
  }
  return null;
}

function setSessionCookie(res, user, remember) {
  const token = jwt.sign({ id: user.id, name: user.name, role: user.role }, JWT_SECRET, {
    expiresIn: remember ? '30d' : '7d'
  });
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: (remember ? 30 : 7) * 24 * 60 * 60 * 1000
  });
}

// Bounce already-logged-in users away from the auth pages instead of
// showing them a login form for an account they're already in.
function redirectIfAuthed(req, res, next) {
  const token = req.cookies.token;
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.redirect(decoded.role === 'admin' ? '/admin' : '/dashboard');
  } catch (err) {
    res.clearCookie('token');
    return next();
  }
}

const emptyErrors = () => ({ name: '', email: '', password: '', confirm_password: '', phone: '', general: '' });

// ---------------------------------------------------------------------------
// SIGN UP
// ---------------------------------------------------------------------------

router.get('/signup', redirectIfAuthed, (req, res) => {
  res.render('signup', {
    errors: emptyErrors(),
    old: { name: '', email: req.query.email || '', phone: '', city: '' }
  });
});

router.post('/signup', redirectIfAuthed, rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), async (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const confirmPassword = req.body.confirm_password || '';
  const phone = (req.body.phone || '').trim();
  const city = (req.body.city || '').trim();

  const errors = emptyErrors();
  const old = { name, email, phone, city };

  if (!name) errors.name = 'Please enter your full name.';
  if (!email) errors.email = 'Email is required.';
  else if (!isValidEmail(email)) errors.email = 'Enter a valid email address.';
  if (!isValidPassword(password)) errors.password = 'Password must be at least 6 characters.';
  if (password !== confirmPassword) errors.confirm_password = 'Passwords do not match.';
  if (!isValidPhone(phone)) errors.phone = 'Enter a valid phone number.';

  if (Object.values(errors).some(Boolean)) {
    return res.status(400).render('signup', { errors, old });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      errors.email = 'An account already exists with this email.';
      errors.general = 'suggest_login';
      return res.status(409).render('signup', { errors, old });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, phone, city, role)
       VALUES ($1,$2,$3,$4,$5,'user') RETURNING id, name, role`,
      [name, email, hash, phone || null, city || null]
    );
    const user = result.rows[0];
    await pool.query('INSERT INTO wallets (user_id, balance) VALUES ($1, 0)', [user.id]);

    setSessionCookie(res, user, false);
    await redeemPendingListing(req, res, user.id);
    return res.redirect('/dashboard');
  } catch (err) {
    // 23505 = Postgres unique_violation - backstop for a race between the
    // existence check above and the insert (two signups for the same email
    // landing at nearly the same instant).
    if (err.code === '23505') {
      errors.email = 'An account already exists with this email.';
      errors.general = 'suggest_login';
      return res.status(409).render('signup', { errors, old });
    }
    console.error('Signup error:', err);
    errors.general = 'server_error';
    return res.status(500).render('signup', { errors, old });
  }
});

// ---------------------------------------------------------------------------
// LOG IN
// ---------------------------------------------------------------------------

router.get('/login', redirectIfAuthed, (req, res) => {
  res.render('login', {
    errors: emptyErrors(),
    old: { email: req.query.email || '' }
  });
});

router.post('/login', redirectIfAuthed, rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const remember = req.body.remember === 'on';

  const errors = emptyErrors();
  const old = { email };

  if (!email || !isValidEmail(email)) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Password is required.';

  if (errors.email || errors.password) {
    return res.status(400).render('login', { errors, old });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    // First-time-here detection: no account exists for this email at all -
    // point the person straight to registration instead of a generic error.
    if (result.rows.length === 0) {
      errors.general = 'suggest_signup';
      return res.status(404).render('login', { errors, old });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      errors.password = 'Incorrect password. Please try again.';
      return res.status(401).render('login', { errors, old });
    }

    setSessionCookie(res, user, remember);
    await redeemPendingListing(req, res, user.id);
    return res.redirect(user.role === 'admin' ? '/admin' : '/dashboard');
  } catch (err) {
    console.error('Login error:', err);
    errors.general = 'server_error';
    return res.status(500).render('login', { errors, old });
  }
});

router.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/');
});

module.exports = router;
