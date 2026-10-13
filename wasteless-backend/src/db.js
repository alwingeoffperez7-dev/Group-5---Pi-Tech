const mysql = require('mysql2/promise');

// One shared connection pool for the whole app.
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wasteless',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true, // return DECIMAL as JS numbers, not strings
  dateStrings: ['DATE'] // keep DATE columns as 'YYYY-MM-DD' (no timezone shift)
});

module.exports = pool;
