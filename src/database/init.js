/**
 * Inicializacion de la base de datos
 * Crea todas las tablas necesarias si no existen
 * Ejecutar con: node src/database/init.js
 */

require('dotenv').config();
const { sql } = require('../api-client/index');

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
];

async function initDB() {
  console.log('[DB-INIT] Iniciando creacion de tablas...');
  for (const tablaSql of tablas) {
    const nombreMatch = tablaSql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
    const nombre = nombreMatch ? nombreMatch[1] : 'desconocida';
    try {
      await sql.query(tablaSql);
      console.log(`[DB-INIT] Tabla OK: ${nombre}`);
    } catch (err) {
      console.error(`[DB-INIT] Error en tabla ${nombre}:`, err.message);
      process.exit(1);
    }
  }
  console.log('[DB-INIT] Base de datos inicializada correctamente.');
}

// Si se ejecuta directamente
if (require.main === module) {
  initDB().catch(console.error);
}

module.exports = { initDB };
