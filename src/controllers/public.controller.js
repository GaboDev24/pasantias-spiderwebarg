/**
 * Controlador publico — Noticias, proyectos, aptitudes para visitantes.
 *
 * CAMBIOS DE SEGURIDAD:
 * - SQL construido con sqlEscape() / toInt().
 * - safeJsonParse() en todos los puntos de acceso a columnas JSON.
 * - Limite de paginacion validado (limit).
 */

const { sql, storage } = require('../api-client/index');
const { sqlEscape, toInt, safeJsonParse } = require('../helpers/sqlSanitizer');

// ── Función auxiliar para calcular estado dinámico ──────────────────────────
function computeStatus(project) {
  const now = new Date();
  const start = project.start_date ? new Date(project.start_date) : null;
  const end   = project.end_date   ? new Date(project.end_date)   : null;

  if (start && end) {
    if (now < start) return 'Por comenzar';
    if (now >= start && now <= end) return 'En proceso';
    if (now > end) return 'Finalizado';
  }
  if (start && !end) {
    if (now < start) return 'Por comenzar';
    return 'En proceso';
  }
  const manualMap = { open: 'Por comenzar', in_progress: 'En proceso', closed: 'Finalizado' };
  return manualMap[project.status] || project.status;
}

function canApply(dynamicStatus) {
  return dynamicStatus === 'Por comenzar';
}

const normalizeTag = t => (t || '').toString().trim().toLowerCase();

// Validar y acotar el límite de paginación
function parseLimit(raw, def = 6, max = 50) {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? def : Math.min(n, max);
}

async function getLatestNews(req, res) {
  try {
    const limit = parseLimit(req.query.limit, 6, 50);
    const result = await sql.query(
      `SELECT n.id, n.title, n.content, n.summary, n.cover_file_id, n.created_at, COALESCE(u.name, 'Admin') AS author
       FROM news n
       LEFT JOIN users u ON u.id = n.created_by
       ORDER BY n.created_at DESC
       LIMIT ${sqlEscape(limit)}`
    );
    const news = (result.data || []).map(item => ({
      ...item,
      cover_url: item.cover_file_id ? storage.getFileUrl(item.cover_file_id) : null,
      summary: item.summary || (item.content ? item.content.substring(0, 140) : ''),
    }));
    return res.json({ news });
  } catch (err) {
    console.error('[PUBLIC/LATEST-NEWS]', err.message);
    return res.status(500).json({ error: 'Error obteniendo noticias.' });
  }
}

async function getNews(req, res) {
  try {
    const id = toInt(req.params.id);
    const result = await sql.query(
      `SELECT n.id, n.title, n.content, n.summary, n.cover_file_id, n.created_at, COALESCE(u.name, 'Admin') AS author
       FROM news n
       LEFT JOIN users u ON u.id = n.created_by
       WHERE n.id = ${sqlEscape(id)}`
    );
    if (!result.data || result.data.length === 0) {
      return res.status(404).json({ error: 'Noticia no encontrada.' });
    }
    const news = result.data[0];
    news.cover_url = news.cover_file_id ? storage.getFileUrl(news.cover_file_id) : null;
    news.summary = news.summary || (news.content ? news.content.substring(0, 140) : '');
    return res.json({ news });
  } catch (err) {
    console.error('[PUBLIC/GET-NEWS]', err.message);
    return res.status(500).json({ error: 'Error obteniendo noticia.' });
  }
}

async function getLatestProjects(req, res) {
  try {
    const limit = parseLimit(req.query.limit, 6, 50);
    const result = await sql.query(
      `SELECT p.id, p.title, p.description, p.summary, p.media_file_ids, p.required_tags, p.conf_link, p.github_repo, p.conf_start, p.conf_end, p.start_date, p.end_date, p.status, p.created_at, COALESCE(u.name, 'Admin') AS author
       FROM projects p
       LEFT JOIN users u ON u.id = p.created_by
       ORDER BY p.created_at DESC`
    );

    let projects = (result.data || []).map(p => {
      const requiredTags  = safeJsonParse(p.required_tags, []);
      const mediaFileIds  = safeJsonParse(p.media_file_ids, []);
      const dynamicStatus = computeStatus(p);
      return {
        ...p,
        required_tags: requiredTags,
        media_file_ids: mediaFileIds,
        dynamic_status: dynamicStatus,
        can_apply: canApply(dynamicStatus),
        summary: p.summary || (p.description ? p.description.substring(0, 140) : ''),
        cover_url: mediaFileIds.length > 0 ? storage.getFileUrl(mediaFileIds[0]) : null,
      };
    });

    if (req.user && req.user.role === 'pasante') {
      const uRes = await sql.query(
        `SELECT tags FROM users WHERE id = ${sqlEscape(req.user.id)}`
      );
      const userTags = safeJsonParse(uRes.data && uRes.data[0] ? uRes.data[0].tags : null, []);
      const userTagSet = new Set(userTags.map(normalizeTag));
      projects = projects.filter(p => {
        if (p.dynamic_status === 'Finalizado') return false;
        if (!p.required_tags || p.required_tags.length === 0) return true;
        return p.required_tags.some(t => userTagSet.has(normalizeTag(t)));
      });
    }

    projects = projects.slice(0, limit);
    return res.json({ projects });
  } catch (err) {
    console.error('[PUBLIC/LATEST-PROJECTS]', err.message);
    return res.status(500).json({ error: 'Error obteniendo proyectos.' });
  }
}

