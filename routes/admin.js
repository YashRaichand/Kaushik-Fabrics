const express = require('express');
const { pool } = require('../db/db');
const { requireAdmin } = require('../middleware/auth');
const { formatWallClock, formatIST, formatINR } = require('../utils/format');

const router = express.Router();

// Lightweight polling endpoint for live dashboard updates. Deliberately
// returns only small scalar counts/ids, never the full data (which would
// include base64 photos) - polling that every few seconds would waste
// serious bandwidth. Pages compare latest_garment_id/latest_pickup_id
// against the value they were rendered with to detect new activity.
router.get('/api/activity', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS users_count,
        (SELECT COUNT(*) FROM garments) AS garments_count,
        (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type = 'credit') AS revenue,
        (SELECT COUNT(*) FROM pickups WHERE status = 'scheduled') AS pending_pickups,
        (SELECT COALESCE(MAX(id),0) FROM garments) AS latest_garment_id,
        (SELECT COALESCE(MAX(id),0) FROM pickups WHERE status = 'scheduled') AS latest_pickup_id
    `);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Admin activity poll error:', err);
    res.status(500).json({ error: 'Could not fetch live stats.' });
  }
});

router.get('/', requireAdmin, async (req, res) => {
  try {
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    const garmentsCount = await pool.query('SELECT COUNT(*) FROM garments');
    const revenueResult = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE type = 'credit'`);
    const pendingPickups = await pool.query(`SELECT COUNT(*) FROM pickups WHERE status = 'scheduled'`);
    const materialBreakdown = await pool.query(
      `SELECT material, COUNT(*) AS count, COALESCE(SUM(weight_kg),0) AS total_weight
       FROM garments GROUP BY material ORDER BY count DESC`
    );
    const recentUsers = await pool.query(
      `SELECT id, name, email, city, created_at FROM users ORDER BY created_at DESC LIMIT 10`
    );

    res.render('admin', {
      usersCount: usersCount.rows[0].count,
      garmentsCount: garmentsCount.rows[0].count,
      revenue: revenueResult.rows[0].total,
      pendingPickups: pendingPickups.rows[0].count,
      materialBreakdown: materialBreakdown.rows,
      recentUsers: recentUsers.rows,
      formatIST,
      formatINR
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).render('500');
  }
});

// Every garment ever listed - structured form OR NLP free-text - regardless
// of whether a pickup has been booked yet. This is where the customer's
// raw description/query text and photos actually live; the pickup queue
// below only covers items that have progressed to a booked pickup.
router.get('/garments', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT g.id, g.category, g.material, g.condition_grade, g.weight_kg, g.price,
              g.status, g.description, g.brand, g.quantity, g.created_at,
              u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone,
              p.id AS pickup_id, p.scheduled_at, p.status AS pickup_status,
              a.line1, a.city, a.pincode
       FROM garments g
       JOIN users u ON u.id = g.user_id
       LEFT JOIN pickup_items pi ON pi.garment_id = g.id
       LEFT JOIN pickups p ON p.id = pi.pickup_id
       LEFT JOIN addresses a ON a.id = p.address_id
       ORDER BY g.created_at DESC
       LIMIT 200`
    );

    const garments = [];
    for (const row of result.rows) {
      const imagesResult = await pool.query(
        `SELECT image_data, content_type FROM garment_images WHERE garment_id = $1 LIMIT 4`,
        [row.id]
      );
      garments.push({ ...row, images: imagesResult.rows.map((r) => `data:${r.content_type};base64,${r.image_data}`) });
    }

    const latestGarmentId = garments.length > 0 ? Math.max(...garments.map((g) => g.id)) : 0;
    res.render('admin-garments', { garments, formatIST, formatWallClock, formatINR, latestGarmentId });
  } catch (err) {
    console.error('Admin garments list error:', err);
    res.status(500).render('500');
  }
});

router.get('/pickups', requireAdmin, async (req, res) => {
  try {
    const scheduledResult = await pool.query(
      `SELECT p.id AS pickup_id, p.scheduled_at, p.status,
              u.name AS customer_name, u.phone AS customer_phone, u.email AS customer_email,
              a.line1, a.city, a.pincode
       FROM pickups p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN addresses a ON a.id = p.address_id
       WHERE p.status = 'scheduled'
       ORDER BY p.scheduled_at ASC`
    );

    const pickups = [];
    for (const row of scheduledResult.rows) {
      const itemsResult = await pool.query(
        `SELECT g.id, g.category, g.material, g.condition_grade, g.weight_kg, g.price, g.description
         FROM pickup_items pi JOIN garments g ON g.id = pi.garment_id
         WHERE pi.pickup_id = $1`,
        [row.pickup_id]
      );
      const items = [];
      for (const item of itemsResult.rows) {
        const imagesResult = await pool.query(
          `SELECT image_data, content_type FROM garment_images WHERE garment_id = $1 LIMIT 4`,
          [item.id]
        );
        items.push({ ...item, images: imagesResult.rows.map((r) => `data:${r.content_type};base64,${r.image_data}`) });
      }
      pickups.push({ ...row, items });
    }

    const completedResult = await pool.query(
      `SELECT p.id AS pickup_id, p.scheduled_at, u.name AS customer_name
       FROM pickups p JOIN users u ON u.id = p.user_id
       WHERE p.status = 'completed'
       ORDER BY p.scheduled_at DESC LIMIT 10`
    );

    const latestPickupId = pickups.length > 0 ? Math.max(...pickups.map((p) => p.pickup_id)) : 0;
    res.render('admin-pickups', { pickups, completed: completedResult.rows, formatWallClock, formatINR, latestPickupId });
  } catch (err) {
    console.error('Admin pickup queue error:', err);
    res.status(500).render('500');
  }
});

// Admin-only confirmation step: only the operator marking a pickup as
// physically collected can trigger the customer's wallet credit. This is
// the fix for the earlier design where any logged-in user could credit
// their own wallet without ever handing over clothes.
router.post('/pickups/:id/complete', requireAdmin, async (req, res) => {
  const pickupId = req.params.id;
  try {
    const pickupCheck = await pool.query('SELECT * FROM pickups WHERE id = $1', [pickupId]);
    if (pickupCheck.rows.length === 0) return res.redirect('/admin/pickups');
    const pickup = pickupCheck.rows[0];

    const items = await pool.query(
      `SELECT g.id, g.price FROM pickup_items pi
       JOIN garments g ON g.id = pi.garment_id
       WHERE pi.pickup_id = $1`,
      [pickupId]
    );

    let total = 0;
    for (const item of items.rows) {
      total += parseFloat(item.price);
      await pool.query(`UPDATE garments SET status = 'collected' WHERE id = $1`, [item.id]);
    }

    await pool.query(`UPDATE pickups SET status = 'completed' WHERE id = $1`, [pickupId]);
    await pool.query(`UPDATE wallets SET balance = balance + $1 WHERE user_id = $2`, [total, pickup.user_id]);
    await pool.query(
      `INSERT INTO transactions (user_id, amount, type, description) VALUES ($1,$2,'credit',$3)`,
      [pickup.user_id, total, `Pickup #${pickupId} confirmed collected by admin - wallet credited`]
    );

    res.redirect('/admin/pickups');
  } catch (err) {
    console.error('Admin pickup completion error:', err);
    res.redirect('/admin/pickups');
  }
});

module.exports = router;
