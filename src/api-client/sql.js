/**
 * Submodulo SQL — Wrapper para el modulo de base de datos
 */

const { request } = require('./client');
const DB = process.env.DB_NAME;

/**
 * Lista todas las bases de datos disponibles
 */
async function listDatabases() {
  return request('/databases');
}

/**
 * Lista todas las tablas de la base de datos configurada
 */
async function listTables() {
  return request(`/databases/${DB}/tables`);
}

/**
 * Ejecuta una query SQL en la base de datos configurada
 * @param {string} sql - Query SQL a ejecutar
 * @param {Array} params - No aplica en este motor (queries directas)
 */
async function query(sql) {
  return request('/query', {
    method: 'POST',
    body: JSON.stringify({ database: DB, query: sql }),
  });
}

module.exports = { listDatabases, listTables, query };
