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

async function validateUser(req, res) {
  try {
    const { userId } = req.params;
    const uid = parseInt(userId);
    if (isNaN(uid)) return res.status(400).json({ error: 'ID de usuario inválido.' });

    const uRes = await sql.query(`SELECT id, name, email, is_token_validated FROM users WHERE id = ${uid}`);
    const userObj = uRes.data && uRes.data.length ? uRes.data[0] : null;
    if (!userObj) return res.status(404).json({ error: 'Usuario no encontrado.' });

    await sql.query(`UPDATE users SET is_token_validated = 1 WHERE id = ${uid}`);

    if (!parseInt(userObj.is_token_validated)) {
      try {
        const welcomeMsg = `¡Hola, ${userObj.name}! Tu cuenta ha sido verificada y aceptada por la Administración. Ya tienes acceso completo a todos los proyectos y funciones del portal. ¡Bienvenido al equipo!`;
        await sql.query(
          `INSERT INTO chat_messages (sender_id, receiver_id, content) VALUES (${req.user.id}, ${uid}, '${welcomeMsg.replace(/'/g, "''")}')`
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

async function updateSkill(req, res) {
  try {
    const { skillId } = req.params;
    const { name, color } = req.body;

    const updates = [];
    if (name) updates.push(`name = '${name.replace(/'/g, "''")}'`);
    if (color) updates.push(`color = '${color.replace(/'/g, "''")}'`);

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No se enviaron campos para actualizar.' });
    }

    await sql.query(`UPDATE skills SET ${updates.join(', ')} WHERE id = ${parseInt(skillId)}`);
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
    const { storage } = require('../api-client/index');
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
      const ids = p.media_file_ids ? JSON.parse(p.media_file_ids) : [];
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

    const tagsValue = required_tags && required_tags.length ? `'${JSON.stringify(required_tags)}'` : "'[]'";
    const mediaValue = media_file_ids && media_file_ids.length ? `'${JSON.stringify(media_file_ids)}'` : "'[]'";
    const confValue = conf_link ? `'${conf_link.replace(/'/g, "''")}'` : 'NULL';
    const githubValue = github_repo ? `'${github_repo.replace(/'/g, "''")}'` : 'NULL';
    const startValue = start_date ? `'${start_date}'` : 'NULL';
    const endValue = end_date ? `'${end_date}'` : 'NULL';
    const confStartValue = conf_start ? `'${conf_start}'` : 'NULL';
    const confEndValue = conf_end ? `'${conf_end}'` : 'NULL';
    const summaryValue = summary ? `'${summary.replace(/'/g, "''")}'` : 'NULL';

    const result = await sql.query(
      `INSERT INTO projects (title, description, summary, media_file_ids, required_tags, conf_link, github_repo, conf_start, conf_end, start_date, end_date, created_by)
       VALUES ('${title.replace(/'/g, "''")}', '${description.replace(/'/g, "''")}', ${summaryValue}, ${mediaValue}, ${tagsValue}, ${confValue}, ${githubValue}, ${confStartValue}, ${confEndValue}, ${startValue}, ${endValue}, ${req.user.id})`
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
    const { title, description, summary, required_tags, conf_link, github_repo, conf_start, conf_end, start_date, end_date, media_file_ids } = req.body;

    const updates = [];
    if (title) updates.push(`title = '${title.replace(/'/g, "''")}'`);
    if (description) updates.push(`description = '${description.replace(/'/g, "''")}'`);
    if (summary !== undefined) updates.push(`summary = ${summary ? `'${summary.replace(/'/g, "''")}' ` : 'NULL'}`);
    if (required_tags !== undefined) updates.push(`required_tags = '${JSON.stringify(required_tags)}'`);
    if (conf_link !== undefined) updates.push(`conf_link = ${conf_link ? `'${conf_link.replace(/'/g, "''")}'` : 'NULL'}`);
    if (github_repo !== undefined) updates.push(`github_repo = ${github_repo ? `'${github_repo.replace(/'/g, "''")}'` : 'NULL'}`);
    if (conf_start !== undefined) updates.push(`conf_start = ${conf_start ? `'${conf_start}'` : 'NULL'}`);
    if (conf_end !== undefined) updates.push(`conf_end = ${conf_end ? `'${conf_end}'` : 'NULL'}`);
    if (start_date !== undefined) updates.push(`start_date = ${start_date ? `'${start_date}'` : 'NULL'}`);
    if (end_date !== undefined) updates.push(`end_date = ${end_date ? `'${end_date}'` : 'NULL'}`);
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
       WHERE pa.project_id = ${parseInt(projectId)} AND pa.status != 'rejected'
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
    const { title, content, summary, cover_file_id } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Titulo y contenido requeridos.' });

    const coverValue = cover_file_id ? `'${cover_file_id}'` : 'NULL';
    const summaryValue = summary ? `'${summary.replace(/'/g, "''")}'` : 'NULL';
    await sql.query(
      `INSERT INTO news (title, content, summary, cover_file_id, created_by)
       VALUES ('${title.replace(/'/g, "''")}', '${content.replace(/'/g, "''")}', ${summaryValue}, ${coverValue}, ${req.user.id})`
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
    const { title, content, summary, cover_file_id } = req.body;

    const updates = [];
    if (title) updates.push(`title = '${title.replace(/'/g, "''")}'`);
    if (content) updates.push(`content = '${content.replace(/'/g, "''")}'`);
    if (summary !== undefined) updates.push(`summary = ${summary ? `'${summary.replace(/'/g, "''")}'` : 'NULL'}`);
    if (cover_file_id !== undefined) updates.push(`cover_file_id = '${cover_file_id}'`);

    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar.' });

    await sql.query(`UPDATE news SET ${updates.join(', ')} WHERE id = ${parseInt(newsId)}`);
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
    const { projectId } = req.params;
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'El contenido del progreso es requerido.' });
    }
    const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'ceo');
    if (!isAdmin) {
      return res.status(403).json({ error: 'Solo los administradores pueden registrar progreso en los proyectos.' });
    }
    await sql.query(
      `INSERT INTO project_progress (project_id, user_id, content) VALUES (${parseInt(projectId)}, ${req.user.id}, '${content.trim().replace(/'/g, "''")}') `
    );
    return res.status(201).json({ message: 'Progreso registrado.' });
  } catch (err) {
    console.error('[PROGRESS/CREATE]', err.message);
    return res.status(500).json({ error: 'Error registrando progreso.' });
  }
}

