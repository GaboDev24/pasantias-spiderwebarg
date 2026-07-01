/**
 * Submodulo Storage — Gestion de archivos en SpiderWeb Storage
 */

const { request } = require('./client');
const FormData = require('form-data');

const PROJECT_ID = process.env.STORAGE_ID;

// ──────────────────────────────────────────────
// PROYECTOS DE STORAGE
// ──────────────────────────────────────────────

async function listProjects() {
  return request('/storage/projects');
}

async function createProject(name) {
  return request('/storage/projects', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

async function updateProject(id, data) {
  return request(`/storage/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

async function deleteProject(id) {
  return request(`/storage/projects/${id}`, { method: 'DELETE' });
}

// ──────────────────────────────────────────────
// ARCHIVOS
// ──────────────────────────────────────────────

async function listFiles(projectId = PROJECT_ID) {
  return request(`/storage/projects/${projectId}/files`);
}

/**
 * Sube un archivo al storage
 * @param {Buffer} fileBuffer - Contenido del archivo
 * @param {string} filename - Nombre del archivo
 * @param {string} mimeType - Tipo MIME
 * @param {string|number} projectId - ID del proyecto storage
 */
async function uploadFile(fileBuffer, filename, mimeType, projectId = PROJECT_ID) {
  const form = new FormData();
  form.append('files', fileBuffer, { filename, contentType: mimeType });

  return request(`/storage/projects/${projectId}/files`, {
    method: 'POST',
    headers: form.getHeaders(),
    body: form,
    isFormData: true,
  });
}

async function downloadFile(fileId) {
  return request(`/storage/files/${fileId}`);
}

async function getFileInfo(fileId) {
  return request(`/storage/files/${fileId}/info`);
}

async function replaceFile(fileId, fileBuffer, filename, mimeType) {
  const form = new FormData();
  form.append('files', fileBuffer, { filename, contentType: mimeType });

  return request(`/storage/files/${fileId}`, {
    method: 'PUT',
    headers: form.getHeaders(),
    body: form,
    isFormData: true,
  });
}

async function deleteFile(fileId) {
  return request(`/storage/files/${fileId}`, { method: 'DELETE' });
}

/**
 * Construye la URL publica de un archivo para mostrarlo en img/video
 */
function getFileUrl(fileId) {
  const API_BASE = process.env.API_BASE || 'https://spiderwebargapi.com.ar/api/v1';
  return `${API_BASE}/storage/files/${fileId}`;
}

module.exports = {
  listProjects, createProject, updateProject, deleteProject,
  listFiles, uploadFile, downloadFile, getFileInfo, replaceFile, deleteFile,
  getFileUrl,
};
