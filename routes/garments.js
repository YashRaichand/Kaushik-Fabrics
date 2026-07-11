const express = require('express');
const { calculatePrice } = require('../utils/pricing');
const { parseFreeText } = require('../utils/nlp');
const { handleImageUpload, MAX_FILES } = require('../utils/upload');
const { formatINR } = require('../utils/format');
const { savePendingListing } = require('../utils/pendingListing');
const { createStructuredGarment, createNlpGarments } = require('../utils/garmentActions');

const router = express.Router();

// Public - no login wall. "Get an Instant Quote" should actually deliver an
// instant quote; forcing a login first breaks that promise before a visitor
// has any reason to trust the site enough to sign up.
router.get('/sell', (req, res) => {
  res.render('sell', { error: null, quote: null, maxFiles: MAX_FILES, formatINR });
});

// Structured form submission (multipart - supports up to 4 photos when logged in)
router.post('/sell', handleImageUpload('images'), async (req, res) => {
  const { category, brand, brand_tier, material, condition_grade, weight_kg, gender, size, quantity, description } = req.body;
  const currentUser = res.locals.currentUser;

  try {
    if (req.imageUploadError) {
      return res.render('sell', { error: req.imageUploadError, quote: null, maxFiles: MAX_FILES, formatINR });
    }
    if (!category || !material || !weight_kg) {
      return res.render('sell', { error: 'Category, material, and weight are required.', quote: null, maxFiles: MAX_FILES, formatINR });
    }

    if (currentUser) {
      // Logged in: list it for real, right now.
      const files = req.files || [];
      const result = await createStructuredGarment(currentUser.id, {
        category, brand, brand_tier, material, condition_grade, weight_kg, gender, size, quantity, description
      }, files);
      return res.render('sell', {
        error: null,
        quote: { ...result.priceResult, garmentId: result.garmentId, points: result.points, nlp: false, images: result.images, guest: false },
        maxFiles: MAX_FILES, formatINR
      });
    }

    // Guest: show the real price, don't write to the DB yet (there's no
    // account to attach it to), and stash the submission in a short-lived
    // cookie so signing up completes the listing instead of losing it.
    const priceResult = calculatePrice({ material, weightKg: weight_kg, conditionGrade: condition_grade, brandTier: brand_tier, quantity });
    savePendingListing(res, {
      type: 'structured',
      category, brand: brand || null, brand_tier: brand_tier || 'standard', material,
      condition_grade: (condition_grade || 'B').toUpperCase(), weight_kg,
      gender: gender || null, size: size || null,
      quantity: parseInt(quantity, 10) || 1, description: description || null
    });
    return res.render('sell', { error: null, quote: { ...priceResult, nlp: false, guest: true }, maxFiles: MAX_FILES, formatINR });
  } catch (err) {
    console.error('Sell (structured) error:', err);
    res.render('sell', { error: 'Could not process your item. Please check the form.', quote: null, maxFiles: MAX_FILES, formatINR });
  }
});

// NLP free-text intake: "I have 6 old jeans and 3 cotton shirts" - also public.
router.post('/sell/nlp', async (req, res) => {
  const { description } = req.body;
  const currentUser = res.locals.currentUser;

  try {
    if (!description || description.trim().length < 3) {
      return res.render('sell', { error: 'Please describe what clothes you have.', quote: null, maxFiles: MAX_FILES, formatINR });
    }

    const parsed = parseFreeText(description);
    if (parsed.items.length === 0) {
      return res.render('sell', {
        error: 'We couldn\'t detect any items in that description. Try a format like "6 old jeans and 3 cotton shirts".',
        quote: null, maxFiles: MAX_FILES, formatINR
      });
    }

    if (currentUser) {
      const created = await createNlpGarments(currentUser.id, description, parsed);
      return res.render('sell', { error: null, quote: { nlp: true, parsed, created, guest: false }, maxFiles: MAX_FILES, formatINR });
    }

    // Guest: compute a preview per item (same formula, nothing written yet).
    const preview = parsed.items.map((item) => {
      const material = item.material || parsed.material || 'blend';
      const conditionGrade = parsed.condition || 'B';
      const estWeight = 0.35 * item.quantity;
      const priceResult = calculatePrice({ material, weightKg: estWeight, conditionGrade, brandTier: 'standard', quantity: item.quantity });
      return { ...item, material, price: priceResult.payout };
    });
    savePendingListing(res, { type: 'nlp', description });
    return res.render('sell', { error: null, quote: { nlp: true, parsed, created: preview, guest: true }, maxFiles: MAX_FILES, formatINR });
  } catch (err) {
    console.error('Sell (NLP) error:', err);
    res.render('sell', { error: 'Could not understand that description. Try the structured form instead.', quote: null, maxFiles: MAX_FILES, formatINR });
  }
});

module.exports = router;
