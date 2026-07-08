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
 */
async function query(sql) {
  const raw = await request('/query', {
    method: 'POST',
    body: JSON.stringify({ database: DB, query: sql }),
  });

  // La API devuelve { success, result: [...] }
  // Normalizamos a { data: [...], insertId, affectedRows } para uso interno
  return {
    data: raw.result ?? raw.data ?? null,
    insertId: raw.insertId ?? raw.insert_id ?? null,
    affectedRows: raw.affectedRows ?? raw.affected_rows ?? null,
    success: raw.success ?? true,
  };
}

module.exports = { listDatabases, listTables, query };
