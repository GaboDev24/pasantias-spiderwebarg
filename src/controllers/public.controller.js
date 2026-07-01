/**
 * Controlador publico — Noticias, proyectos, aptitudes para el index y visitantes
 */

const { sql, storage } = require('../api-client/index');

async function getLatestNews(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 6;
    const result = await sql.query(
      `SELECT n.id, n.title, n.content, n.cover_file_id, n.created_at, u.name AS author
       FROM news n
       JOIN users u ON u.id = n.created_by
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
      `SELECT n.id, n.title, n.content, n.cover_file_id, n.created_at, u.name AS author
       FROM news n
       JOIN users u ON u.id = n.created_by
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
      `SELECT p.id, p.title, p.description, p.media_file_ids, p.required_tags, p.conf_link, p.start_date, p.end_date, p.status, p.created_at, u.name AS author
       FROM projects p
       JOIN users u ON u.id = p.created_by
       ORDER BY p.created_at DESC
       LIMIT ${limit}`
    );

    const projects = (result.data || []).map(p => ({
      ...p,
      required_tags: p.required_tags ? JSON.parse(p.required_tags) : [],
      media_file_ids: p.media_file_ids ? JSON.parse(p.media_file_ids) : [],
    }));
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
      `SELECT p.*, u.name AS author
       FROM projects p
       JOIN users u ON u.id = p.created_by
       WHERE p.id = ${parseInt(id)}`
    );
    if (!result.data || result.data.length === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado.' });
    }
    const project = result.data[0];
    project.required_tags = project.required_tags ? JSON.parse(project.required_tags) : [];
    project.media_file_ids = project.media_file_ids ? JSON.parse(project.media_file_ids) : [];
    project.media_urls = project.media_file_ids.map(id => storage.getFileUrl(id));

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

module.exports = { getLatestNews, getNews, getLatestProjects, getProject, getSkills };
