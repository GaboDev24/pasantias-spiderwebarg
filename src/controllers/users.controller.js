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
    const userId = req.user.id;

    // Verificar is_token_validated directo en BD (no en el JWT, que puede estar desactualizado)
    const dbUserRes = await sql.query(`SELECT is_token_validated FROM users WHERE id = ${userId}`);
    const dbUser = dbUserRes.data && dbUserRes.data[0];

    if (!dbUser || parseInt(dbUser.is_token_validated) !== 1) {
      return res.status(403).json({ error: 'Debes validar tu cuenta con el administrador para inscribirte en proyectos (Error actualizado).' });
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

    const normalizeTag = t => (t || '').toString().trim().toLowerCase();
    const requiredTags = project.required_tags ? JSON.parse(project.required_tags) : [];
    if (req.user.role === 'pasante' && requiredTags.length > 0) {
      const uRes = await sql.query(`SELECT tags FROM users WHERE id = ${req.user.id}`);
      const userTags = (uRes.data && uRes.data[0] && uRes.data[0].tags) ? JSON.parse(uRes.data[0].tags) : [];
      const userTagSet = new Set(userTags.map(normalizeTag));
      const hasMatch = requiredTags.some(t => userTagSet.has(normalizeTag(t)));
      if (!hasMatch) {
        return res.status(403).json({ error: 'No tienes los tags requeridos para postularte a este proyecto.' });
      }
    }

    // 1. VALIDACIÓN: Verificar si el usuario ya se postuló a este proyecto
    const existingApplication = await sql.query(
      `SELECT id, status, applied_at FROM project_applications WHERE user_id = ${userId} AND project_id = ${parseInt(projectId)}`
    );

    if (existingApplication.data && existingApplication.data.length > 0) {
      const application = existingApplication.data[0];
      let message = '';

      // Lógica de respuesta basada en el estado actual
      switch (application.status) {
        case 'pending':
          message = 'Ya te has postulado a este proyecto. Tu postulación está pendiente de revisión.';
          return res.status(200).json({ message: message, application: { id: application.id, status: application.status, applied_at: application.applied_at } });
        case 'accepted':
          message = 'Tu postulación fue aceptada. ¡Felicitaciones! Has sido seleccionado.';
          return res.status(200).json({ message: message, application: { id: application.id, status: application.status, applied_at: application.applied_at } });
        case 'rejected':
          message = 'Tu postulación fue rechazada. Por favor, revisa los requisitos o postúlate a otro proyecto.';
          return res.status(200).json({ message: message, application: { id: application.id, status: application.status, applied_at: application.applied_at } });
        default:
          // Manejo para cualquier estado futuro o desconocido
          message = 'Ya tienes una postulación registrada para este proyecto. Estado actual: ' + application.status;
          return res.status(200).json({ message: message, application: { id: application.id, status: application.status, applied_at: application.applied_at } });
      }
    }

    // 2. POSTULACIÓN NUEVA (No existe registro previo)
    await sql.query(
      `INSERT INTO project_applications (user_id, project_id, status, applied_at) VALUES (${userId}, ${parseInt(projectId)}, 'pending', NOW())`
    );

    return res.status(201).json({ message: 'Postulación exitosa. Estaremos revisando tu candidatura.', application_status: 'pending' });

  } catch (err) {
    console.error('[USERS/APPLY-TO-PROJECT]', err.message, err.stack);
    return res.status(500).json({ error: 'Error al postularse. Por favor, inténtalo más tarde o contacta al soporte.' });
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
      `SELECT pa.id, pa.status, pa.applied_at, p.id AS project_id, p.title, p.description, p.start_date, p.end_date, p.status AS project_status, p.next_meeting_date, p.next_meeting_link
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

// ──────────────────────────────────────────────
// CAPACITACIONES
// ──────────────────────────────────────────────
async function applyToTraining(req, res) {
  try {
    const { trainingId } = req.params;
    const userId = req.user.id;

    // Validar estado de la capacitación
    const statusCheck = await sql.query(`SELECT status FROM trainings WHERE id = ${parseInt(trainingId)}`);
    if (!statusCheck.data || statusCheck.data.length === 0) {
      return res.status(404).json({ error: 'Capacitación no encontrada.' });
    }
    const currentStatus = statusCheck.data[0].status;
    if (currentStatus !== 'open' && currentStatus !== 'quota_filled') {
      return res.status(400).json({ error: 'Ya no es posible unirse a esta capacitación.' });
    }

    // Verificar si ya se postuló
    const existing = await sql.query(`SELECT id FROM training_applications WHERE user_id = ${userId} AND training_id = ${parseInt(trainingId)}`);
    if (existing.data && existing.data.length > 0) {
      return res.status(400).json({ error: 'Ya solicitaste esta capacitación.' });
    }

    // Insertar postulación
    await sql.query(`INSERT INTO training_applications (training_id, user_id) VALUES (${parseInt(trainingId)}, ${userId})`);

    // Verificar cupos
    const tr = await sql.query(`
      SELECT t.min_quota, t.status, t.title,
        (SELECT COUNT(*) FROM training_applications ta WHERE ta.training_id = t.id) as applied_count
      FROM trainings t WHERE t.id = ${parseInt(trainingId)}
    `);
    
    if (tr.data && tr.data.length > 0) {
      const training = tr.data[0];
      
      // Si justo en esta postulación se alcanza el mínimo
      if (training.status === 'open' && training.applied_count === training.min_quota) {
        // Marcamos como lista para programar, pero los usuarios aún pueden seguir uniéndose
        await sql.query(`UPDATE trainings SET status = 'quota_filled' WHERE id = ${parseInt(trainingId)}`);
        
        // Avisar a admins y CEOs
        const admins = await sql.query(`SELECT email FROM users WHERE role IN ('admin', 'ceo')`);
        const { sendNotificationEmail } = require('../helpers/email');
        const adminEmails = (admins.data || []).map(u => u.email).join(', ');
        
        if (adminEmails) {
          const msg = `
            <h3>Capacitación Lista para Programar</h3>
            <p>La capacitación "<strong>${training.title}</strong>" ha alcanzado su mínimo (${training.min_quota} solicitantes).</p>
            <p>Los pasantes pueden seguir uniéndose, pero ya puede ingresar al panel de administración para programar la reunión.</p>
          `;
          await sendNotificationEmail(adminEmails, 'Capacitación Lista para Programar', msg).catch(console.error);
        }
      }
    }

    return res.status(201).json({ message: 'Solicitud enviada correctamente.' });
  } catch (err) {
    console.error('[USERS/APPLY-TRAINING]', err.message);
    return res.status(500).json({ error: 'Error al solicitar capacitación.' });
  }
}

async function requestTraining(req, res) {
  try {
    const { title, description } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: 'Faltan datos de la capacitacion (título o descripción).' });
    }
    
    const safeTitle = title.replace(/'/g, "''");
    const safeDesc = description.replace(/'/g, "''");

    // Crear la capacitacion
    const insertRes = await sql.query(
      `INSERT INTO trainings (title, description, min_quota, status, created_at) VALUES ('${safeTitle}', '${safeDesc}', 2, 'open', NOW())`
    );
    const trainingId = insertRes.insertId || (insertRes.data && insertRes.data.insertId);

    if (!trainingId) {
      throw new Error('No se pudo obtener el ID de la capacitación creada.');
    }

    // Auto-postular al creador
    await sql.query(
      `INSERT INTO training_applications (training_id, user_id, applied_at) VALUES (${trainingId}, ${req.user.id}, NOW())`
    );

    return res.status(201).json({ message: 'Capacitación solicitada correctamente.', id: trainingId });
  } catch (err) {
    console.error('[USERS/REQUEST-TRAINING]', err);
    return res.status(500).json({ error: 'Error al solicitar capacitación.' });
  }
}

module.exports = {
  getMyProfile, updateProfile, changePassword, uploadAvatar,
  uploadCV, getUserPublicProfile,
  applyToProject, cancelApplication, getMyApplications,
  applyToTraining, requestTraining
};
