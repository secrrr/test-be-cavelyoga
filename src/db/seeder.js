const dotenv = require('dotenv');
const { Pool } = require('pg');
const fs = require('fs'); // untuk membaca file sql
const path = require('path'); // untuk manipulasi path file
const crypto = require('crypto'); // untuk menghasilkan UUID random

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function runSeeder() {
  console.log('Connecting to database...');
  const client = await pool.connect();
  
  try {
    console.log('Mulai menjalankan seeder...');
    await client.query('BEGIN');

    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    console.log('Menjalankan schema.sql...');
    await client.query(schemaSql);
    
    console.log('Membuat 3 Merchants...');
    const merchants = [
      { id: crypto.randomUUID(), name: 'Merchant Aktif 1', active: true },
      { id: crypto.randomUUID(), name: 'Merchant Aktif 2', active: true },
      { id: crypto.randomUUID(), name: 'Merchant Tidak Aktif', active: false }
    ];
    
    for (const m of merchants) {
      await client.query(
        'INSERT INTO merchants (id, name, active) VALUES ($1, $2, $3)',
        [m.id, m.name, m.active]
      );
    }

    console.log('Membuat Customers untuk masing-masing Merchant...');
    // Kita buat struktur map untuk menyimpan customer milik tiap merchant
    const merchantCustomers = {};
    for (const m of merchants) {
      merchantCustomers[m.id] = [];
      // Buat 3 customer per merchant
      for (let i = 1; i <= 3; i++) {
        const custId = crypto.randomUUID();
        merchantCustomers[m.id].push(custId);
        await client.query(
          'INSERT INTO customers (id, merchant_id, name, email) VALUES ($1, $2, $3, $4)',
          [custId, m.id, `Customer ${i} of ${m.name}`, `customer${i}@example.com`]
        );
      }
    }

    console.log('Membuat 10.000 Orders (Pending) secara acak ke berbagai merchant... Proses ini memakan waktu beberapa detik.');
    const totalOrders = 10000;
    const batchSize = 1000;
    
    // Array untuk menyimpan order id milik Merchant Aktif 1 agar gampang di-test nanti
    const sampleOrderIds = []; 
    
    for (let i = 0; i < totalOrders; i += batchSize) {
      const values = [];
      const queryValues = [];
      let paramCount = 1;

      for (let j = 0; j < batchSize; j++) {
        const orderId = crypto.randomUUID();
        
        // Pilih merchant secara acak
        const randomMerchant = merchants[Math.floor(Math.random() * merchants.length)];
        const mId = randomMerchant.id;
        
        // Pilih customer secara acak dari merchant yang terpilih
        const customersOfMerchant = merchantCustomers[mId];
        const cId = customersOfMerchant[Math.floor(Math.random() * customersOfMerchant.length)];
        
        const amount = Math.floor(Math.random() * 500000) + 10000;
        
        // Simpan max 5 UUID order milik Merchant 1 untuk dicetak ke terminal
        if (mId === merchants[0].id && sampleOrderIds.length < 5) {
            sampleOrderIds.push(orderId);
        }
        
        queryValues.push(orderId, mId, cId, amount, 'PENDING');
        values.push(`($${paramCount++}, $${paramCount++}, $${paramCount++}, $${paramCount++}, $${paramCount++})`);
      }

      const insertQuery = `
        INSERT INTO orders (id, merchant_id, customer_id, amount, status) 
        VALUES ${values.join(', ')}
      `;
      
      await client.query(insertQuery, queryValues);
      console.log(`- Inserted batch ${i / batchSize + 1} (${i + batchSize} / ${totalOrders})`);
    }

    await client.query('COMMIT');
    console.log('\n✅ Seeder berhasil dieksekusi! Database siap digunakan.');
    
    console.log('\n=====================================');
    console.log('⚠️  DATA UNTUK TESTING API DI POSTMAN:');
    console.log('-------------------------------------');
    console.log(`✅ [AKTIF] Merchant 1 ID: ${merchants[0].id}`);
    console.log(`✅ [AKTIF] Merchant 2 ID: ${merchants[1].id}`);
    console.log(`❌ [NON-AKTIF] Merchant 3 ID: ${merchants[2].id}`);
    console.log('-------------------------------------');
    console.log(`Gunakan array orderIds ini untuk nge-test Merchant 1:`);
    console.log(JSON.stringify(sampleOrderIds, null, 2));
    console.log('=====================================\n');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Terjadi kesalahan saat seeding:', error);
  } finally {
    client.release();
    pool.end();
  }
}

runSeeder();