async function listProjectProgress(req, res) {
  try {
    const { projectId } = req.params;
    const result = await sql.query(
      `SELECT pp.id, pp.content, pp.created_at, u.name AS author_name, u.avatar_file_id
       FROM project_progress pp
       JOIN users u ON u.id = pp.user_id
       WHERE pp.project_id = ${parseInt(projectId)}
       ORDER BY pp.created_at DESC`
    );
    const { storage } = require('../api-client/index');
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

// ──────────────────────────────────────────────
// PORTFOLIO (Proyectos Realizados)
// ──────────────────────────────────────────────
async function createPortfolioProject(req, res) {
  try {
    const { title, description, cover_file_id } = req.body;
    if (!title || !description) return res.status(400).json({ error: 'Titulo y descripcion requeridos.' });

    const coverValue = cover_file_id ? `'${cover_file_id}'` : 'NULL';
    await sql.query(
      `INSERT INTO portfolio_projects (title, description, cover_file_id, created_by)
       VALUES ('${title.replace(/'/g, "''")}', '${description.replace(/'/g, "''")}', ${coverValue}, ${req.user.id})`
    );
    return res.status(201).json({ message: 'Proyecto de portfolio publicado.' });
  } catch (err) {
    console.error('[ADMIN/CREATE-PORTFOLIO]', err.message);
    return res.status(500).json({ error: 'Error publicando proyecto de portfolio.' });
  }
}

async function updatePortfolioProject(req, res) {
  try {
    const { portfolioId } = req.params;
    const { title, description, cover_file_id } = req.body;

    const updates = [];
    if (title) updates.push(`title = '${title.replace(/'/g, "''")}'`);
    if (description) updates.push(`description = '${description.replace(/'/g, "''")}'`);
    if (cover_file_id !== undefined) updates.push(`cover_file_id = ${cover_file_id ? `'${cover_file_id}'` : 'NULL'}`);

    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar.' });

    await sql.query(`UPDATE portfolio_projects SET ${updates.join(', ')} WHERE id = ${parseInt(portfolioId)}`);
    return res.json({ message: 'Proyecto de portfolio actualizado.' });
  } catch (err) {
    console.error('[ADMIN/UPDATE-PORTFOLIO]', err.message);
    return res.status(500).json({ error: 'Error actualizando proyecto de portfolio.' });
  }
}

async function deletePortfolioProject(req, res) {
  try {
    const { portfolioId } = req.params;
    await sql.query(`DELETE FROM portfolio_projects WHERE id = ${parseInt(portfolioId)}`);
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
    const { projectId } = req.params;
    let { meeting_date, meeting_link, date, time, link } = req.body;

    if (meeting_date) {
      const parts = meeting_date.split('T');
      date = parts[0];
      time = parts[1];
    }
    if (meeting_link) {
      link = meeting_link;
    }

    if (!date || !time || !link) return res.status(400).json({ error: 'Fecha, hora y link son requeridos.' });

    // Obtener información del proyecto para el correo
    const projectRes = await sql.query(`SELECT title, summary FROM projects WHERE id = ${parseInt(projectId)}`);
    const projectTitle = projectRes.data && projectRes.data.length > 0 ? projectRes.data[0].title : 'Proyecto';
    const projectSummary = projectRes.data && projectRes.data.length > 0 && projectRes.data[0].summary 
      ? projectRes.data[0].summary 
      : 'Reunión de seguimiento y coordinación del proyecto.';

    const datetime = `${date} ${time}:00`;
    await sql.query(`UPDATE projects SET next_meeting_date = '${datetime}', next_meeting_link = '${link.replace(/'/g, "''")}' WHERE id = ${parseInt(projectId)}`);

    // Obtener postulados aceptados
    const apps = await sql.query(`
      SELECT u.email, u.name 
      FROM project_applications pa
      JOIN users u ON u.id = pa.user_id
      WHERE pa.project_id = ${parseInt(projectId)} AND pa.status = 'accepted'
    `);

    // Obtener administradores y CEOs (encargados)
    const admins = await sql.query(`
      SELECT email, name 
      FROM users 
      WHERE role IN ('admin', 'ceo')
    `);

    const { sendNotificationEmail } = require('../helpers/email');
    
    // Unir ambas listas de notificaciones sin duplicados
    const recipientsMap = new Map();
    for (const u of (apps.data || [])) recipientsMap.set(u.email, u.name);
    for (const u of (admins.data || [])) recipientsMap.set(u.email, u.name);

    const siteUrl = process.env.SITE_URL || 'http://localhost:3000';

    for (const [email, name] of recipientsMap) {
      const msg = `
        <div style="font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0c10; color: #c5c6c7; padding: 40px 20px; margin: 0;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #1f2833; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); overflow: hidden;">
            <div style="background-color: #111; padding: 25px; text-align: center; border-bottom: 4px solid #66fcf1;">
              <img src="https://spiderwebarg.com/wp-content/uploads/2023/10/spider-web-logo.png" alt="Spider-Web ARG" style="height: 40px; margin-bottom: 10px;" />
              <h2 style="color: #66fcf1; margin: 0; font-size: 22px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Reunión Programada</h2>
            </div>
            
            <div style="padding: 35px 30px;">
              <p style="font-size: 16px; line-height: 1.6; margin-top: 0; color: #e0e2e4;">
                Hola <strong style="color: #fff;">${name}</strong>,<br><br>
                Se ha agendado una nueva reunión obligatoria para el proyecto <strong style="color: #66fcf1;">${projectTitle}</strong>.
              </p>

              <div style="background-color: rgba(102, 252, 241, 0.05); border-left: 4px solid #45a29e; padding: 18px 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
                <p style="margin: 0 0 12px 0; font-size: 15px;"><strong style="color: #66fcf1; display: inline-block; width: 60px;">📅 Fecha:</strong> ${date}</p>
                <p style="margin: 0; font-size: 15px;"><strong style="color: #66fcf1; display: inline-block; width: 60px;">⏰ Hora:</strong> ${time} hs</p>
              </div>

              <p style="margin-bottom: 35px; font-size: 15px; color: #a0a5a8; font-style: italic; background: rgba(255,255,255,0.03); padding: 15px; border-radius: 6px;">
                "${projectSummary}"
              </p>

              <div style="text-align: center; margin-top: 20px;">
                <a href="${link}" style="background-color: #66fcf1; color: #0b0c10; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 700; font-size: 15px; display: inline-block; margin: 0 10px 15px 0; transition: all 0.3s; text-transform: uppercase; letter-spacing: 0.5px;">
                  Unirse al Meet
                </a>
                <a href="${siteUrl}/#projects" style="background-color: transparent; border: 2px solid #45a29e; color: #66fcf1; text-decoration: none; padding: 12px 26px; border-radius: 8px; font-weight: 700; font-size: 15px; display: inline-block; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                  Ver Proyecto
                </a>
              </div>
            </div>

            <div style="background-color: #111; padding: 20px; text-align: center; font-size: 13px; color: #777;">
              Este es un correo automático de Spider-Web ARG.<br>
              Por favor, no respondas a esta dirección.<br>
              © 2026 Spider-Web ARG Pasantías.
            </div>
          </div>
        </div>
      `;
      await sendNotificationEmail(email, `Reunión: ${projectTitle}`, msg).catch(console.error);
    }

    return res.json({ message: 'Reunión programada y notificada a los alumnos y administradores.' });
  } catch (err) {
    console.error('[ADMIN/SCHEDULE-MEETING]', err.message);
    return res.status(500).json({ error: 'Error programando reunión.' });
  }
}

async function cancelProjectMeeting(req, res) {
  try {
    const { projectId } = req.params;

    // Obtener información del proyecto
    const projectRes = await sql.query(`SELECT title FROM projects WHERE id = ${parseInt(projectId)}`);
    const projectTitle = projectRes.data && projectRes.data.length > 0 ? projectRes.data[0].title : 'Proyecto';

    // Borrar la fecha y enlace de la base de datos
    await sql.query(`UPDATE projects SET next_meeting_date = NULL, next_meeting_link = NULL WHERE id = ${parseInt(projectId)}`);

    // Obtener postulados aceptados
    const apps = await sql.query(`
      SELECT u.email, u.name 
      FROM project_applications pa
      JOIN users u ON u.id = pa.user_id
      WHERE pa.project_id = ${parseInt(projectId)} AND pa.status = 'accepted'
    `);

    // Obtener administradores y CEOs
    const admins = await sql.query(`
      SELECT email, name 
      FROM users 
      WHERE role IN ('admin', 'ceo')
    `);

    const { sendNotificationEmail } = require('../helpers/email');
    
    // Unir ambas listas sin duplicados
    const recipientsMap = new Map();
    for (const u of (apps.data || [])) recipientsMap.set(u.email, u.name);
    for (const u of (admins.data || [])) recipientsMap.set(u.email, u.name);

    for (const [email, name] of recipientsMap) {
      const msg = `
        <div style="font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0c10; color: #c5c6c7; padding: 40px 20px; margin: 0;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #1f2833; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); overflow: hidden;">
            <div style="background-color: #111; padding: 25px; text-align: center; border-bottom: 4px solid #f87171;">
              <img src="https://spiderwebarg.com/wp-content/uploads/2023/10/spider-web-logo.png" alt="Spider-Web ARG" style="height: 40px; margin-bottom: 10px;" />
              <h2 style="color: #f87171; margin: 0; font-size: 22px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Reunión Cancelada</h2>
            </div>
            
            <div style="padding: 35px 30px;">
              <p style="font-size: 16px; line-height: 1.6; margin-top: 0; color: #e0e2e4;">
                Hola <strong style="color: #fff;">${name}</strong>,<br><br>
                Te informamos que la reunión programada para el proyecto <strong style="color: #66fcf1;">${projectTitle}</strong> ha sido <strong>CANCELADA</strong> o pospuesta.
              </p>

              <p style="margin-bottom: 35px; font-size: 15px; color: #a0a5a8;">
                Recibirás una nueva notificación por este medio cuando los administradores programen una nueva fecha para el encuentro. Por el momento, la reunión previa ya no está en pie.
              </p>
            </div>

            <div style="background-color: #111; padding: 20px; text-align: center; font-size: 13px; color: #777;">
              Este es un correo automático de Spider-Web ARG.<br>
              Por favor, no respondas a esta dirección.<br>
              © 2026 Spider-Web ARG Pasantías.
            </div>
          </div>
        </div>
      `;
      await sendNotificationEmail(email, `Reunión Cancelada: ${projectTitle}`, msg).catch(console.error);
    }

    return res.json({ message: 'Reunión cancelada y notificada a los participantes.' });
  } catch (err) {
    console.error('[ADMIN/CANCEL-MEETING]', err.message);
    return res.status(500).json({ error: 'Error cancelando reunión.' });
  }
}

async function createProjectMeetingRecord(req, res) {
  try {
    const { projectId } = req.params;
    const { record_notes, attendees } = req.body; // attendees es array de IDs o nombres
    
    // Obtener info de la reunión actual
    const proj = await sql.query(`SELECT next_meeting_date, next_meeting_link FROM projects WHERE id = ${parseInt(projectId)}`);
    if (!proj.data || proj.data.length === 0) return res.status(404).json({ error: 'Proyecto no encontrado.' });
    
    const mDate = proj.data[0].next_meeting_date ? `'${String(proj.data[0].next_meeting_date).replace('T', ' ').slice(0,19)}'` : 'NOW()';
    const mLink = proj.data[0].next_meeting_link ? `'${proj.data[0].next_meeting_link.replace(/'/g, "''")}'` : 'NULL';
    const attendeesJson = attendees ? `'${JSON.stringify(attendees)}'` : "'[]'";

    await sql.query(`
      INSERT INTO project_meetings (project_id, meeting_date, meeting_link, record_notes, attendees_json)
      VALUES (${parseInt(projectId)}, ${mDate}, ${mLink}, '${record_notes.replace(/'/g, "''")}', ${attendeesJson})
    `);

    await sql.query(`UPDATE projects SET next_meeting_date = NULL, next_meeting_link = NULL WHERE id = ${parseInt(projectId)}`);

    return res.json({ message: 'Registro de reunión guardado con éxito.' });
  } catch (err) {
    console.error('[ADMIN/MEETING-RECORD]', err.message);
    return res.status(500).json({ error: 'Error guardando registro de reunión.' });
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
    if (!title) return res.status(400).json({ error: 'El título es requerido.' });
    
    const quota = min_quota ? parseInt(min_quota) : 2;
    await sql.query(`
      INSERT INTO trainings (title, description, min_quota) 
      VALUES ('${title.replace(/'/g, "''")}', '${(description||'').replace(/'/g, "''")}', ${quota})
    `);
    return res.status(201).json({ message: 'Capacitación creada.' });
  } catch (err) {
    console.error('[ADMIN/CREATE-TRAINING]', err.message);
    return res.status(500).json({ error: 'Error creando capacitación.' });
  }
}

async function scheduleTraining(req, res) {
  try {
    const { trainingId } = req.params;
    const { date, time, link } = req.body;
    if (!date || !time || !link) return res.status(400).json({ error: 'Fecha, hora y link requeridos.' });

    const datetime = `${date} ${time}:00`;
    await sql.query(`
      UPDATE trainings 
      SET meeting_date = '${datetime}', meeting_link = '${link.replace(/'/g, "''")}', status = 'scheduled' 
      WHERE id = ${parseInt(trainingId)}
    `);

    const apps = await sql.query(`
      SELECT u.email, u.name 
      FROM training_applications ta
      JOIN users u ON u.id = ta.user_id
      WHERE ta.training_id = ${parseInt(trainingId)}
    `);

    const { sendNotificationEmail } = require('../helpers/email');
    for (const user of (apps.data || [])) {
      const msg = `
        <h3>Capacitación Programada</h3>
        <p>Hola ${user.name}, tu capacitación solicitada ha sido programada.</p>
        <p><strong>Fecha y Hora:</strong> ${date} a las ${time}</p>
        <p><strong>Link:</strong> <a href="${link}">${link}</a></p>
      `;
      await sendNotificationEmail(user.email, 'Capacitación Programada', msg).catch(console.error);
    }

    return res.json({ message: 'Capacitación programada y usuarios notificados.' });
  } catch (err) {
    console.error('[ADMIN/SCHEDULE-TRAINING]', err.message);
    return res.status(500).json({ error: 'Error programando capacitación.' });
  }
}

async function updateTraining(req, res) {
  try {
    const { trainingId } = req.params;
    const { title, description, min_quota, status } = req.body;
    
    const updates = [];
    if (title) updates.push(`title = '${title.replace(/'/g, "''")}'`);
    if (description !== undefined) updates.push(`description = '${description.replace(/'/g, "''")}'`);
    if (min_quota !== undefined) updates.push(`min_quota = ${parseInt(min_quota)}`);
    if (status) updates.push(`status = '${status}'`);

    if (updates.length > 0) {
      await sql.query(`UPDATE trainings SET ${updates.join(', ')} WHERE id = ${parseInt(trainingId)}`);
    }
    
    return res.json({ message: 'Capacitación actualizada correctamente.' });
  } catch (err) {
    console.error('[ADMIN/UPDATE-TRAINING]', err.message);
    return res.status(500).json({ error: 'Error actualizando capacitación.' });
  }
}

async function deleteTraining(req, res) {
  try {
    const { trainingId } = req.params;
    // Eliminar postulaciones primero por FK constraint
    await sql.query(`DELETE FROM training_applications WHERE training_id = ${parseInt(trainingId)}`);
    await sql.query(`DELETE FROM trainings WHERE id = ${parseInt(trainingId)}`);
    return res.json({ message: 'Capacitación eliminada.' });
  } catch (err) {
    console.error('[ADMIN/DELETE-TRAINING]', err.message);
    return res.status(500).json({ error: 'Error eliminando capacitación.' });
  }
}

async function testEmail(req, res) {
  try {
    const { to, template } = req.body;
    if (!to || !template) return res.status(400).json({ error: 'Email destino y plantilla son requeridos.' });

    const { sendNotificationEmail } = require('../helpers/email');
    const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
    let msg = '';
    let subject = '';

    if (template === 'meeting') {
      subject = 'Reunión de Proyecto (Prueba)';
      msg = `
        <div style="font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0c10; color: #c5c6c7; padding: 40px 20px; margin: 0;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #1f2833; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); overflow: hidden;">
            <div style="background-color: #111; padding: 25px; text-align: center; border-bottom: 4px solid #66fcf1;">
              <img src="https://spiderwebarg.com/wp-content/uploads/2023/10/spider-web-logo.png" alt="Spider-Web ARG" style="height: 40px; margin-bottom: 10px;" />
              <h2 style="color: #66fcf1; margin: 0; font-size: 22px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Reunión Programada</h2>
            </div>
            
            <div style="padding: 35px 30px;">
              <p style="font-size: 16px; line-height: 1.6; margin-top: 0; color: #e0e2e4;">
                Hola <strong style="color: #fff;">Usuario de Prueba</strong>,<br><br>
                Se ha agendado una nueva reunión obligatoria para el proyecto <strong style="color: #66fcf1;">Proyecto de Pruebas Spider-Web</strong>.
              </p>

              <div style="background-color: rgba(102, 252, 241, 0.05); border-left: 4px solid #45a29e; padding: 18px 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
                <p style="margin: 0 0 12px 0; font-size: 15px;"><strong style="color: #66fcf1; display: inline-block; width: 60px;">📅 Fecha:</strong> 2026-10-10</p>
                <p style="margin: 0; font-size: 15px;"><strong style="color: #66fcf1; display: inline-block; width: 60px;">⏰ Hora:</strong> 15:30 hs</p>
              </div>

              <p style="margin-bottom: 35px; font-size: 15px; color: #a0a5a8; font-style: italic; background: rgba(255,255,255,0.03); padding: 15px; border-radius: 6px;">
                "Esta es una reunión generada desde el panel de pruebas del sistema."
              </p>

              <div style="text-align: center; margin-top: 20px;">
                <a href="#" style="background-color: #66fcf1; color: #0b0c10; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 700; font-size: 15px; display: inline-block; margin: 0 10px 15px 0; transition: all 0.3s; text-transform: uppercase; letter-spacing: 0.5px;">
                  Unirse al Meet
                </a>
                <a href="${siteUrl}/#projects" style="background-color: transparent; border: 2px solid #45a29e; color: #66fcf1; text-decoration: none; padding: 12px 26px; border-radius: 8px; font-weight: 700; font-size: 15px; display: inline-block; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                  Ver Proyecto
                </a>
              </div>
            </div>

            <div style="background-color: #111; padding: 20px; text-align: center; font-size: 13px; color: #777;">
              Este es un correo automático de Spider-Web ARG.<br>
              Por favor, no respondas a esta dirección.<br>
              © 2026 Spider-Web ARG Pasantías.
            </div>
          </div>
        </div>
      `;
    } else if (template === 'basic') {
      subject = 'Correo de Prueba (Básico)';
      msg = `
        <div style="font-family: 'Inter', Arial, sans-serif; padding: 30px; background: #f4f4f5; color: #333;">
          <div style="max-width: 500px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #2563eb; margin-top: 0;">Prueba de Sistema</h2>
            <p style="font-size: 16px;">Este es un correo de prueba generado exitosamente desde el panel de administración.</p>
            <p style="font-size: 14px; color: #666;">Si recibiste este mensaje, significa que los credenciales SMTP y el servicio de correos están funcionando correctamente.</p>
          </div>
        </div>
      `;
    } else {
      return res.status(400).json({ error: 'Plantilla desconocida.' });
    }

    await sendNotificationEmail(to, subject, msg);
    return res.json({ message: 'Correo de prueba enviado con éxito.' });
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
  testEmail
};
