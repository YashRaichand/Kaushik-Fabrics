const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: connectionString && connectionString.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

// The schema.sql init sets the search_path for the connection that runs it,
// but the pool hands out other physical connections for regular queries -
// each of those also needs to default into the fabrique schema, otherwise
// queries would silently fall back to "public" and fail to find our tables.
pool.on('connect', (client) => {
  client.query('SET search_path TO fabrique, public').catch((err) => {
    console.error('Failed to set search_path on new connection:', err);
  });
});

async function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Database schema verified/initialized.');
}

module.exports = { pool, initDb };
