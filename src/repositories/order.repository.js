const db = require("../db");

const updateOrdersStatus = async (merchantId, orderIds, status) => {
    const query = `
        UPDATE orders 
        SET status = $1 
        WHERE merchant_id = $2 AND id = ANY($3::uuid[])
        RETURNING *;
    `;
    const result = await db.query(query, [status, merchantId, orderIds]);
    return result.rows;
};

// Atomic Update untuk mengunci pesanan (mencegah race condition (materi atomic lock))
// melakukan update status proses terhadap id apa saja yang dimiliki merchant dan berstatus pending
// RETURNING id memastikan hanya order yang berhasil di-lock yang dikembalikan
// dan juga melakukan validasi order ada dan milik merchant serta yang statusnya pending
const lockOrdersForProcessing = async (merchantId, orderIds) => {
    const query = `
        UPDATE orders 
        SET status = 'PROCESSING' 
        WHERE id = ANY($1::uuid[]) 
          AND merchant_id = $2 
          AND status = 'PENDING' 
        RETURNING id;
    `;
    
    const result = await db.query(query, [orderIds, merchantId]);
    
    // Hanya kembalikan array string berupa ID
    return result.rows.map(row => row.id);
};

module.exports = {
    updateOrdersStatus,
    lockOrdersForProcessing
};