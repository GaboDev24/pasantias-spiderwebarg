/**
 * Helper centralizado de sanitización SQL.
 * Reemplaza el escaping manual disperso en los controladores.
 *
 * IMPORTANTE: No suple a sentencias preparadas reales, pero es
 * significativamente más robusto que el `replace(/'/g, "''")` anterior.
 * Escapa barras invertidas ANTES de las comillas para evitar la técnica
 * de "escaped quote bypass".
 */

/**
 * Escapa un valor para uso seguro dentro de una sentencia SQL.
 * - strings: escapa `\` y `'`
 * - numbers: valida que sea finito
 * - null / undefined: devuelve 'NULL' sin comillas
 * - boolean: devuelve '1' / '0'
 * - Date: devuelve string ISO con comillas
 * - arrays/objects: serializa como JSON con comillas
 */
function sqlEscape(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
  if (val instanceof Date) {
    return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
  }
  if (Array.isArray(val) || (typeof val === 'object')) {
    const json = JSON.stringify(val)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");
    return `'${json}'`;
  }
  // String: escapar barras invertidas primero, luego comillas simples
  const safe = String(val)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
  return `'${safe}'`;
}

/**
 * Convierte un parámetro de ruta a entero válido.
 * Lanza un error si el resultado es NaN (para capturar en el controlador).
 * @param {*} val
 * @returns {number}
 */
function toInt(val) {
  const n = parseInt(val, 10);
  if (Number.isNaN(n)) throw new Error(`ID inválido: ${val}`);
  return n;
}

/**
 * Parsea JSON de forma segura devolviendo un fallback ante cualquier error.
 * Evita excepciones no controladas por columnas malformadas en la BD.
 * @param {string|null} str
 * @param {*} fallback
 */
function safeJsonParse(str, fallback = []) {
  if (!str || typeof str !== 'string') return fallback;
  try { return JSON.parse(str); } catch (_) { return fallback; }
}

/**
 * Normaliza valores TINYINT que la API puede devolver como string "0" / "1".
 * En JS `Boolean("0") === true`, por eso se requiere esta función.
 * @param {*} val
 * @returns {boolean}
 */
function toBool(val) {
  return val === true || val === 1 || val === '1';
}

/**
 * Escapa caracteres HTML para uso seguro en plantillas de correo.
 * Previene XSS / inyección en clientes de email.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { sqlEscape, toInt, safeJsonParse, toBool, escapeHtml };
