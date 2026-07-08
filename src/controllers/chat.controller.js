/**
 * Controlador de chat interno
 * Permite a CEOs enviar tokens y mensajes a pasantes
 */

const { sql } = require('../api-client/index');

// Enviar mensaje
async function sendMessage(req, res) {
  try {
    const { receiver_id, content } = req.body;
    const senderId = req.user.id;

    if (!receiver_id || !content || !content.trim()) {
      return res.status(400).json({ error: 'Destinatario y contenido requeridos.' });
    }

    // Admin bypass (id 9999) no existe en BD — solo verificar si no es ese id
    if (parseInt(receiver_id) !== 9999) {
      const userCheck = await sql.query(`SELECT id FROM users WHERE id = ${parseInt(receiver_id)}`);
      if (!userCheck.data || userCheck.data.length === 0) {
        return res.status(404).json({ error: 'Usuario destinatario no encontrado.' });
      }
    }

    await sql.query(
      `INSERT INTO chat_messages (sender_id, receiver_id, content)
       VALUES (${senderId}, ${parseInt(receiver_id)}, '${content.trim().replace(/'/g, "''")}')`
    );

    return res.status(201).json({ message: 'Mensaje enviado.' });
  } catch (err) {
    console.error('[CHAT/SEND]', err.message);
    return res.status(500).json({ error: 'Error enviando mensaje.' });
  }
}

// Obtener conversacion entre dos usuarios
async function getConversation(req, res) {
  try {
    const { userId } = req.params;
    const myId = req.user.id;

    const result = await sql.query(
      `SELECT cm.id, cm.sender_id, cm.receiver_id, cm.content, cm.is_read, cm.sent_at,
              COALESCE(s.name, 'Admin') AS sender_name,
              COALESCE(r.name, 'Admin') AS receiver_name
       FROM chat_messages cm
       LEFT JOIN users s ON s.id = cm.sender_id
       LEFT JOIN users r ON r.id = cm.receiver_id
       WHERE (cm.sender_id = ${myId} AND cm.receiver_id = ${parseInt(userId)})
          OR (cm.sender_id = ${parseInt(userId)} AND cm.receiver_id = ${myId})
       ORDER BY cm.sent_at ASC
       LIMIT 100`
    );

    // Marcar mensajes recibidos como leidos
    await sql.query(
      `UPDATE chat_messages SET is_read = 1 WHERE receiver_id = ${myId} AND sender_id = ${parseInt(userId)} AND is_read = 0`
    );

    return res.json({ messages: result.data || [] });
  } catch (err) {
    console.error('[CHAT/CONVERSATION]', err.message);
    return res.status(500).json({ error: 'Error obteniendo conversacion.' });
  }
}

// Listar conversaciones del usuario (bandeja de entrada)
async function getInbox(req, res) {
  try {
    const myId = req.user.id;

    // Obtener los ultimos mensajes de cada conversacion
    const result = await sql.query(
      `SELECT cm.*, u.name AS other_name, u.avatar_file_id AS other_avatar,
              (SELECT COUNT(*) FROM chat_messages WHERE receiver_id = ${myId} AND sender_id = u.id AND is_read = 0) AS unread_count
       FROM chat_messages cm
       JOIN users u ON u.id = IF(cm.sender_id = ${myId}, cm.receiver_id, cm.sender_id)
       WHERE cm.id IN (
         SELECT MAX(id) FROM chat_messages
         WHERE sender_id = ${myId} OR receiver_id = ${myId}
         GROUP BY IF(sender_id = ${myId}, receiver_id, sender_id)
       )
       ORDER BY cm.sent_at DESC`
    );

    return res.json({ inbox: result.data || [] });
  } catch (err) {
    console.error('[CHAT/INBOX]', err.message);
    return res.status(500).json({ error: 'Error obteniendo bandeja.' });
  }
}

// Listar todos los usuarios disponibles para chatear (admin ve todos, pasante solo admin/ceo)
async function getChatUsers(req, res) {
  try {
    const myId = req.user.id;
    let query;

    if (req.user.role === 'admin' || req.user.role === 'ceo') {
      query = `SELECT id, name, email, role, avatar_file_id FROM users WHERE id != ${myId} ORDER BY role DESC, name ASC`;
    } else {
      query = `SELECT id, name, email, role, avatar_file_id FROM users WHERE id != ${myId} AND role IN ('admin', 'ceo') ORDER BY name ASC`;
    }

    const result = await sql.query(query);
    let users = result.data || [];

    // Si el usuario es pasante, agregar el CEO del sistema (admin bypass) como entrada virtual
    if (req.user.role !== 'admin' && req.user.role !== 'ceo') {
      users = [
        { id: 9999, name: 'Spider-Web ARG CEO', email: 'admin@spiderweb.com', role: 'ceo', avatar_file_id: null },
        ...users,
      ];
    }

    return res.json({ users });
  } catch (err) {
    console.error('[CHAT/USERS]', err.message);
    return res.status(500).json({ error: 'Error obteniendo usuarios.' });
  }
}

// Contar mensajes no leidos (para badge de notificacion)
async function getUnreadCount(req, res) {
  try {
    const result = await sql.query(
      `SELECT COUNT(*) AS count FROM chat_messages WHERE receiver_id = ${req.user.id} AND is_read = 0`
    );
    return res.json({ count: result.data && result.data[0] ? result.data[0].count : 0 });
  } catch (err) {
    console.error('[CHAT/UNREAD]', err.message);
    return res.status(500).json({ error: 'Error contando mensajes.' });
  }
}

module.exports = { sendMessage, getConversation, getInbox, getChatUsers, getUnreadCount };
