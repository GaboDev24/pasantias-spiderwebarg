/**
 * Controlador de Notificaciones para usuarios (campanita)
 */

const { sql } = require('../api-client/index');

async function getMyNotifications(req, res) {
  try {
    const result = await sql.query(
      `SELECT id, type, title, message, is_read, payload_json, created_at
       FROM notifications
       WHERE user_id = ${req.user.id}
       ORDER BY created_at DESC
       LIMIT 50`
    );
    const notifications = (result.data || []).map(n => {
      let payload = null;
      try { payload = n.payload_json ? JSON.parse(n.payload_json) : null; } catch (_) {}
      return { ...n, payload };
    });
    return res.json({ notifications });
  } catch (err) {
    console.error('[NOTIFICATIONS/LIST]', err.message);
    return res.status(500).json({ error: 'Error obteniendo notificaciones.' });
  }
}

async function getUnreadCount(req, res) {
  try {
    const result = await sql.query(
      `SELECT COUNT(*) AS count FROM notifications WHERE user_id = ${req.user.id} AND is_read = 0`
    );
    const unreadCount = result.data && result.data[0] ? parseInt(result.data[0].count) : 0;
    return res.json({ unreadCount });
  } catch (err) {
    console.error('[NOTIFICATIONS/UNREAD-COUNT]', err.message);
    return res.status(500).json({ error: 'Error obteniendo conteo de notificaciones.' });
  }
}

async function markAsRead(req, res) {
  try {
    const { id } = req.params;
    await sql.query(
      `UPDATE notifications SET is_read = 1 WHERE id = ${parseInt(id)} AND user_id = ${req.user.id}`
    );
    return res.json({ message: 'Notificación marcada como leída.' });
  } catch (err) {
    console.error('[NOTIFICATIONS/MARK-READ]', err.message);
    return res.status(500).json({ error: 'Error al actualizar notificación.' });
  }
}

async function markAllRead(req, res) {
  try {
    await sql.query(
      `UPDATE notifications SET is_read = 1 WHERE user_id = ${req.user.id}`
    );
    return res.json({ message: 'Todas las notificaciones fueron marcadas como leídas.' });
  } catch (err) {
    console.error('[NOTIFICATIONS/MARK-ALL-READ]', err.message);
    return res.status(500).json({ error: 'Error al marcar todas las notificaciones como leídas.' });
  }
}

module.exports = { getMyNotifications, getUnreadCount, markAsRead, markAllRead };
