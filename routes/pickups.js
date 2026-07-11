const express = require('express');
const { pool } = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const { formatINR } = require('../utils/format');

const router = express.Router();

router.get('/pickup', requireAuth, async (req, res) => {
  try {
    const garments = await pool.query(
      `SELECT * FROM garments WHERE user_id = $1 AND status = 'pending_pickup' ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.render('pickup', { garments: garments.rows, error: null, success: null, formatINR });
  } catch (err) {
    console.error('Pickup list error:', err);
    res.render('pickup', { garments: [], error: 'Could not load your items.', success: null, formatINR });
  }
});

router.post('/pickup', requireAuth, async (req, res) => {
  const { line1, city, pincode, scheduled_at, garment_ids } = req.body;
  try {
    if (!line1 || !city || !pincode || !scheduled_at) {
      const garments = await pool.query(
        `SELECT * FROM garments WHERE user_id = $1 AND status = 'pending_pickup' ORDER BY created_at DESC`,
        [req.user.id]
      );
      return res.render('pickup', { garments: garments.rows, error: 'Please fill in all address and time fields.', success: null, formatINR });
    }

    const addressResult = await pool.query(
      `INSERT INTO addresses (user_id, line1, city, pincode) VALUES ($1,$2,$3,$4) RETURNING id`,
      [req.user.id, line1, city, pincode]
    );
    const pickupResult = await pool.query(
      `INSERT INTO pickups (user_id, address_id, scheduled_at, status) VALUES ($1,$2,$3,'scheduled') RETURNING id`,
      [req.user.id, addressResult.rows[0].id, scheduled_at]
    );

    const ids = Array.isArray(garment_ids) ? garment_ids : (garment_ids ? [garment_ids] : []);
    for (const gid of ids) {
      await pool.query(`INSERT INTO pickup_items (pickup_id, garment_id) VALUES ($1,$2)`, [pickupResult.rows[0].id, gid]);
      await pool.query(`UPDATE garments SET status = 'pickup_scheduled' WHERE id = $1 AND user_id = $2`, [gid, req.user.id]);
    }

    const garments = await pool.query(
      `SELECT * FROM garments WHERE user_id = $1 AND status = 'pending_pickup' ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.render('pickup', { garments: garments.rows, error: null, success: 'Pickup scheduled! You can track and complete it from your dashboard.', formatINR });
  } catch (err) {
    console.error('Pickup booking error:', err);
    res.render('pickup', { garments: [], error: 'Could not schedule pickup. Please try again.', success: null, formatINR });
  }
});

module.exports = router;
