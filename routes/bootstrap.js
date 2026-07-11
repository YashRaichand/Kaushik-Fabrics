const express = require('express');
const { pool } = require('../db/db');
const { rateLimit } = require('../utils/rateLimit');

const router = express.Router();
const BOOTSTRAP_SECRET = process.env.ADMIN_BOOTSTRAP_SECRET;

// This entire feature is off by default. If ADMIN_BOOTSTRAP_SECRET isn't
// set as a Render environment variable, every request here 404s as if the
// route doesn't exist - same treatment whether the secret is missing or
// simply wrong, so nobody probing the URL can tell the difference.
function checkSecret(req, res, next) {
  if (!BOOTSTRAP_SECRET) return res.status(404).render('404');
  const secret = req.method === 'GET' ? req.query.secret : req.body.secret;
  if (!secret || secret !== BOOTSTRAP_SECRET) return res.status(404).render('404');
  req.bootstrapSecret = secret;
  next();
}

router.get('/admin-bootstrap', rateLimit({ windowMs: 15 * 60 * 1000, max: 15 }), checkSecret, (req, res) => {
  res.render('admin-bootstrap', { error: null, success: null, promptEmail: true, secret: req.bootstrapSecret });
});

router.post('/admin-bootstrap', rateLimit({ windowMs: 15 * 60 * 1000, max: 15 }), checkSecret, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email) {
    return res.render('admin-bootstrap', { error: 'Enter an email.', success: null, promptEmail: true, secret: req.bootstrapSecret });
  }
  try {
    const result = await pool.query(
      `UPDATE users SET role = 'admin' WHERE email = $1 RETURNING id, name, email`,
      [email]
    );
    if (result.rows.length === 0) {
      return res.render('admin-bootstrap', {
        error: `No account found for ${email}. Double-check the email you signed up with.`,
        success: null, promptEmail: true, secret: req.bootstrapSecret
      });
    }
    console.log(`[admin-bootstrap] Promoted ${result.rows[0].email} (id ${result.rows[0].id}) to admin.`);
    return res.render('admin-bootstrap', { error: null, success: result.rows[0], promptEmail: false, secret: req.bootstrapSecret });
  } catch (err) {
    console.error('Admin bootstrap error:', err);
    return res.status(500).render('500');
  }
});

module.exports = router;
