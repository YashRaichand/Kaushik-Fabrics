-- Fabrique lives in its own schema so it never collides with any other
-- project's tables sharing this same Postgres instance.
CREATE SCHEMA IF NOT EXISTS fabrique;
SET search_path TO fabrique, public;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  phone VARCHAR(20),
  city VARCHAR(80),
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS addresses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  line1 VARCHAR(255) NOT NULL,
  city VARCHAR(80),
  pincode VARCHAR(10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS garments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(60) NOT NULL,
  brand VARCHAR(80),
  brand_tier VARCHAR(20) DEFAULT 'standard',
  material VARCHAR(40) NOT NULL,
  condition_grade CHAR(1) NOT NULL DEFAULT 'B',
  weight_kg NUMERIC(6,2) NOT NULL,
  gender VARCHAR(20),
  size VARCHAR(20),
  quantity INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending_pickup',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pickups (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address_id INTEGER REFERENCES addresses(id),
  -- Deliberately TIMESTAMP WITHOUT TIME ZONE, not TIMESTAMPTZ: this is the
  -- customer's chosen pickup slot in India wall-clock time (from a plain
  -- <input type="datetime-local">, which carries no timezone info). Since
  -- this business operates in a single timezone, converting it would risk
  -- silently shifting the requested time - see utils/format.js formatWallClock().
  scheduled_at TIMESTAMP NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pickup_items (
  id SERIAL PRIMARY KEY,
  pickup_id INTEGER NOT NULL REFERENCES pickups(id) ON DELETE CASCADE,
  garment_id INTEGER NOT NULL REFERENCES garments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  type VARCHAR(20) NOT NULL,
  description VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS green_points (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  reason VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS garment_images (
  id SERIAL PRIMARY KEY,
  garment_id INTEGER NOT NULL REFERENCES garments(id) ON DELETE CASCADE,
  image_data TEXT NOT NULL,
  content_type VARCHAR(30) NOT NULL DEFAULT 'image/jpeg',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_garments_user ON garments(user_id);
CREATE INDEX IF NOT EXISTS idx_garments_status ON garments(status);
CREATE INDEX IF NOT EXISTS idx_garments_material ON garments(material);
CREATE INDEX IF NOT EXISTS idx_pickups_user ON pickups(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_pickup_items_pickup ON pickup_items(pickup_id);
CREATE INDEX IF NOT EXISTS idx_garment_images_garment ON garment_images(garment_id);

-- Migration for databases that were already deployed before this fix:
-- CREATE TABLE IF NOT EXISTS only affects brand-new tables, so any
-- created_at column that already exists as TIMESTAMP (no timezone) needs
-- an explicit ALTER. Scoped to column_name = 'created_at' specifically so
-- it never touches pickups.scheduled_at, which is intentionally timezone-
-- naive (see comment on that column). Safe to run on every boot - once a
-- column is already TIMESTAMPTZ, the loop finds nothing left to convert.
DO $$
DECLARE
  col RECORD;
BEGIN
  FOR col IN
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'fabrique'
      AND column_name = 'created_at'
      AND data_type = 'timestamp without time zone'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE TIMESTAMPTZ USING %I AT TIME ZONE ''UTC''',
      col.table_name, col.column_name, col.column_name
    );
  END LOOP;
END $$;
