/**
 * Middleware de autenticacion JWT
 * Verifica el token en el header Authorization: Bearer <token>
 */

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Requiere que el usuario este autenticado
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado: token requerido.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalido o expirado.' });
  }
}

/**
 * Requiere que el usuario sea admin o ceo
 */
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin' && req.user.role !== 'ceo') {
      return res.status(403).json({ error: 'Acceso denegado: se requieren permisos de administrador.' });
    }
    next();
  });
}

/**
 * Requiere que el usuario sea exclusivamente ceo
 */
function requireCeo(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'ceo') {
      return res.status(403).json({ error: 'Acceso denegado: se requieren permisos de CEO.' });
    }
    next();
  });
}

/**
 * Middleware opcional: si hay token lo procesa y setea req.user, si no, pasa igual.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (err) {
      // Ignorar token invalido en rutas opcionales
    }
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireCeo, optionalAuth };
