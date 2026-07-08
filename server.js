/**
 * Servidor principal de Spider-Web ARG Pasantias
 * Express + rutas de API + archivos estaticos
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// ──────────────────────────────────────────────
// MIDDLEWARES GLOBALES
// ──────────────────────────────────────────────
app.use(cors({
  origin: process.env.APP_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ──────────────────────────────────────────────
// ARCHIVOS ESTATICOS
// ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ──────────────────────────────────────────────
// RUTAS DE API
// ──────────────────────────────────────────────
app.use('/api/auth',   require('./src/routes/auth.routes'));
app.use('/api/admin',  require('./src/routes/admin.routes'));
app.use('/api/users',  require('./src/routes/users.routes'));
app.use('/api/public', require('./src/routes/public.routes'));
app.use('/api/chat',   require('./src/routes/chat.routes'));

// ──────────────────────────────────────────────
// PROXY DE MEDIA (sirve archivos con MIME correcto)
// ──────────────────────────────────────────────
app.get('/api/media/:fileId', async (req, res) => {
  const { fileId } = req.params;
  const API_BASE = process.env.API_BASE || 'https://spiderwebargapi.com.ar/api/v1';
  const API_KEY  = process.env.API_KEY;

  try {
    const upstream = await fetch(`${API_BASE}/storage/files/${fileId}`, {
      headers: { 'X-API-KEY': API_KEY },
    });
    if (!upstream.ok) return res.status(404).send('Not found');

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const disposition = upstream.headers.get('content-disposition') || '';

    // Inferir MIME del nombre de archivo si viene como octet-stream
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

    // Si no se pudo inferir desde disposition, intentar con el path de la URL upstream
    if (mime === 'application/octet-stream') {
      const urlPath = new URL(upstream.url).pathname;
      const urlExt = (urlPath.split('.').pop() || '').toLowerCase();
      mime = mimeMap[urlExt] || mime;
    }

    res.set('Content-Type', mime);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Access-Control-Allow-Origin', '*');

    // Documentos: forzar descarga con nombre amigable
    const isDownloadable = ['application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(mime);
    if (isDownloadable) {
      const dlName = fname || `documento_${fileId}.${ext || 'pdf'}`;
      res.set('Content-Disposition', `attachment; filename="${dlName}"`);
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    console.error('[PROXY/MEDIA]', err.message);
    res.status(500).send('Error');
  }
});

// ──────────────────────────────────────────────
// VERIFICACION DE EMAIL (redirect desde link)
// ──────────────────────────────────────────────
app.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/login.html?error=token_invalido');

  try {
    const { sql } = require('./src/api-client/index');
    const result = await sql.query(
      `SELECT id FROM users WHERE email_verify_token = '${token}' AND is_email_verified = 0`
    );

    if (!result.data || result.data.length === 0) {
      return res.redirect('/login.html?error=token_invalido');
    }

    await sql.query(
      `UPDATE users SET is_email_verified = 1, email_verify_token = NULL WHERE email_verify_token = '${token}'`
    );

    return res.redirect('/login.html?success=email_verificado');
  } catch (err) {
    console.error('[VERIFY-EMAIL]', err.message);
    return res.redirect('/login.html?error=error_servidor');
  }
});

// ──────────────────────────────────────────────
// SPA FALLBACK — todas las rutas no API devuelven index.html
// ──────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'Ruta no encontrada.' });
  }
});

// ──────────────────────────────────────────────
// INICIAR SERVIDOR (solo en local, en Vercel no se usa)
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[SERVER] Spider-Web ARG Pasantias corriendo en http://localhost:${PORT}`);
  });
}

module.exports = app;
