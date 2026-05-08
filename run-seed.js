const fs = require('fs');
const { Client } = require('pg');

const seedFilePath = '/Users/abraham/Downloads/seed_hotel_tulum_v3.sql';
const sql = fs.readFileSync(seedFilePath, 'utf-8');

const client = new Client({
  connectionString: 'postgresql://housekeeping:devpassword@localhost:5433/housekeeping',
});

(async () => {
  try {
    await client.connect();
    console.log('✓ Conectado a la BD');

    await client.query(sql);
    console.log('✓ Script ejecutado sin errores');
  } catch (err) {
    console.error('✗ Error al ejecutar script:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
