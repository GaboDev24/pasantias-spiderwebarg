require('dotenv').config();
const { sql } = require('../api-client/index');

async function migrate() {
  console.log('[MIGRATION] Iniciando migracion...');
  
  try {
    await sql.query('ALTER TABLE projects ADD COLUMN summary VARCHAR(255) DEFAULT NULL AFTER description;');
    console.log('[MIGRATION] Campo summary añadido a projects');
  } catch (err) {
    if (err.message && err.message.includes('Duplicate column')) {
      console.log('[MIGRATION] Campo summary ya existe en projects');
    } else { console.error('[MIGRATION] Error projects:', err.message); }
  }

  try {
    await sql.query('ALTER TABLE news ADD COLUMN summary VARCHAR(255) DEFAULT NULL AFTER content;');
    console.log('[MIGRATION] Campo summary añadido a news');
  } catch (err) {
    if (err.message && err.message.includes('Duplicate column')) {
      console.log('[MIGRATION] Campo summary ya existe en news');
    } else { console.error('[MIGRATION] Error news:', err.message); }
  }

  try {
    await sql.query(`CREATE TABLE IF NOT EXISTS project_progress (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      user_id INT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log('[MIGRATION] Tabla project_progress creada');
  } catch (err) {
    console.error('[MIGRATION] Error creando project_progress:', err.message);
  }

  console.log('[MIGRATION] Migracion finalizada.');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
