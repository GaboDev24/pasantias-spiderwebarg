const cron = require('node-cron');
const { sql } = require('../api-client/index');
const { sendNotificationEmail } = require('../helpers/email');
const { sqlEscape, escapeHtml } = require('../helpers/sqlSanitizer');

function initScheduler() {
  // Tarea de reuniones: Desactivar reuniones de proyectos que ya pasaron
  cron.schedule('*/5 * * * *', async () => {
    try {
      const pastMeetings = await sql.query(`
        SELECT id, next_meeting_date, next_meeting_link 
        FROM projects 
        WHERE next_meeting_date IS NOT NULL AND next_meeting_date <= NOW()
      `);
      
      for (const proj of (pastMeetings.data || [])) {
        const mDate = proj.next_meeting_date ? sqlEscape(proj.next_meeting_date) : 'NOW()';
        const mLink = proj.next_meeting_link ? sqlEscape(proj.next_meeting_link) : 'NULL';
        
        // Creamos el registro indicando que está pendiente de cargar el acta
        await sql.query(`
          INSERT INTO project_meetings (project_id, meeting_date, meeting_link, record_notes, attendees_json)
          VALUES (${sqlEscape(proj.id)}, ${mDate}, ${mLink}, 'Pendiente de registrar acta...', '[]')
        `);
        
        // Limpiamos del proyecto
        await sql.query(`
          UPDATE projects SET next_meeting_date = NULL, next_meeting_link = NULL WHERE id = ${sqlEscape(proj.id)}
        `);
      }
    } catch (err) {
      console.error('[CRON/PROJECT-MEETINGS]', err.message);
    }
  });

  // Tarea de capacitaciones: Avisar 1 hora antes
  // Asumiremos que se corre cada minuto o cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    try {
      // Buscar capacitaciones scheduled cuya fecha sea dentro de los próximos 60-65 minutos
      // (Para evitar envíos duplicados habría que marcar que ya se notificó, 
      // pero como simplificación podemos chequear que `meeting_date` este entre NOW() + 55min y NOW() + 60min)
      
      const upcoming = await sql.query(`
        SELECT id, title, meeting_date, meeting_link 
        FROM trainings 
        WHERE status = 'scheduled' 
        AND meeting_date BETWEEN DATE_ADD(NOW(), INTERVAL 55 MINUTE) AND DATE_ADD(NOW(), INTERVAL 60 MINUTE)
      `);
      
      for (const t of (upcoming.data || [])) {
        // Buscar usuarios postulados
        const apps = await sql.query(`
          SELECT u.email, u.name 
          FROM training_applications ta
          JOIN users u ON u.id = ta.user_id
          WHERE ta.training_id = ${sqlEscape(t.id)}
        `);
        
        for (const user of (apps.data || [])) {
          const safeName = escapeHtml(user.name);
          const safeTitle = escapeHtml(t.title);
          const rawLink = (t.meeting_link || '').trim();
          const safeLink = /^https?:\/\//i.test(rawLink) ? escapeHtml(rawLink) : '';
          const linkHtml = safeLink
            ? `<p><strong>Link de la reunión:</strong> <a href="${safeLink}">${safeLink}</a></p>`
            : '';
          const msg = `
            <h3>Recordatorio de Capacitación</h3>
            <p>Hola ${safeName}, te recordamos que en aproximadamente 1 hora comenzará tu capacitación: "<strong>${safeTitle}</strong>".</p>
            ${linkHtml}
          `;
          await sendNotificationEmail(user.email, 'Recordatorio: Capacitación en 1 Hora', msg).catch(console.error);
        }
      }
    } catch (err) {
      console.error('[CRON/TRAININGS]', err.message);
    }
  });

  console.log('[SCHEDULER] Tareas programadas inicializadas.');
}

module.exports = { initScheduler };
