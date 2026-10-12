/**
 * Rutas de Cron Jobs — compatibles con Vercel Cron
 *
 * Reemplaza node-cron (que no funciona en entornos serverless) por
 * endpoints HTTP protegidos con X-Cron-Secret.
 *
 * Configurar en vercel.json:
 * {
 *   "crons": [
 *     { "path": "/api/cron/check-meetings",  "schedule": "* /5 * * * *" },
 *     { "path": "/api/cron/check-trainings", "schedule": "* /5 * * * *" }
 *   ]
 * }
 *
 * La variable CRON_SECRET debe definirse en .env y en Vercel Environment Variables.
 * Vercel envia automaticamente la cabecera Authorization con el secret configurado.
 */

const express = require('express');
const router  = express.Router();
const { sql } = require('../api-client/index');
const { sendNotificationEmail } = require('../helpers/email');
const { sqlEscape, escapeHtml } = require('../helpers/sqlSanitizer');

/**
 * Middleware de autenticacion para cron jobs.
 * Verifica el header X-Cron-Secret o el Authorization Bearer.
 */
function cronAuth(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn('[CRON] CRON_SECRET no definido, endpoint desprotegido.');
    return next();
  }
  const provided =
    req.headers['x-cron-secret'] ||
    (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');

  if (provided !== secret) {
    return res.status(401).json({ error: 'No autorizado.' });
  }
  next();
}

// ──────────────────────────────────────────────
// GET /api/cron/check-meetings
// Detecta reuniones de proyectos cuya fecha ya pasó y crea acta pendiente.
// Equivale a la tarea de node-cron anterior.
// ──────────────────────────────────────────────
router.get('/check-meetings', cronAuth, async (req, res) => {
  try {
    const pastMeetings = await sql.query(`
      SELECT id, next_meeting_date, next_meeting_link
      FROM projects
      WHERE next_meeting_date IS NOT NULL AND next_meeting_date <= NOW()
    `);

    let processed = 0;
    for (const proj of (pastMeetings.data || [])) {
      const mDate = proj.next_meeting_date
        ? sqlEscape(String(proj.next_meeting_date).replace('T', ' ').slice(0, 19))
        : 'NOW()';
      const mLink = proj.next_meeting_link ? sqlEscape(proj.next_meeting_link) : 'NULL';

      await sql.query(`
        INSERT INTO project_meetings (project_id, meeting_date, meeting_link, record_notes, attendees_json)
        VALUES (${sqlEscape(proj.id)}, ${mDate}, ${mLink}, 'Pendiente de registrar acta...', '[]')
      `);
      await sql.query(`
        UPDATE projects SET next_meeting_date = NULL, next_meeting_link = NULL WHERE id = ${sqlEscape(proj.id)}
      `);
      processed++;
    }

    console.log(`[CRON/CHECK-MEETINGS] Procesadas ${processed} reuniones vencidas.`);
    return res.json({ ok: true, processed });
  } catch (err) {
    console.error('[CRON/CHECK-MEETINGS]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/cron/check-trainings
// Envia recordatorio 1 hora antes de cada capacitacion programada.
// ──────────────────────────────────────────────
router.get('/check-trainings', cronAuth, async (req, res) => {
  try {
    const upcoming = await sql.query(`
      SELECT id, title, meeting_date, meeting_link
      FROM trainings
      WHERE status = 'scheduled'
        AND meeting_date BETWEEN DATE_ADD(NOW(), INTERVAL 55 MINUTE)
                             AND DATE_ADD(NOW(), INTERVAL 65 MINUTE)
    `);

    let notified = 0;
    for (const t of (upcoming.data || [])) {
      const apps = await sql.query(`
        SELECT u.email, u.name
        FROM training_applications ta
        JOIN users u ON u.id = ta.user_id
        WHERE ta.training_id = ${sqlEscape(t.id)}
      `);

      for (const user of (apps.data || [])) {
        const msg = `
          <h3>Recordatorio de Capacitacion</h3>
          <p>Hola ${escapeHtml(user.name)}, en aproximadamente 1 hora comenzara tu capacitacion:
            "<strong>${escapeHtml(t.title)}</strong>".
          </p>
          <p><strong>Link:</strong> <a href="${escapeHtml(t.meeting_link)}">${escapeHtml(t.meeting_link)}</a></p>
        `;
        await sendNotificationEmail(user.email, 'Recordatorio: Capacitacion en 1 Hora', msg).catch(console.error);
        notified++;
      }
    }

    console.log(`[CRON/CHECK-TRAININGS] Enviados ${notified} recordatorios.`);
    return res.json({ ok: true, notified });
  } catch (err) {
    console.error('[CRON/CHECK-TRAININGS]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
