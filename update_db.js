require('dotenv').config();
const { sql } = require('./src/api-client/index');

async function run() {
  try {
    await sql.query("ALTER TABLE projects MODIFY start_date DATETIME NULL;");
    await sql.query("ALTER TABLE projects MODIFY end_date DATETIME NULL;");
    console.log("DB updated successfully");
  } catch(e) {
    console.error(e);
  }
}
run();
