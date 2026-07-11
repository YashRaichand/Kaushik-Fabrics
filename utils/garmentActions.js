const { pool } = require('../db/db');
const { calculatePrice, greenPointsForGarment } = require('./pricing');

async function createStructuredGarment(userId, data, images = []) {
  const { category, brand, brand_tier, material, condition_grade, weight_kg, gender, size, quantity, description } = data;

  // Price is always computed fresh here from the raw attributes - never
  // trusted from a caller (e.g. a redeemed cookie) - so there's exactly one
  // place pricing logic runs, and no path where a stale/tampered number
  // could be written to the wallet ledger.
  const priceResult = calculatePrice({ material, weightKg: weight_kg, conditionGrade: condition_grade, brandTier: brand_tier, quantity });
  const points = greenPointsForGarment({ weightKg: weight_kg, conditionGrade: condition_grade });

  const inserted = await pool.query(
    `INSERT INTO garments
      (user_id, category, brand, brand_tier, material, condition_grade, weight_kg, gender, size, quantity, description, status, price)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending_pickup',$12)
     RETURNING id`,
    [
      userId, category, brand || null, brand_tier || 'standard', material,
      (condition_grade || 'B').toUpperCase(), weight_kg, gender || null, size || null,
      parseInt(quantity, 10) || 1, description || null, priceResult.payout
    ]
  );
  const garmentId = inserted.rows[0].id;

  const imagePreviews = [];
  for (const file of images) {
    const base64 = file.buffer.toString('base64');
    await pool.query(
      `INSERT INTO garment_images (garment_id, image_data, content_type) VALUES ($1,$2,$3)`,
      [garmentId, base64, file.mimetype]
    );
    imagePreviews.push(`data:${file.mimetype};base64,${base64}`);
  }

  await pool.query(
    `INSERT INTO transactions (user_id, amount, type, description) VALUES ($1,$2,'pending_credit',$3)`,
    [userId, priceResult.payout, `Garment #${garmentId} listed for pickup`]
  );
  await pool.query(
    `INSERT INTO green_points (user_id, points, reason) VALUES ($1,$2,$3)`,
    [userId, points, 'Garment listed']
  );

  return { garmentId, priceResult, points, images: imagePreviews };
}

async function createNlpGarments(userId, description, parsed) {
  const created = [];
  for (const item of parsed.items) {
    const material = item.material || parsed.material || 'blend';
    const conditionGrade = parsed.condition || 'B';
    const estWeight = 0.35 * item.quantity;
    const priceResult = calculatePrice({ material, weightKg: estWeight, conditionGrade, brandTier: 'standard', quantity: item.quantity });
    const points = greenPointsForGarment({ weightKg: estWeight, conditionGrade });

    const inserted = await pool.query(
      `INSERT INTO garments (user_id, category, material, condition_grade, weight_kg, quantity, description, status, price)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending_pickup',$8) RETURNING id`,
      [userId, item.category, material, conditionGrade, estWeight, item.quantity, description, priceResult.payout]
    );
    const garmentId = inserted.rows[0].id;

    await pool.query(
      `INSERT INTO transactions (user_id, amount, type, description) VALUES ($1,$2,'pending_credit',$3)`,
      [userId, priceResult.payout, `NLP garment #${garmentId} listed`]
    );
    await pool.query(
      `INSERT INTO green_points (user_id, points, reason) VALUES ($1,$2,$3)`,
      [userId, points, 'NLP garment listed']
    );

    created.push({ ...item, material, price: priceResult.payout, garmentId });
  }
  return created;
}

module.exports = { createStructuredGarment, createNlpGarments };
