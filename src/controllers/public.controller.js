/**
 * Controlador publico — Noticias, proyectos, aptitudes para el index y visitantes
 */

const { sql, storage } = require('../api-client/index');

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
  // Sin fechas → estado manual
  const manualMap = { open: 'Por comenzar', in_progress: 'En proceso', closed: 'Finalizado' };
  return manualMap[project.status] || project.status;
}

// ── Función auxiliar: ¿se puede postular? ───────────────────────────────────
function canApply(dynamicStatus) {
  return dynamicStatus === 'Por comenzar';
}

async function getLatestNews(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 6;
    const result = await sql.query(
      `SELECT n.id, n.title, n.content, n.summary, n.cover_file_id, n.created_at, COALESCE(u.name, 'Admin') AS author
       FROM news n
       LEFT JOIN users u ON u.id = n.created_by
       ORDER BY n.created_at DESC
       LIMIT ${limit}`
    );
    const news = (result.data || []).map(item => ({
      ...item,
      cover_url: item.cover_file_id ? storage.getFileUrl(item.cover_file_id) : null,
      // Si no hay summary, auto-extraer del contenido
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
    const { id } = req.params;
    const result = await sql.query(
      `SELECT n.id, n.title, n.content, n.summary, n.cover_file_id, n.created_at, COALESCE(u.name, 'Admin') AS author
       FROM news n
       LEFT JOIN users u ON u.id = n.created_by
       WHERE n.id = ${parseInt(id)}`
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
    const limit = parseInt(req.query.limit) || 6;
    const result = await sql.query(
      `SELECT p.id, p.title, p.description, p.summary, p.media_file_ids, p.required_tags, p.conf_link, p.start_date, p.end_date, p.status, p.created_at, COALESCE(u.name, 'Admin') AS author
       FROM projects p
       LEFT JOIN users u ON u.id = p.created_by
       ORDER BY p.created_at DESC`
    );

    let projects = (result.data || []).map(p => ({
      ...p,
      required_tags: p.required_tags ? JSON.parse(p.required_tags) : [],
      media_file_ids: p.media_file_ids ? JSON.parse(p.media_file_ids) : [],
      dynamic_status: computeStatus(p),
      can_apply: canApply(computeStatus(p)),
      summary: p.summary || (p.description ? p.description.substring(0, 140) : ''),
      cover_url: (() => {
        const ids = p.media_file_ids ? JSON.parse(p.media_file_ids) : [];
        return ids.length > 0 ? storage.getFileUrl(ids[0]) : null;
      })(),
    }));

    // Filtrar por tags si es pasante
    if (req.user) {
      if (req.user.role === 'pasante') {
        const uRes = await sql.query(`SELECT tags FROM users WHERE id = ${req.user.id}`);
        const userTags = (uRes.data && uRes.data[0] && uRes.data[0].tags) ? JSON.parse(uRes.data[0].tags) : [];
        projects = projects.filter(p => {
          if (!p.required_tags || p.required_tags.length === 0) return true;
          return p.required_tags.some(t => userTags.includes(t));
        });
      }
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
    const { id } = req.params;
    const result = await sql.query(
      `SELECT p.*, COALESCE(u.name, 'Admin') AS author
       FROM projects p
       LEFT JOIN users u ON u.id = p.created_by
       WHERE p.id = ${parseInt(id)}`
    );
    if (!result.data || result.data.length === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado.' });
    }
    const project = result.data[0];
    project.required_tags = project.required_tags ? JSON.parse(project.required_tags) : [];
    project.media_file_ids = project.media_file_ids ? JSON.parse(project.media_file_ids) : [];
    project.media_urls = project.media_file_ids.map(fid => storage.getFileUrl(fid));
    project.cover_url = project.media_file_ids.length > 0 ? storage.getFileUrl(project.media_file_ids[0]) : null;
    project.dynamic_status = computeStatus(project);
    project.can_apply = canApply(project.dynamic_status);
    project.summary = project.summary || (project.description ? project.description.substring(0, 140) : '');

    // Filtrar acceso por tags si es pasante
    if (req.user && req.user.role === 'pasante' && project.required_tags.length > 0) {
      const uRes = await sql.query(`SELECT tags FROM users WHERE id = ${req.user.id}`);
      const userTags = (uRes.data && uRes.data[0] && uRes.data[0].tags) ? JSON.parse(uRes.data[0].tags) : [];
      const hasMatch = project.required_tags.some(t => userTags.includes(t));
      if (!hasMatch) {
        return res.status(403).json({ error: 'No tienes los tags requeridos para ver este proyecto.' });
      }
    }

    // Contar y listar postulados/pasantes
    const countResult = await sql.query(
      `SELECT COUNT(*) AS total FROM project_applications WHERE project_id = ${parseInt(id)}`
    );
    project.applicant_count = countResult.data && countResult.data[0] ? countResult.data[0].total : 0;

    // Si está en proceso o finalizado, incluir la lista de aceptados con foto
    if (project.dynamic_status === 'En proceso' || project.dynamic_status === 'Finalizado') {
      const acceptedResult = await sql.query(
        `SELECT u.id, u.name, u.avatar_file_id
         FROM project_applications pa
         JOIN users u ON u.id = pa.user_id
         WHERE pa.project_id = ${parseInt(id)} AND pa.status = 'accepted'
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

    // Historial de progreso (visible siempre)
    const progressResult = await sql.query(
      `SELECT pp.id, pp.content, pp.created_at, u.name AS author_name, u.avatar_file_id
       FROM project_progress pp
       JOIN users u ON u.id = pp.user_id
       WHERE pp.project_id = ${parseInt(id)}
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

module.exports = { getLatestNews, getNews, getLatestProjects, getProject, getSkills, getPortfolioProjects };
