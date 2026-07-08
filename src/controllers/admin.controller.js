/**
 * Controlador del panel de administracion
 * Funciones exclusivas para CEOs y admins
 */

const crypto = require('crypto');
const { sql, storage } = require('../api-client/index');

// ──────────────────────────────────────────────
// USUARIOS
// ──────────────────────────────────────────────
async function listAllUsers(req, res) {
  try {
    const result = await sql.query(
      `SELECT id, name, email, role, is_email_verified, is_token_validated, avatar_file_id, tags, created_at FROM users ORDER BY created_at DESC`
    );
    return res.json({ users: result.data || [] });
  } catch (err) {
    console.error('[ADMIN/LIST-USERS]', err.message);
    return res.status(500).json({ error: 'Error obteniendo usuarios.' });
  }
}

async function listPendingUsers(req, res) {
  try {
    const result = await sql.query(
      `SELECT id, name, email, is_email_verified, is_token_validated, created_at FROM users WHERE is_token_validated = 0 AND role = 'pasante' ORDER BY created_at DESC`
    );
    return res.json({ users: result.data || [] });
  } catch (err) {
    console.error('[ADMIN/PENDING-USERS]', err.message);
    return res.status(500).json({ error: 'Error obteniendo usuarios pendientes.' });
  }
}

async function updateUserRole(req, res) {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['pasante', 'admin', 'ceo'].includes(role)) {
      return res.status(400).json({ error: 'Rol invalido.' });
    }

    await sql.query(`UPDATE users SET role = '${role}' WHERE id = ${parseInt(userId)}`);
    return res.json({ message: 'Rol actualizado correctamente.' });
  } catch (err) {
    console.error('[ADMIN/UPDATE-ROLE]', err.message);
    return res.status(500).json({ error: 'Error actualizando rol.' });
  }
}

async function deleteUser(req, res) {
  try {
    const { userId } = req.params;
    await sql.query(`DELETE FROM users WHERE id = ${parseInt(userId)} AND role != 'ceo'`);
    return res.json({ message: 'Usuario eliminado.' });
  } catch (err) {
    console.error('[ADMIN/DELETE-USER]', err.message);
    return res.status(500).json({ error: 'Error eliminando usuario.' });
  }
}

// ──────────────────────────────────────────────
// TOKENS DE VALIDACION
// ──────────────────────────────────────────────
async function generateToken(req, res) {
  try {
    const { assigned_to_email } = req.body;
    const issuedBy = req.user.id;

    const tokenString = crypto.randomBytes(16).toString('hex').toUpperCase();
    const formatted = `${tokenString.slice(0,4)}-${tokenString.slice(4,8)}-${tokenString.slice(8,12)}-${tokenString.slice(12,16)}`;

    const emailValue = assigned_to_email ? `'${assigned_to_email.replace(/'/g, "''")}'` : 'NULL';

    await sql.query(
      `INSERT INTO validation_tokens (token_string, issued_by, assigned_to_email) VALUES ('${formatted}', ${issuedBy}, ${emailValue})`
    );

    return res.status(201).json({ token: formatted, message: 'Token generado correctamente.' });
  } catch (err) {
    console.error('[ADMIN/GEN-TOKEN]', err.message);
    return res.status(500).json({ error: 'Error generando token.' });
  }
}

async function listTokens(req, res) {
  try {
    const result = await sql.query(
      `SELECT vt.id, vt.token_string, vt.assigned_to_email, vt.is_used, vt.created_at, vt.used_at,
              u.name AS used_by_name, u.email AS used_by_email
       FROM validation_tokens vt
       LEFT JOIN users u ON u.id = vt.used_by
       ORDER BY vt.created_at DESC`
    );
    return res.json({ tokens: result.data || [] });
  } catch (err) {
    console.error('[ADMIN/LIST-TOKENS]', err.message);
    return res.status(500).json({ error: 'Error obteniendo tokens.' });
  }
}

// ──────────────────────────────────────────────
// SKILLS / APTITUDES
// ──────────────────────────────────────────────
async function listSkills(req, res) {
  try {
    const result = await sql.query(`SELECT * FROM skills ORDER BY name ASC`);
    return res.json({ skills: result.data || [] });
  } catch (err) {
    console.error('[ADMIN/LIST-SKILLS]', err.message);
    return res.status(500).json({ error: 'Error obteniendo aptitudes.' });
  }
}

