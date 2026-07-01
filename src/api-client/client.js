/**
 * Cliente HTTP centralizado para la API de SpiderWeb
 * Maneja autenticacion, errores y timeouts automaticamente
 */

const API_BASE = process.env.API_BASE || 'https://spiderwebargapi.com.ar/api/v1';
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error('[API-CLIENT] ERROR: Variable de entorno API_KEY no definida.');
}

const TIMEOUT_MS = 15000;

/**
 * Realiza una peticion HTTP a la API de SpiderWeb
 * @param {string} endpoint - Ruta relativa al BASE URL
 * @param {object} options - Opciones de fetch
 * @returns {Promise<any>} - JSON de respuesta o Buffer (para descargas)
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;

  const headers = {
    'X-API-KEY': API_KEY,
    ...options.headers,
  };

  // No agregar Content-Type si es FormData (lo pone el navegador/node automaticamente)
  if (!options.isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch (_) {}
      const error = new Error(`HTTP ${response.status}: ${response.statusText} — ${errorBody}`);
      error.status = response.status;
      throw error;
    }

    // Si la respuesta es un archivo binario, devolver el buffer
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/octet-stream') || contentType.includes('image/') || contentType.includes('video/')) {
      return response.buffer ? await response.buffer() : await response.arrayBuffer();
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`[API-CLIENT] Timeout: La peticion a ${endpoint} supero los ${TIMEOUT_MS}ms`);
    }
    throw err;
  }
}

module.exports = { request };
