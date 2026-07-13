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

// Listar todos los usuarios disponibles para chatear e indicar si son amigos
async function getChatUsers(req, res) {
  try {
    const myId = req.user.id;
    let query;

    if (req.user.role === 'admin' || req.user.role === 'ceo') {
      query = `SELECT u.id, u.name, u.email, u.role, u.avatar_file_id,
                      IF(uf.id IS NOT NULL, 1, 0) AS is_friend
               FROM users u
               LEFT JOIN user_friends uf ON uf.friend_id = u.id AND uf.user_id = ${myId}
               WHERE u.id != ${myId}
               ORDER BY is_friend DESC, u.role DESC, u.name ASC`;
    } else {
      // Pasantes ven administradores/CEOs y a los usuarios que hayan añadido como amigos
      query = `SELECT u.id, u.name, u.email, u.role, u.avatar_file_id,
                      IF(uf.id IS NOT NULL, 1, 0) AS is_friend
               FROM users u
               LEFT JOIN user_friends uf ON uf.friend_id = u.id AND uf.user_id = ${myId}
               WHERE u.id != ${myId} AND (u.role IN ('admin', 'ceo') OR uf.id IS NOT NULL)
               ORDER BY is_friend DESC, u.name ASC`;
    }

    const result = await sql.query(query);
    let users = result.data || [];

    // Si el usuario es pasante, agregar el CEO del sistema como entrada virtual si no está en la lista
    if (req.user.role !== 'admin' && req.user.role !== 'ceo') {
      users = [
        { id: 9999, name: 'Spider-Web ARG CEO', email: 'admin@spiderweb.com', role: 'ceo', avatar_file_id: null, is_friend: 1 },
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

// Buscar usuarios en toda la plataforma por término de búsqueda (nombre, email o rol)
async function searchUsers(req, res) {
  try {
    const myId = req.user.id;
    const q = req.query.q ? req.query.q.trim() : '';
    if (!q) {
      return res.json({ users: [] });
    }
    const safeQ = q.replace(/'/g, "''");
    const result = await sql.query(
      `SELECT u.id, u.name, u.email, u.role, u.avatar_file_id,
              IF(uf.id IS NOT NULL, 1, 0) AS is_friend
       FROM users u
       LEFT JOIN user_friends uf ON uf.friend_id = u.id AND uf.user_id = ${myId}
       WHERE u.id != ${myId} AND (u.name LIKE '%${safeQ}%' OR u.email LIKE '%${safeQ}%' OR u.role LIKE '%${safeQ}%')
       ORDER BY is_friend DESC, u.name ASC
       LIMIT 30`
    );
    return res.json({ users: result.data || [] });
  } catch (err) {
    console.error('[CHAT/SEARCH]', err.message);
    return res.status(500).json({ error: 'Error buscando usuarios.' });
  }
}

// Obtener lista de amigos / contactos guardados
async function getFriends(req, res) {
  try {
    const myId = req.user.id;
    const result = await sql.query(
      `SELECT u.id, u.name, u.email, u.role, u.avatar_file_id, 1 AS is_friend
       FROM user_friends uf
       JOIN users u ON u.id = uf.friend_id
       WHERE uf.user_id = ${myId}
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
    const { friendId } = req.params;
    if (parseInt(friendId) === myId) {
      return res.status(400).json({ error: 'No puedes agregarte a ti mismo como amigo.' });
    }
    await sql.query(
      `INSERT IGNORE INTO user_friends (user_id, friend_id) VALUES (${myId}, ${parseInt(friendId)})`
    );
    return res.json({ message: 'Añadido a amigos correctamente.' });
  } catch (err) {
    console.error('[CHAT/ADD-FRIEND]', err.message);
    return res.status(500).json({ error: 'Error al agregar amigo.' });
  }
}

// Eliminar usuario de amigos
async function removeFriend(req, res) {
  try {
    const myId = req.user.id;
    const { friendId } = req.params;
    await sql.query(
      `DELETE FROM user_friends WHERE user_id = ${myId} AND friend_id = ${parseInt(friendId)}`
    );
    return res.json({ message: 'Eliminado de amigos.' });
  } catch (err) {
    console.error('[CHAT/REMOVE-FRIEND]', err.message);
    return res.status(500).json({ error: 'Error al eliminar amigo.' });
  }
}

module.exports = {
  sendMessage, getConversation, getInbox, getChatUsers, getUnreadCount,
  searchUsers, getFriends, addFriend, removeFriend
};
