/**
 * Controlador del panel de administracion
 * Funciones exclusivas para CEOs y admins.
 *
 * CAMBIOS DE SEGURIDAD:
 * - Toda concatenacion SQL directa reemplazada por sqlEscape() / toInt().
 * - safeJsonParse() en todos los puntos donde se consume JSON de la BD.
 * - escapeHtml() aplicado a datos de usuario embebidos en plantillas de correo.
 * - Validacion de IDs de ruta con toInt() (lanza excepcion -> res 400).
 */

const crypto = require('crypto');
const { sql, storage } = require('../api-client/index');
const { sqlEscape, toInt, safeJsonParse, escapeHtml } = require('../helpers/sqlSanitizer');

// Helper interno: convierte un id de ruta a entero o responde 400
function parseId(val, res, label = 'ID') {
  try { return toInt(val); }
  catch (_) { res.status(400).json({ error: `${label} invalido.` }); return null; }
}

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
    const userId = parseId(req.params.userId, res, 'userId');
    if (userId === null) return;
    const { role } = req.body;

    if (!['pasante', 'admin', 'ceo'].includes(role)) {
      return res.status(400).json({ error: 'Rol invalido.' });
    }

    await sql.query(`UPDATE users SET role = ${sqlEscape(role)} WHERE id = ${sqlEscape(userId)}`);
    return res.json({ message: 'Rol actualizado correctamente.' });
  } catch (err) {
    console.error('[ADMIN/UPDATE-ROLE]', err.message);
    return res.status(500).json({ error: 'Error actualizando rol.' });
  }
}

async function validateUser(req, res) {
  try {
    const uid = parseId(req.params.userId, res, 'userId');
    if (uid === null) return;

    const uRes = await sql.query(
      `SELECT id, name, email, is_token_validated FROM users WHERE id = ${sqlEscape(uid)}`
    );
    const userObj = uRes.data && uRes.data.length ? uRes.data[0] : null;
    if (!userObj) return res.status(404).json({ error: 'Usuario no encontrado.' });

    await sql.query(`UPDATE users SET is_token_validated = 1 WHERE id = ${sqlEscape(uid)}`);

    if (!parseInt(userObj.is_token_validated)) {
      try {
        const welcomeMsg = `¡Hola, ${userObj.name}! Tu cuenta ha sido verificada y aceptada por la Administracion. Ya tienes acceso completo a todos los proyectos y funciones del portal. ¡Bienvenido al equipo!`;
        await sql.query(
          `INSERT INTO chat_messages (sender_id, receiver_id, content) VALUES (${sqlEscape(req.user.id)}, ${sqlEscape(uid)}, ${sqlEscape(welcomeMsg)})`
        );
      } catch (chatErr) {
        console.error('[ADMIN/VALIDATE-CHAT-MSG]', chatErr.message);
      }
    }

    return res.json({ message: 'Alumno verificado y aceptado correctamente.', user: { id: uid, is_token_validated: 1 } });
  } catch (err) {
    console.error('[ADMIN/VALIDATE-USER]', err.message);
    return res.status(500).json({ error: 'Error al verificar y aceptar alumno.' });
  }
}

async function deleteUser(req, res) {
  try {
    const userId = parseId(req.params.userId, res, 'userId');
    if (userId === null) return;
    await sql.query(`DELETE FROM users WHERE id = ${sqlEscape(userId)} AND role != 'ceo'`);
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

    await sql.query(
      `INSERT INTO validation_tokens (token_string, issued_by, assigned_to_email)
       VALUES (${sqlEscape(formatted)}, ${sqlEscape(issuedBy)}, ${assigned_to_email ? sqlEscape(assigned_to_email) : 'NULL'})`
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
      `INSERT INTO skills (name, color, created_by) VALUES (${sqlEscape(name)}, ${sqlEscape(colorValue)}, ${sqlEscape(req.user.id)})`
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
    const skillId = parseId(req.params.skillId, res, 'skillId');
    if (skillId === null) return;
    await sql.query(`DELETE FROM skills WHERE id = ${sqlEscape(skillId)}`);
    return res.json({ message: 'Aptitud eliminada.' });
  } catch (err) {
    console.error('[ADMIN/DELETE-SKILL]', err.message);
    return res.status(500).json({ error: 'Error eliminando aptitud.' });
  }
}

async function updateSkill(req, res) {
  try {
    const skillId = parseId(req.params.skillId, res, 'skillId');
    if (skillId === null) return;
    const { name, color } = req.body;

    const updates = [];
    if (name) updates.push(`name = ${sqlEscape(name)}`);
    if (color) updates.push(`color = ${sqlEscape(color)}`);

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No se enviaron campos para actualizar.' });
    }

    await sql.query(`UPDATE skills SET ${updates.join(', ')} WHERE id = ${sqlEscape(skillId)}`);
    return res.json({ message: 'Aptitud actualizada correctamente.' });
  } catch (err) {
    if (err.message && err.message.includes('Duplicate')) {
      return res.status(409).json({ error: 'Ya existe una aptitud con ese nombre.' });
    }
    console.error('[ADMIN/UPDATE-SKILL]', err.message);
    return res.status(500).json({ error: 'Error actualizando aptitud.' });
  }
}

