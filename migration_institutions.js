require('dotenv').config();
const { sql } = require('./src/api-client/index');

async function migrate() {
  console.log('[MIGRATION] Ejecutando migración...');
  
  // 1. Crear tabla institutions
  try {
    await sql.query(`
      CREATE TABLE IF NOT EXISTS institutions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL UNIQUE,
        website VARCHAR(255) DEFAULT NULL,
        created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[MIGRATION] Tabla institutions verificada/creada.');
  } catch (err) {
    console.error('[MIGRATION] Error creando instituciones:', err.message);
  }

  // 2. Crear tabla notifications
  try {
    await sql.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        is_read TINYINT(1) DEFAULT 0,
        payload_json TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[MIGRATION] Tabla notifications verificada/creada.');
  } catch (err) {
    console.error('[MIGRATION] Error creando notifications:', err.message);
  }

  // 3. Alter table users para agregar institution_id y email_notifications
  try {
    const userCols = await sql.query(`SHOW COLUMNS FROM users`);
    const cols = (userCols.data || []).map(c => c.Field);

    if (!cols.includes('institution_id')) {
      await sql.query(`ALTER TABLE users ADD COLUMN institution_id INT DEFAULT NULL`);
      console.log('[MIGRATION] Columna institution_id agregada a users.');
    }
    if (!cols.includes('email_notifications')) {
      await sql.query(`ALTER TABLE users ADD COLUMN email_notifications TINYINT(1) DEFAULT 1`);
      console.log('[MIGRATION] Columna email_notifications agregada a users.');
    }
  } catch (err) {
    console.error('[MIGRATION] Error alterando tabla users:', err.message);
  }

  // 4. Sembrar algunas instituciones de ejemplo si está vacía
  try {
    const countRes = await sql.query(`SELECT COUNT(*) AS count FROM institutions`);
    const count = countRes.data && countRes.data[0] ? parseInt(countRes.data[0].count) : 0;
    if (count === 0) {
      const defaultInst = [
        { name: 'Universidad de Buenos Aires (UBA)', website: 'https://www.uba.ar' },
        { name: 'Universidad Tecnológica Nacional (UTN)', website: 'https://www.utn.edu.ar' },
        { name: 'Universidad Nacional de La Plata (UNLP)', website: 'https://unlp.edu.ar' },
        { name: 'Instituto Superior Técnico Intercultural', website: '' },
        { name: 'Otra Institución / Particular', website: '' }
      ];
      for (const inst of defaultInst) {
        await sql.query(`INSERT INTO institutions (name, website, created_by) VALUES ('${inst.name.replace(/'/g, "''")}', '${inst.website}', 1)`);
      }
      console.log(`[MIGRATION] Se sembraron ${defaultInst.length} instituciones de prueba.`);
    }
  } catch (err) {
    console.error('[MIGRATION] Error sembrando instituciones:', err.message);
  }

  console.log('[MIGRATION] Finalizada.');
  process.exit(0);
}

migrate();