async function createSkill(req, res) {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre de aptitud requerido.' });

    const colorValue = color || '#A30000';
    await sql.query(
      `INSERT INTO skills (name, color, created_by) VALUES ('${name.replace(/'/g, "''")}', '${colorValue}', ${req.user.id})`
    );
    return res.status(201).json({ message: 'Aptitud creada.' });
  } catch (err) {
    if (err.message && err.message.includes('Duplicate')) {
      return res.status(409).json({ error: 'Ya existe una aptitud con ese nombre.' });
    }
    console.error('[ADMIN/CREATE-SKILL]', err.message);
    return res.status(500).json({ error: 'Error creando aptitud.' });
  }
}

async function deleteSkill(req, res) {
  try {
    const { skillId } = req.params;
    await sql.query(`DELETE FROM skills WHERE id = ${parseInt(skillId)}`);
    return res.json({ message: 'Aptitud eliminada.' });
  } catch (err) {
    console.error('[ADMIN/DELETE-SKILL]', err.message);
    return res.status(500).json({ error: 'Error eliminando aptitud.' });
  }
}

// ──────────────────────────────────────────────
// PROYECTOS
// ──────────────────────────────────────────────
async function listProjects(req, res) {
  try {
    const result = await sql.query(
      `SELECT p.id, p.title, p.description, p.status, p.start_date, p.end_date, p.conf_link, p.created_at,
              (SELECT COUNT(*) FROM project_applications pa WHERE pa.project_id = p.id) AS applicant_count
       FROM projects p
       ORDER BY p.created_at DESC`
    );
    return res.json({ projects: result.data || [] });
  } catch (err) {
    console.error('[ADMIN/LIST-PROJECTS]', err.message);
    return res.status(500).json({ error: 'Error obteniendo proyectos.' });
  }
}

async function createProject(req, res) {
  try {
    const { title, description, required_tags, conf_link, start_date, end_date, media_file_ids } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'Titulo y descripcion son requeridos.' });
    }

    const tagsValue = required_tags && required_tags.length ? `'${JSON.stringify(required_tags)}'` : "'[]'";
    const mediaValue = media_file_ids && media_file_ids.length ? `'${JSON.stringify(media_file_ids)}'` : "'[]'";
    const confValue = conf_link ? `'${conf_link.replace(/'/g, "''")}'` : 'NULL';
    const startValue = start_date ? `'${start_date}'` : 'NULL';
    const endValue = end_date ? `'${end_date}'` : 'NULL';

    const result = await sql.query(
      `INSERT INTO projects (title, description, media_file_ids, required_tags, conf_link, start_date, end_date, created_by)
       VALUES ('${title.replace(/'/g, "''")}', '${description.replace(/'/g, "''")}', ${mediaValue}, ${tagsValue}, ${confValue}, ${startValue}, ${endValue}, ${req.user.id})`
    );

    return res.status(201).json({ message: 'Proyecto publicado correctamente.', id: result.insertId });
  } catch (err) {
    console.error('[ADMIN/CREATE-PROJECT]', err.message);
    return res.status(500).json({ error: 'Error creando proyecto.' });
  }
}

async function updateProject(req, res) {
  try {
    const { projectId } = req.params;
    const { title, description, required_tags, conf_link, start_date, end_date, status, media_file_ids } = req.body;

    const updates = [];
    if (title) updates.push(`title = '${title.replace(/'/g, "''")}'`);
    if (description) updates.push(`description = '${description.replace(/'/g, "''")}'`);
    if (required_tags !== undefined) updates.push(`required_tags = '${JSON.stringify(required_tags)}'`);
    if (conf_link) updates.push(`conf_link = '${conf_link.replace(/'/g, "''")}'`);
    if (start_date) updates.push(`start_date = '${start_date}'`);
    if (end_date) updates.push(`end_date = '${end_date}'`);
    if (status) updates.push(`status = '${status}'`);
    if (media_file_ids !== undefined) updates.push(`media_file_ids = '${JSON.stringify(media_file_ids)}'`);

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No se enviaron campos a actualizar.' });
    }

    await sql.query(`UPDATE projects SET ${updates.join(', ')} WHERE id = ${parseInt(projectId)}`);
    return res.json({ message: 'Proyecto actualizado.' });
  } catch (err) {
    console.error('[ADMIN/UPDATE-PROJECT]', err.message);
    return res.status(500).json({ error: 'Error actualizando proyecto.' });
  }
}

