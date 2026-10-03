/**
 * Controlador de Cursos — Consulta la DB de Cursos-SpiderWebARG
 * usando la Spider API con sus propias credenciales de entorno.
 */

const CURSOS_API_URL = process.env.CURSOS_API_URL || 'https://spiderwebargapi.com.ar/api/v1';
const CURSOS_API_KEY = process.env.CURSOS_API_KEY;
const CURSOS_DB_NAME = process.env.CURSOS_DB_NAME;
const CURSOS_APP_URL = process.env.CURSOS_APP_URL || 'https://cursos.spiderwebarg.com.ar';

const TIMEOUT_MS = 10000;

/**
 * Ejecuta una query SQL contra la DB de Cursos-SpiderWebARG
 */
async function queryCursosDB(sql) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${CURSOS_API_URL}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': CURSOS_API_KEY,
      },
      body: JSON.stringify({ database: CURSOS_DB_NAME, query: sql }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${body}`);
    }

    const raw = await response.json();
    // La Spider API devuelve { success, result: [...] }
    return raw.result ?? raw.data ?? [];
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`Timeout al consultar DB de Cursos (${TIMEOUT_MS}ms)`);
    }
    throw err;
  }
}

/**
 * GET /api/cursos/latest
 * Devuelve los últimos N cursos publicados de Cursos-SpiderWebARG
 */
async function getLatestCourses(req, res) {
  const limit = Math.min(parseInt(req.query.limit) || 3, 9);

  if (!CURSOS_API_KEY || !CURSOS_DB_NAME) {
    return res.status(503).json({
      error: 'Configuración de Cursos no disponible. Verificar CURSOS_API_KEY y CURSOS_DB_NAME en .env',
    });
  }

  try {
    const rows = await queryCursosDB(`
      SELECT
        c.id,
        c.title,
        c.description,
        c.thumbnail_url,
        c.hours,
        c.price,
        c.currency,
        u.name AS professor_name,
        cat.name AS category_name,
        cat.icon AS category_icon,
        cat.color AS category_color
      FROM courses c
      LEFT JOIN users u ON c.professor_id = u.id
      LEFT JOIN categories cat ON c.category_id = cat.id
      WHERE c.is_published = 1
      ORDER BY c.created_at DESC
      LIMIT ${limit}
    `);

    const courses = (Array.isArray(rows) ? rows : []).map(course => ({
      id: course.id,
      title: course.title,
      description: course.description
        ? course.description.substring(0, 160) + (course.description.length > 160 ? '...' : '')
        : null,
      thumbnailUrl: course.thumbnail_url || null,
      hours: course.hours || 0,
      price: course.price || 0,
      currency: course.currency || 'ARS',
      professor: course.professor_name || null,
      category: {
        name: course.category_name || null,
        icon: course.category_icon || 'fas fa-book',
        color: course.category_color || '#a30000',
      },
      link: `${CURSOS_APP_URL}/courses/${course.id}`,
    }));

    return res.json({ courses });
  } catch (err) {
    console.error('[CURSOS/LATEST]', err.message);
    return res.status(500).json({ error: 'Error al obtener cursos.' });
  }
}

module.exports = { getLatestCourses };
