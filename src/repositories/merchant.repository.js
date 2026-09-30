const db = require('../db');

const getMerchantById = async (merchantId) => {
    const query = `
        SELECT id, name, active 
        FROM merchants 
        WHERE id = $1;
    `;
    const result = await db.query(query, [merchantId]);
    
    return result.rows.length > 0 ? result.rows[0] : null;
};

module.exports = {
    getMerchantById,
};
