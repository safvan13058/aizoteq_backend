const db = require('./middlewares/dbconnection');

// Helper function: Check if thing exists in `Things` table using serialno
const getThingBySerialNo = async (serialNo) => {
    const result = await db.query(`SELECT * FROM Things WHERE serialno = $1`, [serialNo]);
    return result.rows[0] || null;
  };
  
  // Helper function: Remove thing from `AdminStock`
  const removeFromAdminStock = async (thingId) => {
    const result = await db.query(`DELETE FROM AdminStock WHERE thingId = $1 RETURNING *`, [thingId]);
    return result.rows[0] || null;
  };
  
  // Helper function: Add thing to dealer's or customer's stock
  const addToStock = async (stockTable, thingId, addedBy, status = "new") => {
    await db.query(
      `INSERT INTO ${stockTable} (thingId, addedBy, status) VALUES ($1, $2, $3)`,
      [thingId, addedBy, status]
    );
  };
  
  module.exports={getThingBySerialNo,removeFromAdminStock,addToStock}
