/**
 * Servidor principal de Spider-Web ARG Pasantias
 * Express + rutas de API + archivos estaticos
 *
 * CAMBIOS DE SEGURIDAD (fases 2-3):
 * - helmet: agrega cabeceras de seguridad HTTP (XSS, Clickjacking, MIME sniffing, HSTS).
 * - CORS: restringido a APP_URL del entorno. Solo cae a '*' en desarrollo local.
 * - Rate limiter global aplicado a toda la API.
 * - Proxy de media (/api/media/:fileId): fileId validado con regex, streaming en lugar
 *   de buffering completo en RAM para no provocar DoS en archivos grandes.
 * - BUG-02: ruta /verify-email eliminada del server.js; ahora vive unicamente en
 *   auth.routes.js bajo /api/auth/verify-email con soporte a ?redirect=1 para
 *   compatibilidad con los links enviados por email.
 * - vercel.json debe redirigir /verify-email -> /server.js -> auth.routes.js (ya funciona
 *   con la regla de rewrite existente).
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { apiLimiter } = require('./src/middleware/rateLimiters');

const app = express();

// ──────────────────────────────────────────────
// SEGURIDAD: CABECERAS HTTP
// ──────────────────────────────────────────────
// helmet gestiona: Content-Security-Policy, X-Content-Type-Options,
// X-Frame-Options, Strict-Transport-Security, Referrer-Policy, etc.
app.use(helmet({
  // Relajar CSP solo para servir imagenes externas del storage y Google Fonts
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],     // para scripts inline del frontend
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:     ["'self'", 'data:', 'https://spiderwebarg.com', 'https://spiderwebargapi.com.ar'],
      connectSrc: ["'self'"],
      frameSrc:   ["'none'"],
    },
  },
  // Desactivar crossOriginEmbedderPolicy para que el proxy de media funcione correctamente
  crossOriginEmbedderPolicy: false,
}));

// ──────────────────────────────────────────────
// CORS
// ──────────────────────────────────────────────
const allowedOrigin = process.env.APP_URL || (process.env.NODE_ENV === 'production' ? false : '*');
app.use(cors({
  origin: allowedOrigin,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ──────────────────────────────────────────────
// PARSING
// ──────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ──────────────────────────────────────────────
// ARCHIVOS ESTATICOS
// ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ──────────────────────────────────────────────
// RATE LIMITER GLOBAL DE API
// ──────────────────────────────────────────────
app.use('/api', apiLimiter);

// ──────────────────────────────────────────────
// RUTAS DE API
// ──────────────────────────────────────────────
app.use('/api/auth',   require('./src/routes/auth.routes'));
app.use('/api/admin',  require('./src/routes/admin.routes'));
app.use('/api/users',  require('./src/routes/users.routes'));
app.use('/api/public', require('./src/routes/public.routes'));
app.use('/api/chat',   require('./src/routes/chat.routes'));
app.use('/api/cursos', require('./src/routes/cursos.routes'));

// ──────────────────────────────────────────────
// PROXY DE MEDIA — con validacion de fileId y streaming
// ──────────────────────────────────────────────
// SEC-04: fileId debe ser estrictamente alfanumérico para evitar path traversal
// y llamadas a endpoints arbitrarios del upstream.
const SAFE_FILE_ID = /^[a-zA-Z0-9_\-]{1,128}$/;

app.get('/api/media/:fileId', async (req, res) => {
  const { fileId } = req.params;

  if (!SAFE_FILE_ID.test(fileId)) {
    return res.status(400).send('ID de archivo invalido.');
  }

  const API_BASE = process.env.API_BASE || 'https://spiderwebargapi.com.ar/api/v1';
  const API_KEY  = process.env.API_KEY;

  try {
    const upstream = await fetch(`${API_BASE}/storage/files/${fileId}`, {
      headers: { 'X-API-KEY': API_KEY },
    });
    if (!upstream.ok) return res.status(404).send('Not found');

    const contentType  = upstream.headers.get('content-type') || 'application/octet-stream';
    const disposition  = upstream.headers.get('content-disposition') || '';
    const contentLen   = upstream.headers.get('content-length');

    const mimeMap = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      mp4: 'video/mp4', mp3: 'audio/mpeg',
    };

    let fname = '';
    if (disposition.includes('filename=')) {
      fname = disposition.split('filename=')[1].replace(/"/g, '').trim();
    }

    const ext = (fname.split('.').pop() || '').toLowerCase();
    let mime = contentType;
    if (mime === 'application/octet-stream' && ext) {
      mime = mimeMap[ext] || mime;
    }
    if (mime === 'application/octet-stream') {
      const urlPath = new URL(upstream.url).pathname;
      const urlExt  = (urlPath.split('.').pop() || '').toLowerCase();
      mime = mimeMap[urlExt] || mime;
    }

    res.set('Content-Type', mime);
    res.set('Cache-Control', 'public, max-age=86400');
    // SEC-04: CORS restringido al origen permitido, no wildcard para archivos privados
    if (allowedOrigin && allowedOrigin !== '*') {
      res.set('Access-Control-Allow-Origin', allowedOrigin);
    }
    if (contentLen) res.set('Content-Length', contentLen);

    const isDownloadable = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ].includes(mime);

    if (isDownloadable) {
      const dlName = fname || `documento_${fileId}.${ext || 'pdf'}`;
      res.set('Content-Disposition', `attachment; filename="${dlName}"`);
    }

    // Streaming directo en lugar de buffering completo en RAM
    // (evita DoS por archivos grandes con await arrayBuffer())
    if (upstream.body) {
      const { Readable } = require('stream');
      Readable.fromWeb(upstream.body).pipe(res);
    } else {
      // Fallback para runtimes sin ReadableStream web
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.send(buffer);
    }
  } catch (err) {
    console.error('[PROXY/MEDIA]', err.message);
    if (!res.headersSent) res.status(500).send('Error');
  }
});

// ──────────────────────────────────────────────
// BUG-02: /verify-email redirige a la ruta unificada en auth.routes.js
// (mantiene compatibilidad con links de email que apuntan a /verify-email)
// ──────────────────────────────────────────────
app.get('/verify-email', (req, res) => {
  const qs = new URLSearchParams({ ...req.query, redirect: '1' }).toString();
  res.redirect(307, `/api/auth/verify-email?${qs}`);
});

// ──────────────────────────────────────────────
// SPA FALLBACK — rutas no API devuelven 404.html
// ──────────────────────────────────────────────
app.use((req, res) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  } else {
    res.status(404).json({ error: 'Ruta no encontrada.' });
  }
});

// ──────────────────────────────────────────────
// INICIAR SERVIDOR (solo en local; Vercel usa module.exports = app)
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  const { initDB }        = require('./src/database/init');
  const { initScheduler } = require('./src/cron/scheduler');
  initDB().catch(err => console.error('[DB-INIT WARNING]', err.message));
  initScheduler();
  app.listen(PORT, () => {
    console.log(`[SERVER] Spider-Web ARG Pasantias corriendo en http://localhost:${PORT}`);
  });
}

module.exports = app;
