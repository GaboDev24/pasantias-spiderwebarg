require('dotenv').config();
const { sql } = require('./src/api-client/index');

async function update() {
  try {
    await sql.query(`ALTER TABLE projects ADD COLUMN next_meeting_date DATETIME DEFAULT NULL`);
    console.log("Added next_meeting_date to projects");
  } catch (err) {
    console.log("Column next_meeting_date might already exist or error:", err.message);
  }

  try {
    await sql.query(`ALTER TABLE projects ADD COLUMN next_meeting_link VARCHAR(500) DEFAULT NULL`);
    console.log("Added next_meeting_link to projects");
  } catch (err) {
    console.log("Column next_meeting_link might already exist or error:", err.message);
  }

  const { initDB } = require('./src/database/init');
  await initDB();
  console.log("New tables created successfully.");
  process.exit(0);
}

update();
