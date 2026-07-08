/**
 * Controlador publico — Noticias, proyectos, aptitudes para el index y visitantes
 */

const { sql, storage } = require('../api-client/index');

async function getLatestNews(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 6;
    const result = await sql.query(
      `SELECT n.id, n.title, n.content, n.cover_file_id, n.created_at, COALESCE(u.name, 'Admin') AS author
       FROM news n
       LEFT JOIN users u ON u.id = n.created_by
       ORDER BY n.created_at DESC
       LIMIT ${limit}`
    );
    const news = (result.data || []).map(item => ({
      ...item,
      cover_url: item.cover_file_id ? storage.getFileUrl(item.cover_file_id) : null,
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
      `SELECT n.id, n.title, n.content, n.cover_file_id, n.created_at, COALESCE(u.name, 'Admin') AS author
       FROM news n
       LEFT JOIN users u ON u.id = n.created_by
       WHERE n.id = ${parseInt(id)}`
    );
    if (!result.data || result.data.length === 0) {
      return res.status(404).json({ error: 'Noticia no encontrada.' });
    }
    const news = result.data[0];
    news.cover_url = news.cover_file_id ? storage.getFileUrl(news.cover_file_id) : null;
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
      `SELECT p.id, p.title, p.description, p.media_file_ids, p.required_tags, p.conf_link, p.start_date, p.end_date, p.status, p.created_at, COALESCE(u.name, 'Admin') AS author
       FROM projects p
       LEFT JOIN users u ON u.id = p.created_by
       ORDER BY p.created_at DESC`
    );

    let projects = (result.data || []).map(p => ({
      ...p,
      required_tags: p.required_tags ? JSON.parse(p.required_tags) : [],
      media_file_ids: p.media_file_ids ? JSON.parse(p.media_file_ids) : [],
    }));

    // Filtrar por tags
    if (req.user) {
      if (req.user.role === 'pasante') {
        const uRes = await sql.query(`SELECT tags FROM users WHERE id = ${req.user.id}`);
        const userTags = (uRes.data && uRes.data[0] && uRes.data[0].tags) ? JSON.parse(uRes.data[0].tags) : [];
        projects = projects.filter(p => {
          if (!p.required_tags || p.required_tags.length === 0) return true; // Si el proyecto no tiene req tags, se muestra
          return p.required_tags.some(t => userTags.includes(t));
        });
      }
      // admins y ceos ven todo
    } else {
      // Visitantes sin sesion, acordamos que vean todos
      // (O si cambiaste de opinion, los filtras aqui)
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
    project.media_urls = project.media_file_ids.map(id => storage.getFileUrl(id));

    // Filtrar acceso por tags si es pasante
    if (req.user && req.user.role === 'pasante' && project.required_tags.length > 0) {
      const uRes = await sql.query(`SELECT tags FROM users WHERE id = ${req.user.id}`);
      const userTags = (uRes.data && uRes.data[0] && uRes.data[0].tags) ? JSON.parse(uRes.data[0].tags) : [];
      const hasMatch = project.required_tags.some(t => userTags.includes(t));
      if (!hasMatch) {
        return res.status(403).json({ error: 'No tienes los tags requeridos para ver este proyecto.' });
      }
    }

    // Contar inscriptos
    const countResult = await sql.query(
      `SELECT COUNT(*) AS total FROM project_applications WHERE project_id = ${parseInt(id)}`
    );
    project.applicant_count = countResult.data && countResult.data[0] ? countResult.data[0].total : 0;

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
