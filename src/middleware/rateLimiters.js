/**
 * Rate limiters centralizados para la API.
 * Se usan en las rutas para proteger contra fuerza bruta,
 * abuso de registro y spam de correos.
 */

const rateLimit = require('express-rate-limit');

/**
 * Limiter para login y validación de token CEO.
 * Máximo 10 intentos por 15 minutos por IP.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Por favor, espera 15 minutos antes de volver a intentarlo.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Limiter para registro de nuevos usuarios.
 * Máximo 5 registros por hora por IP.
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Límite de registros alcanzado para esta dirección IP. Intenta nuevamente en 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Limiter estricto para endpoints que envían correos (test-email).
 * Máximo 3 envíos por hora por IP.
 */
const mailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Límite de envíos de correo alcanzado. Intenta nuevamente en 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Limiter general para la API.
 * 200 peticiones por minuto por IP (protección básica anti-scraping).
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Demasiadas peticiones desde esta IP. Por favor, espera un momento.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authLimiter, registerLimiter, mailLimiter, apiLimiter };