async function deleteProject(req, res) {
  try {
    const { projectId } = req.params;
    await sql.query(`DELETE FROM projects WHERE id = ${parseInt(projectId)}`);
    await sql.query(`DELETE FROM project_applications WHERE project_id = ${parseInt(projectId)}`);
    return res.json({ message: 'Proyecto eliminado.' });
  } catch (err) {
    console.error('[ADMIN/DELETE-PROJECT]', err.message);
    return res.status(500).json({ error: 'Error eliminando proyecto.' });
  }
}

async function listProjectApplications(req, res) {
  try {
    const { projectId } = req.params;
    const result = await sql.query(
      `SELECT pa.id, pa.status, pa.applied_at, u.id AS user_id, u.name, u.email, u.tags, u.avatar_file_id
       FROM project_applications pa
       JOIN users u ON u.id = pa.user_id
       WHERE pa.project_id = ${parseInt(projectId)}
       ORDER BY pa.applied_at DESC`
    );
    return res.json({ applications: result.data || [] });
  } catch (err) {
    console.error('[ADMIN/PROJECT-APPS]', err.message);
    return res.status(500).json({ error: 'Error obteniendo inscripciones.' });
  }
}

async function updateApplicationStatus(req, res) {
  try {
    const { appId } = req.params;
    const { status } = req.body;
    if (!['pending', 'accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Estado invalido.' });
    }
    await sql.query(`UPDATE project_applications SET status = '${status}' WHERE id = ${parseInt(appId)}`);
    return res.json({ message: 'Estado de inscripcion actualizado.' });
  } catch (err) {
    console.error('[ADMIN/UPDATE-APP]', err.message);
    return res.status(500).json({ error: 'Error actualizando estado.' });
  }
}

// ──────────────────────────────────────────────
// NOTICIAS
// ──────────────────────────────────────────────
async function createNews(req, res) {
  try {
    const { title, content, cover_file_id } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Titulo y contenido requeridos.' });

    const coverValue = cover_file_id ? `'${cover_file_id}'` : 'NULL';
    await sql.query(
      `INSERT INTO news (title, content, cover_file_id, created_by)
       VALUES ('${title.replace(/'/g, "''")}', '${content.replace(/'/g, "''")}', ${coverValue}, ${req.user.id})`
    );
    return res.status(201).json({ message: 'Noticia publicada.' });
  } catch (err) {
    console.error('[ADMIN/CREATE-NEWS]', err.message);
    return res.status(500).json({ error: 'Error publicando noticia.' });
  }
}

async function updateNews(req, res) {
  try {
    const { newsId } = req.params;
    const { title, content, cover_file_id } = req.body;

    const updates = [];
    if (title) updates.push(`title = '${title.replace(/'/g, "''")}'`);
    if (content) updates.push(`content = '${content.replace(/'/g, "''")}'`);
    if (cover_file_id !== undefined) updates.push(`cover_file_id = '${cover_file_id}'`);

    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar.' });

    await sql.query(`UPDATE news SET ${updates.join(', ')} WHERE id = ${parseInt(newsId)}`);
    return res.json({ message: 'Noticia actualizada.' });
  } catch (err) {
    console.error('[ADMIN/UPDATE-NEWS]', err.message);
    return res.status(500).json({ error: 'Error actualizando noticia.' });
  }
}

async function deleteNews(req, res) {
  try {
    const { newsId } = req.params;
    await sql.query(`DELETE FROM news WHERE id = ${parseInt(newsId)}`);
    return res.json({ message: 'Noticia eliminada.' });
  } catch (err) {
    console.error('[ADMIN/DELETE-NEWS]', err.message);
    return res.status(500).json({ error: 'Error eliminando noticia.' });
  }
}

// ──────────────────────────────────────────────
// SUBIR ARCHIVO (fotos/videos para proyectos)
// ──────────────────────────────────────────────
async function uploadMedia(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido.' });

    const result = await storage.uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    // La API de SpiderWeb devuelve una lista de archivos subidos
    const files = result.files || result;
    const fileId = Array.isArray(files) ? files[0].id : files.id;
    const fileUrl = storage.getFileUrl(fileId);

    return res.json({ file_id: fileId, url: fileUrl });
  } catch (err) {
    console.error('[ADMIN/UPLOAD-MEDIA]', err.message);
    return res.status(500).json({ error: 'Error subiendo archivo.' });
  }
}

module.exports = {
  listAllUsers, listPendingUsers, updateUserRole, deleteUser,
  generateToken, listTokens,
  listSkills, createSkill, deleteSkill,
  listProjects, createProject, updateProject, deleteProject, listProjectApplications, updateApplicationStatus,
  createNews, updateNews, deleteNews,
  uploadMedia,
};
