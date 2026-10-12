/**
 * Controlador de chat interno
 * Permite a usuarios enviarse mensajes y gestionar contactos.
 *
 * CAMBIOS DE SEGURIDAD:
 * - SQL construido con sqlEscape() / toInt().
 * - Eliminada la referencia al id virtual 9999 (el admin existe en BD).
 * - Limite de contenido de mensajes (max 2000 caracteres).
 */

const { sql } = require('../api-client/index');
const { sqlEscape, toInt } = require('../helpers/sqlSanitizer');

// Enviar mensaje
async function sendMessage(req, res) {
  try {
    const { receiver_id, content } = req.body;
    const senderId = req.user.id;

    if (!receiver_id || !content || !content.trim()) {
      return res.status(400).json({ error: 'Destinatario y contenido requeridos.' });
    }

    // Limitar longitud del mensaje
    const trimmedContent = content.trim().slice(0, 2000);

    const userCheck = await sql.query(
      `SELECT id FROM users WHERE id = ${sqlEscape(toInt(receiver_id))}`
    );
    if (!userCheck.data || userCheck.data.length === 0) {
      return res.status(404).json({ error: 'Usuario destinatario no encontrado.' });
    }

    await sql.query(
      `INSERT INTO chat_messages (sender_id, receiver_id, content)
       VALUES (${sqlEscape(senderId)}, ${sqlEscape(toInt(receiver_id))}, ${sqlEscape(trimmedContent)})`
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
    const userId = toInt(req.params.userId);
    const myId = req.user.id;

    const result = await sql.query(
      `SELECT cm.id, cm.sender_id, cm.receiver_id, cm.content, cm.is_read, cm.sent_at,
              COALESCE(s.name, 'Admin') AS sender_name,
              COALESCE(r.name, 'Admin') AS receiver_name
       FROM chat_messages cm
       LEFT JOIN users s ON s.id = cm.sender_id
       LEFT JOIN users r ON r.id = cm.receiver_id
       WHERE (cm.sender_id = ${sqlEscape(myId)} AND cm.receiver_id = ${sqlEscape(userId)})
          OR (cm.sender_id = ${sqlEscape(userId)} AND cm.receiver_id = ${sqlEscape(myId)})
       ORDER BY cm.sent_at ASC
       LIMIT 100`
    );

    await sql.query(
      `UPDATE chat_messages SET is_read = 1 WHERE receiver_id = ${sqlEscape(myId)} AND sender_id = ${sqlEscape(userId)} AND is_read = 0`
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

    const result = await sql.query(
      `SELECT cm.*, u.name AS other_name, u.avatar_file_id AS other_avatar,
              (SELECT COUNT(*) FROM chat_messages WHERE receiver_id = ${sqlEscape(myId)} AND sender_id = u.id AND is_read = 0) AS unread_count
       FROM chat_messages cm
       JOIN users u ON u.id = IF(cm.sender_id = ${sqlEscape(myId)}, cm.receiver_id, cm.sender_id)
       WHERE cm.id IN (
         SELECT MAX(id) FROM chat_messages
         WHERE sender_id = ${sqlEscape(myId)} OR receiver_id = ${sqlEscape(myId)}
         GROUP BY IF(sender_id = ${sqlEscape(myId)}, receiver_id, sender_id)
       )
       ORDER BY cm.sent_at DESC`
    );

    return res.json({ inbox: result.data || [] });
  } catch (err) {
    console.error('[CHAT/INBOX]', err.message);
    return res.status(500).json({ error: 'Error obteniendo bandeja.' });
  }
}

// Listar todos los usuarios disponibles para chatear
async function getChatUsers(req, res) {
  try {
    const myId = req.user.id;
    let query;

    if (req.user.role === 'admin' || req.user.role === 'ceo') {
      query = `SELECT u.id, u.name, u.email, u.role, u.avatar_file_id,
                      IF(uf.id IS NOT NULL, 1, 0) AS is_friend
               FROM users u
               LEFT JOIN user_friends uf ON uf.friend_id = u.id AND uf.user_id = ${sqlEscape(myId)}
               WHERE u.id != ${sqlEscape(myId)}
               ORDER BY is_friend DESC, u.role DESC, u.name ASC`;
    } else {
      query = `SELECT u.id, u.name, u.email, u.role, u.avatar_file_id,
                      IF(uf.id IS NOT NULL, 1, 0) AS is_friend
               FROM users u
               LEFT JOIN user_friends uf ON uf.friend_id = u.id AND uf.user_id = ${sqlEscape(myId)}
               WHERE u.id != ${sqlEscape(myId)} AND (u.role IN ('admin', 'ceo') OR uf.id IS NOT NULL)
               ORDER BY is_friend DESC, u.name ASC`;
    }

    const result = await sql.query(query);
    return res.json({ users: result.data || [] });
  } catch (err) {
    console.error('[CHAT/USERS]', err.message);
    return res.status(500).json({ error: 'Error obteniendo usuarios.' });
  }
}

// Contar mensajes no leidos
async function getUnreadCount(req, res) {
  try {
    const result = await sql.query(
      `SELECT COUNT(*) AS count FROM chat_messages WHERE receiver_id = ${sqlEscape(req.user.id)} AND is_read = 0`
    );
    return res.json({ count: result.data && result.data[0] ? result.data[0].count : 0 });
  } catch (err) {
    console.error('[CHAT/UNREAD]', err.message);
    return res.status(500).json({ error: 'Error contando mensajes.' });
  }
}

// Buscar usuarios por término de búsqueda
async function searchUsers(req, res) {
  try {
    const myId = req.user.id;
    const q = req.query.q ? req.query.q.trim().slice(0, 100) : '';
    if (!q) return res.json({ users: [] });

    const result = await sql.query(
      `SELECT u.id, u.name, u.email, u.role, u.avatar_file_id,
              IF(uf.id IS NOT NULL, 1, 0) AS is_friend
       FROM users u
       LEFT JOIN user_friends uf ON uf.friend_id = u.id AND uf.user_id = ${sqlEscape(myId)}
       WHERE u.id != ${sqlEscape(myId)} AND (u.name LIKE ${sqlEscape('%' + q + '%')} OR u.email LIKE ${sqlEscape('%' + q + '%')} OR u.role LIKE ${sqlEscape('%' + q + '%')})
       ORDER BY is_friend DESC, u.name ASC
       LIMIT 30`
    );
    return res.json({ users: result.data || [] });
  } catch (err) {
    console.error('[CHAT/SEARCH]', err.message);
    return res.status(500).json({ error: 'Error buscando usuarios.' });
  }
}

// Obtener lista de amigos
async function getFriends(req, res) {
  try {
    const myId = req.user.id;
    const result = await sql.query(
      `SELECT u.id, u.name, u.email, u.role, u.avatar_file_id, 1 AS is_friend
       FROM user_friends uf
       JOIN users u ON u.id = uf.friend_id
       WHERE uf.user_id = ${sqlEscape(myId)}
       ORDER BY u.name ASC`
    );
    return res.json({ friends: result.data || [] });
  } catch (err) {
    console.error('[CHAT/FRIENDS]', err.message);
    return res.status(500).json({ error: 'Error obteniendo amigos.' });
  }
}

// Añadir usuario a amigos
async function addFriend(req, res) {
  try {
    const myId = req.user.id;
    const friendId = toInt(req.params.friendId);
    if (friendId === myId) {
      return res.status(400).json({ error: 'No puedes agregarte a ti mismo como amigo.' });
    }
    await sql.query(
      `INSERT IGNORE INTO user_friends (user_id, friend_id) VALUES (${sqlEscape(myId)}, ${sqlEscape(friendId)})`
    );
    return res.json({ message: 'Anadido a amigos correctamente.' });
  } catch (err) {
    console.error('[CHAT/ADD-FRIEND]', err.message);
    return res.status(500).json({ error: 'Error al agregar amigo.' });
  }
}

// Eliminar usuario de amigos
async function removeFriend(req, res) {
  try {
    const myId = req.user.id;
    const friendId = toInt(req.params.friendId);
    await sql.query(
      `DELETE FROM user_friends WHERE user_id = ${sqlEscape(myId)} AND friend_id = ${sqlEscape(friendId)}`
    );
    return res.json({ message: 'Eliminado de amigos.' });
  } catch (err) {
    console.error('[CHAT/REMOVE-FRIEND]', err.message);
    return res.status(500).json({ error: 'Error al eliminar amigo.' });
  }
}

module.exports = {
  sendMessage, getConversation, getInbox, getChatUsers, getUnreadCount,
  searchUsers, getFriends, addFriend, removeFriend,
};
