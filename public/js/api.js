/**
 * Funciones cliente para interactuar con la API local
 */

const API_BASE = '/api';

/**
 * Realiza una peticion a la API interna adjuntando el JWT
 */
async function fetchAPI(endpoint, options = {}) {
  const token = localStorage.getItem('sw_token');
  
  const headers = {
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // No override Content-Type si es FormData
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    if (options.body && typeof options.body !== 'string') {
      options.body = JSON.stringify(options.body);
    }
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || 'Error en la petición');
    error.status = response.status;
    throw error;
  }

  return data;
}

// Global scope
window.api = { fetch: fetchAPI };
