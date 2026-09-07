/**
 * Migracion: añadir github_repo, conf_start y conf_end a la tabla projects
 * Ejecutar: node update_db_conf.js
 */
require('dotenv').config();
const { sql } = require('./src/api-client/index');

async function migrate() {
  const alterations = [
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_repo VARCHAR(500) DEFAULT NULL`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS conf_start DATETIME NULL`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS conf_end DATETIME NULL`,
  ];

  for (const q of alterations) {
    try {
      await sql.query(q);
      console.log('[MIGRATE] OK:', q.substring(0, 60));
    } catch (err) {
      // Ignorar error si la columna ya existe (algunos drivers no soportan IF NOT EXISTS)
      if (err.message && err.message.includes('Duplicate column')) {
        console.log('[MIGRATE] Columna ya existe, saltando:', q.substring(30, 70));
      } else {
        console.error('[MIGRATE] Error:', err.message);
        process.exit(1);
      }
    }
  }
  console.log('[MIGRATE] Migracion completada.');
  process.exit(0);
}

migrate().catch(err => { console.error(err); process.exit(1); });
