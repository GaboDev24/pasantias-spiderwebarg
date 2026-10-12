/**
 * Controlador de autenticacion
 * Maneja: registro, login, verificacion de email, validacion de token CEO,
 * aceptacion de terminos y seed del administrador.
 *
 * CAMBIOS DE SEGURIDAD:
 * - SQL construido con sqlEscape() en lugar de concatenacion directa o replace naive.
 * - JSON.parse reemplazado por safeJsonParse().
 * - Valores TINYINT normalizados con toBool().
 * - Eliminado bypass de admin en memoria (id: 9999). El administrador
 *   se crea ahora como usuario real en BD mediante seedAdmin() en init.js.
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sql } = require('../api-client/index');
const { sendVerificationEmail } = require('../helpers/email');
const { sqlEscape, toInt, safeJsonParse, toBool } = require('../helpers/sqlSanitizer');

const JWT_SECRET = process.env.JWT_SECRET;

// ──────────────────────────────────────────────
// REGISTRO
// ──────────────────────────────────────────────
async function register(req, res) {
  try {
    let { name, email, password, accepted_terms } = req.body;
    if (email) email = email.trim().toLowerCase();

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nombre, email y contrasena son requeridos.' });
    }

    if (!accepted_terms) {
      return res.status(400).json({ error: 'Debes aceptar los Terminos y Condiciones para registrarte.' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email invalido.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'La contrasena debe tener al menos 8 caracteres.' });
    }

    const existing = await sql.query(
      `SELECT id FROM users WHERE email = ${sqlEscape(email)}`
    );
    if (existing.data && existing.data.length > 0) {
      return res.status(409).json({ error: 'El email ya esta registrado.' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const verifyToken = crypto.randomBytes(32).toString('hex');

    await sql.query(
      `INSERT INTO users (name, email, password_hash, role, is_email_verified, is_token_validated, email_verify_token, accepted_terms)
       VALUES (${sqlEscape(name)}, ${sqlEscape(email)}, ${sqlEscape(password_hash)}, 'pasante', 0, 0, ${sqlEscape(verifyToken)}, 1)`
    );

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
    const { token, redirect } = req.query;
    if (!token) {
      if (redirect) return res.redirect('/login.html?error=token_invalido');
      return res.status(400).json({ error: 'Token requerido.' });
    }

    const result = await sql.query(
      `SELECT id FROM users WHERE email_verify_token = ${sqlEscape(token)} AND is_email_verified = 0`
    );

    if (!result.data || result.data.length === 0) {
      if (redirect) return res.redirect('/login.html?error=token_invalido');
      return res.status(400).json({ error: 'Token invalido o ya utilizado.' });
    }

    await sql.query(
      `UPDATE users SET is_email_verified = 1, email_verify_token = NULL WHERE email_verify_token = ${sqlEscape(token)}`
    );

    if (redirect) return res.redirect('/login.html?success=email_verificado');
    return res.json({ message: 'Email verificado correctamente. Ya puedes iniciar sesion.' });
  } catch (err) {
    console.error('[AUTH/VERIFY-EMAIL]', err.message);
    if (req.query.redirect) return res.redirect('/login.html?error=error_servidor');
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

    const providedEmail = email.trim().toLowerCase();

    const result = await sql.query(
      `SELECT id, name, email, password_hash, role, is_email_verified, is_token_validated, avatar_file_id, tags, accepted_terms
       FROM users WHERE email = ${sqlEscape(providedEmail)}`
    );

    if (!result.data || result.data.length === 0) {
      console.warn(`[AUTH/LOGIN] Intento fallido (email no existe): ${providedEmail}`);
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    const user = result.data[0];

    // toBool normaliza "0"/"1" que la API puede devolver como string
    if (!toBool(user.is_email_verified)) {
      console.warn(`[AUTH/LOGIN] Intento fallido (email no verificado): ${providedEmail}`);
      return res.status(403).json({ error: 'Debes verificar tu email antes de iniciar sesion. Revisa tu bandeja de entrada.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      console.warn(`[AUTH/LOGIN] Intento fallido (password incorrecta): ${providedEmail}`);
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    console.log(`[AUTH/LOGIN] Inicio de sesion exitoso: ${user.email} (Rol: ${user.role})`);

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        is_token_validated: toBool(user.is_token_validated),
        accepted_terms: toBool(user.accepted_terms),
      },
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
        is_email_verified: toBool(user.is_email_verified),
        is_token_validated: toBool(user.is_token_validated),
        accepted_terms: toBool(user.accepted_terms),
        avatar_file_id: user.avatar_file_id,
        tags: safeJsonParse(user.tags, []),
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
      `SELECT id, assigned_to_email, is_used FROM validation_tokens WHERE token_string = ${sqlEscape(token_string)}`
    );

    if (!result.data || result.data.length === 0) {
      return res.status(404).json({ error: 'Token invalido.' });
    }

    const tokenRow = result.data[0];

    // Normalizar is_used con toBool para evitar "0" evaluado como true
    if (toBool(tokenRow.is_used)) {
      return res.status(409).json({ error: 'Este token ya fue utilizado.' });
    }

    if (tokenRow.assigned_to_email && tokenRow.assigned_to_email !== req.user.email) {
      return res.status(403).json({ error: 'Este token no fue asignado a tu email.' });
    }

    await sql.query(
      `UPDATE validation_tokens SET is_used = 1, used_by = ${sqlEscape(userId)}, used_at = NOW() WHERE id = ${sqlEscape(toInt(tokenRow.id))}`
    );
    await sql.query(
      `UPDATE users SET is_token_validated = 1 WHERE id = ${sqlEscape(userId)}`
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

// ──────────────────────────────────────────────
// ACEPTAR TÉRMINOS Y CONDICIONES
// ──────────────────────────────────────────────
async function acceptTerms(req, res) {
  try {
    const userId = req.user.id;
    await sql.query(`UPDATE users SET accepted_terms = 1 WHERE id = ${sqlEscape(userId)}`);

    const token = jwt.sign(
      {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        is_token_validated: req.user.is_token_validated,
        accepted_terms: true,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({ message: 'Terminos aceptados correctamente.', token });
  } catch (err) {
    console.error('[AUTH/ACCEPT-TERMS]', err.message);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}

module.exports = { register, login, verifyEmail, validateToken, acceptTerms };