// ──────────────────────────────────────────────
// PROYECTOS
// ──────────────────────────────────────────────
async function listProjects(req, res) {
  try {
    const result = await sql.query(
      `SELECT p.id, p.title, p.description, p.summary, p.status, p.start_date, p.end_date, p.conf_link, p.github_repo, p.conf_start, p.conf_end, p.media_file_ids, p.required_tags, p.created_at,
              (SELECT COUNT(*) FROM project_applications pa WHERE pa.project_id = p.id) AS applicant_count
       FROM projects p
       ORDER BY p.created_at DESC`
    );
    const projects = (result.data || []).map(p => {
      const now = new Date();
      const start = p.start_date ? new Date(p.start_date) : null;
      const end   = p.end_date   ? new Date(p.end_date)   : null;
      let dynamic_status;
      if (start && end) {
        if (now < start) dynamic_status = 'Por comenzar';
        else if (now <= end) dynamic_status = 'En proceso';
        else dynamic_status = 'Finalizado';
      } else if (start) {
        dynamic_status = now < start ? 'Por comenzar' : 'En proceso';
      } else {
        const m = { open: 'Por comenzar', in_progress: 'En proceso', closed: 'Finalizado' };
        dynamic_status = m[p.status] || p.status;
      }
      const ids = safeJsonParse(p.media_file_ids, []);
      return { ...p, dynamic_status, cover_url: ids.length > 0 ? storage.getFileUrl(ids[0]) : null };
    });
    return res.json({ projects });
  } catch (err) {
    console.error('[ADMIN/LIST-PROJECTS]', err.message);
    return res.status(500).json({ error: 'Error obteniendo proyectos.' });
  }
}

async function createProject(req, res) {
  try {
    const { title, description, summary, required_tags, conf_link, github_repo, conf_start, conf_end, start_date, end_date, media_file_ids } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'Titulo y descripcion son requeridos.' });
    }

    const tagsValue  = sqlEscape(JSON.stringify(required_tags  && required_tags.length  ? required_tags  : []));
    const mediaValue = sqlEscape(JSON.stringify(media_file_ids && media_file_ids.length ? media_file_ids : []));

    await sql.query(
      `INSERT INTO projects (title, description, summary, media_file_ids, required_tags, conf_link, github_repo, conf_start, conf_end, start_date, end_date, created_by)
       VALUES (
         ${sqlEscape(title)},
         ${sqlEscape(description)},
         ${summary  ? sqlEscape(summary)     : 'NULL'},
         ${mediaValue},
         ${tagsValue},
         ${conf_link  ? sqlEscape(conf_link)   : 'NULL'},
         ${github_repo ? sqlEscape(github_repo) : 'NULL'},
         ${conf_start  ? sqlEscape(conf_start)  : 'NULL'},
         ${conf_end    ? sqlEscape(conf_end)    : 'NULL'},
         ${start_date  ? sqlEscape(start_date)  : 'NULL'},
         ${end_date    ? sqlEscape(end_date)    : 'NULL'},
         ${sqlEscape(req.user.id)}
       )`
    );

    return res.status(201).json({ message: 'Proyecto publicado correctamente.' });
  } catch (err) {
    console.error('[ADMIN/CREATE-PROJECT]', err.message);
    return res.status(500).json({ error: 'Error creando proyecto.' });
  }
}

