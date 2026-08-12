/**
 * Helper para crear notificaciones internas y enviar correos automáticos
 */

const { sql } = require('../api-client/index');
const { sendNotificationEmail } = require('./email');

/**
 * Notifica a un usuario específico.
 * Crea una notificación en la BD (campanita) y, si el usuario tiene activadas las notificaciones por email, envía un mail.
 * 
 * @param {number} userId - ID del usuario a notificar
 * @param {string} type - Tipo de notificación ('application_status', 'project_progress', 'conference_update', etc.)
 * @param {string} title - Título de la notificación
 * @param {string} message - Mensaje o descripción detallada
 * @param {object} [payload] - Datos adjuntos opcionales (ej: { projectId: 1 })
 */
async function notifyUser(userId, type, title, message, payload = null) {
  if (!userId || userId === 9999) return;

  try {
    // 1. Obtener datos del usuario
    const userRes = await sql.query(`SELECT email, name, email_notifications FROM users WHERE id = ${parseInt(userId)}`);
    if (!userRes.data || userRes.data.length === 0) return;
    const user = userRes.data[0];

    // 2. Guardar en base de datos para la campanita
    const payloadJson = payload ? `'${JSON.stringify(payload).replace(/'/g, "''")}'` : 'NULL';
    await sql.query(
      `INSERT INTO notifications (user_id, type, title, message, payload_json)
       VALUES (${parseInt(userId)}, '${type}', '${title.replace(/'/g, "''")}', '${message.replace(/'/g, "''")}', ${payloadJson})`
    );

    // 3. Enviar email si tiene la preferencia activada
    if (parseInt(user.email_notifications) === 1 && user.email) {
      const htmlContent = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0b0c10; color: #f5f5f5; padding: 40px; max-width: 600px; margin: 0 auto; border: 1px solid rgba(163,0,0,0.3); border-radius: 8px;">
          <div style="border-bottom: 2px solid #A30000; padding-bottom: 15px; margin-bottom: 25px;">
            <span style="font-size: 0.7rem; letter-spacing: 0.2em; color: #A30000; text-transform: uppercase; font-weight: bold;">Spider-Web ARG — Notificación</span>
            <h2 style="font-size: 1.4rem; margin: 10px 0 0; color: #ffffff; text-transform: uppercase;">${title}</h2>
          </div>
          <p style="color: rgba(245,245,245,0.85); font-size: 0.95rem; line-height: 1.6; margin-bottom: 20px;">Hola <strong>${user.name}</strong>,</p>
          <div style="background: rgba(255,255,255,0.03); border-left: 4px solid #A30000; padding: 15px 20px; margin-bottom: 25px; border-radius: 0 4px 4px 0;">
            <p style="color: #e0e0e0; font-size: 0.9rem; line-height: 1.6; margin: 0;">${message}</p>
          </div>
          <p style="color: rgba(245,245,245,0.5); font-size: 0.8rem; margin-top: 30px;">Puedes revisar tus postulaciones y detalles ingresando a tu panel en la plataforma.</p>
          <div style="border-top: 1px solid rgba(255,255,255,0.1); margin-top: 30px; padding-top: 15px; text-align: center;">
            <p style="color: rgba(245,245,245,0.3); font-size: 0.65rem; letter-spacing: 0.1em; margin: 0;">SPIDER-WEB ARG — PLATAFORMA DE PASANTÍAS</p>
          </div>
        </div>
      `;

      try {
        await sendNotificationEmail(user.email, `[Spider-Web ARG] ${title}`, htmlContent);
      } catch (eErr) {
        console.error(`[NOTIFY] Error enviando mail a ${user.email}:`, eErr.message);
      }
    }
  } catch (err) {
    console.error('[NOTIFY] Error creando notificación:', err.message);
  }
}

/**
 * Notifica a un grupo de usuarios (ej: pasantes inscriptos a un proyecto)
 * @param {Array<number>} userIds - Lista de IDs de usuario
 * @param {string} type
 * @param {string} title
 * @param {string} message
 * @param {object} [payload]
 */
async function notifyUsers(userIds, type, title, message, payload = null) {
  if (!Array.isArray(userIds) || userIds.length === 0) return;
  for (const uid of userIds) {
    await notifyUser(uid, type, title, message, payload);
  }
}

module.exports = { notifyUser, notifyUsers };
