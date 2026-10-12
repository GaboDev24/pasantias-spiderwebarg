/**
 * Controlador de usuarios (pasantes)
 * Gestion de perfil, foto, tags y aplicaciones a proyectos.
 *
 * CAMBIOS DE SEGURIDAD:
 * - Eliminado el bypass de id:9999 (admin existe ahora en BD).
 * - SQL construido con sqlEscape() / toInt().
 * - JSON.parse reemplazado por safeJsonParse() en todos los puntos.
 * - toBool() para normalizar TINYINT de la API.
 * - Race condition en applyToTraining corregida con >= en lugar de ===.
 */

const bcrypt = require('bcryptjs');
const { sql, storage } = require('../api-client/index');
const { sqlEscape, toInt, safeJsonParse, toBool } = require('../helpers/sqlSanitizer');

// ──────────────────────────────────────────────
// PERFIL
// ──────────────────────────────────────────────
async function getMyProfile(req, res) {
  try {
    const result = await sql.query(
      `SELECT id, name, email, role, is_email_verified, is_token_validated, avatar_file_id, avatar_url, cv_file_id, cv_url, tags, created_at
       FROM users WHERE id = ${sqlEscape(req.user.id)}`
    );
    if (!result.data || result.data.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    const user = result.data[0];
    user.tags = safeJsonParse(user.tags, []);
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

    if (name) updates.push(`name = ${sqlEscape(name)}`);
    if (tags !== undefined) updates.push(`tags = ${sqlEscape(JSON.stringify(tags))}`);

    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar.' });

    await sql.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ${sqlEscape(req.user.id)}`
    );
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

    const result = await sql.query(
      `SELECT password_hash FROM users WHERE id = ${sqlEscape(req.user.id)}`
    );
    if (!result.data || result.data.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const valid = await bcrypt.compare(current_password, result.data[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Contrasena actual incorrecta.' });

    const newHash = await bcrypt.hash(new_password, 12);
    await sql.query(
      `UPDATE users SET password_hash = ${sqlEscape(newHash)} WHERE id = ${sqlEscape(req.user.id)}`
    );

    return res.json({ message: 'Contrasena actualizada correctamente.' });
  } catch (err) {
    console.error('[USERS/CHANGE-PASS]', err.message);
    return res.status(500).json({ error: 'Error cambiando contrasena.' });
  }
}

async function uploadAvatar(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Imagen requerida.' });

    const userQ = await sql.query(
      `SELECT avatar_file_id FROM users WHERE id = ${sqlEscape(req.user.id)}`
    );
    const oldFileId = userQ.data && userQ.data[0] ? userQ.data[0].avatar_file_id : null;

    const avatarExt = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
    const avatarMime = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp',
    }[avatarExt] || req.file.mimetype;
    const crypto = require('crypto');
    const safeName = `avatar_${crypto.randomBytes(8).toString('hex')}.${avatarExt}`;

    let fileId, publicUrl;
    if (oldFileId) {
      try {
        const result = await storage.replaceFile(oldFileId, req.file.buffer, safeName, avatarMime);
        const files = result.files || [];
        publicUrl = Array.isArray(files) && files[0] ? files[0].url : null;
        fileId = oldFileId;
      } catch (_) {
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

    const proxyUrl = `/api/media/${fileId}`;
    await sql.query(
      `UPDATE users SET avatar_file_id = ${sqlEscape(fileId)}, avatar_url = ${sqlEscape(proxyUrl)} WHERE id = ${sqlEscape(req.user.id)}`
    );

    return res.json({ avatar_file_id: fileId, avatar_url: proxyUrl });
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
    const projectId = toInt(req.params.projectId);
    const userId = req.user.id;

    const dbUserRes = await sql.query(
      `SELECT is_token_validated FROM users WHERE id = ${sqlEscape(userId)}`
    );
    const dbUser = dbUserRes.data && dbUserRes.data[0];

    if (!dbUser || !toBool(dbUser.is_token_validated)) {
      return res.status(403).json({ error: 'Debes validar tu cuenta con el administrador para inscribirte en proyectos.' });
    }

    const projectResult = await sql.query(
      `SELECT id, status, required_tags, start_date, end_date FROM projects WHERE id = ${sqlEscape(projectId)}`
    );
    if (!projectResult.data || projectResult.data.length === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado.' });
    }

    const project = projectResult.data[0];

    const now = new Date();
    const end = project.end_date ? new Date(project.end_date) : null;
    if (end && now > end) {
      return res.status(400).json({ error: 'El proyecto ya se encuentra finalizado. No es posible postularse.' });
    }

    if (project.status !== 'open') {
      return res.status(400).json({ error: 'Este proyecto no esta abierto para inscripciones.' });
    }

    const normalizeTag = t => (t || '').toString().trim().toLowerCase();
    const requiredTags = safeJsonParse(project.required_tags, []);
    if (req.user.role === 'pasante' && requiredTags.length > 0) {
      const uRes = await sql.query(
        `SELECT tags FROM users WHERE id = ${sqlEscape(req.user.id)}`
      );
      const userTags = safeJsonParse(uRes.data && uRes.data[0] ? uRes.data[0].tags : null, []);
      const userTagSet = new Set(userTags.map(normalizeTag));
      const hasMatch = requiredTags.some(t => userTagSet.has(normalizeTag(t)));
      if (!hasMatch) {
        return res.status(403).json({ error: 'No tienes los tags requeridos para postularte a este proyecto.' });
      }
    }

    const existingApplication = await sql.query(
      `SELECT id, status, applied_at FROM project_applications WHERE user_id = ${sqlEscape(userId)} AND project_id = ${sqlEscape(projectId)}`
    );

    if (existingApplication.data && existingApplication.data.length > 0) {
      const application = existingApplication.data[0];
      const messages = {
        pending:  'Ya te has postulado a este proyecto. Tu postulacion esta pendiente de revision.',
        accepted: 'Tu postulacion fue aceptada. ¡Felicitaciones!',
        rejected: 'Tu postulacion fue rechazada. Por favor, revisa los requisitos o postulate a otro proyecto.',
      };
      const message = messages[application.status] || `Ya tienes una postulacion registrada. Estado: ${application.status}`;
      return res.status(200).json({
        message,
        application: { id: application.id, status: application.status, applied_at: application.applied_at },
      });
    }

    await sql.query(
      `INSERT INTO project_applications (user_id, project_id, status, applied_at) VALUES (${sqlEscape(userId)}, ${sqlEscape(projectId)}, 'pending', NOW())`
    );

    return res.status(201).json({ message: 'Postulacion exitosa. Estaremos revisando tu candidatura.', application_status: 'pending' });
  } catch (err) {
    console.error('[USERS/APPLY-TO-PROJECT]', err.message, err.stack);
    return res.status(500).json({ error: 'Error al postularse. Por favor, intentalo mas tarde.' });
  }
}

async function cancelApplication(req, res) {
  try {
    const projectId = toInt(req.params.projectId);
    await sql.query(
      `DELETE FROM project_applications WHERE project_id = ${sqlEscape(projectId)} AND user_id = ${sqlEscape(req.user.id)} AND status = 'pending'`
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
       WHERE pa.user_id = ${sqlEscape(req.user.id)}
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

    const crypto = require('crypto');
    const randomName = `cv_${crypto.randomBytes(8).toString('hex')}.${ext}`;
    const result = await storage.uploadFile(req.file.buffer, randomName, resolvedMime);
    const files = result.files || [];
    const fileData = Array.isArray(files) ? files[0] : files;

    if (!fileData || !fileData.id) {
      return res.status(500).json({ error: 'El storage no devolvio el archivo.' });
    }
    const fileId = fileData.id;
    const proxyUrl = `/api/media/${fileId}`;
    await sql.query(
      `UPDATE users SET cv_file_id = ${sqlEscape(fileId)}, cv_url = ${sqlEscape(proxyUrl)} WHERE id = ${sqlEscape(req.user.id)}`
    );

    return res.json({ cv_file_id: fileId, cv_url: proxyUrl, message: 'CV subido correctamente.' });
  } catch (err) {
    console.error('[USERS/UPLOAD-CV]', err.message, err.stack);
    return res.status(500).json({ error: 'Error subiendo CV: ' + err.message });
  }
}

async function getUserPublicProfile(req, res) {
  try {
    const userId = toInt(req.params.userId);
    const result = await sql.query(
      `SELECT id, name, email, role, is_email_verified, is_token_validated, avatar_file_id, avatar_url, cv_file_id, cv_url, tags, created_at
       FROM users WHERE id = ${sqlEscape(userId)}`
    );
    if (!result.data || result.data.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    const user = result.data[0];
    user.tags = safeJsonParse(user.tags, []);
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
    const trainingId = toInt(req.params.trainingId);
    const userId = req.user.id;

    const statusCheck = await sql.query(
      `SELECT status FROM trainings WHERE id = ${sqlEscape(trainingId)}`
    );
    if (!statusCheck.data || statusCheck.data.length === 0) {
      return res.status(404).json({ error: 'Capacitacion no encontrada.' });
    }
    const currentStatus = statusCheck.data[0].status;
    if (currentStatus !== 'open' && currentStatus !== 'quota_filled') {
      return res.status(400).json({ error: 'Ya no es posible unirse a esta capacitacion.' });
    }

    const existing = await sql.query(
      `SELECT id FROM training_applications WHERE user_id = ${sqlEscape(userId)} AND training_id = ${sqlEscape(trainingId)}`
    );
    if (existing.data && existing.data.length > 0) {
      return res.status(400).json({ error: 'Ya solicitaste esta capacitacion.' });
    }

    await sql.query(
      `INSERT INTO training_applications (training_id, user_id) VALUES (${sqlEscape(trainingId)}, ${sqlEscape(userId)})`
    );

    // BUG-03 FIX: usar >= en lugar de === para evitar race condition cuando
    // dos postulaciones simultáneas saltan la igualdad exacta.
    const tr = await sql.query(`
      SELECT t.min_quota, t.status, t.title,
        (SELECT COUNT(*) FROM training_applications ta WHERE ta.training_id = t.id) as applied_count
      FROM trainings t WHERE t.id = ${sqlEscape(trainingId)}
    `);

    if (tr.data && tr.data.length > 0) {
      const training = tr.data[0];
      if (training.status === 'open' && parseInt(training.applied_count) >= parseInt(training.min_quota)) {
        await sql.query(
          `UPDATE trainings SET status = 'quota_filled' WHERE id = ${sqlEscape(trainingId)}`
        );

        const admins = await sql.query(`SELECT email FROM users WHERE role IN ('admin', 'ceo')`);
        const { sendNotificationEmail } = require('../helpers/email');
        const adminEmails = (admins.data || []).map(u => u.email).join(', ');

        if (adminEmails) {
          const msg = `
            <h3>Capacitacion Lista para Programar</h3>
            <p>La capacitacion "<strong>${training.title}</strong>" ha alcanzado su minimo (${training.min_quota} solicitantes).</p>
            <p>Los pasantes pueden seguir uniendose, pero ya puede ingresar al panel para programar la reunion.</p>
          `;
          await sendNotificationEmail(adminEmails, 'Capacitacion Lista para Programar', msg).catch(console.error);
        }
      }
    }

    return res.status(201).json({ message: 'Solicitud enviada correctamente.' });
  } catch (err) {
    console.error('[USERS/APPLY-TRAINING]', err.message);
    return res.status(500).json({ error: 'Error al solicitar capacitacion.' });
  }
}

async function requestTraining(req, res) {
  try {
    const { title, description } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: 'Faltan datos de la capacitacion (titulo o descripcion).' });
    }

    const insertRes = await sql.query(
      `INSERT INTO trainings (title, description, min_quota, status, created_at)
       VALUES (${sqlEscape(title)}, ${sqlEscape(description)}, 2, 'open', NOW())`
    );
    const trainingId = insertRes.insertId || (insertRes.data && insertRes.data.insertId);

    if (!trainingId) {
      throw new Error('No se pudo obtener el ID de la capacitacion creada.');
    }

    await sql.query(
      `INSERT INTO training_applications (training_id, user_id, applied_at)
       VALUES (${sqlEscape(trainingId)}, ${sqlEscape(req.user.id)}, NOW())`
    );

    return res.status(201).json({ message: 'Capacitacion solicitada correctamente.', id: trainingId });
  } catch (err) {
    console.error('[USERS/REQUEST-TRAINING]', err);
    return res.status(500).json({ error: 'Error al solicitar capacitacion.' });
  }
}

module.exports = {
  getMyProfile, updateProfile, changePassword, uploadAvatar,
  uploadCV, getUserPublicProfile,
  applyToProject, cancelApplication, getMyApplications,
  applyToTraining, requestTraining,
};
