const express = require('express');
const { pool } = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const { environmentalImpact } = require('../utils/pricing');
const { formatWallClock, formatINR } = require('../utils/format');

const router = express.Router();

router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const walletResult = await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [req.user.id]);
    const garmentsResult = await pool.query(
      'SELECT * FROM garments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [req.user.id]
    );
    const pickupsResult = await pool.query(
      'SELECT * FROM pickups WHERE user_id = $1 ORDER BY scheduled_at DESC LIMIT 10',
      [req.user.id]
    );
    const pointsResult = await pool.query(
      'SELECT COALESCE(SUM(points),0) AS total_points FROM green_points WHERE user_id = $1',
      [req.user.id]
    );
    const weightResult = await pool.query(
      `SELECT COALESCE(SUM(weight_kg),0) AS total_weight FROM garments
       WHERE user_id = $1 AND status IN ('collected','pickup_scheduled','pending_pickup')`,
      [req.user.id]
    );

    const impact = environmentalImpact(weightResult.rows[0].total_weight);

    res.render('dashboard', {
      wallet: walletResult.rows[0] || { balance: 0 },
      garments: garmentsResult.rows,
      pickups: pickupsResult.rows,
      points: pointsResult.rows[0].total_points,
      impact,
      user: req.user,
      formatWallClock,
      formatINR
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).render('500');
  }
});

module.exports = router;