async function updateProject(req, res) {
  try {
    const projectId = parseId(req.params.projectId, res, 'projectId');
    if (projectId === null) return;
    const { title, description, summary, required_tags, conf_link, github_repo, conf_start, conf_end, start_date, end_date, media_file_ids } = req.body;

    const updates = [];
    if (title)                  updates.push(`title = ${sqlEscape(title)}`);
    if (description)            updates.push(`description = ${sqlEscape(description)}`);
    if (summary !== undefined)  updates.push(`summary = ${summary ? sqlEscape(summary) : 'NULL'}`);
    if (required_tags !== undefined) updates.push(`required_tags = ${sqlEscape(JSON.stringify(required_tags))}`);
    if (conf_link !== undefined)    updates.push(`conf_link = ${conf_link ? sqlEscape(conf_link) : 'NULL'}`);
    if (github_repo !== undefined)  updates.push(`github_repo = ${github_repo ? sqlEscape(github_repo) : 'NULL'}`);
    if (conf_start !== undefined)   updates.push(`conf_start = ${conf_start ? sqlEscape(conf_start) : 'NULL'}`);
    if (conf_end !== undefined)     updates.push(`conf_end = ${conf_end ? sqlEscape(conf_end) : 'NULL'}`);
    if (start_date !== undefined)   updates.push(`start_date = ${start_date ? sqlEscape(start_date) : 'NULL'}`);
    if (end_date !== undefined)     updates.push(`end_date = ${end_date ? sqlEscape(end_date) : 'NULL'}`);
    if (media_file_ids !== undefined) updates.push(`media_file_ids = ${sqlEscape(JSON.stringify(media_file_ids))}`);

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No se enviaron campos a actualizar.' });
    }

    await sql.query(`UPDATE projects SET ${updates.join(', ')} WHERE id = ${sqlEscape(projectId)}`);
    return res.json({ message: 'Proyecto actualizado.' });
  } catch (err) {
    console.error('[ADMIN/UPDATE-PROJECT]', err.message);
    return res.status(500).json({ error: 'Error actualizando proyecto.' });
  }
}

async function deleteProject(req, res) {
  try {
    const projectId = parseId(req.params.projectId, res, 'projectId');
    if (projectId === null) return;
    await sql.query(`DELETE FROM projects WHERE id = ${sqlEscape(projectId)}`);
    await sql.query(`DELETE FROM project_applications WHERE project_id = ${sqlEscape(projectId)}`);
    return res.json({ message: 'Proyecto eliminado.' });
  } catch (err) {
    console.error('[ADMIN/DELETE-PROJECT]', err.message);
    return res.status(500).json({ error: 'Error eliminando proyecto.' });
  }
}

