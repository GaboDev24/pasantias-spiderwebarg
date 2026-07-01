/**
 * Controlador de autenticacion
 * Maneja: registro, login, verificacion de email, validacion de token CEO
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sql } = require('../api-client/index');
const { sendVerificationEmail } = require('../helpers/email');

const JWT_SECRET = process.env.JWT_SECRET;

// ──────────────────────────────────────────────
// REGISTRO
// ──────────────────────────────────────────────
async function register(req, res) {
  try {
    let { name, email, password } = req.body;
    if (email) email = email.trim().toLowerCase();

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nombre, email y contrasena son requeridos.' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email invalido.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'La contrasena debe tener al menos 8 caracteres.' });
    }

    // Verificar si ya existe el email
    const existing = await sql.query(`SELECT id FROM users WHERE email = '${email.replace(/'/g, "''")}'`);
    if (existing.data && existing.data.length > 0) {
      return res.status(409).json({ error: 'El email ya esta registrado.' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const verifyToken = crypto.randomBytes(32).toString('hex');

    await sql.query(
      `INSERT INTO users (name, email, password_hash, role, is_email_verified, is_token_validated, email_verify_token)
       VALUES ('${name.replace(/'/g, "''")}', '${email.replace(/'/g, "''")}', '${password_hash}', 'pasante', 0, 0, '${verifyToken}')`
    );

    // Enviar email de verificacion
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    try {
      await sendVerificationEmail(email, name, verifyToken, baseUrl);
    } catch (emailErr) {
      console.error('[AUTH] Error enviando email de verificacion:', emailErr.message);
    }

    return res.status(201).json({ message: 'Registro exitoso. Revisa tu email para verificar tu cuenta.' });
  } catch (err) {
    console.error('[AUTH/REGISTER]', err.message);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}

// ──────────────────────────────────────────────
// VERIFICAR EMAIL
// ──────────────────────────────────────────────
async function verifyEmail(req, res) {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token requerido.' });

    const result = await sql.query(
      `SELECT id FROM users WHERE email_verify_token = '${token}' AND is_email_verified = 0`
    );

    if (!result.data || result.data.length === 0) {
      return res.status(400).json({ error: 'Token invalido o ya utilizado.' });
    }

    await sql.query(
      `UPDATE users SET is_email_verified = 1, email_verify_token = NULL WHERE email_verify_token = '${token}'`
    );

    return res.json({ message: 'Email verificado correctamente. Ya puedes iniciar sesion.' });
  } catch (err) {
    console.error('[AUTH/VERIFY-EMAIL]', err.message);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}

// ──────────────────────────────────────────────
// LOGIN
// ──────────────────────────────────────────────
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contrasena requeridos.' });
    }

    // --- BYPASS DE ADMIN POR .ENV ---
    const adminEmailEnv = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.trim().toLowerCase() : null;
    const adminPassEnv = process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.trim() : null;
    const providedEmail = email ? email.trim().toLowerCase() : null;

    if (adminEmailEnv && adminPassEnv && 
        providedEmail === adminEmailEnv && password === adminPassEnv) {
      const token = jwt.sign(
        { id: 9999, name: 'Admin Master', email: providedEmail, role: 'ceo', is_token_validated: true },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      return res.json({
        token,
        user: {
          id: 9999,
          name: 'Admin Master',
          email: email,
          role: 'ceo',
          is_email_verified: 1,
          is_token_validated: 1,
          avatar_file_id: null,
          tags: [],
        },
      });
    }
    // ---------------------------------

    const result = await sql.query(
      `SELECT id, name, email, password_hash, role, is_email_verified, is_token_validated, avatar_file_id, tags
       FROM users WHERE email = '${providedEmail.replace(/'/g, "''")}'`
    );

    if (!result.data || result.data.length === 0) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    const user = result.data[0];

    if (!user.is_email_verified) {
      return res.status(403).json({ error: 'Debes verificar tu email antes de iniciar sesion.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role, is_token_validated: user.is_token_validated },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        is_email_verified: user.is_email_verified,
        is_token_validated: user.is_token_validated,
        avatar_file_id: user.avatar_file_id,
        tags: user.tags ? JSON.parse(user.tags) : [],
      },
    });
  } catch (err) {
    console.error('[AUTH/LOGIN]', err.message);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}

// ──────────────────────────────────────────────
// VALIDAR TOKEN CEO (pasante ingresa su token de acceso)
// ──────────────────────────────────────────────
async function validateToken(req, res) {
  try {
    const { token_string } = req.body;
    const userId = req.user.id;

    if (!token_string) {
      return res.status(400).json({ error: 'Token de validacion requerido.' });
    }

    const result = await sql.query(
      `SELECT id, assigned_to_email, is_used FROM validation_tokens WHERE token_string = '${token_string.replace(/'/g, "''")}'`
    );

    if (!result.data || result.data.length === 0) {
      return res.status(404).json({ error: 'Token invalido.' });
    }

    const tokenRow = result.data[0];

    if (tokenRow.is_used) {
      return res.status(409).json({ error: 'Este token ya fue utilizado.' });
    }

    // Verificar que el token fue asignado al email del usuario si tiene assigned_to_email
    if (tokenRow.assigned_to_email && tokenRow.assigned_to_email !== req.user.email) {
      return res.status(403).json({ error: 'Este token no fue asignado a tu email.' });
    }

    // Marcar token como usado y al usuario como validado
    await sql.query(
      `UPDATE validation_tokens SET is_used = 1, used_by = ${userId}, used_at = NOW() WHERE id = ${tokenRow.id}`
    );
    await sql.query(
      `UPDATE users SET is_token_validated = 1 WHERE id = ${userId}`
    );

    const newToken = jwt.sign(
      { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role, is_token_validated: true },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({ message: 'Cuenta validada correctamente. Ahora tienes acceso completo.', token: newToken });
  } catch (err) {
    console.error('[AUTH/VALIDATE-TOKEN]', err.message);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}

module.exports = { register, login, verifyEmail, validateToken };
