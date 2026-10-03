const cron = require('node-cron');
const { sql } = require('../api-client/index');
const { sendNotificationEmail } = require('../helpers/email');

function initScheduler() {
  // Tarea de reuniones: Desactivar reuniones de proyectos que ya pasaron
  cron.schedule('*/5 * * * *', async () => {
    try {
      // Si la fecha de la próxima reunión es menor o igual a AHORA, lo pasamos al historial para que se complete el acta.
      // O simplemente se puede dejar ahí, pero para que el frontend lo sepa, podemos enviar un evento.
      // Según requerimiento: "cuando llegue la fecha y la hora se desactiva el recordatorio y queda guardada la fecha de la reunion y con el respectivo registro de lo que sucedio"
      // Lo creamos como "pendiente de registro" y limpiamos en el proyecto.
      
      const pastMeetings = await sql.query(`
        SELECT id, next_meeting_date, next_meeting_link 
        FROM projects 
        WHERE next_meeting_date IS NOT NULL AND next_meeting_date <= NOW()
      `);
      
      for (const proj of (pastMeetings.data || [])) {
        const mDate = proj.next_meeting_date ? `'${String(proj.next_meeting_date).replace('T', ' ').slice(0,19)}'` : 'NOW()';
        const mLink = proj.next_meeting_link ? `'${proj.next_meeting_link.replace(/'/g, "''")}'` : 'NULL';
        
        // Creamos el registro vacío indicando que está pendiente de cargar el acta
        await sql.query(`
          INSERT INTO project_meetings (project_id, meeting_date, meeting_link, record_notes, attendees_json)
          VALUES (${proj.id}, ${mDate}, ${mLink}, 'Pendiente de registrar acta...', '[]')
        `);
        
        // Limpiamos del proyecto
        await sql.query(`
          UPDATE projects SET next_meeting_date = NULL, next_meeting_link = NULL WHERE id = ${proj.id}
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
          WHERE ta.training_id = ${t.id}
        `);
        
        for (const user of (apps.data || [])) {
          const msg = `
            <h3>Recordatorio de Capacitación</h3>
            <p>Hola ${user.name}, te recordamos que en aproximadamente 1 hora comenzará tu capacitación: "<strong>${t.title}</strong>".</p>
            <p><strong>Link de la reunión:</strong> <a href="${t.meeting_link}">${t.meeting_link}</a></p>
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
