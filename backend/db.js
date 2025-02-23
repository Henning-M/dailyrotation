require('dotenv').config();
const { Pool } = require('pg');

// Set up PostgreSQL connection pool using environment variables
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT || 5432, // Default to 5432 if no DB_PORT provided
});

module.exports = pool;
