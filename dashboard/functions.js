const db = require('../middlewares/dbconnection');

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
  const addToStock = async (stockTable, thingId,userid, addedBy, status = "new") => {
    await db.query(
      `INSERT INTO ${stockTable} (thing_id,user_id,added_by, status) VALUES ($1, $2, $3,$4)`,
      [thingId,userid, addedBy, status]
    );
  };
  
  module.exports={getThingBySerialNo,removeFromAdminStock,addToStock}