async function getProject(req, res) {
  try {
    const id = toInt(req.params.id);
    const result = await sql.query(
      `SELECT p.*, COALESCE(u.name, 'Admin') AS author
       FROM projects p
       LEFT JOIN users u ON u.id = p.created_by
       WHERE p.id = ${sqlEscape(id)}`
    );
    if (!result.data || result.data.length === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado.' });
    }
    const project = result.data[0];
    project.required_tags  = safeJsonParse(project.required_tags, []);
    project.media_file_ids = safeJsonParse(project.media_file_ids, []);
    project.media_urls     = project.media_file_ids.map(fid => storage.getFileUrl(fid));
    project.cover_url      = project.media_file_ids.length > 0 ? storage.getFileUrl(project.media_file_ids[0]) : null;
    project.dynamic_status = computeStatus(project);
    project.can_apply      = canApply(project.dynamic_status);
    project.summary        = project.summary || (project.description ? project.description.substring(0, 140) : '');

    if (req.user && req.user.role === 'pasante') {
      if (project.dynamic_status === 'Finalizado') {
        return res.status(403).json({ error: 'No puedes ver un proyecto que ya ha finalizado.' });
      }
      if (project.required_tags.length > 0) {
        const uRes = await sql.query(
          `SELECT tags FROM users WHERE id = ${sqlEscape(req.user.id)}`
        );
        const userTags = safeJsonParse(uRes.data && uRes.data[0] ? uRes.data[0].tags : null, []);
        const userTagSet = new Set(userTags.map(normalizeTag));
        const hasMatch = project.required_tags.some(t => userTagSet.has(normalizeTag(t)));
        if (!hasMatch) {
          return res.status(403).json({ error: 'No tienes los tags requeridos para ver este proyecto.' });
        }
      }
    }

    const countResult = await sql.query(
      `SELECT COUNT(*) AS total FROM project_applications WHERE project_id = ${sqlEscape(id)}`
    );
    project.applicant_count = countResult.data && countResult.data[0] ? countResult.data[0].total : 0;

    if (project.dynamic_status === 'En proceso' || project.dynamic_status === 'Finalizado') {
      const acceptedResult = await sql.query(
        `SELECT u.id, u.name, u.avatar_file_id
         FROM project_applications pa
         JOIN users u ON u.id = pa.user_id
         WHERE pa.project_id = ${sqlEscape(id)} AND pa.status = 'accepted'
         ORDER BY pa.applied_at ASC`
      );
      project.accepted_applicants = (acceptedResult.data || []).map(u => ({
        id: u.id,
        name: u.name,
        avatar_url: u.avatar_file_id ? storage.getFileUrl(u.avatar_file_id) : null,
      }));
    } else {
      project.accepted_applicants = [];
    }

    const progressResult = await sql.query(
      `SELECT pp.id, pp.content, pp.created_at, u.name AS author_name, u.avatar_file_id
       FROM project_progress pp
       JOIN users u ON u.id = pp.user_id
       WHERE pp.project_id = ${sqlEscape(id)}
       ORDER BY pp.created_at DESC`
    );
    project.progress_log = (progressResult.data || []).map(r => ({
      ...r,
      avatar_url: r.avatar_file_id ? storage.getFileUrl(r.avatar_file_id) : null,
    }));

    return res.json({ project });
  } catch (err) {
    console.error('[PUBLIC/GET-PROJECT]', err.message);
    return res.status(500).json({ error: 'Error obteniendo proyecto.' });
  }
}

async function getSkills(req, res) {
  try {
    const result = await sql.query(`SELECT id, name, color FROM skills ORDER BY name ASC`);
    return res.json({ skills: result.data || [] });
  } catch (err) {
    console.error('[PUBLIC/SKILLS]', err.message);
    return res.status(500).json({ error: 'Error obteniendo aptitudes.' });
  }
}

async function getPortfolioProjects(req, res) {
  try {
    const result = await sql.query(
      `SELECT p.id, p.title, p.description, p.cover_file_id, p.created_at, COALESCE(u.name, 'Admin') AS author
       FROM portfolio_projects p
       LEFT JOIN users u ON u.id = p.created_by
       ORDER BY p.created_at DESC`
    );
    const portfolio = (result.data || []).map(item => ({
      ...item,
      cover_url: item.cover_file_id ? storage.getFileUrl(item.cover_file_id) : null,
    }));
    return res.json({ portfolio });
  } catch (err) {
    console.error('[PUBLIC/PORTFOLIO]', err.message);
    return res.status(500).json({ error: 'Error obteniendo proyectos de portfolio.' });
  }
}

async function getTrainings(req, res) {
  try {
    const result = await sql.query(`
      SELECT t.id, t.title, t.description, t.min_quota, t.status, t.meeting_date, t.created_at,
        (SELECT COUNT(*) FROM training_applications ta WHERE ta.training_id = t.id) as applied_count
      FROM trainings t
      ORDER BY t.created_at DESC
    `);

    let userApplications = [];
    if (req.user) {
      const apps = await sql.query(
        `SELECT training_id FROM training_applications WHERE user_id = ${sqlEscape(req.user.id)}`
      );
      userApplications = (apps.data || []).map(a => a.training_id);
    }

    const trainings = (result.data || []).map(t => ({
      ...t,
      user_applied: userApplications.includes(t.id),
    }));

    return res.json({ trainings });
  } catch (err) {
    console.error('[PUBLIC/TRAININGS]', err.message);
    return res.status(500).json({ error: 'Error obteniendo capacitaciones.' });
  }
}

module.exports = { getLatestNews, getNews, getLatestProjects, getProject, getSkills, getPortfolioProjects, getTrainings };
