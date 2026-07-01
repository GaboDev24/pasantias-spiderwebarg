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
    const result = await sql.query(
      `SELECT id, name, email, role, is_email_verified, is_token_validated, avatar_file_id, tags, created_at
       FROM users WHERE id = ${req.user.id}`
    );
    if (!result.data || result.data.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    const user = result.data[0];
    user.tags = user.tags ? JSON.parse(user.tags) : [];
    user.avatar_url = user.avatar_file_id ? storage.getFileUrl(user.avatar_file_id) : null;
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

    const user = await sql.query(`SELECT avatar_file_id FROM users WHERE id = ${req.user.id}`);
    const oldFileId = user.data && user.data[0] ? user.data[0].avatar_file_id : null;

    let fileId;
    if (oldFileId) {
      // Reemplazar el archivo existente
      try {
        const result = await storage.replaceFile(oldFileId, req.file.buffer, req.file.originalname, req.file.mimetype);
        fileId = oldFileId;
      } catch (_) {
        // Si falla el reemplazo, subir como nuevo
        const result = await storage.uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);
        const files = result.files || result;
        fileId = Array.isArray(files) ? files[0].id : files.id;
      }
    } else {
      const result = await storage.uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);
      const files = result.files || result;
      fileId = Array.isArray(files) ? files[0].id : files.id;
    }

    await sql.query(`UPDATE users SET avatar_file_id = '${fileId}' WHERE id = ${req.user.id}`);

    return res.json({ avatar_file_id: fileId, avatar_url: storage.getFileUrl(fileId) });
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

module.exports = {
  getMyProfile, updateProfile, changePassword, uploadAvatar,
  applyToProject, cancelApplication, getMyApplications,
};
