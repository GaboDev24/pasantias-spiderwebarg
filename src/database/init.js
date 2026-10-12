/**
 * Inicializacion de la base de datos
 * Crea todas las tablas necesarias si no existen
 * Ejecutar con: node src/database/init.js
 */

require('dotenv').config();
const { sql } = require('../api-client/index');
const { sqlEscape } = require('../helpers/sqlSanitizer');

const tablas = [
  // ──────────────────────────────────────────────
  // USUARIOS
  // ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('pasante', 'admin', 'ceo') DEFAULT 'pasante',
    is_email_verified TINYINT(1) DEFAULT 0,
    is_token_validated TINYINT(1) DEFAULT 0,
    accepted_terms TINYINT(1) DEFAULT 0,
    avatar_file_id VARCHAR(100) DEFAULT NULL,
    avatar_url VARCHAR(500) DEFAULT NULL,
    tags TEXT DEFAULT NULL,
    email_verify_token VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,

  // ──────────────────────────────────────────────
  // TOKENS DE VALIDACION (emitidos por CEOs)
  // ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS validation_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    token_string VARCHAR(64) NOT NULL UNIQUE,
    issued_by INT NOT NULL,
    assigned_to_email VARCHAR(150) DEFAULT NULL,
    used_by INT DEFAULT NULL,
    is_used TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP DEFAULT NULL
  )`,

  // ──────────────────────────────────────────────
  // APTITUDES / TAGS (definidas por admin)
  // ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS skills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    color VARCHAR(20) DEFAULT '#A30000',
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // ──────────────────────────────────────────────
  // PROYECTOS
  // ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    summary VARCHAR(255) DEFAULT NULL,
    media_file_ids TEXT DEFAULT NULL,
    required_tags TEXT DEFAULT NULL,
    conf_link VARCHAR(500) DEFAULT NULL,
    github_repo VARCHAR(500) DEFAULT NULL,
    conf_start DATETIME NULL,
    conf_end DATETIME NULL,
    next_meeting_date DATETIME DEFAULT NULL,
    next_meeting_link VARCHAR(500) DEFAULT NULL,
    start_date DATETIME NULL,
    end_date DATETIME NULL,
    status ENUM('open', 'closed', 'in_progress') DEFAULT 'open',
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,

  // ──────────────────────────────────────────────
  // INSCRIPCIONES A PROYECTOS
  // ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS project_applications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    user_id INT NOT NULL,
    status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_application (project_id, user_id)
  )`,

  // ──────────────────────────────────────────────
  // NOTICIAS
  // ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS news (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    summary VARCHAR(255) DEFAULT NULL,
    cover_file_id VARCHAR(100) DEFAULT NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,

  // ──────────────────────────────────────────────
  // CHAT (mensajes internos)
  // ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT NOT NULL,
    receiver_id INT NOT NULL,
    content TEXT NOT NULL,
    is_read TINYINT(1) DEFAULT 0,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // ──────────────────────────────────────────────
  // REGISTRO DE PROGRESO DE PROYECTOS
  // ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS project_progress (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    user_id INT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // ──────────────────────────────────────────────
  // AMIGOS / CONTACTOS FAVORITOS DE CHAT
  // ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS user_friends (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    friend_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_friend (user_id, friend_id)
  )`,

  // ──────────────────────────────────────────────
  // REGISTRO DE REUNIONES DE PROYECTOS
  // ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS project_meetings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    meeting_date DATETIME NOT NULL,
    meeting_link VARCHAR(500),
    record_notes TEXT NOT NULL,
    attendees_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // ──────────────────────────────────────────────
  // CAPACITACIONES
  // ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS trainings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    min_quota INT DEFAULT 2,
    status ENUM('open', 'quota_filled', 'scheduled', 'completed') DEFAULT 'open',
    meeting_date DATETIME DEFAULT NULL,
    meeting_link VARCHAR(500) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // ──────────────────────────────────────────────
  // POSTULACIONES A CAPACITACIONES
  // ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS training_applications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    training_id INT NOT NULL,
    user_id INT NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_application (training_id, user_id)
  )`,
  // ──────────────────────────────────────────────
  // PORTFOLIO / PROYECTOS DESTACADOS
  // ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS portfolio_projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    cover_file_id VARCHAR(100) DEFAULT NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
];

