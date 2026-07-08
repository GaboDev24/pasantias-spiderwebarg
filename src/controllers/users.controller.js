/**
 * Controlador de usuarios (pasantes)
 * Gestión de perfil, foto, tags y aplicaciones a proyectos
 */

const bcrypt = require('bcryptjs');
const { sql, storage } = require('../api-client/index');

// ──────────────────────────────────────────────
// PERFIL
// ──────────────────────────────────────────────
async function getMyProfile(req, res) {
  try {
    // Admin bypass: id 9999 no existe en BD, devolver perfil desde el JWT
    if (req.user.id === 9999) {
      return res.json({
        user: {
          id: 9999,
          name: req.user.name || 'Admin Master',
          email: req.user.email,
          role: 'ceo',
          is_email_verified: 1,
          is_token_validated: 1,
          avatar_file_id: null,
          avatar_url: null,
          tags: [],
          created_at: new Date().toISOString(),
        }
      });
    }

    const result = await sql.query(
      `SELECT id, name, email, role, is_email_verified, is_token_validated, avatar_file_id, avatar_url, cv_file_id, cv_url, tags, created_at
       FROM users WHERE id = ${req.user.id}`
    );
    if (!result.data || result.data.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    const user = result.data[0];
    user.tags = user.tags ? JSON.parse(user.tags) : [];
    // Usar avatar_url directo si existe, sino construir desde file_id
    user.avatar_url = user.avatar_url || (user.avatar_file_id ? storage.getFileUrl(user.avatar_file_id) : null);
    user.cv_url = user.cv_url || (user.cv_file_id ? storage.getFileUrl(user.cv_file_id) : null);
    return res.json({ user });

  } catch (err) {
    console.error('[USERS/PROFILE]', err.message);
    return res.status(500).json({ error: 'Error obteniendo perfil.' });
  }
}

async function updateProfile(req, res) {
  try {
    const { name, tags } = req.body;
    const updates = [];

    if (name) updates.push(`name = '${name.replace(/'/g, "''")}'`);
    if (tags !== undefined) updates.push(`tags = '${JSON.stringify(tags)}'`);

    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar.' });

    await sql.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ${req.user.id}`);
    return res.json({ message: 'Perfil actualizado correctamente.' });
  } catch (err) {
    console.error('[USERS/UPDATE-PROFILE]', err.message);
    return res.status(500).json({ error: 'Error actualizando perfil.' });
  }
}

async function changePassword(req, res) {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Contrasena actual y nueva son requeridas.' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'La nueva contrasena debe tener al menos 8 caracteres.' });
    }

    const result = await sql.query(`SELECT password_hash FROM users WHERE id = ${req.user.id}`);
    if (!result.data || result.data.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const valid = await bcrypt.compare(current_password, result.data[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Contrasena actual incorrecta.' });

    const newHash = await bcrypt.hash(new_password, 12);
    await sql.query(`UPDATE users SET password_hash = '${newHash}' WHERE id = ${req.user.id}`);

    return res.json({ message: 'Contrasena actualizada correctamente.' });
  } catch (err) {
    console.error('[USERS/CHANGE-PASS]', err.message);
    return res.status(500).json({ error: 'Error cambiando contrasena.' });
  }
}

async function uploadAvatar(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Imagen requerida.' });

    const userQ = await sql.query(`SELECT avatar_file_id FROM users WHERE id = ${req.user.id}`);
    const oldFileId = userQ.data && userQ.data[0] ? userQ.data[0].avatar_file_id : null;

    const avatarExt = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
    const avatarMime = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp' }[avatarExt] || req.file.mimetype;
    const crypto = require('crypto');
    const safeName = `avatar_${crypto.randomBytes(8).toString('hex')}.${avatarExt}`;

    let fileId, publicUrl;
    if (oldFileId) {
      try {
        const result = await storage.replaceFile(oldFileId, req.file.buffer, safeName, avatarMime);
        // replaceFile puede devolver la URL actualizada
        const files = result.files || [];
        publicUrl = Array.isArray(files) && files[0] ? files[0].url : null;
        fileId = oldFileId;
      } catch (_) {
        // Si falla el reemplazo, subir como nuevo
        const result = await storage.uploadFile(req.file.buffer, safeName, avatarMime);
        const files = result.files || [];
        const fileData = Array.isArray(files) ? files[0] : files;
        fileId = fileData.id;
        publicUrl = fileData.url;
      }
    } else {
      const result = await storage.uploadFile(req.file.buffer, safeName, avatarMime);
      const files = result.files || [];
      const fileData = Array.isArray(files) ? files[0] : files;
      fileId = fileData.id;
      publicUrl = fileData.url;
    }

    // Guardar SIEMPRE la URL a traves del proxy
    const proxyUrl = `/api/media/${fileId}`;
    await sql.query(`UPDATE users SET avatar_file_id = '${fileId}', avatar_url = '${proxyUrl}' WHERE id = ${req.user.id}`);

    return res.json({
      avatar_file_id: fileId,
      avatar_url: proxyUrl,
    });
  } catch (err) {
    console.error('[USERS/UPLOAD-AVATAR]', err.message);
    return res.status(500).json({ error: 'Error subiendo foto de perfil.' });
  }
}

// ──────────────────────────────────────────────
// PROYECTOS
// ──────────────────────────────────────────────
async function applyToProject(req, res) {
  try {
    const { projectId } = req.params;

    if (!req.user.is_token_validated) {
      return res.status(403).json({ error: 'Debes validar tu cuenta con el token CEO para inscribirte en proyectos.' });
    }

    // Verificar que el proyecto exista y este abierto
    const projectResult = await sql.query(
      `SELECT id, status, required_tags FROM projects WHERE id = ${parseInt(projectId)}`
    );
    if (!projectResult.data || projectResult.data.length === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado.' });
    }

    const project = projectResult.data[0];
    if (project.status !== 'open') {
      return res.status(400).json({ error: 'Este proyecto no esta abierto para inscripciones.' });
    }

    await sql.query(
      `INSERT IGNORE INTO project_applications (project_id, user_id) VALUES (${parseInt(projectId)}, ${req.user.id})`
    );

    return res.json({ message: 'Inscripcion realizada correctamente.' });
  } catch (err) {
    console.error('[USERS/APPLY-PROJECT]', err.message);
    return res.status(500).json({ error: 'Error al inscribirse.' });
  }
}

async function cancelApplication(req, res) {
  try {
    const { projectId } = req.params;
    await sql.query(
      `DELETE FROM project_applications WHERE project_id = ${parseInt(projectId)} AND user_id = ${req.user.id} AND status = 'pending'`
    );
    return res.json({ message: 'Inscripcion cancelada.' });
  } catch (err) {
    console.error('[USERS/CANCEL-APP]', err.message);
    return res.status(500).json({ error: 'Error cancelando inscripcion.' });
  }
}

async function getMyApplications(req, res) {
  try {
    const result = await sql.query(
      `SELECT pa.id, pa.status, pa.applied_at, p.id AS project_id, p.title, p.description, p.start_date, p.end_date, p.status AS project_status
       FROM project_applications pa
       JOIN projects p ON p.id = pa.project_id
       WHERE pa.user_id = ${req.user.id}
       ORDER BY pa.applied_at DESC`
    );
    return res.json({ applications: result.data || [] });
  } catch (err) {
    console.error('[USERS/MY-APPS]', err.message);
    return res.status(500).json({ error: 'Error obteniendo inscripciones.' });
  }
}

async function uploadCV(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo CV requerido.' });

    const ext = (req.file.originalname.split('.').pop() || '').toLowerCase();
    const mimeMap = {
      pdf:  'application/pdf',
      doc:  'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    const resolvedMime = mimeMap[ext];
    if (!resolvedMime) {
      return res.status(400).json({ error: 'Solo se aceptan archivos PDF, DOC o DOCX.' });
    }

    // Usar nombre aleatorio para evitar problemas de firma con caracteres especiales
    const crypto = require('crypto');
    const randomName = `cv_${crypto.randomBytes(8).toString('hex')}.${ext}`;
    const result = await storage.uploadFile(req.file.buffer, randomName, resolvedMime);
    const files = result.files || [];
    const fileData = Array.isArray(files) ? files[0] : files;

    if (!fileData || !fileData.id) {
      return res.status(500).json({ error: 'El storage no devolvio el archivo.' });
    }
    const fileId = fileData.id;

    // Usar proxy local para servir con los headers correctos
    const proxyUrl = `/api/media/${fileId}`;
    await sql.query(`UPDATE users SET cv_file_id = '${fileId}', cv_url = '${proxyUrl}' WHERE id = ${req.user.id}`);

    return res.json({
      cv_file_id: fileId,
      cv_url: proxyUrl,
      message: 'CV subido correctamente.',
    });
  } catch (err) {
    console.error('[USERS/UPLOAD-CV]', err.message, err.stack);
    return res.status(500).json({ error: 'Error subiendo CV: ' + err.message });
  }
}

// Perfil público de usuario (para que admin lo vea)
async function getUserPublicProfile(req, res) {
  try {
    const { userId } = req.params;
    const result = await sql.query(
      `SELECT id, name, email, role, is_email_verified, is_token_validated, avatar_file_id, avatar_url, cv_file_id, cv_url, tags, created_at
       FROM users WHERE id = ${parseInt(userId)}`
    );
    if (!result.data || result.data.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    const user = result.data[0];
    user.tags = user.tags ? JSON.parse(user.tags) : [];
    user.avatar_url = user.avatar_url || (user.avatar_file_id ? `/api/media/${user.avatar_file_id}` : null);
    user.cv_url = user.cv_url ? `/api/media/${user.cv_file_id}` : null;
    return res.json({ user });
  } catch (err) {
    console.error('[USERS/PUBLIC-PROFILE]', err.message);
    return res.status(500).json({ error: 'Error obteniendo perfil.' });
  }
}

module.exports = {
  getMyProfile, updateProfile, changePassword, uploadAvatar,
  uploadCV, getUserPublicProfile,
  applyToProject, cancelApplication, getMyApplications,
};
