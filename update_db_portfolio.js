require('dotenv').config();
const { sql } = require('./src/api-client/index');

async function createPortfolioTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS portfolio_projects (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      description TEXT NOT NULL,
      cover_file_id VARCHAR(100) DEFAULT NULL,
      created_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `;

  try {
    console.log('[DB] Creando tabla portfolio_projects...');
    await sql.query(query);
    console.log('[DB] OK: portfolio_projects');
  } catch (err) {
    console.error('[DB] Error creando tabla portfolio_projects:', err.message);
  }
}

createPortfolioTable().catch(console.error);