async function initDB() {
  for (const tablaSql of tablas) {
    const nombreMatch = tablaSql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
    const nombre = nombreMatch ? nombreMatch[1] : 'desconocida';
    try {
      await sql.query(tablaSql);
    } catch (err) {
      console.error(`[DB-INIT] Error en tabla ${nombre}:`, err.message);
      throw err;
    }
  }
  console.log(`[DB-INIT] Base de datos inicializada correctamente (${tablas.length} tablas verificadas).`);

  // Sembrar skills iniciales si la tabla está vacía
  try {
    const sRes = await sql.query('SELECT COUNT(*) AS count FROM skills');
    const count = sRes.data && sRes.data[0] ? parseInt(sRes.data[0].count) : 0;
    if (count === 0) {
      const defaultSkills = [
        { name: 'Programación', color: '#3b82f6' },
        { name: 'Diseño Gráfico', color: '#ec4899' },
        { name: 'Redes Sociales', color: '#8b5cf6' },
        { name: 'Edición de Videos', color: '#f59e0b' },
        { name: 'QA / Testing', color: '#10b981' },
        { name: 'Marketing', color: '#ef4444' },
        { name: 'IT (Soporte Técnico)', color: '#06b6d4' },
      ];
      for (const sk of defaultSkills) {
        await sql.query(`INSERT INTO skills (name, color, created_by) VALUES (${sqlEscape(sk.name)}, ${sqlEscape(sk.color)}, 1)`);
      }
      console.log(`[DB-INIT] Se sembraron ${defaultSkills.length} aptitudes predeterminadas.`);
    }
  } catch (sErr) {
    console.error('[DB-INIT] Error al sembrar skills iniciales:', sErr.message);
  }

  // SEC-02: Crear/actualizar administrador master como usuario real en BD
  await seedAdmin();
}

/**
 * Crea o actualiza el usuario administrador master desde ADMIN_EMAIL/ADMIN_PASSWORD.
 * Elimina la necesidad del bypass con id:9999 en memoria.
 */
async function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.trim().toLowerCase() : null;
  const adminPass  = process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.trim() : null;

  if (!adminEmail || !adminPass) {
    console.log('[DB-INIT/SEED-ADMIN] ADMIN_EMAIL o ADMIN_PASSWORD no definidos. Omitiendo seed.');
    return;
  }

  const bcrypt = require('bcryptjs');
  try {
    const existing = await sql.query(
      `SELECT id, password_hash FROM users WHERE email = ${sqlEscape(adminEmail)} `
    );

    if (!existing.data || existing.data.length === 0) {
      const hash = await bcrypt.hash(adminPass, 12);
      await sql.query(`
        INSERT INTO users (name, email, password_hash, role, is_email_verified, is_token_validated, accepted_terms)
        VALUES ('Admin Master', ${sqlEscape(adminEmail)}, ${sqlEscape(hash)}, 'ceo', 1, 1, 1)
      `);
      console.log(`[DB-INIT/SEED-ADMIN] Usuario admin creado en BD: ${adminEmail}`);
    } else {
      const user = existing.data[0];
      const match = await bcrypt.compare(adminPass, user.password_hash);
      if (!match) {
        const newHash = await bcrypt.hash(adminPass, 12);
        await sql.query(`
          UPDATE users SET password_hash = ${sqlEscape(newHash)}, role = 'ceo',
            is_email_verified = 1, is_token_validated = 1
          WHERE id = ${user.id}
        `);
        console.log(`[DB-INIT/SEED-ADMIN] Contrasena del admin actualizada: ${adminEmail}`);
      } else {
        console.log(`[DB-INIT/SEED-ADMIN] Admin ya existe y es valido: ${adminEmail}`);
      }
    }
  } catch (err) {
    console.error('[DB-INIT/SEED-ADMIN] Error:', err.message);
  }
}

// Si se ejecuta directamente
if (require.main === module) {
  initDB().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { initDB, seedAdmin };
