require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { pool, initDb } = require('./db/db');
const { JWT_SECRET } = require('./utils/config');

const authRoutes = require('./routes/auth');
const garmentRoutes = require('./routes/garments');
const pickupRoutes = require('./routes/pickups');
const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');
const bootstrapRoutes = require('./routes/bootstrap');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Soft session check: makes the logged-in user available to every view
// (via res.locals) without forcing a redirect, so the header nav can show
// "Dashboard / Logout" instead of "Login" once someone is signed in.
app.use((req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    res.locals.currentUser = null;
    return next();
  }
  try {
    res.locals.currentUser = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    res.locals.currentUser = null;
  }
  next();
});

app.get('/', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT COALESCE(SUM(weight_kg),0) AS total_weight, COUNT(*) AS total_garments FROM garments
    `);
    const totalWeight = parseFloat(stats.rows[0].total_weight) || 0;
    const impact = {
      totalGarments: parseInt(stats.rows[0].total_garments, 10) || 0,
      waterSaved: Math.round(totalWeight * 2700),
      co2Saved: Math.round(totalWeight * 3.6),
      treesEquivalent: Math.round((totalWeight * 3.6) / 21)
    };
    res.render('index', { impact });
  } catch (err) {
    console.error('Landing page stats error:', err);
    res.render('index', { impact: { totalGarments: 0, waterSaved: 0, co2Saved: 0, treesEquivalent: 0 } });
  }
});

app.use('/', authRoutes);
app.use('/', garmentRoutes);
app.use('/', pickupRoutes);
app.use('/', dashboardRoutes);
app.use('/', bootstrapRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).render('404');
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).render('500');
});

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Fabrique running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
