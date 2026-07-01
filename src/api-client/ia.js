/**
 * Submodulo SpiderIA — Acceso a modelos de lenguaje de la plataforma
 */

const { request } = require('./client');

/**
 * Lista los modelos de IA disponibles
 */
async function listModels() {
  return request('/ia/models');
}

/**
 * Envia mensajes y recibe respuesta del modelo
 * @param {string} modelId - ID del modelo a usar
 * @param {Array<{role: string, content: string}>} messages - Historial de mensajes
 */
async function chat(modelId, messages) {
  return request('/ia/chat', {
    method: 'POST',
    body: JSON.stringify({ model_id: modelId, messages }),
  });
}

/**
 * Consulta el uso y cuota diaria de la IA
 */
async function getUsage() {
  return request('/ia/usage');
}

module.exports = { listModels, chat, getUsage };
