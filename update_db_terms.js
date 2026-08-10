require('dotenv').config();
const { sql } = require('./src/api-client/index');

async function updateDb() {
  try {
    console.log('[DB-UPDATE] Agregando columna accepted_terms a tabla users...');
    await sql.query(`ALTER TABLE users ADD COLUMN accepted_terms TINYINT(1) DEFAULT 0`);
    console.log('[DB-UPDATE] Columna agregada exitosamente.');
  } catch (err) {
    if (err.message && err.message.includes('Duplicate column name')) {
      console.log('[DB-UPDATE] La columna accepted_terms ya existe. No se requiere accion.');
    } else {
      console.error('[DB-UPDATE] Error:', err.message);
    }
  }
  process.exit(0);
}

updateDb();