async function listProjectApplications(req, res) {
  try {
    const projectId = parseId(req.params.projectId, res, 'projectId');
    if (projectId === null) return;
    const result = await sql.query(
      `SELECT pa.id, pa.status, pa.applied_at, u.id AS user_id, u.name, u.email, u.tags, u.avatar_file_id
       FROM project_applications pa
       JOIN users u ON u.id = pa.user_id
       WHERE pa.project_id = ${sqlEscape(projectId)} AND pa.status != 'rejected'
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
    const appId = parseId(req.params.appId, res, 'appId');
    if (appId === null) return;
    const { status } = req.body;
    if (!['pending', 'accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Estado invalido.' });
    }
    await sql.query(`UPDATE project_applications SET status = ${sqlEscape(status)} WHERE id = ${sqlEscape(appId)}`);
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
    const { title, content, summary, cover_file_id } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Titulo y contenido requeridos.' });

    await sql.query(
      `INSERT INTO news (title, content, summary, cover_file_id, created_by)
       VALUES (${sqlEscape(title)}, ${sqlEscape(content)}, ${summary ? sqlEscape(summary) : 'NULL'}, ${cover_file_id ? sqlEscape(cover_file_id) : 'NULL'}, ${sqlEscape(req.user.id)})`
    );
    return res.status(201).json({ message: 'Noticia publicada.' });
  } catch (err) {
    console.error('[ADMIN/CREATE-NEWS]', err.message);
    return res.status(500).json({ error: 'Error publicando noticia.' });
  }
}

async function updateNews(req, res) {
  try {
    const newsId = parseId(req.params.newsId, res, 'newsId');
    if (newsId === null) return;
    const { title, content, summary, cover_file_id } = req.body;

    const updates = [];
    if (title)                  updates.push(`title = ${sqlEscape(title)}`);
    if (content)                updates.push(`content = ${sqlEscape(content)}`);
    if (summary !== undefined)  updates.push(`summary = ${summary ? sqlEscape(summary) : 'NULL'}`);
    if (cover_file_id !== undefined) updates.push(`cover_file_id = ${cover_file_id ? sqlEscape(cover_file_id) : 'NULL'}`);

    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar.' });

    await sql.query(`UPDATE news SET ${updates.join(', ')} WHERE id = ${sqlEscape(newsId)}`);
    return res.json({ message: 'Noticia actualizada.' });
  } catch (err) {
    console.error('[ADMIN/UPDATE-NEWS]', err.message);
    return res.status(500).json({ error: 'Error actualizando noticia.' });
  }
}

// ──────────────────────────────────────────────
// PROGRESO DE PROYECTO
// ──────────────────────────────────────────────
async function createProjectProgress(req, res) {
  try {
    const projectId = parseId(req.params.projectId, res, 'projectId');
    if (projectId === null) return;
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'El contenido del progreso es requerido.' });
    }
    const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'ceo');
    if (!isAdmin) {
      return res.status(403).json({ error: 'Solo los administradores pueden registrar progreso en los proyectos.' });
    }
    await sql.query(
      `INSERT INTO project_progress (project_id, user_id, content)
       VALUES (${sqlEscape(projectId)}, ${sqlEscape(req.user.id)}, ${sqlEscape(content.trim())})`
    );
    return res.status(201).json({ message: 'Progreso registrado.' });
  } catch (err) {
    console.error('[PROGRESS/CREATE]', err.message);
    return res.status(500).json({ error: 'Error registrando progreso.' });
  }
}

async function listProjectProgress(req, res) {
  try {
    const projectId = parseId(req.params.projectId, res, 'projectId');
    if (projectId === null) return;
    const result = await sql.query(
      `SELECT pp.id, pp.content, pp.created_at, u.name AS author_name, u.avatar_file_id
       FROM project_progress pp
       JOIN users u ON u.id = pp.user_id
       WHERE pp.project_id = ${sqlEscape(projectId)}
       ORDER BY pp.created_at DESC`
    );
    const log = (result.data || []).map(r => ({
      ...r,
      avatar_url: r.avatar_file_id ? storage.getFileUrl(r.avatar_file_id) : null,
    }));
    return res.json({ log });
  } catch (err) {
    console.error('[PROGRESS/LIST]', err.message);
    return res.status(500).json({ error: 'Error obteniendo progreso.' });
  }
}

async function deleteNews(req, res) {
  try {
    const newsId = parseId(req.params.newsId, res, 'newsId');
    if (newsId === null) return;
    await sql.query(`DELETE FROM news WHERE id = ${sqlEscape(newsId)}`);
    return res.json({ message: 'Noticia eliminada.' });
  } catch (err) {
    console.error('[ADMIN/DELETE-NEWS]', err.message);
    return res.status(500).json({ error: 'Error eliminando noticia.' });
  }
}

// ──────────────────────────────────────────────
// SUBIR ARCHIVO
// ──────────────────────────────────────────────
async function uploadMedia(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido.' });

    const result = await storage.uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);
    const files = result.files || result;
    const fileId = Array.isArray(files) ? files[0].id : files.id;
    const fileUrl = storage.getFileUrl(fileId);

    return res.json({ file_id: fileId, url: fileUrl });
  } catch (err) {
    console.error('[ADMIN/UPLOAD-MEDIA]', err.message);
    return res.status(500).json({ error: 'Error subiendo archivo.' });
  }
}

// ──────────────────────────────────────────────
// PORTFOLIO
// ──────────────────────────────────────────────
async function createPortfolioProject(req, res) {
  try {
    const { title, description, cover_file_id } = req.body;
    if (!title || !description) return res.status(400).json({ error: 'Titulo y descripcion requeridos.' });

    await sql.query(
      `INSERT INTO portfolio_projects (title, description, cover_file_id, created_by)
       VALUES (${sqlEscape(title)}, ${sqlEscape(description)}, ${cover_file_id ? sqlEscape(cover_file_id) : 'NULL'}, ${sqlEscape(req.user.id)})`
    );
    return res.status(201).json({ message: 'Proyecto de portfolio publicado.' });
  } catch (err) {
    console.error('[ADMIN/CREATE-PORTFOLIO]', err.message);
    return res.status(500).json({ error: 'Error publicando proyecto de portfolio.' });
  }
}

async function updatePortfolioProject(req, res) {
  try {
    const portfolioId = parseId(req.params.portfolioId, res, 'portfolioId');
    if (portfolioId === null) return;
    const { title, description, cover_file_id } = req.body;

    const updates = [];
    if (title)       updates.push(`title = ${sqlEscape(title)}`);
    if (description) updates.push(`description = ${sqlEscape(description)}`);
    if (cover_file_id !== undefined) updates.push(`cover_file_id = ${cover_file_id ? sqlEscape(cover_file_id) : 'NULL'}`);

    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar.' });

    await sql.query(`UPDATE portfolio_projects SET ${updates.join(', ')} WHERE id = ${sqlEscape(portfolioId)}`);
    return res.json({ message: 'Proyecto de portfolio actualizado.' });
  } catch (err) {
    console.error('[ADMIN/UPDATE-PORTFOLIO]', err.message);
    return res.status(500).json({ error: 'Error actualizando proyecto de portfolio.' });
  }
}

async function deletePortfolioProject(req, res) {
  try {
    const portfolioId = parseId(req.params.portfolioId, res, 'portfolioId');
    if (portfolioId === null) return;
    await sql.query(`DELETE FROM portfolio_projects WHERE id = ${sqlEscape(portfolioId)}`);
    return res.json({ message: 'Proyecto de portfolio eliminado.' });
  } catch (err) {
    console.error('[ADMIN/DELETE-PORTFOLIO]', err.message);
    return res.status(500).json({ error: 'Error eliminando proyecto de portfolio.' });
  }
}

// ──────────────────────────────────────────────
// REUNIONES DE PROYECTOS
// ──────────────────────────────────────────────
async function scheduleProjectMeeting(req, res) {
  try {
    const projectId = parseId(req.params.projectId, res, 'projectId');
    if (projectId === null) return;
    let { meeting_date, meeting_link, date, time, link } = req.body;

    if (meeting_date) {
      const parts = meeting_date.split('T');
      date = parts[0];
      time = parts[1];
    }
    if (meeting_link) link = meeting_link;

    if (!date || !time || !link) return res.status(400).json({ error: 'Fecha, hora y link son requeridos.' });

    const projectRes = await sql.query(
      `SELECT title, summary FROM projects WHERE id = ${sqlEscape(projectId)}`
    );
    const projectTitle   = projectRes.data && projectRes.data.length > 0 ? projectRes.data[0].title   : 'Proyecto';
    const projectSummary = projectRes.data && projectRes.data.length > 0 && projectRes.data[0].summary
      ? projectRes.data[0].summary
      : 'Reunion de seguimiento y coordinacion del proyecto.';

    const datetime = `${date} ${time}:00`;
    await sql.query(
      `UPDATE projects SET next_meeting_date = ${sqlEscape(datetime)}, next_meeting_link = ${sqlEscape(link)} WHERE id = ${sqlEscape(projectId)}`
    );

    const apps = await sql.query(`
      SELECT u.email, u.name
      FROM project_applications pa
      JOIN users u ON u.id = pa.user_id
      WHERE pa.project_id = ${sqlEscape(projectId)} AND pa.status = 'accepted'
    `);
    const admins = await sql.query(`SELECT email, name FROM users WHERE role IN ('admin', 'ceo')`);
    const { sendNotificationEmail } = require('../helpers/email');

    const recipientsMap = new Map();
    for (const u of (apps.data || []))   recipientsMap.set(u.email, u.name);
    for (const u of (admins.data || [])) recipientsMap.set(u.email, u.name);

    const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
    const safeTitle   = escapeHtml(projectTitle);
    const safeSummary = escapeHtml(projectSummary);

    for (const [email, name] of recipientsMap) {
      const safeName = escapeHtml(name);
      const msg = `
        <div style="font-family:'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#0b0c10;color:#c5c6c7;padding:40px 20px;margin:0;">
          <div style="max-width:600px;margin:0 auto;background-color:#1f2833;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.5);overflow:hidden;">
            <div style="background-color:#111;padding:25px;text-align:center;border-bottom:4px solid #66fcf1;">
              <img src="https://spiderwebarg.com/wp-content/uploads/2023/10/spider-web-logo.png" alt="Spider-Web ARG" style="height:40px;margin-bottom:10px;" />
              <h2 style="color:#66fcf1;margin:0;font-size:22px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Reunion Programada</h2>
            </div>
            <div style="padding:35px 30px;">
              <p style="font-size:16px;line-height:1.6;margin-top:0;color:#e0e2e4;">
                Hola <strong style="color:#fff;">${safeName}</strong>,<br><br>
                Se ha agendado una nueva reunion obligatoria para el proyecto <strong style="color:#66fcf1;">${safeTitle}</strong>.
              </p>
              <div style="background-color:rgba(102,252,241,0.05);border-left:4px solid #45a29e;padding:18px 20px;margin:25px 0;border-radius:0 8px 8px 0;">
                <p style="margin:0 0 12px 0;font-size:15px;"><strong style="color:#66fcf1;display:inline-block;width:60px;">&#128197; Fecha:</strong> ${escapeHtml(date)}</p>
                <p style="margin:0;font-size:15px;"><strong style="color:#66fcf1;display:inline-block;width:60px;">&#9200; Hora:</strong> ${escapeHtml(time)} hs</p>
              </div>
              <p style="margin-bottom:35px;font-size:15px;color:#a0a5a8;font-style:italic;background:rgba(255,255,255,0.03);padding:15px;border-radius:6px;">
                &ldquo;${safeSummary}&rdquo;
              </p>
              <div style="text-align:center;margin-top:20px;">
                <a href="${escapeHtml(link)}" style="background-color:#66fcf1;color:#0b0c10;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block;margin:0 10px 15px 0;text-transform:uppercase;letter-spacing:0.5px;">Unirse al Meet</a>
                <a href="${siteUrl}/#projects" style="background-color:transparent;border:2px solid #45a29e;color:#66fcf1;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block;margin:0 0 15px 0;text-transform:uppercase;letter-spacing:0.5px;">Ver Proyecto</a>
              </div>
            </div>
            <div style="background-color:#111;padding:20px;text-align:center;font-size:13px;color:#777;">
              Este es un correo automatico de Spider-Web ARG.<br>Por favor, no respondas a esta direccion.<br>&copy; 2026 Spider-Web ARG Pasantias.
            </div>
          </div>
        </div>
      `;
      await sendNotificationEmail(email, `Reunion: ${safeTitle}`, msg).catch(console.error);
    }

    return res.json({ message: 'Reunion programada y notificada a los alumnos y administradores.' });
  } catch (err) {
    console.error('[ADMIN/SCHEDULE-MEETING]', err.message);
    return res.status(500).json({ error: 'Error programando reunion.' });
  }
}

async function cancelProjectMeeting(req, res) {
  try {
    const projectId = parseId(req.params.projectId, res, 'projectId');
    if (projectId === null) return;

    const projectRes = await sql.query(
      `SELECT title FROM projects WHERE id = ${sqlEscape(projectId)}`
    );
    const projectTitle = projectRes.data && projectRes.data.length > 0 ? projectRes.data[0].title : 'Proyecto';

    await sql.query(`UPDATE projects SET next_meeting_date = NULL, next_meeting_link = NULL WHERE id = ${sqlEscape(projectId)}`);

    const apps = await sql.query(`
      SELECT u.email, u.name FROM project_applications pa
      JOIN users u ON u.id = pa.user_id
      WHERE pa.project_id = ${sqlEscape(projectId)} AND pa.status = 'accepted'
    `);
    const admins = await sql.query(`SELECT email, name FROM users WHERE role IN ('admin', 'ceo')`);
    const { sendNotificationEmail } = require('../helpers/email');

    const recipientsMap = new Map();
    for (const u of (apps.data || []))   recipientsMap.set(u.email, u.name);
    for (const u of (admins.data || [])) recipientsMap.set(u.email, u.name);

    const safeTitle = escapeHtml(projectTitle);
    for (const [email, name] of recipientsMap) {
      const safeName = escapeHtml(name);
      const msg = `
        <div style="font-family:'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#0b0c10;color:#c5c6c7;padding:40px 20px;margin:0;">
          <div style="max-width:600px;margin:0 auto;background-color:#1f2833;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.5);overflow:hidden;">
            <div style="background-color:#111;padding:25px;text-align:center;border-bottom:4px solid #f87171;">
              <img src="https://spiderwebarg.com/wp-content/uploads/2023/10/spider-web-logo.png" alt="Spider-Web ARG" style="height:40px;margin-bottom:10px;" />
              <h2 style="color:#f87171;margin:0;font-size:22px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Reunion Cancelada</h2>
            </div>
            <div style="padding:35px 30px;">
              <p style="font-size:16px;line-height:1.6;margin-top:0;color:#e0e2e4;">
                Hola <strong style="color:#fff;">${safeName}</strong>,<br><br>
                Te informamos que la reunion programada para el proyecto <strong style="color:#66fcf1;">${safeTitle}</strong> ha sido <strong>CANCELADA</strong> o pospuesta.
              </p>
              <p style="margin-bottom:35px;font-size:15px;color:#a0a5a8;">Recibiras una nueva notificacion cuando los administradores programen una nueva fecha.</p>
            </div>
            <div style="background-color:#111;padding:20px;text-align:center;font-size:13px;color:#777;">
              Este es un correo automatico de Spider-Web ARG.<br>Por favor, no respondas a esta direccion.<br>&copy; 2026 Spider-Web ARG Pasantias.
            </div>
          </div>
        </div>
      `;
      await sendNotificationEmail(email, `Reunion Cancelada: ${safeTitle}`, msg).catch(console.error);
    }

    return res.json({ message: 'Reunion cancelada y notificada a los participantes.' });
  } catch (err) {
    console.error('[ADMIN/CANCEL-MEETING]', err.message);
    return res.status(500).json({ error: 'Error cancelando reunion.' });
  }
}

async function createProjectMeetingRecord(req, res) {
  try {
    const projectId = parseId(req.params.projectId, res, 'projectId');
    if (projectId === null) return;
    const { record_notes, attendees } = req.body;

    const proj = await sql.query(
      `SELECT next_meeting_date, next_meeting_link FROM projects WHERE id = ${sqlEscape(projectId)}`
    );
    if (!proj.data || proj.data.length === 0) return res.status(404).json({ error: 'Proyecto no encontrado.' });

    const mDate = proj.data[0].next_meeting_date
      ? sqlEscape(String(proj.data[0].next_meeting_date).replace('T', ' ').slice(0, 19))
      : 'NOW()';
    const mLink = proj.data[0].next_meeting_link ? sqlEscape(proj.data[0].next_meeting_link) : 'NULL';
    const attendeesJson = sqlEscape(JSON.stringify(attendees || []));

    await sql.query(`
      INSERT INTO project_meetings (project_id, meeting_date, meeting_link, record_notes, attendees_json)
      VALUES (${sqlEscape(projectId)}, ${mDate}, ${mLink}, ${sqlEscape(record_notes || '')}, ${attendeesJson})
    `);

    await sql.query(
      `UPDATE projects SET next_meeting_date = NULL, next_meeting_link = NULL WHERE id = ${sqlEscape(projectId)}`
    );

    return res.json({ message: 'Registro de reunion guardado con exito.' });
  } catch (err) {
    console.error('[ADMIN/MEETING-RECORD]', err.message);
    return res.status(500).json({ error: 'Error guardando registro de reunion.' });
  }
}

// ──────────────────────────────────────────────
// CAPACITACIONES
// ──────────────────────────────────────────────
async function listTrainings(req, res) {
  try {
    const result = await sql.query(`
      SELECT t.*,
        (SELECT COUNT(*) FROM training_applications ta WHERE ta.training_id = t.id) as applied_count
      FROM trainings t ORDER BY t.created_at DESC
    `);
    return res.json({ trainings: result.data || [] });
  } catch (err) {
    console.error('[ADMIN/LIST-TRAININGS]', err.message);
    return res.status(500).json({ error: 'Error listando capacitaciones.' });
  }
}

async function createTraining(req, res) {
  try {
    const { title, description, min_quota } = req.body;
    if (!title) return res.status(400).json({ error: 'El titulo es requerido.' });

    const quota = min_quota ? parseInt(min_quota, 10) : 2;
    await sql.query(`
      INSERT INTO trainings (title, description, min_quota)
      VALUES (${sqlEscape(title)}, ${sqlEscape(description || '')}, ${sqlEscape(quota)})
    `);
    return res.status(201).json({ message: 'Capacitacion creada.' });
  } catch (err) {
    console.error('[ADMIN/CREATE-TRAINING]', err.message);
    return res.status(500).json({ error: 'Error creando capacitacion.' });
  }
}

async function scheduleTraining(req, res) {
  try {
    const trainingId = parseId(req.params.trainingId, res, 'trainingId');
    if (trainingId === null) return;
    const { date, time, link } = req.body;
    if (!date || !time || !link) return res.status(400).json({ error: 'Fecha, hora y link requeridos.' });

    const datetime = `${date} ${time}:00`;
    await sql.query(`
      UPDATE trainings
      SET meeting_date = ${sqlEscape(datetime)}, meeting_link = ${sqlEscape(link)}, status = 'scheduled'
      WHERE id = ${sqlEscape(trainingId)}
    `);

    const apps = await sql.query(`
      SELECT u.email, u.name
      FROM training_applications ta
      JOIN users u ON u.id = ta.user_id
      WHERE ta.training_id = ${sqlEscape(trainingId)}
    `);

    const { sendNotificationEmail } = require('../helpers/email');
    for (const user of (apps.data || [])) {
      const msg = `
        <h3>Capacitacion Programada</h3>
        <p>Hola ${escapeHtml(user.name)}, tu capacitacion solicitada ha sido programada.</p>
        <p><strong>Fecha y Hora:</strong> ${escapeHtml(date)} a las ${escapeHtml(time)}</p>
        <p><strong>Link:</strong> <a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>
      `;
      await sendNotificationEmail(user.email, 'Capacitacion Programada', msg).catch(console.error);
    }

    return res.json({ message: 'Capacitacion programada y usuarios notificados.' });
  } catch (err) {
    console.error('[ADMIN/SCHEDULE-TRAINING]', err.message);
    return res.status(500).json({ error: 'Error programando capacitacion.' });
  }
}

async function updateTraining(req, res) {
  try {
    const trainingId = parseId(req.params.trainingId, res, 'trainingId');
    if (trainingId === null) return;
    const { title, description, min_quota, status } = req.body;

    const updates = [];
    if (title)               updates.push(`title = ${sqlEscape(title)}`);
    if (description !== undefined) updates.push(`description = ${sqlEscape(description)}`);
    if (min_quota !== undefined)   updates.push(`min_quota = ${sqlEscape(parseInt(min_quota, 10))}`);
    if (status)              updates.push(`status = ${sqlEscape(status)}`);

    if (updates.length > 0) {
      await sql.query(`UPDATE trainings SET ${updates.join(', ')} WHERE id = ${sqlEscape(trainingId)}`);
    }

    return res.json({ message: 'Capacitacion actualizada correctamente.' });
  } catch (err) {
    console.error('[ADMIN/UPDATE-TRAINING]', err.message);
    return res.status(500).json({ error: 'Error actualizando capacitacion.' });
  }
}

async function deleteTraining(req, res) {
  try {
    const trainingId = parseId(req.params.trainingId, res, 'trainingId');
    if (trainingId === null) return;
    await sql.query(`DELETE FROM training_applications WHERE training_id = ${sqlEscape(trainingId)}`);
    await sql.query(`DELETE FROM trainings WHERE id = ${sqlEscape(trainingId)}`);
    return res.json({ message: 'Capacitacion eliminada.' });
  } catch (err) {
    console.error('[ADMIN/DELETE-TRAINING]', err.message);
    return res.status(500).json({ error: 'Error eliminando capacitacion.' });
  }
}

async function testEmail(req, res) {
  try {
    const { to, template } = req.body;
    if (!to || !template) return res.status(400).json({ error: 'Email destino y plantilla son requeridos.' });

    // SEC: validar formato de email para evitar uso como relay de spam
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return res.status(400).json({ error: 'Email destino invalido.' });
    }

    const { sendNotificationEmail } = require('../helpers/email');
    const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
    let msg = '';
    let subject = '';

    if (template === 'meeting') {
      subject = 'Reunion de Proyecto (Prueba)';
      msg = `
        <div style="font-family:'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#0b0c10;color:#c5c6c7;padding:40px 20px;">
          <div style="max-width:600px;margin:0 auto;background-color:#1f2833;border-radius:12px;overflow:hidden;">
            <div style="background-color:#111;padding:25px;text-align:center;border-bottom:4px solid #66fcf1;">
              <h2 style="color:#66fcf1;margin:0;font-size:22px;font-weight:700;text-transform:uppercase;">Reunion Programada (TEST)</h2>
            </div>
            <div style="padding:35px 30px;">
              <p>Si recibes este mensaje, el sistema de correos funciona correctamente.</p>
              <p>Fecha de prueba: 2026-10-10 | Hora: 15:30</p>
              <a href="${siteUrl}/#projects" style="background-color:#66fcf1;color:#0b0c10;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;display:inline-block;">Ver Proyectos</a>
            </div>
            <div style="background-color:#111;padding:20px;text-align:center;font-size:13px;color:#777;">
              Correo automatico de Spider-Web ARG. &copy; 2026
            </div>
          </div>
        </div>
      `;
    } else if (template === 'basic') {
      subject = 'Correo de Prueba (Basico)';
      msg = `
        <div style="font-family:'Inter',Arial,sans-serif;padding:30px;background:#f4f4f5;color:#333;">
          <div style="max-width:500px;margin:0 auto;background:#fff;padding:20px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color:#2563eb;margin-top:0;">Prueba de Sistema</h2>
            <p>Este es un correo de prueba generado exitosamente desde el panel de administracion.</p>
            <p style="color:#666;font-size:14px;">Si recibiste este mensaje, los credenciales SMTP y el servicio de correos estan funcionando correctamente.</p>
          </div>
        </div>
      `;
    } else {
      return res.status(400).json({ error: 'Plantilla desconocida.' });
    }

    await sendNotificationEmail(to, subject, msg);
    return res.json({ message: 'Correo de prueba enviado con exito.' });
  } catch (err) {
    console.error('[ADMIN/TEST-EMAIL]', err.message);
    return res.status(500).json({ error: 'Error enviando correo de prueba.' });
  }
}

module.exports = {
  listAllUsers, listPendingUsers, updateUserRole, deleteUser, validateUser,
  generateToken, listTokens,
  listSkills, createSkill, updateSkill, deleteSkill,
  listProjects, createProject, updateProject, deleteProject, listProjectApplications, updateApplicationStatus,
  createNews, updateNews, deleteNews,
  createPortfolioProject, updatePortfolioProject, deletePortfolioProject,
  uploadMedia,
  createProjectProgress, listProjectProgress,
  scheduleProjectMeeting, cancelProjectMeeting, createProjectMeetingRecord,
  listTrainings, createTraining, scheduleTraining, updateTraining, deleteTraining,
  testEmail,
};
