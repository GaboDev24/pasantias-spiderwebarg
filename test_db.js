require('dotenv').config();
const { sql } = require('./src/api-client/index');
async function run() {
  const result = await sql.query("SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_NAME = 'trainings'");
  console.log(result);
}
run();
