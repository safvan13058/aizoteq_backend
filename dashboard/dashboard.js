const express = require('express');
const dashboard = express.Router();
const db = require('../middlewares/dbconnection');
// const {getThingBySerialNo,removeFromAdminStock,addToStock} =require('./functions.js')
const { validateJwt, authorizeRoles } = require('../middlewares/auth');
const { thingSchema } = require('../middlewares/validation');
const { s3, upload } = require('../middlewares/s3');
const path = require('path');
const multer = require("multer");
const fs = require('fs');
const { billing, returned } = require('./billing.js')
const { getThingBySerialNo, removeFromAdminStock, removeFromdealersStock, addToStock, generatePDF, sendEmailWithAttachment, isSessionOpen, groupItemsByModel } = require("./functions.js");
const { wifidata } = require('../MQTT/mqtt.js')

dashboard.get('/', (req, res) => {
  res.send('dashboard working ')
})
const { swaggerU, spec } = require("./swaggerdoc_dash/swagger.js");
dashboard.use("/api-dashboard", swaggerU.serve, swaggerU.setup(spec));

// API endpoint to count users
dashboard.get('/api/users/count',
  validateJwt,
  authorizeRoles('admin', 'dealer'),
  async (req, res) => {
    console.log(`working count${req.user.id}`)
    try {
      const result = await db.query('SELECT COUNT(*) AS user_count FROM Users');
      res.json({ user_count: result.rows[0].user_count });
    } catch (err) {
      console.error('Error querying the database:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

dashboard.get("/api/production/graph", async (req, res) => {
    const { groupBy } = req.query; // Accept 'day', 'week', 'month', or 'year' as a query parameter
  
    if (!["day", "week", "month", "year"].includes(groupBy)) {
      return res.status(400).json({ error: "Invalid groupBy value. Use 'day', 'week', 'month', or 'year'." });
    }
  
    // Map groupBy to SQL expressions
    const groupByExpression = {
      day: "TO_CHAR( added_at, 'Mon DD')", // Example: "Feb 11"
      week: "TO_CHAR( added_at, 'IYYY-IW')", // Example: "2025-06" (ISO year-week)
      month: "TO_CHAR( added_at, 'Mon YYYY')", // Example: "Feb 2025"
      year: "EXTRACT(YEAR FROM  added_at)::INT", // Example: 2025
    };
  
    const sortExpression = {
      day: "DATE( added_at)", // Sort by actual date
      week: "DATE_TRUNC('week',  added_at)", // Start of the week
      month: "DATE_TRUNC('month',  added_at)", // Start of the month
      year: "DATE_TRUNC('year',  added_at)", // Start of the year
    };
  
    const query = `
      SELECT 
        ${groupByExpression[groupBy]} AS period,
        COUNT(*) AS thing_count,
        ${sortExpression[groupBy]} AS sort_date
      FROM 
        Things
      GROUP BY 
        ${groupByExpression[groupBy]}, sort_date
      ORDER BY 
        sort_date ASC;
    `;
  
    try {
      const client = await db.connect();
      const result = await client.query(query);
  
      res.status(200).json({
        groupBy,
        data: result.rows.map(row => ({
          period: row.period,
          thing_count: row.thing_count,
        })),
      });
  
      client.release();
    } catch (err) {
      console.error("Error fetching Things graph data:", err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });  
// 📊 API to get total sales count (Filtered by `sale_by`)
dashboard.get('/api/sales/total', async (req, res) => {
  try {
      const  sale_by  = req.user?.username||req.query.sale_by;
      
      if (!sale_by) {
          return res.status(400).json({ error: "sale_by parameter is required" });
      }

      // Step 1: Get user role
      const userResult = await db.query('SELECT userRole FROM Users WHERE userName = $1', [sale_by]);

      if (userResult.rows.length === 0) {
          return res.status(404).json({ error: "User not found" });
      }

      const userRole = userResult.rows[0].userrole; // Case-sensitive issue, use lowercase

      let query;
      let values = [];

      // Step 2: If user is admin, show all admin sales; otherwise, show only their own sales
      if (userRole === 'admin') {
          query = `
              SELECT COUNT(*) AS total_sales 
              FROM sales_graph 
              WHERE sale_by IN (SELECT userName FROM Users WHERE userRole = 'admin')
          `;
      } else {
          query = 'SELECT COUNT(*) AS total_sales FROM sales_graph WHERE sale_by = $1';
          values.push(sale_by);
      }

      // Step 3: Execute query
      const result = await db.query(query, values);
      res.json(result.rows[0]);

  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
  }
});


// 📈 API to get sales data for graph (Filtered by `sale_by`)
dashboard.get('/api/sales/graph', async (req, res) => {
  try {
      const  sale_by  = req.user?.username||req.query.sale_by;

      if (!sale_by) {
          return res.status(400).json({ error: "sale_by parameter is required" });
      }

      // Step 1: Get user role
      const userResult = await db.query('SELECT userRole FROM Users WHERE userName = $1', [sale_by]);

      if (userResult.rows.length === 0) {
          return res.status(404).json({ error: "User not found" });
      }

      const userRole = userResult.rows[0].userrole; // Make sure column names match

      let query;
      let values = [];

      // Step 2: If user is admin, show all admin sales; otherwise, show only their own sales
      if (userRole === 'admin') {
          query = `
              SELECT timeanddate::DATE AS sale_date, COUNT(*) AS sale_count
              FROM sales_graph
              WHERE sale_by IN (SELECT userName FROM Users WHERE userRole = 'admin')
              GROUP BY sale_date
              ORDER BY sale_date
          `;
      } else {
          query = `
              SELECT timeanddate::DATE AS sale_date, COUNT(*) AS sale_count
              FROM sales_graph
              WHERE sale_by = $1
              GROUP BY sale_date
              ORDER BY sale_date
          `;
          values.push(sale_by);
      }

      // Step 3: Execute query
      const result = await db.query(query, values);
      res.json(result.rows);

  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
  }
});

//api for sale graph
dashboard.get('/api/sales/graph/:user_id', async (req, res) => {
  const { user_id } = req.params;
  const { group_by = 'day' } = req.query; // Default to grouping by day

  const validGroups = ['day', 'week', 'month', 'year'];
  if (!validGroups.includes(group_by)) {
    return res.status(400).json({ error: 'Invalid group_by parameter. Use day, week, month, or year.' });
  }

  try {
    const query = `
          SELECT 
              DATE_TRUNC($1, session_date) AS period,
              SUM(total_sales) AS total_sales
          FROM billing_session
          WHERE user_id = $2
          GROUP BY DATE_TRUNC($1, session_date)
          ORDER BY DATE_TRUNC($1, session_date);
      `;

    const result = await db.query(query, [group_by, user_id]);

    res.json({
      user_id,
      group_by,
      sales: result.rows,
    });
  } catch (error) {
    console.error('Error fetching sales data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// dashboard.get('/api/searchThings/working/:stock/status/:status',  
//   validateJwt,
//   authorizeRoles('admin', 'dealer'),
//   async (req, res) => {
//     const { serialno, name, phone,party } = req.query;
//     const { stock,status} = req.params;
//     const userrole = req.user.role;

//     try {
//       if(userrole==="admin"){
//       let stockTable = 'AdminStock';
//       let userTable = '';
//       let userColumn = '';
//       if(stock==="sold"){
//       if (party === 'dealer') {
//         stockTable = 'dealersStock';
//         userTable = 'dealers_details';
//         userColumn = 'dealer_id';
//       } else if (party === 'customer') {
//         stockTable = 'customersStock';
//         userTable = 'customers_details';
//         userColumn = 'customer_id';
//       } else if (party === 'onlineCustomer') {
//         stockTable = 'onlineCustomerStock';
//         userTable = 'onlinecustomer_details';
//         userColumn = 'online_customer_id';
//       }
//     }

//       let query = `
//         SELECT 
//           t.id AS thing_id,
//           t.thingName,
//           t.createdby,
//           t.batchId,
//           t.model,
//           t.securityKey,
//           t.serialno,
//           s.status AS stock_status,
//           s.addedAt,
//           s.addedby,
//           u.name AS user_name,
//           u.phone AS user_phone,
//           tf.failureReason,
//           tf.fixed_by,
//           tf.loggedAt
//         FROM Things t
//         LEFT JOIN ${stockTable} s ON t.id = s.thingId
//         LEFT JOIN ${userTable} u ON s.user_id = u.id
//         LEFT JOIN TestFailedDevices tf ON t.id = tf.thingId
//         WHERE s.status = $1
//       `;

//       const params = [status];

//       if (serialno) {
//         query += ` AND t.serialno ILIKE $${params.length + 1}`;
//         params.push(`%${serialno}%`);
//       }
//       if (name) {
//         query += ` AND u.name ILIKE $${params.length + 1}`;
//         params.push(`%${name}%`);
//       }
//       if (phone) {
//         query += ` AND u.phone ILIKE $${params.length + 1}`;
//         params.push(`%${phone}%`);
//       }

//       console.log('Executing query:', query);
//       console.log('Query parameters:', params);

//       const result = await db.query(query, params);

//       if (result.rows.length === 0) {
//         return res.status(404).json({ message: 'No matching records found' });
//       }

//       res.json(result.rows);
//     }
//     else if(userrole==="dealer"){


//        let stockTable = 'dealersStock';
//        let userTable = 'dealers_details';
//        let userColumn = 'dealer_id';

//       if(stock==="sold"){
//       if (party === 'customer') {
//         stockTable = 'customersStock';
//         userTable = 'customers_details';
//         userColumn = 'customer_id';
//       } 
//     }
//       let query = `
//         SELECT 
//           t.id AS thing_id,
//           t.thingName,
//           t.createdby,
//           t.batchId,
//           t.model,
//           t.securityKey,
//           t.serialno,
//           s.status AS stock_status,
//           s.addedAt,
//           s.addedby,
//           u.name AS user_name,
//           u.phone AS user_phone,
//           tf.failureReason,
//           tf.fixed_by,
//           tf.loggedAt
//         FROM Things t
//         LEFT JOIN ${stockTable} s ON t.id = s.thingId
//         LEFT JOIN ${userTable} u ON s.user_id = u.id
//         LEFT JOIN TestFailedDevices tf ON t.id = tf.thingId
//         WHERE s.status = $1
//       `;

//       const params = [status];


//   // If user is a dealer, fetch their ID and add to query
//   if (userrole === 'dealer') {
//     const dealerQuery = `SELECT id FROM dealers_details WHERE email = $1`;
//     const dealerResult = await db.query(dealerQuery, [req.user.email]);
//     if (dealerResult.rows.length === 0) {
//       return res.status(404).json({ message: 'Dealer not found' });
//     }
//     query += ` AND s.user_id = $2`;
//     params.push(dealerResult.rows[0].id);
//   }

//   // Add serialno filter if provided
//   if (serialno) {
//     query += ` AND t.serialno ILIKE $${params.length + 1}`;
//     params.push(`%${serialno}%`);
//   }

//   // Log for debugging
//   console.log('Executing query:', query);
//   console.log('Query parameters:', params);

//   // Execute the query
//   const result = await db.query(query, params);

//   // Handle no results
//   if (result.rows.length === 0) {
//     return res.status(404).json({ message: 'No matching records found' });
//   }

//   // Return results
//   res.json(result.rows);
//     }
//     } catch (err) {
//       console.error('Error executing query:', err);
//       res.status(500).json({
//         error: 'Internal Server Error',
//         details: process.env.NODE_ENV === 'production' ? undefined : err.message,
//       });
//     }
//   }
// );

// dashboard.get('/api/searchThings/working/:stock/status/:status',
//   validateJwt,
//   authorizeRoles('admin', 'dealer'),
//   async (req, res) => {
//     const { serialno, name, phone, party } = req.query;
//     const { stock, status } = req.params;
//     // const userrole = "admin";
//     const userrole = req.user.role;

//     try {
//       let stockTable = '';
//       let userTable = '';
//       const params = [status];

//       if (userrole === 'admin') {
//         stockTable = 'AdminStock';
//         if (stock === 'sold') {
//           if (party === 'dealer') {
//             stockTable = 'dealersStock';
//             userTable = 'dealers_details';
//           } else if (party === 'customer') {
//             stockTable = 'customersStock';
//             userTable = 'customers_details';
//           } else if (party === 'onlineCustomer') {
//             stockTable = 'onlineCustomerStock';
//             userTable = 'onlinecustomer_details';
//           }
//         }
//       } else if (userrole === 'dealer') {
//         stockTable = 'dealersStock';
//         userTable = 'dealers_details';

//         if (stock === 'sold' && party === 'customer') {
//           stockTable = 'customersStock';
//           userTable = 'customers_details';
//         }
//       }

//       let query = `
//         SELECT 
//           t.id AS thing_id,
//           t.thingName,
//           t.createdby,
//           t.batchId,
//           t.model,
//           t.securityKey,
//           t.serialno,
//           s.status AS stock_status,
//           s.addedAt,
//           s.addedby,
//           tf.failureReason,
//           tf.fixed_by,
//           tf.loggedAt
//         FROM Things t
//         LEFT JOIN ${stockTable} s ON t.id = s.thingId
//       `;

//       if (userTable) {
//         query += `LEFT JOIN ${userTable} u ON s.user_id = u.id `;
//       }

//       query += `LEFT JOIN TestFailedDevices tf ON t.id = tf.thingId
//         WHERE s.status = $1`;

//       if (userrole === 'dealer') {
//         const dealerQuery = `SELECT id FROM dealers_details WHERE email = $1`;
//         const dealerResult = await db.query(dealerQuery, [req.user.email]);
//         if (dealerResult.rows.length === 0) {
//           return res.status(404).json({ message: 'Dealer not found' });
//         }
//         query += ` AND s.user_id = $2`;
//         params.push(dealerResult.rows[0].id);
//       }

//       if (serialno) {
//         query += ` AND t.serialno ILIKE $${params.length + 1}`;
//         params.push(`%${serialno}%`);
//       }
//       if (name && userTable) {
//         query += ` AND u.name ILIKE $${params.length + 1}`;
//         params.push(`%${name}%`);
//       }
//       if (phone && userTable) {
//         query += ` AND u.phone ILIKE $${params.length + 1}`;
//         params.push(`%${phone}%`);
//       }

//       console.log('Executing query:', query);
//       console.log('Query parameters:', params);

//       const result = await db.query(query, params);

//       if (result.rows.length === 0) {
//         return res.status(404).json({ message: 'No matching records found' });
//       }

//       res.json(result.rows);
//     } catch (err) {
//       console.error('Error executing query:', err);
//       res.status(500).json({
//         error: 'Internal Server Error',
//         details: process.env.NODE_ENV === 'production' ? undefined : err.message,
//       });
//     }
//   }
// );

// dashboard.get('/api/searchThings/working/:stock/status/:status',
//   // validateJwt,
//   // authorizeRoles('admin', 'dealer'),
//   async (req, res) => {
//     const { searchTerm, party="customer",serialno } = req.query; // Extract `party`
//     const { stock, status } = req.params;
//     // const userrole = req.user.role;
//     const userrole = "admin";

//     try {
//       let stockTable = '';
//       let userTable = '';
//       const params = [status];

//       if (userrole === 'admin') {
//         stockTable = 'AdminStock ';
//         if (stock === 'sold') {
//           if (!party) {
//             return res.status(400).json({ message: "Party parameter is required" });
//         }

//           console.log(`soldworking===${stock}`)
//           if (party === 'dealer') {
//             console.log(`partyworking===${stock, party}`)
//             stockTable = 'dealersStock';
//             userTable = 'dealers_details';
//           } else if (party === 'customer') {
//             console.log(`partyworking===${stock, party}`)
//             stockTable = 'customersStock';
//             userTable = 'customers_details';
//           } else if (party === 'onlineCustomer') {
//             console.log(`partyworking===${stock, party}`)
//             stockTable = 'onlineCustomerStock';
//             userTable = 'onlinecustomer_details';
//           }

//         } else if (stock !== 'sold') {
//           let query = `
//           SELECT 
//               t.id AS thing_id,
//               t.thingName,
//               t.createdby,
//               t.batchId,
//               t.model,
//               t.macaddress,
//               t.securityKey,
//               t.serialno,
//               a.status AS stock_status,
//               a.addedAt,
//               a.addedby,
//               tf.failureReason,
//               tf.fixed_by,
//               tf.loggedAt
//           FROM Things t
//           LEFT JOIN ${userrole === 'admin' ? 'AdminStock' : 'dealersStock'} a ON t.id = a.thingId
//           LEFT JOIN TestFailedDevices tf ON t.id = tf.thingId
//           WHERE a.status = $1
//       `;
//       const params = [status];

//       // If user is a dealer, fetch their ID and add to query
//       if (userrole === 'dealer') {
//         const dealerQuery = `SELECT id FROM dealers_details WHERE email = $1`;
//         const dealerResult = await db.query(dealerQuery, [req.user.email]);
//         if (dealerResult.rows.length === 0) {
//           return res.status(404).json({ message: 'Dealer not found' });
//         }
//         query += ` AND a.user_id = $2`;
//         params.push(dealerResult.rows[0].id);
//       }

//       // Add serialno filter if provided
//       if (serialno) {
//         query += ` AND t.serialno ILIKE $${params.length + 1}`;
//         params.push(`%${serialno}%`);
//       }

//       // Log for debugging
//       console.log('Executing query:', query);
//       console.log('Query parameters:', params);

//       // Execute the query
//       const result = await db.query(query, params);
//        // Handle no results
//       if (result.rows.length === 0) {
//         return res.status(404).json({ message: 'No matching records found' });
//       }

//       // Return results
//       res.json(result.rows);
//         }

//       } else if (userrole === 'dealer') {
//         stockTable = 'dealersStock';
//         userTable = 'dealers_details';

//         if (stock === 'sold' && party === 'customer') {
//           stockTable = 'customersStock';
//           userTable = 'customers_details';
//         }
//       }
//       let query = ''
//       if (stockTable.trim() !== "AdminStock") {
//         console.log(`tableworking===${stockTable}`)
//         query = `
//           SELECT 
//       t.id AS thing_id,
//       t.thingName,
//       t.createdby,
//       t.batchId,
//       t.model,
//       t.macaddress,
//       t.securityKey,
//       t.serialno,
//       s.status AS stock_status,
//       s.added_at AS added_date,  -- Handle column naming differences
//       s.added_by AS added_by,
//       tf.failureReason,
//       tf.fixed_by,
//       tf.loggedAt
//     FROM Things t
//     LEFT JOIN ${stockTable} s ON t.id = s.thingId `;
//       } else if (stockTable === "AdminStock") {
//         query = `SELECT 
//     t.id AS thing_id,
//     t.thingName,
//     t.createdby,
//     t.batchId,
//     t.model,
//     t.macaddress,
//     t.securityKey,
//     t.serialno,
//     s.status AS stock_status,
//     s.addedAt AS added_date,  -- Handle column naming differences
//     s.addedBy AS added_by,    -- Ensure consistency for added_by
//     tf.failureReason,
//     tf.fixed_by,
//     tf.loggedAt
//   FROM Things t
//   LEFT JOIN ${stockTable} s ON t.id = s.thingId `;
//       }



//       if (userTable) {
//         query += `LEFT JOIN ${userTable} u ON s.user_id = u.id `;
//       }

//       query += `LEFT JOIN TestFailedDevices tf ON t.id = tf.thingId
//         WHERE s.status = $1`;

//       if (userrole === 'dealer') {
//         const dealerQuery = `SELECT id FROM dealers_details WHERE email = $1`;
//         const dealerResult = await db.query(dealerQuery, [req.user.email]);
//         if (dealerResult.rows.length === 0) {
//           return res.status(404).json({ message: 'Dealer not found' });
//         }
//         query += ` AND s.user_id = $2`;
//         params.push(dealerResult.rows[0].id);
//       }

//       if (searchTerm) {
//         query += ` AND (
//           t.serialno ILIKE $${params.length + 1} 
//           OR (u.name ILIKE $${params.length + 1} AND u.name IS NOT NULL) 
//           OR (u.phone ILIKE $${params.length + 1} AND u.phone IS NOT NULL)
//         )`;
//         params.push(`%${searchTerm}%`);
//       }

//       console.log('Executing query:', query);
//       console.log('Query parameters:', params);

//       const result = await db.query(query, params);

//       if (result.rows.length === 0) {
//         return res.status(404).json({ message: 'No matching records found' });
//       }

//       res.json(result.rows);
//     } catch (err) {
//       console.error('Error executing query:', err);
//       res.status(500).json({
//         error: 'Internal Server Error',
//         details: process.env.NODE_ENV === 'production' ? undefined : err.message,
//       });
//     }
//   }
// );

// dashboard.get('/api/searchThings/working/:stock/status/:status',
//   async (req, res) => {
//     const { searchTerm, party = "customer", serialno } = req.query; // Default `party` to "customer"
//     const { stock, status } = req.params;
//     const userrole = "admin";

//     try {
//       let stockTable = '';
//       let userTable = '';
//       const params = [status];

//       if (userrole === 'admin') {
//         stockTable = 'AdminStock';

//         if (stock === 'sold') {
//           console.log(`soldworking===${stock}`);

//           if (party === 'dealer') {
//             console.log(`partyworking===${stock}, ${party}`);
//             stockTable = 'dealersStock';
//             userTable = 'dealers_details';
//           } else if (party === 'customer') {
//             console.log(`partyworking===${stock}, ${party}`);
//             stockTable = 'customersStock';
//             userTable = 'customers_details';
//           } else if (party === 'onlineCustomer') {
//             console.log(`partyworking===${stock}, ${party}`);
//             stockTable = 'onlineCustomerStock';
//             userTable = 'onlinecustomer_details';
//           }
//         }
//       } else if (userrole === 'dealer') {
//         stockTable = 'dealersStock';
//         userTable = 'dealers_details';

//         if (stock === 'sold' && party === 'customer') {
//           stockTable = 'customersStock';
//           userTable = 'customers_details';
//         }
//       }

//       // Construct the query
//       let query = `
//         SELECT 
//           t.id AS thing_id,
//           t.thingName,
//           t.createdby,
//           t.batchId,
//           t.model,
//           t.securityKey,
//           t.serialno,
//           s.status AS stock_status,
//           COALESCE(s.addedAt, s.added_at) AS added_date,
//           COALESCE(s.addedBy, s.added_by) AS added_by,
//           tf.failureReason,
//           tf.fixed_by,
//           tf.loggedAt
//         FROM Things t
//         LEFT JOIN ${stockTable} s ON t.id = s.thingId
//       `;

//       if (userTable) {
//         query += ` LEFT JOIN ${userTable} u ON s.user_id = u.id `;
//       }

//       query += ` LEFT JOIN TestFailedDevices tf ON t.id = tf.thingId WHERE s.status = $1`;

//       // If user is a dealer, restrict results to their stock
//       if (userrole === 'dealer') {
//         const dealerQuery = `SELECT id FROM dealers_details WHERE email = $1`;
//         const dealerResult = await db.query(dealerQuery, [req.user.email]);

//         if (dealerResult.rows.length === 0) {
//           return res.status(404).json({ message: 'Dealer not found' });
//         }

//         query += ` AND s.user_id = $2`;
//         params.push(dealerResult.rows[0].id);
//       }

//       // Apply serial number search
//       if (serialno) {
//         query += ` AND t.serialno ILIKE $${params.length + 1}`;
//         params.push(`%${serialno}%`);
//       }

//       // Apply search term filter
//       if (searchTerm) {
//         query += ` AND (
//           t.serialno ILIKE $${params.length + 1} 
//           OR (u.name ILIKE $${params.length + 1} AND u.name IS NOT NULL) 
//           OR (u.phone ILIKE $${params.length + 1} AND u.phone IS NOT NULL)
//         )`;
//         params.push(`%${searchTerm}%`);
//       }

//       // Debug logs
//       console.log('Executing query:', query);
//       console.log('Query parameters:', params);

//       // Execute the query
//       const result = await db.query(query, params);

//       if (result.rows.length === 0) {
//         return res.status(404).json({ message: 'No matching records found' });
//       }

//       return res.json(result.rows); // ✅ Ensure `return` to prevent further execution
//     } catch (err) {
//       console.error('Error executing query:', err);

//       // ✅ Prevent sending multiple responses
//       if (!res.headersSent) {
//         return res.status(500).json({
//           error: 'Internal Server Error',
//           details: process.env.NODE_ENV === 'production' ? undefined : err.message,
//         });
//       }
//     }
//   }
// );



// dashboard.get('/api/searchThings/working/:stock/status/:status',
//   // validateJwt,
//   // authorizeRoles('admin', 'dealer'),
//   async (req, res) => {
//     const { searchTerm, party = "customer", serialno } = req.query; // Extract `party`
//     const { stock, status } = req.params;
//     // const userrole = req.user.role;
//     const userrole = "admin";

//     try {
//       let stockTable = '';
//       let userTable = '';
//       let params = [status];
//       let query = ''
//       if (userrole === 'admin') {
//         stockTable = 'AdminStock ';
//         if (stock === 'sold') {
//           if (!party) {
//             return res.status(400).json({ message: "Party parameter is required" });
//           }

//           console.log(`soldworking===${stock}`)
//           if (party === 'dealer') {
//             console.log(`partyworking===${stock, party}`)
//             stockTable = 'dealersStock';
//             userTable = 'dealers_details';
//           } else if (party === 'customer') {
//             console.log(`partyworking===${stock, party}`)
//             stockTable = 'customersStock';
//             userTable = 'customers_details';
//           } else if (party === 'onlineCustomer') {
//             console.log(`partyworking===${stock, party}`)
//             stockTable = 'onlineCustomerStock';
//             userTable = 'onlinecustomer_details';
//           }

//         } else if (stock !== 'sold') {
//           query = `
//           SELECT 
//               t.id AS thing_id,
//               t.thingName,
//               t.createdby,
//               t.batchId,
//               t.model,
//               t.macaddress,
//               t.securityKey,
//               t.serialno,
//               a.status AS stock_status,
//               a.addedAt,
//               a.addedby,
//               tf.failureReason,
//               tf.fixed_by,
//               tf.loggedAt
//           FROM Things t
//           LEFT JOIN ${userrole === 'admin' ? 'AdminStock' : 'dealersStock'} a ON t.id = a.thingId
//           LEFT JOIN TestFailedDevices tf ON t.id = tf.thingId
//           WHERE a.status = $1
//       `;

//           // If user is a dealer, fetch their ID and add to query
//           if (userrole === 'dealer') {
//             const dealerQuery = `SELECT id FROM dealers_details WHERE email = $1`;
//             const dealerResult = await db.query(dealerQuery, [req.user.email]);
//             if (dealerResult.rows.length === 0) {
//               return res.status(404).json({ message: 'Dealer not found' });
//             }
//             query += ` AND a.user_id = $2`;
//             params.push(dealerResult.rows[0].id);
//           }

//           // Add serialno filter if provided
//           if (serialno) {
//             query += ` AND t.serialno ILIKE $${params.length + 1}`;
//             params.push(`%${serialno}%`);
//           }

//           // Log for debugging
//           console.log('Executing query:', query);
//           console.log('Query parameters:', params);

//           // Execute the query
//           const result = await db.query(query, params);
//           // Handle no results
//           if (result.rows.length === 0) {
//             return res.status(404).json({ message: 'No matching records found' });
//           }

//           // Return results
//           return res.json(result.rows);

//         }

//       } else if (userrole === 'dealer') {
//         stockTable = 'dealersStock';
//         userTable = 'dealers_details';

//         if (stock === 'sold' && party === 'customer') {
//           stockTable = 'customersStock';
//           userTable = 'customers_details';
//         }
//       }

//       if (stockTable.trim() !== "AdminStock") {
//         console.log(`tableworking===${stockTable}`)
//         query = `
//       SELECT 
//     t.id AS thing_id,
//     t.thingName,
//     t.createdby,
//     t.batchId,
//     t.model,
//     t.macaddress,
//     t.securityKey,
//     t.serialno,
//     s.status AS stock_status,
//     s.added_at AS added_date,  -- Handle column naming differences
//     s.added_by AS added_by,
//     tf.failureReason,
//     tf.fixed_by,
//     tf.loggedAt,
//     u.name AS user_name,        -- Added user name
//     u.phone AS user_phone       -- Added user phone
//     FROM Things t
//     LEFT JOIN ${stockTable} s ON t.id = s.thingId `;
//       }
//       //      else if (stockTable === "AdminStock") {
//       //       query = `SELECT 
//       //   t.id AS thing_id,
//       //   t.thingName,
//       //   t.createdby,
//       //   t.batchId,
//       //   t.model,
//       //   t.macaddress,
//       //   t.securityKey,
//       //   t.serialno,
//       //   s.status AS stock_status,
//       //   s.addedAt AS added_date,  -- Handle column naming differences
//       //   s.addedBy AS added_by,    -- Ensure consistency for added_by
//       //   tf.failureReason,
//       //   tf.fixed_by,
//       //   tf.loggedAt
//       // FROM Things t
//       // LEFT JOIN ${stockTable} s ON t.id = s.thingId `;
//       //     }



//       if (userTable) {
//         query += `LEFT JOIN ${userTable} u ON s.user_id = u.id `;
//       }

//       query += `LEFT JOIN TestFailedDevices tf ON t.id = tf.thingId
//         WHERE s.status = $1`;

//       if (userrole === 'dealer') {
//         const dealerQuery = `SELECT id FROM dealers_details WHERE email = $1`;
//         const dealerResult = await db.query(dealerQuery, [req.user.email]);
//         if (dealerResult.rows.length === 0) {
//           return res.status(404).json({ message: 'Dealer not found' });
//         }
//         query += ` AND s.user_id = $2`;
//         params.push(dealerResult.rows[0].id);
//       }

//       if (searchTerm) {
//         query += ` AND (
//           t.serialno ILIKE $${params.length + 1} 
//           OR (u.name ILIKE $${params.length + 1} AND u.name IS NOT NULL) 
//           OR (u.phone ILIKE $${params.length + 1} AND u.phone IS NOT NULL)
//         )`;
//         params.push(`%${searchTerm}%`);
//       }

//       console.log('Executing query:', query);
//       console.log('Query parameters:', params);

//       const result = await db.query(query, params);

//       if (result.rows.length === 0) {
//         return res.status(404).json({ message: 'No matching records found' });
//       }

//       return res.json(result.rows);
//     } catch (err) {
//       console.error('Error executing query:', err);
//       res.status(500).json({
//         error: 'Internal Server Error',
//         details: process.env.NODE_ENV === 'production' ? undefined : err.message,
//       });
//     }
//   }
// );

dashboard.get('/api/searchThings/working/:stock/status/:status', async (req, res) => {
  const { searchTerm, party = "customer", serialno } = req.query; // Extract `party`
  const { stock, status } = req.params;
  const userrole = "admin"; // Hardcoded for testing

  try {
      let stockTable = '';
      let userTable = '';
      let params = [status];
      let query = '';

      if (userrole === 'admin') {
          stockTable = 'AdminStock ';
          if (stock === 'sold') {
              if (!party) {
                  return res.status(400).json({ message: "Party parameter is required" });
              }

              if (party === 'dealer') {
                  stockTable = 'dealersStock';
                  userTable = 'dealers_details';
              } else if (party === 'customer') {
                  stockTable = 'customersStock';
                  userTable = 'customers_details';
              } else if (party === 'onlineCustomer') {
                  stockTable = 'onlineCustomerStock';
                  userTable = 'onlinecustomer_details';
              }
          } else if (stock !== 'sold') {
            query = `
            SELECT
                t.id AS thing_id,
                t.thingName,
                t.createdby,
                t.batchId,
                t.model,
                t.macaddress,
                t.securityKey,
                t.serialno,
                a.status AS stock_status,
                a.addedAt AS addedat,
                a.addedby AS addedby,
                tf.failureReason,
                tf.fixed_by,
                tf.loggedAt,
                -- Join the features and attributes
                jsonb_agg(DISTINCT jsonb_build_object('feature', f.feature, 'feature_value', f.feature_value)) AS features,    
                jsonb_agg(DISTINCT jsonb_build_object('attributeName', ta.attributeName, 'attributeValue', ta.attributeValue)) AS attributes,
                -- Join price table with type casting
                p.mrp,
                p.retail_price,
                p.sgst,
                p.cgst,
                p.igst,
                p.discount,
                p.warranty_period
            FROM Things t
            LEFT JOIN AdminStock a ON t.id = a.thingId
             LEFT JOIN price_table p ON t.model  = p.model 
            LEFT JOIN TestFailedDevices tf ON t.id = tf.thingId
            LEFT JOIN model_features f ON p.id = f.model_id
            LEFT JOIN ThingAttributes ta ON t.id = ta.thingId
            -- Applying type casting here
            WHERE a.status = $1
            GROUP BY t.id, a.status, a.addedAt, a.addedby, tf.failureReason, tf.fixed_by, tf.loggedAt, p.id;
          `;
              // If user is a dealer, fetch their ID and add to query
              if (userrole === 'dealer') {
                  const dealerQuery = `SELECT id FROM dealers_details WHERE email = $1`;
                  const dealerResult = await db.query(dealerQuery, [req.user.email]);
                  if (dealerResult.rows.length === 0) {
                      return res.status(404).json({ message: 'Dealer not found' });
                  }
                  query += ` AND a.user_id = $2`;
                  params.push(dealerResult.rows[0].id);
              }

              // Add serialno filter if provided
              if (serialno) {
                  query += ` AND t.serialno ILIKE $${params.length + 1}`;
                  params.push(`%${serialno}%`);
              }

              // Log for debugging
              console.log('Executing query:', query);
              console.log('Query parameters:', params);

              // Execute the query
              const result = await db.query(query, params);

              // Handle no results
              if (result.rows.length === 0) {
                  return res.status(404).json({ message: 'No matching records found' });
              }

              // Return results with features, attributes, and price data
              return res.json(result.rows);
          }
      }

      // For non-admin users (such as dealers)
      if (stockTable.trim() !== "AdminStock") {
        query = `
    SELECT
        t.id AS thing_id,
        t.thingName,
        t.createdby,
        t.batchId,
        t.model,
        t.macaddress,
        t.securityKey,
        t.serialno,
        s.status AS stock_status,
        s.added_at AS addedat,
        s.added_by AS addedby,
        tf.failureReason,
        tf.fixed_by,
        tf.loggedAt,
        u.name AS user_name,
        u.phone AS user_phone,
        -- Join the features and attributes
        jsonb_agg(DISTINCT jsonb_build_object('feature', f.feature, 'feature_value', f.feature_value)) AS features,
        jsonb_agg(DISTINCT jsonb_build_object('attributeName', ta.attributeName, 'attributeValue', ta.attributeValue)) AS attributes,
        -- Join price table
        p.mrp,
        p.retail_price,
        p.sgst,
        p.cgst,
        p.igst,
        p.discount,
        p.warranty_period
    FROM Things t
    LEFT JOIN ${stockTable} s ON t.id = s.thingId
    LEFT JOIN ${userTable} u ON s.user_id = u.id
    LEFT JOIN price_table p ON t.model = p.model
    LEFT JOIN TestFailedDevices tf ON t.id = tf.thingId
    LEFT JOIN model_features f ON p.id = f.model_id  -- Corrected Join
    LEFT JOIN ThingAttributes ta ON t.id = ta.thingId
    WHERE s.status = $1
    GROUP BY
        t.id, t.thingName, t.createdby, t.batchId, t.model, t.macaddress, 
        t.securityKey, t.serialno, s.status, s.added_at, s.added_by, 
        tf.failureReason, tf.fixed_by, tf.loggedAt, u.name, u.phone, 
        p.mrp, p.retail_price, p.sgst, p.cgst, p.igst, p.discount, p.warranty_period;
`;

console.log("Executing query:", query);
console.log("Query parameters:", [status]);

      
          if (userrole === 'dealer') {
              const dealerQuery = `SELECT id FROM dealers_details WHERE email = $1`;
              const dealerResult = await db.query(dealerQuery, [req.user.email]);
              if (dealerResult.rows.length === 0) {
                  return res.status(404).json({ message: 'Dealer not found' });
              }
              query += ` AND s.user_id = $2`;
              params.push(dealerResult.rows[0].id);
          }

          if (searchTerm) {
              query += ` AND (
                  t.serialno ILIKE $${params.length + 1} 
                  OR (u.name ILIKE $${params.length + 1} AND u.name IS NOT NULL) 
                  OR (u.phone ILIKE $${params.length + 1} AND u.phone IS NOT NULL)
              )`;
              params.push(`%${searchTerm}%`);
          }
      }

      // Log for debugging
      console.log('Executing query:', query);
      console.log('Query parameters:', params);

      const result = await db.query(query, params);

      if (result.rows.length === 0) {
          return res.status(404).json({ message: 'No matching records found' });
      }

      // Return results with features, attributes, and price data
      return res.json(result.rows);
  } catch (err) {
      console.error('Error executing query:', err);
      res.status(500).json({
          error: 'Internal Server Error',
          details: process.env.NODE_ENV === 'production' ? undefined : err.message,
      });
  }
});


dashboard.get('/api/searchThings/working/:status',
  validateJwt,
  authorizeRoles('admin', 'dealer'),
  async (req, res) => {
    const { serialno } = req.query;
    const { status } = req.params;
    const userrole = req.user.role;

    console.log(`working ${userrole}`)
    try {
      // Define base query and parameters
      let query = `
          SELECT 
              t.id AS thing_id,
              t.thingName,
              t.createdby,
              t.batchId,
              t.model,
              t.securityKey,
              t.serialno,
              a.status AS stock_status,
              a.addedAt,
              a.addedby,
              tf.failureReason,
              tf.fixed_by,
              tf.loggedAt
          FROM Things t
          LEFT JOIN ${userrole === 'admin' ? 'AdminStock' : 'dealersStock'} a ON t.id = a.thingId
          LEFT JOIN TestFailedDevices tf ON t.id = tf.thingId
          WHERE a.status = $1
      `;
      const params = [status];

      // If user is a dealer, fetch their ID and add to query
      if (userrole === 'dealer') {
        const dealerQuery = `SELECT id FROM dealers_details WHERE email = $1`;
        const dealerResult = await db.query(dealerQuery, [req.user.email]);
        if (dealerResult.rows.length === 0) {
          return res.status(404).json({ message: 'Dealer not found' });
        }
        query += ` AND a.user_id = $2`;
        params.push(dealerResult.rows[0].id);
      }

      // Add serialno filter if provided
      if (serialno) {
        query += ` AND t.serialno ILIKE $${params.length + 1}`;
        params.push(`%${serialno}%`);
      }

      // Log for debugging
      console.log('Executing query:', query);
      console.log('Query parameters:', params);

      // Execute the query
      const result = await db.query(query, params);

      // Handle no results
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'No matching records found' });
      }

      // Return results
      res.json(result.rows);
    } catch (err) {
      // Log error and return response
      console.error('Error executing query:', err);
      res.status(500).json({
        error: 'Internal Server Error',
        details: process.env.NODE_ENV === 'production' ? undefined : err.message,
      });
    }
  });

//api for user graph 
// dashboard.get("/api/users/graph", async (req, res) => {
//   const { groupBy } = req.query; // Accept 'day', 'week', 'month', or 'year' as a query parameter

//   if (!["day", "week", "month", "year"].includes(groupBy)) {
//     return res.status(400).json({ error: "Invalid groupBy value. Use 'day', 'week', 'month', or 'year'." });
//   }

//   // Map groupBy to the appropriate SQL expressions
//   // const groupByExpression = {
//   //   day: "TO_CHAR(lastModified, 'YYYY-MM-DD')", // Extract only the date without time and time zone
//   //   week: "TO_CHAR(lastModified, 'IYYY-IW')",  // ISO year and week number
//   //   month: "TO_CHAR(lastModified, 'YYYY-MM')", // Year and month in YYYY-MM format
//   //   year: "EXTRACT(YEAR FROM lastModified)::INT", // Extract the year as an integer
//   // };
//   const groupByExpression = {
//     day: "TO_CHAR(lastModified, 'FMDay, FMMonth DD, YYYY')", // Full day and month in letters
//     week: "TO_CHAR(lastModified, 'IYYY-IW')",  // ISO year and week number
//     month: "TO_CHAR(lastModified, 'FMMonth YYYY')", // Full month in letters and year
//     year: "EXTRACT(YEAR FROM lastModified)::INT", // Extract the year as an integer
//   };

//   const query = `
//     SELECT 
//       ${groupByExpression[groupBy]} AS period,
//       COUNT(*) AS user_count
//     FROM 
//       Users
//     GROUP BY 
//       ${groupByExpression[groupBy]}
//     ORDER BY 
//       period ASC;
//   `;
//   try {
//     const client = await db.connect();
//     const result = await client.query(query);

//     res.status(200).json({
//       groupBy,
//       data: result.rows, // Rows contain the grouped data
//     });

//     client.release();
//   } catch (err) {
//     console.error("Error fetching user graph data:", err);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

dashboard.get("/api/users/graph", async (req, res) => {
  const { groupBy } = req.query; // Accept 'day', 'week', 'month', or 'year' as a query parameter

  if (!["day", "week", "month", "year"].includes(groupBy)) {
    return res.status(400).json({ error: "Invalid groupBy value. Use 'day', 'week', 'month', or 'year'." });
  }

  // Map groupBy to the appropriate SQL expressions
  const groupByExpression = {
    day: "TO_CHAR(lastModified, 'Mon DD')", // Full day and month in letters
    week: "TO_CHAR(lastModified, 'IYYY-IW')",  // ISO year and week number
    month: "TO_CHAR(lastModified, 'Mon YYYY')", // Full month in letters and year
    year: "EXTRACT(YEAR FROM lastModified)::INT", // Extract the year as an integer
  };

  const sortExpression = {
    day: "TO_DATE(lastModified::TEXT, 'YYYY-MM-DD')", // Sort by date
    week: "TO_DATE(lastModified::TEXT, 'YYYY-MM-DD')", // Use first day of the week
    month: "DATE_TRUNC('month', lastModified)", // Sort by the first day of the month
    year: "DATE_TRUNC('year', lastModified)", // Sort by the first day of the year
  };

  const query = `
    SELECT 
      ${groupByExpression[groupBy]} AS period,
      COUNT(*) AS user_count,
      ${sortExpression[groupBy]} AS sort_date -- Add a sortable column
    FROM 
      Users
    GROUP BY 
      ${groupByExpression[groupBy]}, sort_date -- Include the sortable column in GROUP BY
    ORDER BY 
      sort_date ASC; -- Sort by the sortable column
  `;

  try {
    const client = await db.connect();
    const result = await client.query(query);

    res.status(200).json({
      groupBy,
      data: result.rows.map(row => ({
        period: row.period,
        user_count: row.user_count,
      })), // Return the data without the sort_date field
    });

    client.release();
  } catch (err) {
    console.error("Error fetching user graph data:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//api to display things
dashboard.get('/api/display/things', async (req, res) => {
  try {
    // Get `page`, `limit`, and `serialno` query parameters
    const page = parseInt(req.query.page, 10) || 1; // Default to page 1
    const limit = parseInt(req.query.limit, 10) || 10; // Default to 10 records per page
    const serialno = req.query.serialno || null; // Search by serial number if provided

    if (page < 1 || limit < 1) {
      return res.status(400).json({ error: 'Invalid page or limit value' });
    }

    const offset = (page - 1) * limit; // Calculate the offset

    // Query for filtering by `serialno` or listing all available things in `AdminStock`
    let query = `
          SELECT t.*, a.status AS stock_status, a.addedAt
          FROM AdminStock a
          INNER JOIN Things t ON a.thingId = t.id
      `;
    let countQuery = `
          SELECT COUNT(*) AS total
          FROM AdminStock a
          INNER JOIN Things t ON a.thingId = t.id
      `;
    const params = [];
    let whereClause = '';

    // Add a filter for `serialno` if provided
    if (serialno) {
      whereClause = ' WHERE t.serialno = $1';
      params.push(serialno);
    }

    // Add pagination
    query += whereClause + ' ORDER BY t.id ASC LIMIT $2 OFFSET $3';
    countQuery += whereClause;

    params.push(limit, offset);

    // Fetch records with pagination
    const result = await db.query(query, params);

    // Fetch the total number of records to calculate total pages
    const countResult = await db.query(countQuery, serialno ? [serialno] : []);
    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limit);

    // Respond with data
    res.status(200).json({
      page,
      limit,
      total,
      totalPages,
      data: result.rows,
    });
  } catch (error) {
    console.error('Error fetching things:', error); // Log the error for debugging
    res.status(500).json({ error: 'Internal Server Error' }); // Respond with an error
  }
});

// API endpoint for full count
dashboard.get('/api/things/count', async (req, res) => {
  try {
    const result = await db.query('SELECT COUNT(*) AS total_count FROM Things');
    res.json({ total_count: result.rows[0].total_count });
  } catch (err) {
    console.error('Error querying the database:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API endpoint for sorted count by model
dashboard.get('/api/things/model-count', async (req, res) => {
  try {
    // Query to get grouped counts
    const groupedResult = await db.query(`
            SELECT model, COUNT(*) AS model_count
            FROM Things
            GROUP BY model
            ORDER BY model_count DESC, model ASC
        `);

    // Query to get the total count
    const totalResult = await db.query(`
            SELECT COUNT(*) AS total_count
            FROM Things
        `);

    const totalCount = totalResult.rows[0].total_count;

    // Add total count to the response
    res.json({
      total_count: totalCount,
      model_counts: groupedResult.rows
    });
  } catch (err) {
    console.error('Error querying the database:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

dashboard.post("/api/billing/create", billing);

dashboard.post("/api/billing/return/:status", returned)
// API Endpoint to search price_table by model and/or attributes
// dashboard.get('/api/search/model/price', async (req, res) => {
//   try {
//       const { query } = req.query;

//       if (!query) {
//           return res.status(400).json({ error: "Missing query parameter" });
//       }

//       // Split query into parts
//       const parts = query.split(',').map(item => item.trim());

//       let model = null;
//       let conditions = [];

//       // Identify if the first part is a model (assumes models don't contain spaces)
//       if (parts[0] && !parts[0].includes(' ')) {
//           model = parts[0]; // First part is the model name
//           conditions = parts.slice(1).map(item => {
//               const [attributeName, attributeValue] = item.split(' ');
//               return { attributeName, attributeValue };
//           });
//       } else {
//           conditions = parts.map(item => {
//               const [attributeName, attributeValue] = item.split(' ');
//               return { attributeName, attributeValue };
//           });
//       }

//       // Base SQL query (only selecting from price_table)
//       let sqlQuery = `
//           SELECT pt.* 
//           FROM price_table pt
//       `;
//       const queryParams = [];

//       // Apply filters
//       if (model) {
//           sqlQuery += " WHERE pt.model = $1";
//           queryParams.push(model);
//       }

//       if (conditions.length > 0) {
//           sqlQuery += model ? " AND EXISTS (" : " WHERE EXISTS (";
//           sqlQuery += `
//               SELECT 1 FROM Things t
//               JOIN ThingAttributes ta ON t.id = ta.thingId
//               WHERE t.model = pt.model AND (
//           `;
//           conditions.forEach((condition, index) => {
//               sqlQuery += `(ta.attributeName = $${queryParams.length + 1} AND ta.attributeValue = $${queryParams.length + 2})`;
//               if (index < conditions.length - 1) sqlQuery += " OR ";
//               queryParams.push(condition.attributeName, condition.attributeValue);
//           });
//           sqlQuery += "))";
//       }

//       const { rows } = await db.query(sqlQuery, queryParams);
//       res.json(rows);
//   } catch (error) {
//       console.error("Error fetching data:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// dashboard.get('/api/search/model/price', async (req, res) => {
//   try {
//       const { query } = req.query;

//       if (!query) {
//           return res.status(400).json({ error: "Missing query parameter" });
//       }

//       // Split query into parts
//       const parts = query.split(',').map(item => item.trim());

//       let model = null;
//       let conditions = [];

//       // Identify if the first part is a model (assumes models don't contain spaces)
//       if (parts[0] && !parts[0].includes(' ')) {
//           model = parts[0]; // First part is the model name
//           conditions = parts.slice(1).map(item => {
//               const [attributeName, attributeValue] = item.split(' ');
//               return { attributeName, attributeValue };
//           });
//       } else {
//           conditions = parts.map(item => {
//               const [attributeName, attributeValue] = item.split(' ');
//               return { attributeName, attributeValue };
//           });
//       }

//       // Base SQL query (only selecting from price_table)
//       let sqlQuery = `
//           SELECT pt.* 
//           FROM price_table pt
//       `;
//       const queryParams = [];

//       // Apply filters
//       if (model) {
//           sqlQuery += " WHERE LOWER(pt.model) = LOWER($1)";
//           queryParams.push(model);
//       }

//       if (conditions.length > 0) {
//           sqlQuery += model ? " AND EXISTS (" : " WHERE EXISTS (";
//           sqlQuery += `
//               SELECT 1 FROM Things t
//               JOIN ThingAttributes ta ON t.id = ta.thingId
//               WHERE LOWER(t.model) = LOWER(pt.model) AND (
//           `;
//           conditions.forEach((condition, index) => {
//               sqlQuery += `(LOWER(ta.attributeName) = LOWER($${queryParams.length + 1}) AND LOWER(ta.attributeValue) = LOWER($${queryParams.length + 2}))`;
//               if (index < conditions.length - 1) sqlQuery += " OR ";
//               queryParams.push(condition.attributeName, condition.attributeValue);
//           });
//           sqlQuery += "))";
//       }

//       const { rows } = await db.query(sqlQuery, queryParams);
//       res.json(rows);
//   } catch (error) {
//       console.error("Error fetching data:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//   }
// });
// dashboard.get('/api/search/model/price', async (req, res) => {
//   try {
//       const { query } = req.query;

//       if (!query) {
//           return res.status(400).json({ error: "Missing query parameter" });
//       }

//       // Split query into parts
//       const parts = query.split(',').map(item => item.trim());

//       let model = null;
//       let conditions = [];

//       if (parts[0] && !parts[0].includes(' ')) {
//           model = parts[0];
//           conditions = parts.slice(1).map(item => {
//               const [attributeName, attributeValue] = item.split(' ');
//               return { attributeName, attributeValue };
//           });
//       } else {
//           conditions = parts.map(item => {
//               const [attributeName, attributeValue] = item.split(' ');
//               return { attributeName, attributeValue };
//           });
//       }

//       let sqlQuery = `
//           SELECT pt.* 
//           FROM price_table pt
//       `;
//       const queryParams = [];

//       if (model) {
//           sqlQuery += " WHERE LOWER(pt.model) = LOWER($1)";
//           queryParams.push(model);
//       }

//       if (conditions.length > 0) {
//           sqlQuery += model ? " AND EXISTS (" : " WHERE EXISTS (";
//           sqlQuery += `
//               SELECT 1 FROM Things t
//               JOIN ThingAttributes ta ON t.id = ta.thingId
//               WHERE LOWER(t.model) = LOWER(pt.model) AND (
//           `;

//           conditions.forEach((condition, index) => {
//               const { attributeName, attributeValue } = condition;
//               const isNumeric = !isNaN(attributeValue); // Check if it's a number

//               if (isNumeric) {
//                   sqlQuery += `(LOWER(ta.attributeName) = LOWER($${queryParams.length + 1}) 
//                                 AND CAST(ta.attributeValue AS INTEGER) 
//                                 BETWEEN $${queryParams.length + 2} - 2 AND $${queryParams.length + 2} + 2)`;
//                   queryParams.push(attributeName, parseInt(attributeValue));
//               } else {
//                   sqlQuery += `(LOWER(ta.attributeName) = LOWER($${queryParams.length + 1}) 
//                                 AND LOWER(ta.attributeValue) = LOWER($${queryParams.length + 2}))`;
//                   queryParams.push(attributeName, attributeValue);
//               }

//               if (index < conditions.length - 1) sqlQuery += " OR ";
//           });

//           sqlQuery += "))";
//       }

//       const { rows } = await db.query(sqlQuery, queryParams);
//       res.json(rows);
//   } catch (error) {
//       console.error("Error fetching data:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//   }
// });
// dashboard.get('/api/search/model/price', async (req, res) => {
//   try {
//       const { query } = req.query;

//       if (!query) {
//           return res.status(400).json({ error: "Missing query parameter" });
//       }

//       // Split query into parts
//       const parts = query.split(',').map(item => item.trim());

//       let model = null;
//       let conditions = [];

//       if (parts[0] && !parts[0].includes(' ')) {
//           model = parts[0];
//           conditions = parts.slice(1).map(item => {
//               const [attributeName, attributeValue] = item.split(' ');
//               return { attributeName, attributeValue };
//           });
//       } else {
//           conditions = parts.map(item => {
//               const [attributeName, attributeValue] = item.split(' ');
//               return { attributeName, attributeValue };
//           });
//       }

//       let sqlQuery = `
//           SELECT 
//               pt.model, 
//               pt.mrp, 
//               pt.retail_price, 
//               pt.sgst, 
//               pt.cgst, 
//               pt.igst, 
//               pt.discount, 
//               pt.warranty_period, 
//               pt.lastmodified, 
//               JSON_AGG(
//                   JSON_BUILD_OBJECT(
//                       'attributeName', ta.attributeName, 
//                       'attributeValue', ta.attributeValue
//                   )
//               ) AS attributes
//           FROM price_table pt
//           JOIN Things t ON pt.model = t.model
//           JOIN ThingAttributes ta ON t.id = ta.thingId
//       `;
//       const queryParams = [];

//       if (model) {
//           sqlQuery += " WHERE LOWER(pt.model) = LOWER($1)";
//           queryParams.push(model);
//       }

//       if (conditions.length > 0) {
//           sqlQuery += model ? " AND EXISTS (" : " WHERE EXISTS (";
//           sqlQuery += `
//               SELECT 1 FROM ThingAttributes ta
//               WHERE ta.thingId = t.id AND (
//           `;

//           conditions.forEach((condition, index) => {
//               const { attributeName, attributeValue } = condition;
//               const isNumeric = !isNaN(attributeValue);

//               if (isNumeric) {
//                   sqlQuery += `(LOWER(ta.attributeName) = LOWER($${queryParams.length + 1}) 
//                                 AND CAST(ta.attributeValue AS INTEGER) 
//                                 BETWEEN $${queryParams.length + 2} - 2 AND $${queryParams.length + 2} + 2)`;
//                   queryParams.push(attributeName, parseInt(attributeValue));
//               } else {
//                   sqlQuery += `(LOWER(ta.attributeName) = LOWER($${queryParams.length + 1}) 
//                                 AND LOWER(ta.attributeValue) = LOWER($${queryParams.length + 2}))`;
//                   queryParams.push(attributeName, attributeValue);
//               }

//               if (index < conditions.length - 1) sqlQuery += " OR ";
//           });

//           sqlQuery += "))";
//       }

//       sqlQuery += " GROUP BY pt.model, pt.mrp, pt.retail_price, pt.sgst, pt.cgst, pt.igst, pt.discount, pt.warranty_period, pt.lastmodified";

//       const { rows } = await db.query(sqlQuery, queryParams);
//       res.json(rows);
//   } catch (error) {
//       console.error("Error fetching data:", error);
//       res.status(500).json({ error: "Internal Server Error" });
//   }
// });
dashboard.get('/api/search/model/price', async (req, res) => {
  try {
      const { query } = req.query;

      if (!query) {
          return res.status(400).json({ error: "Missing query parameter" });
      }

      // Split query into parts
      const parts = query.split(',').map(item => item.trim());

      let model = null;
      let conditions = [];

      if (parts[0] && !parts[0].includes(' ')) {
          model = parts[0];
          conditions = parts.slice(1).map(item => {
              const [attributeName, attributeValue] = item.split(' ');
              return { attributeName, attributeValue };
          });
      } else {
          conditions = parts.map(item => {
              const [attributeName, attributeValue] = item.split(' ');
              return { attributeName, attributeValue };
          });
      }

      let sqlQuery = `
          SELECT pt.model, pt.mrp,
              pt.retail_price, 
              pt.sgst, 
              pt.cgst, 
              pt.igst, 
              pt.discount, 
              pt.warranty_period,
                 JSON_AGG(DISTINCT JSONB_BUILD_OBJECT('attributeName', ta.attributeName, 'attributeValue', ta.attributeValue)) AS attributes
          FROM price_table pt
          JOIN Things t ON pt.model = t.model
          JOIN ThingAttributes ta ON t.id = ta.thingId
      `;
      const queryParams = [];

      if (model) {
          sqlQuery += " WHERE LOWER(pt.model) = LOWER($1)";
          queryParams.push(model);
      }

      if (conditions.length > 0) {
          sqlQuery += model ? " AND EXISTS (" : " WHERE EXISTS (";
          sqlQuery += `
              SELECT 1 FROM ThingAttributes ta
              WHERE ta.thingId = t.id AND (
          `;

          conditions.forEach((condition, index) => {
              const { attributeName, attributeValue } = condition;
              const isNumeric = !isNaN(attributeValue);

              if (isNumeric) {
                  sqlQuery += `(LOWER(ta.attributeName) = LOWER($${queryParams.length + 1}) 
                                AND CAST(ta.attributeValue AS INTEGER) 
                                BETWEEN $${queryParams.length + 2} - 2 AND $${queryParams.length + 2} + 2)`;
                  queryParams.push(attributeName, parseInt(attributeValue));
              } else {
                  sqlQuery += `(LOWER(ta.attributeName) = LOWER($${queryParams.length + 1}) 
                                AND LOWER(ta.attributeValue) = LOWER($${queryParams.length + 2}))`;
                  queryParams.push(attributeName, attributeValue);
              }

              if (index < conditions.length - 1) sqlQuery += " OR ";
          });

          sqlQuery += "))";
      }

      sqlQuery += " GROUP BYpt.model, pt.mrp,pt.retail_price,  pt.sgst,pt.cgst,  pt.igst,  pt.discount, pt.warranty_period,";

      const { rows } = await db.query(sqlQuery, queryParams);
      res.json(rows);
  } catch (error) {
      console.error("Error fetching data:", error);
      res.status(500).json({ error: "Internal Server Error" });
  }
});


dashboard.get("/price/:serialno", async (req, res) => {
  const serialno = req.params.serialno;

  try {
    const query = `
      SELECT 
          t.serialno,
          t.model,
          p.mrp,
          p.retail_price,
          p.sgst,
          p.cgst,
          p.igst,
          p.discount,
          p.warranty_period,
          p.lastmodified
      FROM Things t
      JOIN price_table p ON t.model = p.model
      WHERE t.serialno = $1;
    `;

    const result = await db.query(query, [serialno]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No data found for this serial number" });
    }

    res.json(result.rows[0]); // Return the first matching result
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

dashboard.post('/api/pay-balance', async (req, res) => {
  try {
    const {
      id,                   // ID of the customer, dealer, or online customer
      type,                 // 'customer', 'dealer', or 'online_customer'
      payments,             // Array of payment objects: [{ method: 'cash', amount: 500 }, { method: 'online', amount: 200 }]
      created_by            // User creating the billing
    } = req.body;

    // Validate input
    if (!id || !type || !payments || !Array.isArray(payments) || !created_by) {
      return res.status(400).json({ error: 'All fields (id, type, payments, created_by) are required' });
    }

    // Validate payment methods and amounts
    const validPaymentMethods = ['cash', 'online', 'bank'];
    let totalPaid = 0;

    for (const payment of payments) {
      if (!payment.method || !payment.amount) {
        return res.status(400).json({ error: 'Each payment must have a method and an amount' });
      }
      if (!validPaymentMethods.includes(payment.method)) {
        return res.status(400).json({ error: `Invalid payment method: ${payment.method}` });
      }
      if (payment.amount <= 0) {
        return res.status(400).json({ error: 'Payment amount must be greater than zero' });
      }
      totalPaid += payment.amount;
    }

    // Define table and corresponding ID column based on type
    let table, idColumn;
    if (type === 'customer') {
      table = 'customers_details';
      idColumn = 'customers_id';
    } else if (type === 'dealer') {
      table = 'dealers_details';
      idColumn = 'dealers_id';
    } else if (type === 'online_customer') {
      table = 'onlinecustomer_details';
      idColumn = 'onlinecustomer_id';
    } else {
      return res.status(400).json({ error: 'Invalid type. Must be "customer", "dealer", or "online_customer".' });
    }

    // Fetch current balance and details
    const balanceQuery = `SELECT name, phone, email,address, balance FROM ${table} WHERE id = $1`;
    const result = await db.query(balanceQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    const { name, phone, email, address, balance } = result.rows[0];

    // Check if the total payment exceeds the balance
    if (totalPaid > balance) {
      return res.status(400).json({ error: 'Total payment amount exceeds balance' });
    }

    // Update balance in the table
    const newBalance = balance - totalPaid;
    const updateQuery = `
            UPDATE ${table}
            SET paid_amount = paid_amount + $1, balance = $2, lastmodified = CURRENT_TIMESTAMP
            WHERE id = $3
        `;
    await db.query(updateQuery, [totalPaid, newBalance, id]);

    // Create billing receipt
    const receiptInsertQuery = `
            INSERT INTO billing_receipt (name, phone, email, billing_address, dealer_or_customer, total_amount, paid_amount, balance, billing_createdby, ${idColumn}, type)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id
        `;
    const receiptValues = [
      name,
      phone,
      email,
      address, // Replace with actual billing address if required
      type,
      totalPaid, // Total billed amount (this payment only)
      totalPaid, // Paid amount
      newBalance, // Remaining balance
      created_by,
      id, // ID of the customer, dealer, or online customer
      "Balance",
    ];
    const receiptResult = await db.query(receiptInsertQuery, receiptValues);
    const receiptId = receiptResult.rows[0].id;

    // Add payment details for each payment method
    const paymentInsertQuery = `
            INSERT INTO payment_details (receipt_id, payment_method, amount)
            VALUES ($1, $2, $3)
        `;
    for (const payment of payments) {
      await db.query(paymentInsertQuery, [receiptId, payment.method, payment.amount]);
    }

    // Respond with success
    res.status(201).json({
      message: 'Payment successful and receipt generated',
      receiptId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

// API to update userRole
dashboard.put('/api/users/:id/role',
  validateJwt,
  authorizeRoles('admin'), async (req, res) => {
    const { id } = req.params;
    const { userRole } = req.body;
    const allowedRoles = ['admin', 'staff', 'customer', 'dealers'];
    // Input validation: Check if userRole exists and is valid
    if (!userRole) {
      return res.status(400).json({ error: 'userRole is required' });
    }


    try {
      const result = await db.query(
        `UPDATE Users 
             SET userRole = $1, lastModified = CURRENT_TIMESTAMP 
             WHERE id = $2 
             RETURNING *`,
        [userRole, id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.status(200).json({
        message: 'User role updated successfully',
        user: result.rows[0],
      });
    } catch (error) {
      console.error('Error updating userRole:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

// API to get all users in role with optional search
dashboard.get('/api/display/users/:role',
  validateJwt,
  authorizeRoles('admin'),
  async (req, res) => {
    console.log(`changerole${req.user}`)
    const { search } = req.query;
    const role = req.params.role.toLowerCase(); // Normalize case for role comparison
    const allowedRoles = ['admin', 'staff', 'customer', 'dealer']; // Valid roles

    try {
      // Validate role
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid userRole' });
      }

      let query = `SELECT id, userName, userRole, profilePic,name, lastModified FROM Users WHERE LOWER(userRole) = $1`;
      const values = [role];

      // Add search condition if search query is provided
      if (search) {
        query += ` AND userName ILIKE %$2% 
                       
                     `;
        values.push(`%${search.toLowerCase()}%`);
      }

      query += ` ORDER BY lastModified DESC`;

      const result = await db.query(query, values);

      res.status(200).json({
        message: 'Users retrieved successfully',
        users: result.rows,
      });
    } catch (error) {
      console.error('Error retrieving users:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

dashboard.get("/api/billing/:receipt_no", async (req, res) => {
  const { receipt_no } = req.params;

  try {
    // Step 1: Fetch billing receipt with its related payment details and billing items
    const billingQuery = `
        SELECT 
          br.id AS receipt_id,
          br.receipt_no,
          br.name AS customer_name,
          br.phone,
          br.billing_address,
          br.shipping_address,
          br.dealer_or_customer,
          br.total_amount,
          br.balance,
          br.billing_createdby,
          br.datetime,
          br.lastmodified,
          pd.payment_method,
          pd.amount AS payment_amount,
          bi.item_name,
          bi.model,
          bi.mrp,
          bi.serial_no,
          bi.retail_price
        FROM billing_receipt br
        LEFT JOIN payment_details pd ON pd.receipt_id = br.id
        LEFT JOIN billing_items bi ON bi.receipt_no = br.receipt_no
        WHERE br.receipt_no = $1
      `;

    const result = await db.query(billingQuery, [receipt_no]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Billing receipt not found" });
    }

    // Step 2: Group the results by the billing receipt, including related payment details and items
    const billingReceipt = {
      receipt_id: result.rows[0].receipt_id,
      receipt_no: result.rows[0].receipt_no,
      customer_name: result.rows[0].customer_name,
      phone: result.rows[0].phone,
      billing_address: result.rows[0].billing_address,
      shipping_address: result.rows[0].shipping_address,
      dealer_or_customer: result.rows[0].dealer_or_customer,
      total_amount: result.rows[0].total_amount,
      balance: result.rows[0].balance,
      billing_createdby: result.rows[0].billing_createdby,
      datetime: result.rows[0].datetime,
      lastmodified: result.rows[0].lastmodified,
      payment_details: [],
      billing_items: [],
    };

    // Populate payment_details and billing_items arrays
    result.rows.forEach(row => {
      if (row.payment_method && row.payment_amount) {
        billingReceipt.payment_details.push({
          payment_method: row.payment_method,
          amount: row.payment_amount,
        });
      }

      if (row.item_name && row.serial_no) {
        billingReceipt.billing_items.push({
          item_name: row.item_name,
          model: row.model,
          mrp: row.mrp,
          serial_no: row.serial_no,
          retail_price: row.retail_price,
        });
      }
    });

    // Step 3: Send the response
    return res.status(200).json(billingReceipt);
  } catch (error) {
    console.error("Error fetching billing receipt:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});


dashboard.get('/api/recent-bills', async (req, res) => {
  // Get the search term from the query string
  const { search_term } = req.query;

  // Base query to fetch data
  let query = `
    SELECT 
      br.id AS billing_id,
      br.receipt_no,
      br.name AS customer_name,
      br.phone,
      br.email,
      br.billing_address,
      br.shipping_address,
      br.dealer_or_customer,
      br.total_amount,
      br.paid_amount,
      br.balance,
      br.billing_createdby,
      br.datetime AS billing_datetime,
      br.lastmodified,
      -- Aggregate payments into an array of objects
      COALESCE(
        JSON_AGG(
          DISTINCT jsonb_build_object(
            'payment_method', pd.payment_method,
            'payment_amount', pd.amount
          )
        ) FILTER (WHERE pd.id IS NOT NULL), '[]') AS payments,
      -- Aggregate items into an array of objects
      COALESCE(
        JSON_AGG(
          DISTINCT jsonb_build_object(
            'item_name', bi.item_name,
            'model', bi.model,
            'mrp', bi.mrp,
            'serial_no', bi.serial_no,
            'retail_price', bi.retail_price,
            'item_type', bi.type
          )
        ) FILTER (WHERE bi.id IS NOT NULL), '[]') AS items
    FROM 
      billing_receipt br
    LEFT JOIN 
      payment_details pd ON br.id = pd.receipt_id
    LEFT JOIN 
      billing_items bi ON br.receipt_no = bi.receipt_no
  `;

  // Create an array to hold the query parameters
  const queryParams = [];

  // If search term is provided, add conditions to the query
  if (search_term) {
    query += `
      WHERE 
        br.name ILIKE $1 OR
        br.phone ILIKE $1 OR
        br.receipt_no ILIKE $1
    `;
    queryParams.push(`%${search_term}%`); // Add search term to query parameters
  }

  // Add the GROUP BY and ORDER BY clauses
  query += `
    GROUP BY br.id
    ORDER BY br.lastmodified DESC
  `;

  try {
    // Execute the query with dynamic parameters (search term if provided)
    const result = await db.query(query, queryParams);

    // Send the result as a JSON response
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching recent billing details:', err);
    res.status(500).send('Internal Server Error');
  }
});

dashboard.get("/api/billing/totalsales/all", async (req, res) => {
  try {
    // Helper function to format date for queries
    const formatDate = (date) => {
      return date.toISOString().split('T')[0]; // Formats date as 'YYYY-MM-DD'
    };

    // Get the current date
    const currentDate = new Date();

    // Define the periods (1 day, 7 days, 1 month, 6 months, 1 year)
    const periods = [
      { period: '1 day', date: new Date(currentDate.setDate(currentDate.getDate() - 1)) },
      { period: '7 days', date: new Date(currentDate.setDate(currentDate.getDate() - 7)) },
      { period: '1 month', date: new Date(currentDate.setMonth(currentDate.getMonth() - 1)) },
      { period: '6 months', date: new Date(currentDate.setMonth(currentDate.getMonth() - 6)) },
      { period: '1 year', date: new Date(currentDate.setFullYear(currentDate.getFullYear() - 1)) },
    ];

    // Function to query total sales for each period
    const totalSalesQuery = (startDate) => {
      return `
          SELECT 
            COUNT(id) AS total_receipts,
            SUM(total_amount) AS total_sales
          FROM billing_receipt
          WHERE datetime >= '${formatDate(startDate)}'
        `;
    };

    // Get sales data for each period
    const salesData = await Promise.all(periods.map(async (period) => {
      const result = await db.query(totalSalesQuery(period.date));
      return {
        period: period.period,
        total_receipts: result.rows[0].total_receipts || 0,
        total_sales: result.rows[0].total_sales || 0
      };
    }));

    // Step 2: Return the total sales and receipt count for each period
    return res.status(200).json({
      message: "Total sales and receipt data fetched successfully",
      data: salesData,
    });
  } catch (error) {
    console.error("Error fetching total sales:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

dashboard.get("/api/billing/totalsales/all2", async (req, res) => {
  try {
    // Helper function to format date for queries
    const formatDate = (date) => {
      return date.toISOString().split('T')[0]; // Formats date as 'YYYY-MM-DD'
    };

    // Get the current date
    const currentDate = new Date();

    // Define the periods (1 day, 7 days, 1 month, 6 months, 1 year)
    const periods = [
      { period: '1 day', date: new Date(currentDate.setDate(currentDate.getDate() - 1)) },
      { period: '7 days', date: new Date(currentDate.setDate(currentDate.getDate() - 7)) },
      { period: '1 month', date: new Date(currentDate.setMonth(currentDate.getMonth() - 1)) },
      { period: '6 months', date: new Date(currentDate.setMonth(currentDate.getMonth() - 6)) },
      { period: '1 year', date: new Date(currentDate.setFullYear(currentDate.getFullYear() - 1)) },
    ];

    // Function to query total sales and receipt details for each period
    const salesAndReceiptsQuery = (startDate) => {
      return `
          SELECT 
            br.id AS receipt_id,
            br.receipt_no,
            br.name AS customer_name,
            br.phone,
            br.billing_address,
            br.shipping_address,
            br.dealer_or_customer,
            br.total_amount,
            br.balance,
            br.billing_createdby,
            br.datetime,   -- Billing creation timestamp
            br.lastmodified, -- Last modified timestamp
            pd.payment_method,
            pd.amount AS payment_amount,
            bi.item_name,
            bi.model,
            bi.mrp,
            bi.serial_no,
            bi.retail_price
          FROM billing_receipt br
          LEFT JOIN payment_details pd ON br.id = pd.receipt_id
          LEFT JOIN billing_items bi ON br.receipt_no = bi.receipt_no
          WHERE br.datetime >= '${formatDate(startDate)}'
          ORDER BY br.datetime DESC
        `;
    };

    // Get sales data for each period
    const salesData = await Promise.all(periods.map(async (period) => {
      const result = await db.query(salesAndReceiptsQuery(period.date));

      // Format the results to group payments and items under each receipt
      const billingReceipts = [];
      let currentReceipt = null;

      result.rows.forEach(row => {
        // Check if we are still processing the same receipt
        if (!currentReceipt || currentReceipt.receipt_id !== row.receipt_id) {
          if (currentReceipt) billingReceipts.push(currentReceipt);
          currentReceipt = {
            receipt_id: row.receipt_id,
            receipt_no: row.receipt_no,
            customer_name: row.customer_name,
            phone: row.phone,
            billing_address: row.billing_address,
            shipping_address: row.shipping_address,
            dealer_or_customer: row.dealer_or_customer,
            total_amount: row.total_amount,
            balance: row.balance,
            billing_createdby: row.billing_createdby,
            datetime: row.datetime,
            lastmodified: row.lastmodified,
            payments: [],
            items: []
          };
        }

        // Add payment details to the current receipt
        if (row.payment_method && row.payment_amount) {
          currentReceipt.payments.push({
            payment_method: row.payment_method,
            payment_amount: row.payment_amount
          });
        }

        // Add billing item details to the current receipt
        if (row.item_name) {
          currentReceipt.items.push({
            item_name: row.item_name,
            model: row.model,
            mrp: row.mrp,
            serial_no: row.serial_no,
            retail_price: row.retail_price
          });
        }
      });

      // Push the last receipt
      if (currentReceipt) billingReceipts.push(currentReceipt);

      return {
        period: period.period,
        total_receipts: billingReceipts.length,
        total_sales: billingReceipts.reduce((sum, receipt) => sum + parseFloat(receipt.total_amount), 0),
        receipts: billingReceipts
      };
    }));

    // Step 2: Return the total sales, receipt count, and receipt details for each period
    return res.status(200).json({
      message: "Total sales, receipt details, and payment information fetched successfully",
      data: salesData,
    });
  } catch (error) {
    console.error("Error fetching total sales:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

dashboard.get("/api/billing/search", async (req, res) => {
  try {
    // Get the search parameters from the query string
    const { phone, name, receipt_no } = req.query;

    // Start building the SQL query dynamically
    let query = `
        SELECT 
          br.id AS receipt_id,
          br.receipt_no,
          br.name AS customer_name,
          br.phone,
          br.billing_address,
          br.shipping_address,
          br.dealer_or_customer,
          br.total_amount,
          br.balance,
          br.billing_createdby,
          br.datetime,   -- Billing creation timestamp
          br.lastmodified, -- Last modified timestamp
          pd.payment_method,
          pd.amount AS payment_amount,
          bi.item_name,
          bi.model,
          bi.mrp,
          bi.serial_no,
          bi.retail_price
        FROM billing_receipt br
        LEFT JOIN payment_details pd ON br.id = pd.receipt_id
        LEFT JOIN billing_items bi ON br.receipt_no = bi.receipt_no
        WHERE 1=1
      `;

    // Dynamically add conditions based on provided parameters
    if (phone) {
      query += ` AND br.phone LIKE '%${phone}%'`;
    }
    if (name) {
      query += ` AND br.name ILIKE '%${name}%'`;
    }
    if (receipt_no) {
      query += ` AND br.receipt_no = '${receipt_no}'`;
    }

    // Execute the query
    const result = await db.query(query);

    // If no results are found, return a 404
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No matching billing receipts found" });
    }

    // Format the results to group payments and items under each receipt
    const billingReceipts = [];
    let currentReceipt = null;

    result.rows.forEach(row => {
      // Check if we are still processing the same receipt
      if (!currentReceipt || currentReceipt.receipt_id !== row.receipt_id) {
        if (currentReceipt) billingReceipts.push(currentReceipt);
        currentReceipt = {
          receipt_id: row.receipt_id,
          receipt_no: row.receipt_no,
          customer_name: row.customer_name,
          phone: row.phone,
          billing_address: row.billing_address,
          shipping_address: row.shipping_address,
          dealer_or_customer: row.dealer_or_customer,
          total_amount: row.total_amount,
          balance: row.balance,
          billing_createdby: row.billing_createdby,
          datetime: row.datetime,
          lastmodified: row.lastmodified,
          payments: [],
          items: []
        };
      }

      // Add payment details to the current receipt
      if (row.payment_method && row.payment_amount) {
        currentReceipt.payments.push({
          payment_method: row.payment_method,
          payment_amount: row.payment_amount
        });
      }

      // Add billing item details to the current receipt
      if (row.item_name) {
        currentReceipt.items.push({
          item_name: row.item_name,
          model: row.model,
          mrp: row.mrp,
          serial_no: row.serial_no,
          retail_price: row.retail_price
        });
      }
    });

    // Push the last receipt
    if (currentReceipt) billingReceipts.push(currentReceipt);

    // Step 2: Return the search results with receipt details
    return res.status(200).json({
      message: "Billing receipts fetched successfully",
      data: billingReceipts
    });
  } catch (error) {
    console.error("Error searching for billing receipts:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

dashboard.get("/api/things/receipt/:serial_no", async (req, res) => {

  const { serial_no } = req.params;

  if (!serial_no) {
    return res.status(400).json({ error: "Serial number is required" });
  }

  try {
    const client = await db.connect();

    // Query to get the thing details by serial_no
    const result = await client.query(
      `SELECT 
          t.id AS thing_id,
          t.serial_no,
          t.thingName AS thing_name,
          t.model,
          p.mrp,
          p.retail_price,
          a.stock_status
        FROM Things t
        LEFT JOIN price_table p ON t.model = p.model
        LEFT JOIN AdminStock a ON t.id = a.thing_id
        WHERE t.serial_no = $1`,
      [serial_no]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Thing not found with the provided serial number" });
    }

    const thing = result.rows[0];

    // Check if the thing is available in the stock
    if (!thing.stock_status || thing.stock_status !== "available") {
      return res.status(400).json({
        error: "Thing is not available in the stock",
      });
    }

    res.status(200).json({ data: thing });
  } catch (error) {
    console.error("Error fetching thing details:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API Endpoint: Find Receipt Bill
dashboard.get("/api/billing/receipt/:type/:id", async (req, res) => {
  const { type, id } = req.params;
  const { search } = req.query; // Search parameter

  // Validate input
  if (!["dealer", "customer", "onlinecustomer"].includes(type)) {
    return res.status(400).json({ error: "Invalid type. Allowed values: dealer, customer, onlinecustomer." });
  }

  if (!id) {
    return res.status(400).json({ error: "ID parameter is required." });
  }

  let query = `
    SELECT 
        br.id AS receipt_id,
        br.receipt_no,
        br.name AS receipt_name,
        br.phone AS receipt_phone,
        br.billing_address,
        br.total_amount,
        br.paid_amount,
        br.balance,
        br.type AS transaction_type,
        br.datetime AS receipt_date,
        CASE 
            WHEN br.dealers_id IS NOT NULL THEN 'Dealer'
            WHEN br.customers_id IS NOT NULL THEN 'Customer'
            WHEN br.onlinecustomer_id IS NOT NULL THEN 'Online Customer'
            ELSE 'Unknown'
        END AS user_type,
        COALESCE(dd.name, cd.name, od.name) AS user_name,
        COALESCE(dd.phone, cd.phone, od.phone) AS user_phone,
        COALESCE(dd.address, cd.address, od.address) AS user_address
    FROM 
        billing_receipt br
    LEFT JOIN 
        dealers_details dd ON br.dealers_id = dd.id
    LEFT JOIN 
        customers_details cd ON br.customers_id = cd.id
    LEFT JOIN 
        onlinecustomer_details od ON br.onlinecustomer_id = od.id
    WHERE 
  `;

  // Add WHERE condition based on `type`
  let condition = "";
  const queryParams = [id];

  if (type === "dealer") {
    condition = "br.dealers_id = $1";
  } else if (type === "customer") {
    condition = "br.customers_id = $1";
  } else if (type === "onlinecustomer") {
    condition = "br.onlinecustomer_id = $1";
  }

  query += condition;

  // Add search condition if `search` parameter is provided
  if (search) {
    query += `
      AND (
        br.receipt_no ILIKE $2 OR
        br.name ILIKE $2 OR
        br.phone ILIKE $2 OR
        COALESCE(dd.name, cd.name, od.name) ILIKE $2
      )
    `;
    queryParams.push(`%${search}%`);
  }

  try {
    const client = await db.connect();
    const result = await client.query(query, queryParams);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: `No receipts found for ${type} with ID ${id}.` });
    }

    res.status(200).json({ receipts: result.rows });
    client.release();
  } catch (error) {
    console.error("Error fetching receipt:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

//warranty
dashboard.get("/api/warranty/:serial_no", async (req, res) => {
  const { serial_no } = req.params;

  if (!serial_no) {
    return res.status(400).json({ error: "Serial number is required" });
  }

  const client = await db.connect();

  try {
    // Fetch warranty details
    const warrantyQuery = await client.query(
      `
        SELECT 
          w.id AS warranty_id,
          w.serial_no,
          w.receipt_id,
          w.date AS warranty_start_date,
          w.due_date AS warranty_expiration_date,
          r.name AS customer_name,
          r.phone AS customer_phone,
          r.datetime AS receipt_date
        FROM 
          thing_warranty w
        JOIN 
          billing_receipt r
        ON 
          w.receipt_id = r.id
        WHERE 
          w.serial_no = $1
        `,
      [serial_no]
    );

    if (warrantyQuery.rows.length === 0) {
      return res.status(404).json({ error: `No warranty found for serial number: ${serial_no}` });
    }

    return res.status(200).json({
      message: "Warranty details retrieved successfully",
      warranty_details: warrantyQuery.rows[0],
    });
  } catch (error) {
    console.error("Error fetching warranty details:", error);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

dashboard.get("/api/display/warranty/thing", async (req, res) => {
  const { search } = req.query; // Single search term

  const client = await db.connect();

  try {
    let query = `
      SELECT 
        w.id AS warranty_id,
        w.serial_no,
        w.receipt_id,
        w.date AS warranty_start_date,
        w.due_date AS warranty_expiration_date,
        r.name AS customer_name,
        r.phone AS customer_phone,
        r.email AS customer_email,
        r.datetime AS receipt_date
      FROM 
        thing_warranty w
      JOIN 
        billing_receipt r
      ON 
        w.receipt_id = r.id
    `;

    let values = [];

    if (search) {
      query += ` WHERE 
        w.serial_no ILIKE $1 
        OR r.name ILIKE $1 
        OR r.phone ILIKE $1
      `;
      values.push(`%${search}%`);
    }

    query += ` ORDER BY w.date DESC`; // Sort by warranty start date

    const warrantyQuery = await client.query(query, values);

    return res.status(200).json({
      message: "Warranty details retrieved successfully",
      warranty_details: warrantyQuery.rows,
    });
  } catch (error) {
    console.error("Error fetching warranty details:", error);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

//display warranties with search
dashboard.get('/warranties', async (req, res) => {
  const { search, sort = 'DESC' } = req.query; // Get the search term and sort order from query parameters
  try {
    const allowedSort = ['ASC', 'DESC'];
    const order = allowedSort.includes(sort.toUpperCase()) ? sort.toUpperCase() : 'ASC';

    const result = await db.query(
      `SELECT 
            tw.id AS warranty_id,
            tw.serial_no,
            tw.date AS warranty_start_date,
            tw.due_date AS warranty_due_date,
            br.receipt_no,
            br.name AS customer_or_dealer_name,
            br.phone,
            br.email,
            br.billing_address,
            br.shipping_address,
            br.total_amount,
            br.paid_amount,
            br.balance,
            br.type,
            br.datetime AS billing_date
         FROM 
            thing_warranty tw
         JOIN 
            billing_receipt br
         ON 
            tw.receipt_id = br.id
         WHERE 
            $1::TEXT IS NULL 
            OR tw.serial_no ILIKE '%' || $1::TEXT || '%'
            OR br.receipt_no ILIKE '%' || $1::TEXT || '%'
         ORDER BY 
            tw.date ${order};`, // Dynamically set ASC or DESC for sorting
      [search || null]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve warranties' });
  }
});

// API to insert data into the dealers_details table
dashboard.post('/api/create/account/for/:Party',
  validateJwt,
  authorizeRoles('admin', 'dealer'),
  async (req, res) => {
    const { table } = req.params.Party;
    const { name, address, email, phone, alt_phone } = req.body;

    // Validate required fields
    if (!name || !address || !phone) {
      return res.status(400).json({ error: 'Name, address, and phone are required fields.' });
    }

    try {
      const query = `
      INSERT INTO ${table}_details 
      (name, address, email, phone, alt_phone) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING *;
    `;
      const values = [name, address, email, phone, alt_phone];

      const client = await db.connect();
      const result = await client.query(query, values);
      client.release();

      res.status(201).json({
        message: 'Dealer data inserted successfully.',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Error inserting data:', error);
      res.status(500).json({ error: 'An error occurred while inserting dealer data.' });
    }
  });

//Api to display
dashboard.get('/api/display/party/:Party',
  validateJwt,
  authorizeRoles('admin'),
  async (req, res) => {
    const { Party } = req.params; // Get the table name from route parameters
    const { query } = req.query; // Get search query from query parameters (optional)

    // Validate the Party parameter
    const validParties = ['onlinecustomer', 'customers', 'dealers'];

    if (!validParties.includes(Party)) {
      return res.status(400).json({ error: 'Invalid Party parameter. Must be one of: onlinecustomer, customers, dealers.' });
    }

    try {
      console.log(`party table${Party}`) 
      // Construct the table name dynamically
      const tableName = `${Party}_details`;

      // SQL query for fetching data
      let sql = `SELECT * FROM ${tableName}`;
      const values = [];

      // Add search functionality if a query is provided
      if (query) {
        sql += ` WHERE name ILIKE $1 OR address ILIKE $1 OR phone ILIKE $1`;
        values.push(`%${query}%`); // Case-insensitive matching
      }

      const client = await db.connect();
      const result = await client.query(sql, values);
      client.release();

      // Respond with the fetched data
      res.status(200).json({
        message: `Data retrieved successfully from ${tableName}.`,
        data: result.rows,
      });
    } catch (error) {
      console.error('Error fetching data:', error);
      res.status(500).json({ error: 'An error occurred while fetching data.' });
    }
  });
// dashboard.get('/api/display/party/:Party',
//   // validateJwt,
//   // authorizeRoles('admin', 'dealer'),
//   async (req, res) => {
//     const { Party } = req.params; // Get the table name from route parameters
//     const { query } = req.query; // Get search query from query parameters (optional)

//     // Validate the Party parameter
//     const validParties = ['onlinecustomer', 'customers', 'dealers'];
//     if (!validParties.includes(Party)) {
//       return res.status(400).json({ error: 'Invalid Party parameter. Must be one of: onlinecustomer, customers, dealers.' });
//     }

//     try {
//       let sql, values, tableName;

//       if (req.user.role === "admin") {
//         // Admin-specific logic
//         tableName = `${Party}_details`;
//         sql = `SELECT * FROM ${tableName} WHERE addedby=$1`;
//         values = [req.user.id];

//         if (query) {
//           sql += ` AND (name ILIKE $2 OR address ILIKE $2 OR phone ILIKE $2)`;
//           values.push(`%${query}%`); // Case-insensitive matching
//         }
//       } else if (req.user.role === "dealer") {
//         // Dealer-specific logic
//         tableName = `customers_details`;
//         sql = `SELECT * FROM ${tableName} WHERE addedby=$1`;
//         values = [req.user.id];

//         if (query) {
//           sql += ` AND (name ILIKE $2 OR address ILIKE $2 OR phone ILIKE $2)`;
//           values.push(`%${query}%`); // Case-insensitive matching
//         }
//       } else {
//         return res.status(403).json({ error: 'Unauthorized access.' });
//       }

//       // Execute query
//       const client = await db.connect();
//       const result = await client.query(sql, values);
//       client.release();

//       // Respond with the fetched data
//       res.status(200).json({
//         message: `Data retrieved successfully from ${tableName}.`,
//         data: result.rows,
//       });
//     } catch (error) {
//       console.error('Error fetching data:', error);
//       res.status(500).json({ error: 'An error occurred while fetching data.' });
//     }
//   }
// );

//delete account 
dashboard.delete('/api/delete/account/for/:Party/:id',
  validateJwt,
  authorizeRoles('admin', 'dealer'),
  async (req, res) => {
    const { Party, id } = req.params;

    // Validate the id
    if (!id) {
      return res.status(400).json({ error: 'ID is required.' });
    }

    try {
      // Construct the table name dynamically based on the Party parameter
      const table = `${Party}_details`;

      // Create the DELETE query
      const query = `
        DELETE FROM ${table} WHERE id = $1 RETURNING *;
      `;

      // Execute the query
      const client = await db.connect();
      const result = await client.query(query, [id]);
      client.release();

      // Check if any record was deleted
      if (result.rowCount === 0) {
        return res.status(404).json({ error: `No record found with ID ${id}.` });
      }

      res.status(200).json({
        message: 'Record deleted successfully.',
        deleted_data: result.rows[0],
      });
    } catch (error) {
      console.error('Error deleting record:', error);
      res.status(500).json({ error: 'An error occurred while deleting the record.' });
    }
  });

//update account datas
dashboard.put('/api/update/account/for/:Party/:id',
  validateJwt,
  authorizeRoles('admin'),
  async (req, res) => {
    const { Party, id } = req.params;
    const { name, address, email, phone, alt_phone } = req.body;

    // Validate the required fields
    if (!name && !address && !phone && !alt_phone && !email) {
      return res.status(400).json({ error: 'At least one field to update is required.' });
    }

    try {
      // Construct the table name dynamically based on the Party parameter
      const table = `${Party}_details`;

      // Build the SET clause of the query dynamically based on provided fields
      let setClause = [];
      let values = [];

      if (name) {
        setClause.push(`name = $${setClause.length + 1}`);
        values.push(name);
      }
      if (address) {
        setClause.push(`address = $${setClause.length + 1}`);
        values.push(address);
      }
      if (email) {
        setClause.push(`email = $${setClause.length + 1}`);
        values.push(email);
      }
      if (phone) {
        setClause.push(`phone = $${setClause.length + 1}`);
        values.push(phone);
      }
      if (alt_phone) {
        setClause.push(`alt_phone = $${setClause.length + 1}`);
        values.push(alt_phone);
      }

      // Append the id as the last parameter to the query
      values.push(id);

      // Construct the final query string
      const query = `
      UPDATE ${table} 
      SET ${setClause.join(', ')} 
      WHERE id = $${values.length} 
      RETURNING *;
    `;

      // Execute the query
      const client = await db.connect();
      const result = await client.query(query, values);
      client.release();

      // Check if any record was updated
      if (result.rowCount === 0) {
        return res.status(404).json({ error: `No record found with ID ${id}.` });
      }

      res.status(200).json({
        message: 'Record updated successfully.',
        updated_data: result.rows[0],
      });
    } catch (error) {
      console.error('Error updating record:', error);
      res.status(500).json({ error: 'An error occurred while updating the record.' });
    }
  });

// Create a new entry in the price_table

dashboard.post('/api/create/price_table',
  validateJwt,
  authorizeRoles('admin'),
  async (req, res) => {
    const { model, mrp, retail_price, discount, warranty_period, sgst, cgst, igst } = req.body;

    // Function to validate warranty_period
    function isValidWarrantyPeriod(warrantyPeriod) {
      const regex = /^\d+\s?(years?|months?|days?)((\s\d+\s?(years?|months?|days?))?)*$/i;
      return regex.test(warrantyPeriod);
    }

    // Validate input data
    if (!model || !mrp || !retail_price) {
      return res.status(400).json({ error: 'Missing required fields: model, mrp, retail_price, or tax' });
    }

    if (warranty_period && !isValidWarrantyPeriod(warranty_period)) {
      return res.status(400).json({
        error: 'Invalid warranty period format. Use formats like "2 years", "6 months", or "1 year 6 months".',
      });
    }
    try {
      const checkModelQuery = 'SELECT * FROM price_table WHERE model ILIKE $1';
      const existingModel = await db.query(checkModelQuery, [model]);

      if (existingModel.rows.length > 0) {
        return res.status(400).json({ error: 'Model already exists in the price table.' });
      }

      if (existingModel.rows.length > 0) {
        return res.status(400).json({ error: 'Model already exists in the price table.' });
      }

      const result = await db.query(
        `INSERT INTO price_table (model, mrp, retail_price, discount, warranty_period,sgst,cgst,igst)
       VALUES ($1, $2, $3, $4, $5::INTERVAL,$6,$7,$8) RETURNING *`,
        [model, mrp, retail_price, discount, warranty_period, sgst, cgst, igst]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create entry' });
    }
  });

dashboard.post("/api/create/model_details",
    // validateJwt,
    // authorizeRoles("admin"),
    async (req, res) => {
      const { model, mrp, retail_price, discount, warranty_period, sgst, cgst, igst, features } = req.body;
  
      // Function to validate warranty_period
      function isValidWarrantyPeriod(warrantyPeriod) {
        const regex = /^\d+\s?(years?|months?|days?)((\s\d+\s?(years?|months?|days?))?)*$/i;
        return regex.test(warrantyPeriod);
      }
  
      // Validate input data
      if (!model || !mrp || !retail_price) {
        return res.status(400).json({ error: "Missing required fields: model, mrp, retail_price." });
      }
  
      if (warranty_period && !isValidWarrantyPeriod(warranty_period)) {
        return res.status(400).json({
          error: 'Invalid warranty period format. Use formats like "2 years", "6 months", or "1 year 6 months".',
        });
      }
  
      const client = await db.connect(); // Start a transaction
  
      try {
        await client.query("BEGIN"); // Begin transaction
  
        // Check if model already exists
        const checkModelQuery = "SELECT * FROM price_table WHERE model ILIKE $1";
        const existingModel = await client.query(checkModelQuery, [model]);
  
        if (existingModel.rows.length > 0) {
          return res.status(400).json({ error: "Model already exists in the price table." });
        }
  
        // Insert model into price_table
        const insertModelQuery = `
          INSERT INTO price_table (model, mrp, retail_price, discount, warranty_period, sgst, cgst, igst)
          VALUES ($1, $2, $3, $4, $5::INTERVAL, $6, $7, $8) RETURNING *;
        `;
        const modelResult = await client.query(insertModelQuery, [
          model,
          mrp,
          retail_price,
          discount,
          warranty_period,
          sgst,
          cgst,
          igst,
        ]);
  
        const modelId = modelResult.rows[0].id; // Get the newly inserted model ID
  
        // Insert features if provided
        if (Array.isArray(features) && features.length > 0) {
          const insertFeaturesQuery = `
            INSERT INTO model_features (model_id, feature, feature_value)
            VALUES ${features.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(", ")}
            RETURNING *;
          `;
  
          const featureValues = [modelId, ...features.flatMap(({ feature, feature_value }) => [feature, feature_value || null])];
  
          await client.query(insertFeaturesQuery, featureValues);
        }
  
        await client.query("COMMIT"); // Commit transaction
  
        res.status(201).json({
          message: "Model and features added successfully",
          model: modelResult.rows[0],
        });
      } catch (err) {
        await client.query("ROLLBACK"); // Rollback transaction on error
        console.error(err);
        res.status(500).json({ error: "Failed to create entry" });
      } finally {
        client.release(); // Release client
      }
    }
  );

dashboard.put('/api/model/features/update/:model_id/:id',
    // validateJwt,
    // authorizeRoles('admin'),
    async (req, res) => {
      console.log("update features working")
      const { model_id, id } = req.params;
      const { feature, feature_value } = req.body;
      console.log(feature, feature_value)
      try {
        // Dynamically build the update query
        const updates = [];
        const values = [];
        let queryIndex = 1;
  
        if (feature !== undefined) {
          updates.push(`feature = $${queryIndex++}`);
          values.push(feature);
        }
        if (feature_value !== undefined) {
          updates.push(`feature_value = $${queryIndex++}`);
          values.push(feature_value);
        }
        
        console.log(`update ====${req.body}`)
        // If no fields to update, return an error
        if (updates.length === 0) {
          console.log(updates.length)
          return res.status(400).json({ error: 'No valid fields provided for update' });
        }
  
        // Add model_id and id as the last parameters
        values.push(model_id, id);
  
        const updateQuery = `
          UPDATE model_features
          SET ${updates.join(', ')}, created_at = CURRENT_TIMESTAMP
          WHERE model_id = $${queryIndex++} AND id = $${queryIndex};
        `;
  
        const result = await db.query(updateQuery, values);
        console.log(`final==${result.rowCount}`)
        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Feature not found or no changes made' });
        }
  
        res.status(200).json({ message: 'Feature updated successfully' });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update model feature', message: err.message });
      }
    }
  );


dashboard.delete('/api/model/features/delete/:model_id/:id',
    validateJwt,
    authorizeRoles('admin'),
    async (req, res) => {
      const { model_id, id } = req.params;
  
      try {
        const deleteQuery = `
          DELETE FROM model_features
          WHERE model_id = $1 AND id = $2
          RETURNING *;
        `;
  
        const result = await db.query(deleteQuery, [model_id, id]);
  
        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Feature not found or already deleted' });
        }
  
        res.status(200).json({ message: 'Feature deleted successfully' });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete model feature', message: err.message });
      }
    }
  );  
dashboard.post('/api/model/features/add/:model_id',
    validateJwt,
    authorizeRoles('admin'),
    async (req, res) => {
      const { model_id } = req.params;
      const { feature, feature_value } = req.body;
  
      if (!feature) {
        return res.status(400).json({ error: 'Feature is required' });
      }
  
      try {
        const insertQuery = `
          INSERT INTO model_features (model_id, feature, feature_value, created_at)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
          RETURNING *;
        `;
  
        const values = [model_id, feature, feature_value || null];
  
        const result = await db.query(insertQuery, values);
  
        res.status(201).json({ message: 'Feature added successfully', data: result.rows[0] });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to add model feature', message: err.message });
      }
    }
  ); 
  
// Read all entries from the price_table
// dashboard.get('/api/display/prices-table',
//   validateJwt,
//   authorizeRoles('admin', 'dealer'),
//   async (req, res) => {
//     console.log(`working pricetable ${req.user} `)
//     const { search } = req.query; // Get the search query from the request

//     try {
//       // Base query
//       let query = 'SELECT * FROM price_table';
//       const params = [];

//       // Add search condition if a search query is provided
//       if (search) {
//         query += ' WHERE model ILIKE $1'; // Use ILIKE for case-insensitive search
//         params.push(`%${search}%`); // Add wildcards for partial matching
//       }

//       // Execute the query
//       const result = await db.query(query, params);
//       res.status(200).json(result.rows);
//     } catch (err) {
//       console.error(err);
//       res.status(500).json({ error: 'Failed to retrieve prices' });
//     }
//   });

dashboard.get("/api/display/prices-table",
    //  validateJwt, authorizeRoles("admin","dealer"), 
     async (req, res) => {
    try {
      const query = `
        WITH FirstThing AS (
          SELECT DISTINCT ON (t.model) t.id AS thing_id, t.model
          FROM Things t
          ORDER BY t.model, t.id ASC
        )
        SELECT 
          p.id AS price_id, p.model,P.lastmodified, p.mrp, p.retail_price, p.sgst, p.cgst, p.igst, p.discount, 
          jsonb_agg(DISTINCT jsonb_build_object('feature_id',f.id,'feature', f.feature, 'feature_value', f.feature_value)) AS features,
          jsonb_agg(DISTINCT jsonb_build_object('attributeName', ta.attributeName, 'attributeValue', ta.attributeValue)) AS attributes
        FROM price_table p
        LEFT JOIN model_features f ON p.id = f.model_id
        LEFT JOIN FirstThing ft ON p.model = ft.model
        LEFT JOIN ThingAttributes ta ON ft.thing_id = ta.thingId
        GROUP BY p.id;
      `;
  
      const { rows } = await db.query(query);
  
      if (rows.length === 0) {
        return res.status(404).json({ message: "No models found" });
      }
  
      res.status(200).json({
        message: "All model details retrieved successfully",
        data: rows
      });
  
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch data" });
    }
  });

// dashboard.get("/api/display/prices-table",
//     validateJwt, 
//     authorizeRoles("admin", "dealer"), 
//     async (req, res) => {
//       try {
//         // Step 1: Fetch price details for models
//         const query = `
//           WITH FirstThing AS (
//             SELECT DISTINCT ON (t.model) t.id AS thing_id, t.model
//             FROM Things t
//             ORDER BY t.model, t.id ASC
//           )
//           SELECT 
//             p.id AS price_id, 
//             p.model, 
//             p.mrp, 
//             p.retail_price, 
//             p.sgst, 
//             p.cgst, 
//             p.igst, 
//             p.discount, 
//             jsonb_agg(DISTINCT jsonb_build_object('feature', f.feature, 'feature_value', f.feature_value)) AS features,
//             jsonb_agg(DISTINCT jsonb_build_object('attributeName', ta.attributeName, 'attributeValue', ta.attributeValue)) AS attributes
//           FROM price_table p
//           LEFT JOIN model_features f ON p.id = f.model_id
//           LEFT JOIN FirstThing ft ON p.model = ft.model
//           LEFT JOIN ThingAttributes ta ON ft.thing_id = ta.thingId
//           GROUP BY p.id;
//         `;
    
//         const { rows } = await db.query(query);
    
//         if (rows.length === 0) {
//           return res.status(404).json({ message: "No models found" });
//         }
  
//         // Step 2: Get the role and email of the user (dealer or admin)
//         const user = await db.query('SELECT * FROM Users WHERE email = $1', [req.user.email]);
//         if (user.rows.length === 0) {
//           return res.status(404).json({ message: "User not found" });
//         }
  
//         const { role } = user.rows[0];
  
//         // Step 3: Initialize an array to store stock data
//         let stockData = [];
  
//         // Step 4: Fetch stock data based on user role
//         if (role === 'admin') {
//           // Admin: Get stock data from AdminStock
//           const adminStockQuery = `
//             SELECT t.model, COUNT(*) AS stock_count
//             FROM AdminStock a
//             JOIN Things t ON a.thingId = t.id
//             WHERE t.model IN (${rows.map((row) => `'${row.model}'`).join(', ')})
//             GROUP BY t.model;
//           `;
//           stockData = await db.query(adminStockQuery);
//         } else if (role === 'dealer') {
//           // Dealer: Get stock data from DealersStock
//           const dealerStockQuery = `
//             SELECT t.model, COUNT(*) AS stock_count
//             FROM DealersStock ds
//             JOIN Things t ON ds.thingid = t.id
//             WHERE ds.user_id = (SELECT id FROM dealers_details WHERE email = $1)
//             AND t.model IN (${rows.map((row) => `'${row.model}'`).join(', ')})
//             GROUP BY t.model;
//           `;
//           stockData = await db.query(dealerStockQuery, [req.user.email]);
//         }
  
//         // Step 5: Merge price and stock data by model
//         const mergedData = rows.map((price) => {
//           const stock = stockData.rows.find((stockItem) => stockItem.model === price.model);
//           return {
//             ...price,
//             stock_count: stock ? stock.stock_count : 0,  // Default to 0 if no stock data found
//           };
//         });
  
//         // Step 6: Return the merged data with price and stock count
//         res.status(200).json({
//           message: "All model details with stock retrieved successfully",
//           data: mergedData
//         });
//       } catch (err) {
//         console.error(err);
//         res.status(500).json({ error: "Failed to fetch data" });
//       }
//     });
  
// Read a single entry by ID
dashboard.get('/api/display/single/price_table/:id',
  validateJwt,
  authorizeRoles('admin'),
  async (req, res) => {
    const { id } = req.params;
    try {
      const result = await db.query('SELECT * FROM price_table WHERE id = $1', [id]);
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Price entry not found' });
      } else {
        res.status(200).json(result.rows[0]);
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to retrieve price entry' });
    }
  });

// Update an existing entry
dashboard.put('/api/update/price_table/:id',
  validateJwt,
  authorizeRoles('admin'),
  async (req, res) => {
    const { id } = req.params;
    const {
      model, mrp, retail_price, sgst, cgst, igst, discount, warranty_period
    } = req.body;

    // Function to validate warranty_period
    function isValidWarrantyPeriod(warrantyPeriod) {
      const regex = /^\d+\s?(years?|months?|days?)((\s\d+\s?(years?|months?|days?))?)*$/i;
      return regex.test(warrantyPeriod);
    }

    // Validate warranty_period if provided
    if (warranty_period && !isValidWarrantyPeriod(warranty_period)) {
      return res.status(400).json({
        error: 'Invalid warranty period format. Use formats like "2 years", "6 months", or "1 year 6 months".',
      });
    }

    try {
      const updates = [];
      const values = [];
      let queryIndex = 1;

      // Build query dynamically
      if (model !== undefined) {
        updates.push(`model = $${queryIndex++}`);
        values.push(model);
      }
      if (mrp !== undefined) {
        updates.push(`mrp = $${queryIndex++}`);
        values.push(mrp);
      }
      if (retail_price !== undefined) {
        updates.push(`retail_price = $${queryIndex++}`);
        values.push(retail_price);
      }
      if (sgst !== undefined) {
        updates.push(`sgst = $${queryIndex++}`);
        values.push(sgst);
      }
      if (cgst !== undefined) {
        updates.push(`cgst = $${queryIndex++}`);
        values.push(cgst);
      }
      if (igst !== undefined) {
        updates.push(`igst = $${queryIndex++}`);
        values.push(igst);
      }
      if (discount !== undefined) {
        updates.push(`discount = $${queryIndex++}`);
        values.push(discount);
      }
      if (warranty_period !== undefined) {
        updates.push(`warranty_period = $${queryIndex++}::INTERVAL`);
        values.push(warranty_period);
      }

      // If no fields to update
      if (updates.length === 0) {
        return res.status(400).json({ error: 'No valid fields provided for update' });
      }

      // Add id as the last parameter
      values.push(id);

      const query = `
      UPDATE price_table
      SET ${updates.join(', ')}
      WHERE id = $${queryIndex}
      RETURNING *;
    `;

      const result = await db.query(query, values);

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Price entry not found' });
      } else {
        res.status(200).json(result.rows[0]);
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update price entry' });
    }
  });
// Delete an entry
dashboard.delete('/api/delete/price_table/:id',
  validateJwt,
  authorizeRoles('admin'),
  async (req, res) => {
    const { id } = req.params;
    try {
      console.log("working delete")
      const result = await db.query('DELETE FROM price_table WHERE id = $1 RETURNING *', [id]);
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Price entry not found' });
      } else {
        res.status(200).json({ message: 'Price entry deleted successfully' });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete price entry' });
    }
  });

// API to add multiple features for a model
dashboard.post("/api/add-features/:model_id", async (req, res) => {
  const { model_id } = req.params;
  const { features } = req.body; // Expecting an array of features in the body

  if (!features || !Array.isArray(features) || features.length === 0) {
    return res.status(400).json({ message: "Invalid input. Provide an array of features." });
  }

  try {
    // Insert features into the database
    const queries = features.map((feature) =>
      db.query(
        "INSERT INTO model_features (model_id, feature) VALUES ($1, $2)",
        [model_id, feature]
      )
    );

    await Promise.all(queries);

    res.status(201).json({
      message: "Features added successfully",
      model_id,
      added_features: features,
    });
  } catch (error) {
    console.error("Error adding features:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
// API to Add Multiple Features with model_id in Params
dashboard.post("api/add-features/model/:model_id", async (req, res) => {
  const { model_id } = req.params;
  const { features } = req.body;

  if (!model_id || isNaN(model_id)) {
    return res.status(400).json({ error: "Invalid model_id in URL" });
  }

  if (!Array.isArray(features) || features.length === 0) {
    return res.status(400).json({ error: "A non-empty features array is required" });
  }

  try {
    const query = `
      INSERT INTO model_features (model_id, feature, feature_value)
      VALUES ${features.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(", ")}
      RETURNING *;
    `;

    const values = [model_id, ...features.flatMap(({ feature, feature_value }) => [feature, feature_value || null])];

    const result = await db.query(query, values);

    res.status(201).json({ message: "Features added successfully", data: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database error" });
  }
});

// API to delete an image by its ID
dashboard.delete("/api/delete-image/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Delete the database entry
    await db.query("DELETE FROM model_features_image WHERE id = $1", [id]);

    res.status(200).json({ message: "Image deleted successfully" });
  } catch (error) {
    console.error("Error deleting image:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

dashboard.get('/test-image', (req, res) => {
  res.sendFile(path.join(__dirname, 'uploads', '1737969595925-aizo1.jpg'));
});
dashboard.get("/api/display/model/features/:model_id", async (req, res) => {
  const { model_id } = req.params;

  try {
    // Query to fetch features and their IDs
    const featuresQuery = `
      SELECT id, feature 
      FROM model_features 
      WHERE model_id = $1;
    `;
    const featuresResult = await db.query(featuresQuery, [model_id]);

    // Query to fetch image URLs and their IDs
    const imagesQuery = `
      SELECT id, image_url 
      FROM model_features_image 
      WHERE model_id = $1;
    `;
    const imagesResult = await db.query(imagesQuery, [model_id]);

    // Combine results with IDs
    const features = featuresResult.rows.map(row => ({
      feature_id: row.id,
      feature: row.feature
    }));
    const images = imagesResult.rows.map(row => ({
      image_id: row.id,
      image_url: row.image_url
    }));

    if (features.length === 0 && images.length === 0) {
      return res.status(404).json({ message: "No data found for the given model_id" });
    }

    res.json({
      model_id,
      features,
      images,
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Multer Disk Storage Configuration
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true }); // Create the directory if it doesn't exist
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const sanitizedOriginalName = file.originalname.replace(/\s+/g, "_"); // Replace spaces with underscores
    cb(null, `${timestamp}-${sanitizedOriginalName}`);
  },
});

// Multer Middleware for File Uploads
const uploads = multer({
  storage: diskStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/gif"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, and GIF formats are allowed"));
    }
    cb(null, true);
  },
});

// Serve Static Files
dashboard.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Image Upload Endpoint
// dashboard.post("/api/upload-images/:model_id", uploads.array("images", 5), async (req, res) => {
//   const { model_id } = req.params;
//   console.log("Uploaded files:", req.files);

//   try {
//     if (!req.files || req.files.length === 0) {
//       return res.status(400).json({ message: "No files uploaded" });
//     }

//     // Check how many images already exist for this model_id
//     const { rows } = await db.query(
//       "SELECT COUNT(*) AS image_count FROM model_features_image WHERE model_id = $1",
//       [model_id]
//     );

//     const currentImageCount = parseInt(rows[0].image_count, 10);

//     if (currentImageCount >= 5) {
//       return res.status(400).json({ message: "Maximum of 4 images allowed per model." });
//     }

//     // Determine how many new images can be uploaded
//     const availableSlots = 5 - currentImageCount;
//     if (req.files.length > availableSlots) {
//       return res.status(400).json({ message: `You can only upload ${availableSlots} more images.` });
//     }

//     // Save local image file paths to the database
//     const imagePaths = req.files.map((file) => `/dashboard/uploads/${file.filename}`);
//     const queries = imagePaths.map((filePath) =>
//       db.query(
//         "INSERT INTO model_features_image (model_id, image_url) VALUES ($1, $2)",
//         [model_id, filePath]
//       )
//     );

//     console.log("Image paths to save:", imagePaths);
//     await Promise.all(queries);

//     res.status(200).json({
//       message: "Images uploaded successfully",
//       imagePaths,
//     });
//   } catch (error) {
//     console.error("Error uploading images:", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// });
dashboard.post("/api/upload-images/:model_id", uploads.array("images", 5), async (req, res) => {
  const { model_id } = req.params;
  console.log("Uploaded files:", req.files);

  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    // Fetch model_no from price_table
    const modelNoResult = await db.query(
      "SELECT model FROM price_table WHERE id = $1",
      [model_id]
    );

    if (modelNoResult.rows.length === 0) {
      return res.status(404).json({ message: "Model ID not found" });
    }

    const model_no = modelNoResult.rows[0].model;

    // Check how many images already exist for this model_id
    const { rows } = await db.query(
      "SELECT COUNT(*) AS image_count FROM model_features_image WHERE model_id = $1",
      [model_id]
    );

    const currentImageCount = parseInt(rows[0].image_count, 10);
    if (currentImageCount >= 5) {
      return res.status(400).json({ message: "Maximum of 4 images allowed per model." });
    }

    // Determine how many new images can be uploaded
    const availableSlots = 5 - currentImageCount;
    if (req.files.length > availableSlots) {
      return res.status(400).json({ message: `You can only upload ${availableSlots} more images.` });
    }

    // Save local image file paths to the database
    const imagePaths = req.files.map((file) => `/dashboard/uploads/${file.filename}`);
    const queries = imagePaths.map((filePath) =>
      db.query(
        "INSERT INTO model_features_image (model_id, model_no, image_url) VALUES ($1, $2, $3)",
        [model_id, model_no, filePath]
      )
    );

    console.log("Image paths to save:", imagePaths);
    await Promise.all(queries);

    res.status(200).json({
      message: "Images uploaded successfully",
      imagePaths,
    });
  } catch (error) {
    console.error("Error uploading images:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

dashboard.post("/api/upload/webimage/:model_id", uploads.array("images", 10), async (req, res) => {
  const { model_id } = req.params;
  console.log("Uploaded files:", req.files);

  try {
    // No files uploaded check
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    // Fetch model_no from price_table using model_id
    const { rows } = await db.query(
      "SELECT model FROM price_table WHERE id = $1",
      [model_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Model not found" });
    }

    const model_no = rows[0].model;  // Assuming "model" column contains the model identifier

    // Save the image file paths to the database
    const imagePaths = req.files.map((file) => `/dashboard/uploads/${file.filename}`);
    const queries = imagePaths.map((filePath) =>
      db.query(
        "INSERT INTO web_image (model_id, model_no, image_url) VALUES ($1, $2, $3)",
        [model_id, model_no, filePath]
      )
    );

    console.log("Image paths to save:", imagePaths);
    await Promise.all(queries);

    // Return the success message with image paths
    res.status(200).json({
      message: "Images uploaded successfully",
      imagePaths,
    });
  } catch (error) {
    console.error("Error uploading images:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
dashboard.get("/api/display/web/images/:modelid_or_modelno", async (req, res) => {
  const { modelid_or_modelno } = req.params;

  try {
    // Check if the value is a number (model_id) or string (model_no)
    const isModelId = !isNaN(parseInt(modelid_or_modelno));

    let query = "";
    let values = [];

    if (isModelId) {
      // If the parameter is a model_id (number), use it in the query
      query = "SELECT id, model_id, model_no, image_url FROM web_image WHERE model_id = $1";
      values = [modelid_or_modelno];
    } else {
      // If the parameter is a model_no (string), use it in the query
      query = "SELECT id, model_id, model_no, image_url FROM web_image WHERE model_no = $1";
      values = [modelid_or_modelno];
    }

    const { rows } = await db.query(query, values);

    if (rows.length === 0) {
      return res.status(404).json({ message: "No images found for this model" });
    }

    res.status(200).json({
      message: "Images retrieved successfully",
      images: rows,
    });
  } catch (error) {
    console.error("Error retrieving images:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

dashboard.get("/api/display/images/:modelid_or_modelno", async (req, res) => {
  const { modelid_or_modelno } = req.params;

  try {
    const isModelId = !isNaN(parseInt(modelid_or_modelno));
    let values = [modelid_or_modelno];

    // Query for model_features_image (check both model_id and model_no)
    let featuresQuery = "";
    if (isModelId) {
      featuresQuery = `SELECT id, model_id, model_no, image_url FROM model_features_image WHERE model_id = $1`;
    } else {
      featuresQuery = `SELECT id, model_id, model_no, image_url FROM model_features_image WHERE model_no = $1`;
    }
    const featuresResult = await db.query(featuresQuery, values);
    const featureImages = featuresResult.rows.map(row => ({
      id: row.id,
      model_id: row.model_id,
      model_no: row.model_no,
      images: [{ image_id: row.id, image_url: row.image_url }]
    }));

    // Query for web_image (same logic as before)
    let webQuery = "";
    if (isModelId) {
      webQuery = "SELECT id, model_id, model_no, image_url FROM web_image WHERE model_id = $1";
    } else {
      webQuery = "SELECT id, model_id, model_no, image_url FROM web_image WHERE model_no = $1";
    }
    const webResult = await db.query(webQuery, values);
    const webImages = webResult.rows.map(row => ({
      id: row.id,
      model_id: row.model_id,
      model_no: row.model_no,
      images: [{ image_id: row.id, image_url: row.image_url }]
    }));

    res.status(200).json({
      model_id: isModelId ? modelid_or_modelno : null,
      model_no: isModelId ? null : modelid_or_modelno,
      feature_images: featureImages,
      web_images: webImages,
    });
  } catch (error) {
    console.error("Error retrieving images:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});


// DELETE: Delete a specific image by image_id
dashboard.delete("/api/delete/web/images/:image_id", async (req, res) => {
  const { image_id } = req.params;

  try {
    const { rows } = await db.query(
      "SELECT * FROM web_image WHERE id = $1",
      [image_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Image not found" });
    }

    await db.query(
      "DELETE FROM web_image WHERE id = $1",
      [image_id]
    );

    res.status(200).json({
      message: "Image deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting image:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// API endpoint to delete a feature by ID
dashboard.delete("/delete-feature/:id", async (req, res) => {
  const featureId = parseInt(req.params.id);

  try {
    // Check if the feature exists
    const featureResult = await db.query(
      "SELECT * FROM model_features WHERE id = $1",
      [featureId]
    );

    if (featureResult.rowCount === 0) {
      return res.status(404).json({ error: "Feature not found" });
    }

    // Delete the feature
    await db.query("DELETE FROM model_features WHERE id = $1", [featureId]);
    res.status(200).json({ message: `Feature with ID ${featureId} deleted successfully.` });
  } catch (error) {
    console.error("Error deleting feature:", error);
    res.status(500).json({ error: "An error occurred while deleting the feature" });
  }
});


dashboard.get("/api/things/features/:model", async (req, res) => {
  const { model } = req.params;

  try {
    // Query to fetch features and their associated images for the model
    const query = `
      SELECT 
        t.model AS thing_model,
        mf.feature AS feature_description,
        mfi.image_url AS feature_image_url
      FROM 
        Things t
      JOIN 
        price_table pt ON t.model = pt.model
      LEFT JOIN 
        model_features mf ON pt.id = mf.model_id
      LEFT JOIN 
        model_features_image mfi ON pt.id = mfi.model_id
      WHERE 
        t.model = $1;
    `;

    // Execute the query
    const result = await db.query(query, [model]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No data found for the given model" });
    }

    // Transform data into arrays for features and images
    const features = [];
    const images = [];
    result.rows.forEach(row => {
      if (row.feature_description && !features.includes(row.feature_description)) {
        features.push(row.feature_description);
      }
      if (row.feature_image_url && !images.includes(row.feature_image_url)) {
        images.push(row.feature_image_url);
      }
    });

    // Send the response
    res.json({
      model,
      features,
      images,
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// API Endpoint to fetch billing details for any entity (dealer, customer, or online customer)
dashboard.get("/api/billing/:entity_type/:entity_id",
  validateJwt,
  authorizeRoles('admin'),
  async (req, res) => {
    const { entity_type, entity_id } = req.params;

    // Determine the table and column based on entity type
    let tableColumn;
    if (entity_type === "dealer") {
      tableColumn = "dealers_id";
    } else if (entity_type === "customer") {
      tableColumn = "customers_id";
    } else if (entity_type === "online_customer") {
      tableColumn = "onlinecustomer_id";
    } else {
      return res.status(400).json({ error: "Invalid entity type. Use 'dealer', 'customer', or 'online_customer'." });
    }

    // Query to fetch billing receipt details
    const query = `
    SELECT 
        br.id AS billing_receipt_id,
        br.receipt_no,
        br.name AS entity_name,
        br.phone,
        br.email,
        br.billing_address,
        br.shipping_address,
        br.dealer_or_customer,
        br.total_amount,
        br.discount,
        br.payable_amount,
        br.paid_amount,
        br.balance,
        br.billing_createdby,
        br.type AS transaction_type,
        br.datetime AS receipt_date,
        br.lastmodified AS last_modified_date
    FROM 
        billing_receipt br
    WHERE 
        br.${tableColumn} = $1;
  `;

    // Queries to fetch associated items, warranties, and payments
    const itemsQuery = `
    SELECT 
        bi.id AS billing_item_id,
        bi.receipt_no,
        bi.item_name,
        bi.model,
        bi.serial_no,
        bi.mrp,
        bi.retail_price,
        bi.type AS item_type
    FROM 
        billing_items bi
    WHERE 
        bi.receipt_no IN (SELECT receipt_no FROM billing_receipt WHERE ${tableColumn} = $1);
  `;

    const warrantiesQuery = `
    SELECT 
        tw.id AS warranty_id,
        tw.serial_no AS warranty_serial_no,
        tw.receipt_id,
        tw.date AS warranty_start_date,
        tw.due_date AS warranty_due_date
    FROM 
        thing_warranty tw
    WHERE 
        tw.receipt_id IN (SELECT id FROM billing_receipt WHERE ${tableColumn} = $1);
  `;

    const paymentsQuery = `
    SELECT 
        pd.id AS payment_id,
        pd.receipt_id,
        pd.payment_method,
        pd.amount AS payment_amount
    FROM 
        payment_details pd
    WHERE 
        pd.receipt_id IN (SELECT id FROM billing_receipt WHERE ${tableColumn} = $1);
  `;

    try {
      const client = await db.connect();

      // Execute queries concurrently
      const [billingResult, itemsResult, warrantiesResult, paymentsResult] = await Promise.all([
        client.query(query, [entity_id]),
        client.query(itemsQuery, [entity_id]),
        client.query(warrantiesQuery, [entity_id]),
        client.query(paymentsQuery, [entity_id]),
      ]);

      if (billingResult.rows.length === 0) {
        return res.status(404).json({ error: "No billing details found for the given entity." });
      }

      // Structure the response
      const billingReceipts = billingResult.rows.map((receipt) => {
        // Get related items, warranties, and payments for the current receipt
        const items = itemsResult.rows.filter((item) => item.receipt_no === receipt.receipt_no);
        const warranties = warrantiesResult.rows.filter((warranty) => warranty.receipt_id === receipt.billing_receipt_id);
        const payments = paymentsResult.rows.filter((payment) => payment.receipt_id === receipt.billing_receipt_id);

        return {
          ...receipt,
          items,
          warranties,
          payments,
        };
      });

      res.status(200).json({ data: billingReceipts });
      client.release();
    } catch (err) {
      console.error("Error fetching billing details:", err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

// 1. Open Billing Session
dashboard.post('/open-session',
  validateJwt,
  authorizeRoles('admin', 'dealer'),
  async (req, res) => {
    const { opened_by } = req.body;
    const userid = req.user?.id || req.body.userid;
    try {
      const result = await db.query(
        `INSERT INTO billing_session (session_date, opened_by,user_id) 
           VALUES (CURRENT_DATE, $1,$2) RETURNING *`,
        [opened_by, userid]
      );
      res.status(201).json({ message: 'Session opened', session: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

const PDFDocument = require('pdfkit');
// 2. Close Billing Session
dashboard.post('/close-session',
  validateJwt,
  authorizeRoles('admin'),
  async (req, res) => {
    const { session_id, closed_by } = req.body;

    if (!session_id || !closed_by) {
      return res.status(400).json({ error: "Session ID and closed_by are required" });
    }

    const client = await db.connect();
    try {
      // Validate if session exists and is open
      const sessionValidation = await isSessionOpen(session_id, client);
      if (!sessionValidation.isValid && sessionValidation.message === "Session does not exist.") {
        return res.status(404).json({ error: sessionValidation.message });
      }
      if (!sessionValidation.isValid) {
        return res.status(400).json({ error: sessionValidation.message });
      }

      // Retrieve session opening time
      const sessionDetails = await client.query(
        `SELECT opened_at,opened_by FROM billing_session WHERE id = $1`,
        [session_id]
      );

      if (sessionDetails.rows.length === 0) {
        return res.status(404).json({ error: "Session not found" });
      }

      const { opened_at, opened_by } = sessionDetails.rows[0];

      // Calculate session summary
      const summary = await client.query(
        `SELECT COUNT(*) AS total_transactions, 
                  SUM(total_amount) AS total_sales, 
                  SUM(discount) AS total_discount, 
                  SUM(paid_amount) AS total_paid, 
                  SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END) AS total_cash, 
                  SUM(CASE WHEN payment_method = 'bank' THEN amount ELSE 0 END) AS total_bank, 
                  SUM(CASE WHEN payment_method = 'online' THEN amount ELSE 0 END) AS total_online
           FROM billing_receipt 
           LEFT JOIN payment_details ON billing_receipt.id = payment_details.receipt_id
           WHERE session_id = $1`,
        [session_id]
      );

      const {
        total_transactions,
        total_sales,
        total_discount,
        total_paid,
        total_cash,
        total_bank,
        total_online,
      } = summary.rows[0];

      // Close session
      await client.query(
        `UPDATE billing_session 
           SET closed_by = $1, closed_at = CURRENT_TIMESTAMP, status = 'closed', 
               total_cash = $2, total_bank = $3, total_online = $4, total_sales = $5 
           WHERE id = $6`,
        [closed_by, total_cash, total_bank, total_online, total_sales, session_id]
      );

      // Save daily report
      const report = await client.query(
        `INSERT INTO daily_report 
           (session_id, total_transactions, total_sales, total_discount, total_paid, total_cash, total_bank, total_online) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          session_id,
          total_transactions,
          total_sales,
          total_discount,
          total_paid,
          total_cash,
          total_bank,
          total_online,
        ]
      );

      // Generate PDF report
      const doc = new PDFDocument();
      const pdfPath = path.resolve(__dirname, `session_${session_id}_report.pdf`);
      const writeStream = fs.createWriteStream(pdfPath);

      doc.pipe(writeStream);
      doc.fontSize(16).text('Session Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Session ID: ${session_id}`);
      doc.text(`Opened At: ${new Date(opened_at).toLocaleString()}`);
      doc.text(`opened By: ${opened_by}`);
      doc.text(`Closed By: ${closed_by}`);
      doc.text(`Total Transactions: ${total_transactions}`);
      doc.text(`Total Sales: $${total_sales}`);
      doc.text(`Total Discount: $${total_discount}`);
      doc.text(`Total Paid: $${total_paid}`);
      doc.text(`Total Cash: $${total_cash}`);
      doc.text(`Total Bank: $${total_bank}`);
      doc.text(`Total Online: $${total_online}`);
      doc.text(`Closed At: ${new Date().toLocaleString()}`);
      doc.end();

      writeStream.on('finish', () => {
        res.status(200).json({
          message: 'Session closed successfully',
          report: report.rows[0],
          pdfPath: `/downloads/session_${session_id}_report.pdf`,
        });
      });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    } finally {
      client.release();
    }
  });

//display daily report
dashboard.get("/api/reports/daily",
  validateJwt,
  authorizeRoles('admin'),
  async (req, res) => {
    const { date } = req.query; // Optional query parameter to filter by date

    try {
      let query = `
          SELECT 
              dr.id AS report_id,
              dr.session_id,
              dr.total_transactions,
              dr.total_sales,
              dr.total_discount,
              dr.total_paid,
              dr.total_cash,
              dr.total_bank,
              dr.total_online,
              dr.report_date,
              dr.created_at,
              bs.opened_by,
              bs.opened_at,
              bs.closed_by,
              bs.closed_at
          FROM 
              daily_report dr
          JOIN 
              billing_session bs ON dr.session_id = bs.id
      `;

      const params = [];
      if (date) {
        query += " WHERE dr.report_date = $1";
        params.push(date);
      }

      query += " ORDER BY dr.report_date DESC";

      const result = await db.query(query, params);

      res.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve daily reports.",
        error: err.message,
      });
    }
  });

// All-in-one sales graph
dashboard.get('/api/sales', async (req, res) => {
  const { period } = req.query; // Accept a query parameter: daily, weekly, monthly, yearly

  // Determine the date truncation level based on the period
  let dateTrunc;
  switch (period) {
    case 'daily':
      dateTrunc = 'day';
      break;
    case 'weekly':
      dateTrunc = 'week';
      break;
    case 'monthly':
      dateTrunc = 'month';
      break;
    case 'yearly':
      dateTrunc = 'year';
      break;
    default:
      return res.status(400).json({ error: 'Invalid period. Use daily, weekly, monthly, or yearly.' });
  }

  // Query to fetch aggregated sales data
  const query = `
    SELECT DATE_TRUNC($1, report_date) AS period_start, 
           SUM(total_sales) AS total_sales,
           SUM(total_cash) AS total_cash,
           SUM(total_bank) AS total_bank,
           SUM(total_online) AS total_online
    FROM daily_report
    GROUP BY period_start
    ORDER BY period_start ASC;
  `;

  try {
    // Execute the query with a parameter
    const result = await db.query(query, [dateTrunc]);
    res.json(result.rows); // Extract rows from the query result
  } catch (err) {
    console.error('Error fetching sales data:', err.message);
    res.status(500).json({ error: 'Failed to fetch sales data' });
  }
});
    
//API to raw_materials
// -----------------------------------
// API to create a new raw material
// dashboard.post('/api/raw_materials/create',
//   validateJwt,
//   authorizeRoles('admin'),
//   upload.single('image'), async (req, res) => {
//     const { Component, package, category, value, unit_price_in_rupees, unit_price_in_dollars, reference_no, stock_quantity, reorder_level } = req.body;
//     let fileUrl = null;
//     console.log(req.body)
//     if (req.file) {
//       // console.log(req.file)
//       const file = req.file;
//       const fileKey = `raw_materials/${Date.now()}-${file.originalname}`; // Unique file name
//       const params = {
//         Bucket: process.env.S3_BUCKET_NAME,
//         Key: fileKey,
//         Body: file.buffer,
//         ContentType: file.mimetype,
//         // ACL: 'public-read', // Uncomment if you want the file to be publicly readable
//       };

//       const uploadResult = await s3.upload(params).promise();
//       fileUrl = uploadResult.Location; // S3 file URL
//     }

//     const query = `INSERT INTO raw_materials_stock (Component, category,package, value, reference_no, image,unit_price_in_rupees,unit_price_in_dollars,stock_quantity, reorder_level)
//                  VALUES ($1, $2, $3, $4, $5, $6, $7,$8,$9,$10) RETURNING id`;

//     try {
//       const result = await db.query(query, [Component, category, package, value, reference_no, fileUrl, unit_price_in_rupees, unit_price_in_dollars, stock_quantity, reorder_level]);
//       res.status(201).json({ message: 'Raw material created successfully', id: result.rows[0].id });
//     } catch (err) {
//       console.error(err);
//       res.status(500).json({ error: 'Failed to create raw material', message: err.message });
//     }
//   });
  // dashboard.post('/api/raw_materials/create',
  //   validateJwt,
  //   authorizeRoles('admin'),
  //   upload.single('image'),
  //   async (req, res) => {
  //     const {
  //       Component,
  //       package,
  //       category,
  //       value,
  //       unit_price_in_rupees,
  //       unit_price_in_dollars,
  //       reference_no,
  //       stock_quantity,
  //       reorder_level,
  //       raw_material_features // Can be undefined, empty, or an array of features
  //     } = req.body;
  
  //     let fileUrl = null;
  
  //     if (req.file) {
  //       const file = req.file;
  //       const fileKey = `raw_materials/${Date.now()}-${file.originalname}`; // Unique file name
  //       const params = {
  //         Bucket: process.env.S3_BUCKET_NAME,
  //         Key: fileKey,
  //         Body: file.buffer,
  //         ContentType: file.mimetype,
  //       };
  
  //       const uploadResult = await s3.upload(params).promise();
  //       fileUrl = uploadResult.Location; // S3 file URL
  //     }
  
  //     const query = `
  //       INSERT INTO raw_materials_stock (Component, category, package, value, reference_no, image, unit_price_in_rupees, unit_price_in_dollars, stock_quantity, reorder_level)
  //       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`;
  
  //     try {
  //       const result = await db.query(query, [
  //         Component,
  //         category,
  //         package,
  //         value,
  //         reference_no,
  //         fileUrl,
  //         unit_price_in_rupees,
  //         unit_price_in_dollars,
  //         stock_quantity,
  //         reorder_level,
  //       ]);
  
  //       const materialId = result.rows[0].id; // Get the inserted material ID
  
  //       // Insert features ONLY if they exist and are an array
  //       if (Array.isArray(raw_material_features) && raw_material_features.length > 0) {
  //         const featureQuery = `
  //           INSERT INTO raw_material_features (material_id, raw_material_feature, raw_material_value)
  //           VALUES ${raw_material_features.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(', ')}
  //         `;
  
  //         const featureValues = raw_material_features.flatMap(({ feature, value }) => [materialId, feature, value]);
  
  //         await db.query(featureQuery, [materialId, ...featureValues]);
  //       }
  
  //       res.status(201).json({ message: 'Raw material created successfully', id: materialId });
  //     } catch (err) {
  //       console.error(err);
  //       res.status(500).json({ error: 'Failed to create raw material', message: err.message });
  //     }
  //   }
  // );
  dashboard.post('/api/raw_materials/create',
    validateJwt,
    authorizeRoles('admin'),
    upload.single('image'),
    async (req, res) => {
      // console.log(`rawww==${req.body}`)
      const {
        Component,
        package,
        category,
        value,
        unit_price_in_rupees,
        unit_price_in_dollars,
        reference_no,
        stock_quantity,
        reorder_level,
        tax,                // Percentage
        shipping_charge,    // Percentage
        raw_material_features // Can be undefined, empty, or an array of features
      } = req.body;
      console.log(`rawwwtax==${tax,shipping_charge}`)
      let fileUrl = null;
  
      if (req.file) {
        const file = req.file;
        const fileKey = `raw_materials/${Date.now()}-${file.originalname}`; // Unique file name
        const params = {
          Bucket: process.env.S3_BUCKET_NAME,
          Key: fileKey,
          Body: file.buffer,
          ContentType: file.mimetype,
        };
  
        const uploadResult = await s3.upload(params).promise();
        fileUrl = uploadResult.Location; // S3 file URL
      }
  
      // Ensure tax and shipping_charge have valid values (default to 0 if not provided)
      const taxPercent = tax !== undefined ? parseFloat(tax) : 0;
      const shippingPercent = shipping_charge !== undefined ? parseFloat(shipping_charge) : 0;
      const priceInRupees = parseFloat(unit_price_in_rupees) || 0;

      // Calculate total price with tax and shipping percentage
      const totalPrice = priceInRupees * (1 + taxPercent / 100 + shippingPercent / 100);
  
      const query = `
        INSERT INTO raw_materials_stock (
          Component, category, package, value, reference_no, image, 
          unit_price_in_rupees, unit_price_in_dollars, tax, shipping_charge, 
          total_price, stock_quantity, reorder_level
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
        RETURNING id`;
  
      try {
        const result = await db.query(query, [
          Component,
          category,
          package,
          value,
          reference_no,
          fileUrl,
          unit_price_in_rupees,
          unit_price_in_dollars,
          taxPercent,        // Store tax as percentage
          shippingPercent,   // Store shipping as percentage
          totalPrice,        // Store calculated total price
          stock_quantity,
          reorder_level,
        ]);
  
        const materialId = result.rows[0].id; // Get the inserted material ID
  
        // Insert features ONLY if they exist and are an array
        if (Array.isArray(raw_material_features) && raw_material_features.length > 0) {
          const featureQuery = `
            INSERT INTO raw_material_features (material_id, raw_material_feature, raw_material_value)
            VALUES ${raw_material_features.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(', ')}
          `;
  
          const featureValues = raw_material_features.flatMap(({ feature, value }) => [materialId, feature, value]);
  
          await db.query(featureQuery, [materialId, ...featureValues]);
        }
  
        res.status(201).json({ message: 'Raw material created successfully', id: materialId });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create raw material', message: err.message });
      }
    }
  );

  dashboard.post('/api/raw_materials/add_features/:material_id',
    async (req, res) => {
      const {material_id} = req.params
      const { raw_material_features } = req.body;
  
      // Validate input
      if (!material_id || isNaN(material_id)) {
        return res.status(400).json({ error: 'Valid material_id is required' });
      }
  
      if (!Array.isArray(raw_material_features) || raw_material_features.length === 0) {
        return res.status(400).json({ error: 'At least one raw_material_feature is required' });
      }
  
      try {
        // Check if material_id exists in raw_materials_stock
        const materialCheck = await db.query(
          'SELECT id FROM raw_materials_stock WHERE id = $1',
          [material_id]
        );
  
        if (materialCheck.rows.length === 0) {
          return res.status(404).json({ error: 'Material not found' });
        }

        // Insert features into raw_material_features
        const featureQuery = `
          INSERT INTO raw_material_features (material_id, raw_material_feature, raw_material_value)
          VALUES ${raw_material_features.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ')}
        `;

        const featureValues = raw_material_features.flatMap(({ feature, value }) => [
          material_id, // Ensure material_id is passed for each row
          feature,
          value
        ]);

        await db.query(featureQuery, featureValues);

        res.status(201).json({ message: 'Features added successfully' });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to add features', message: err.message });
      }
    }
);

  dashboard.put('/api/raw_materials/update_feature/:id',
    // validateJwt,
    // authorizeRoles('admin'),
    async (req, res) => {
      const{id}=req.params;
      const {raw_material_value } = req.body;
  
      // Validate input
      if (!id) {
        return res.status(400).json({ error: 'Feature ID is required' });
      }
     console.log(raw_material_value)
      try {
        // Check if feature exists
        const featureCheck = await db.query(
          'SELECT id FROM raw_material_features WHERE id = $1',
          [id]
        );
  
        if (featureCheck.rows.length === 0) {
          return res.status(404).json({ error: 'Feature not found' });
        }
  
        // Update feature
        const updateQuery = `
          UPDATE raw_material_features
          SET raw_material_value = $1
          WHERE id = $2
        `;
  
        await db.query(updateQuery, [raw_material_value, id]);
  
        res.status(200).json({ message: 'Feature updated successfully' });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update feature', message: err.message });
      }
    }
  );
  dashboard.delete('/api/raw_materials/delete_feature/:id',
    validateJwt,
    authorizeRoles('admin'),
    async (req, res) => {
      const { id } = req.params;
  
      // Validate input
      if (!id) {
        return res.status(400).json({ error: 'Feature ID is required' });
      }
  
      try {
        // Check if feature exists
        const featureCheck = await db.query(
          'SELECT id FROM raw_material_features WHERE id = $1',
          [id]
        );
  
        if (featureCheck.rows.length === 0) {
          return res.status(404).json({ error: 'Feature not found' });
        }
  
        // Delete feature
        await db.query('DELETE FROM raw_material_features WHERE id = $1', [id]);
  
        res.status(200).json({ message: 'Feature deleted successfully' });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete feature', message: err.message });
      }
    }
  );
  
// API to update a raw material by ID
// dashboard.put('/api/raw_materials/update/:id',
//   validateJwt,
//   authorizeRoles('admin'),
//   upload.single('image'), async (req, res) => {
//     const { id } = req.params;
//     console.log(req.body)
//     const {
//       Component, category, package: pkg, value, reference_no,
//       unit_price_in_rupees, unit_price_in_dollars, stock_quantity, reorder_level
//     } = req.body;

//     let fileUrl = null;

//     // If an image file is uploaded, process it for S3
//     if (req.file) {
//       const file = req.file;
//       const fileKey = `raw_materials/${Date.now()}-${file.originalname}`; // Unique file name
//       const params = {
//         Bucket: process.env.S3_BUCKET_NAME,
//         Key: fileKey,
//         Body: file.buffer,
//         ContentType: file.mimetype,
//       };

//       try {
//         const uploadResult = await s3.upload(params).promise();
//         fileUrl = uploadResult.Location; // S3 file URL
//       } catch (uploadErr) {
//         console.error('Error uploading file:', uploadErr);
//         return res.status(500).json({ error: 'Failed to upload image', message: uploadErr.message });
//       }
//     }

//     try {
//       // Dynamically construct query
//       const updates = [];
//       const values = [];
//       let queryIndex = 1;

//       if (Component) {
//         updates.push(`Component = $${queryIndex++}`);
//         values.push(Component);
//       }
//       if (category) {
//         updates.push(`category = $${queryIndex++}`);
//         values.push(category);
//       }
//       if (pkg) {
//         updates.push(`package = $${queryIndex++}`);
//         values.push(pkg);
//       }
//       if (value) {
//         updates.push(`value = $${queryIndex++}`);
//         values.push(value);
//       }
//       if (reference_no) {
//         updates.push(`reference_no = $${queryIndex++}`);
//         values.push(reference_no);
//       }
//       if (unit_price_in_rupees) {
//         updates.push(`unit_price_in_rupees = $${queryIndex++}`);
//         values.push(unit_price_in_rupees);
//       }
//       if (unit_price_in_dollars) {
//         updates.push(`unit_price_in_dollars = $${queryIndex++}`);
//         values.push(unit_price_in_dollars);
//       }
//       if (fileUrl) {
//         updates.push(`image = $${queryIndex++}`);
//         values.push(fileUrl);
//       }
//       if (stock_quantity) {
//         updates.push(`stock_quantity = $${queryIndex++}`);
//         values.push(stock_quantity);
//       }
//       if (reorder_level) {
//         updates.push(`reorder_level = $${queryIndex++}`);
//         values.push(reorder_level);
//       }

//       // If no fields to update, return an error
//       if (updates.length === 0) {
//         return res.status(400).json({ error: 'No valid fields provided for update' });
//       }

//       // Add the id as the last parameter
//       values.push(id);

//       const query = `
//       UPDATE raw_materials_stock
//       SET ${updates.join(', ')}
//       WHERE id = $${queryIndex}
//       RETURNING *;
//     `;

//       const result = await db.query(query, values);

//       if (result.rows.length === 0) {
//         return res.status(404).json({ error: 'Raw material not found' });
//       } else {
//         res.status(200).json({ message: 'Raw material updated successfully', data: result.rows[0] });
//       }
//     } catch (err) {
//       console.error(err);
//       res.status(500).json({ error: 'Failed to update raw material', message: err.message });
//     }
//   });

dashboard.put('/api/raw_materials/update/:id', 
  validateJwt, 
  authorizeRoles('admin'), 
  upload.single('image'), 
  async (req, res) => {
    const { id } = req.params;
    console.log("Request Body:", req.body);

    const {
      Component, category, package: pkg, value, reference_no,
      unit_price_in_rupees, unit_price_in_dollars, tax, shipping_charge,
      total_price, stock_quantity, reorder_level
    } = req.body;

    let fileUrl = null;

    // If an image file is uploaded, upload it to AWS S3
    if (req.file) {
      const file = req.file;
      const fileKey = `raw_materials/${Date.now()}-${file.originalname}`;
      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: fileKey,
        Body: file.buffer,
        ContentType: file.mimetype,
      };

      try {
        const uploadResult = await s3.upload(params).promise();
        fileUrl = uploadResult.Location; // S3 file URL
      } catch (uploadErr) {
        console.error('Error uploading file:', uploadErr);
        return res.status(500).json({ error: 'Failed to upload image', message: uploadErr.message });
      }
    }

    try {
      // Construct dynamic query
      const updates = [];
      const values = [];
      let queryIndex = 1;

      if (Component) {
        updates.push(`Component = $${queryIndex++}`);
        values.push(Component);
      }
      if (category) {
        updates.push(`category = $${queryIndex++}`);
        values.push(category);
      }
      if (pkg) {
        updates.push(`package = $${queryIndex++}`);
        values.push(pkg);
      }
      if (value) {
        updates.push(`value = $${queryIndex++}`);
        values.push(value);
      }
      if (reference_no) {
        updates.push(`reference_no = $${queryIndex++}`);
        values.push(reference_no);
      }
      if (unit_price_in_rupees) {
        updates.push(`unit_price_in_rupees = $${queryIndex++}`);
        values.push(unit_price_in_rupees);
      }
      if (unit_price_in_dollars) {
        updates.push(`unit_price_in_dollars = $${queryIndex++}`);
        values.push(unit_price_in_dollars);
      }
      if (tax) {
        updates.push(`tax = $${queryIndex++}`);
        values.push(tax);
      }
      if (shipping_charge) {
        updates.push(`shipping_charge = $${queryIndex++}`);
        values.push(shipping_charge);
      }
      if (total_price) {
        updates.push(`total_price = $${queryIndex++}`);
        values.push(total_price);
      }
      if (fileUrl) {
        updates.push(`image = $${queryIndex++}`);
        values.push(fileUrl);
      }
      if (stock_quantity) {
        updates.push(`stock_quantity = $${queryIndex++}`);
        values.push(stock_quantity);
      }
      if (reorder_level) {
        updates.push(`reorder_level = $${queryIndex++}`);
        values.push(reorder_level);
      }

      // If no fields to update, return an error
      if (updates.length === 0) {
        return res.status(400).json({ error: 'No valid fields provided for update' });
      }

      // Add the id as the last parameter
      values.push(id);

      const query = `
        UPDATE raw_materials_stock
        SET ${updates.join(', ')}
        WHERE id = $${queryIndex}
        RETURNING *;
      `;

      const result = await db.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Raw material not found' });
      } else {
        res.status(200).json({ message: 'Raw material updated successfully', data: result.rows[0] });
      }
    } catch (err) {
      console.error('Database update error:', err);
      res.status(500).json({ error: 'Failed to update raw material', message: err.message });
    }
  }
);

// dashboard.put('/api/raw/stock/update/:id',
//   validateJwt,
//   authorizeRoles('admin'),
//   async (req, res) => {
//     const { id } = req.params;
//     const { stock_quantity } = req.body;  // Only extract stock_quantity

//     const query = `
//     UPDATE raw_materials_stock
//     SET stock_quantity = $1
//     WHERE id = $2
//   `;

//     try {
//       await db.query(query, [stock_quantity, id]); // Update only stock_quantity
//       res.status(200).json({ message: 'Stock quantity updated successfully' });
//     } catch (err) {
//       console.error(err);
//       res.status(500).json({ error: 'Failed to update stock quantity', message: err.message });
//     }
//   });

dashboard.put('/api/raw/stock/update/:id',
  validateJwt,
  authorizeRoles('admin'),
  async (req, res) => {
    const { id } = req.params;
    const {
      unit_price_in_rupees,
      unit_price_in_dollars,
      stock_quantity,  // New stock should be added to old stock
      tax,
      shipping_charge
    } = req.body;

    const user = req.user.username; // Track the user making the update

    try {
      // Fetch previous data before updating
      const oldDataQuery = `
        SELECT unit_price_in_rupees, unit_price_in_dollars, stock_quantity, tax, shipping_charge
        FROM raw_materials_stock WHERE id = $1
      `;
      const oldDataResult = await db.query(oldDataQuery, [id]);

      if (oldDataResult.rows.length === 0) {
        return res.status(404).json({ error: 'Raw material not found' });
      }

      const oldData = oldDataResult.rows[0];

      // Determine new values (fallback to existing if not provided)
      const newUnitPrice = unit_price_in_rupees !== undefined ? unit_price_in_rupees : oldData.unit_price_in_rupees;
      const newTax = tax !== undefined ? tax : oldData.tax;
      const newShippingCharge = shipping_charge !== undefined ? shipping_charge : oldData.shipping_charge;

      // Add new stock to old stock
      const updatedStockQuantity = stock_quantity !== undefined ? oldData.stock_quantity + parseInt(stock_quantity) : oldData.stock_quantity;

      // Calculate the new total_price
      const newTotalPrice = newUnitPrice * (1 + newTax / 100 + newShippingCharge / 100);

      // Store previous values in history table
      const historyQuery = `
        INSERT INTO raw_materials_stock_history (
          raw_material_id, unit_price_in_rupees, unit_price_in_dollars, 
          stock_quantity, tax, shipping_charge, total_price, updated_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8
        )
      `;

      const historyValues = [
        id, oldData.unit_price_in_rupees, oldData.unit_price_in_dollars,
        oldData.stock_quantity, oldData.tax, oldData.shipping_charge,
        oldData.unit_price_in_rupees * (1 + oldData.tax / 100 + oldData.shipping_charge / 100), // Store old total_price
        user
      ];

      await db.query(historyQuery, historyValues);

      // Dynamically construct the update query
      const updates = [];
      const values = [];
      let queryIndex = 1;

      if (unit_price_in_rupees !== undefined) {
        updates.push(`unit_price_in_rupees = $${queryIndex++}`);
        values.push(unit_price_in_rupees);
      }
      if (unit_price_in_dollars !== undefined) {
        updates.push(`unit_price_in_dollars = $${queryIndex++}`);
        values.push(unit_price_in_dollars);
      }
      // Ensure stock quantity is updated with the added value
      updates.push(`stock_quantity = $${queryIndex++}`);
      values.push(updatedStockQuantity);

      if (tax !== undefined) {
        updates.push(`tax = $${queryIndex++}`);
        values.push(tax);
      }
      if (shipping_charge !== undefined) {
        updates.push(`shipping_charge = $${queryIndex++}`);
        values.push(shipping_charge);
      }

      // Update total_price dynamically
      updates.push(`total_price = $${queryIndex++}`);
      values.push(newTotalPrice);

      // Add the id as the last parameter
      values.push(id);

      const updateQuery = `
        UPDATE raw_materials_stock
        SET ${updates.join(', ')}
        WHERE id = $${queryIndex}
      `;

      await db.query(updateQuery, values);

      res.status(200).json({ message: 'Raw material updated successfully', updated_stock: updatedStockQuantity });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update raw material', message: err.message });
    }
  }
);



// API to delete a raw material by ID
dashboard.delete('/api/raw_materials/delete/:id',

  validateJwt,
  authorizeRoles('admin'),
  async (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM raw_materials_stock WHERE id = $1';

    try {
      await db.query(query, [id]);
      res.status(200).json({ message: 'Raw material deleted successfully' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete raw material', message: err.message });
    }
  });

// API to get all raw materials
// dashboard.get('/api/raw_materials',
//   validateJwt,
//   authorizeRoles('admin'),
//   async (req, res) => {
//     const { search, category } = req.query;
//     console.log(req.query)
//     let query = 'SELECT * FROM raw_materials_stock WHERE 1=1';
//     const params = [];
//     let paramIndex = 1; // Keeps track of parameter indices for SQL injection protection

//     if (search) {
//       query += ` AND (
//       Component ILIKE $${paramIndex} OR
//       category ILIKE $${paramIndex} OR
//       package ILIKE $${paramIndex} OR
//       value ILIKE $${paramIndex} OR
//       reference_no ILIKE $${paramIndex}
//     )`;
//       params.push(`%${search}%`);
//       paramIndex++; // Increment index after adding a parameter
//     }

//     if (category) {
//       query += ` AND category = $${paramIndex}`;
//       params.push(category);
//     }

//     try {
//       const result = await db.query(query, params);
//       res.status(200).json({ raw_materials: result.rows });
//     } catch (err) {
//       console.error(err);
//       res.status(500).json({ error: 'Failed to fetch raw materials', message: err.message });
//     }
//   });
dashboard.get('/api/raw_materials',
    // validateJwt,
    // authorizeRoles('admin'),
    async (req, res) => {
      const { search, category } = req.query;
      console.log(req.query);
  
      let query = `
        SELECT 
          rms.id AS material_id, 
          rms.Component, 
          rms.category, 
          rms.package, 
          rms.value, 
          rms.reference_no, 
          rms.unit_price_in_rupees, 
          rms.unit_price_in_dollars, 
          rms.stock_quantity, 
          rms.reorder_level, 
          rms.tax, 
          rms.shipping_charge, 
          rms.total_price, 
          rms.image, 
          rmf.id AS feature_id, 
          rmf.raw_material_feature, 
          rmf.raw_material_value
        FROM raw_materials_stock rms
        LEFT JOIN raw_material_features rmf ON rms.id = rmf.material_id
        WHERE 1=1
      `;
  
      const params = [];
      let paramIndex = 1;
  
      if (search) {
        query += ` AND (
          rms.Component ILIKE $${paramIndex} OR
          rms.category ILIKE $${paramIndex} OR
          rms.package ILIKE $${paramIndex} OR
          rms.value ILIKE $${paramIndex} OR
          rms.reference_no ILIKE $${paramIndex}
        )`;
        params.push(`%${search}%`);
        paramIndex++;
      }
  
      if (category) {
        query += ` AND rms.category = $${paramIndex}`;
        params.push(category);
      }
  
      try {
        const result = await db.query(query, params);
  
        // Group materials with their features
        const materialsMap = new Map();
  
        result.rows.forEach((row) => {
          if (!materialsMap.has(row.material_id)) {
            materialsMap.set(row.material_id, {
              id: row.material_id,
              Component: row.Component,
              category: row.category,
              package: row.package,
              value: row.value,
              reference_no: row.reference_no,
              unit_price_in_rupees: row.unit_price_in_rupees,
              unit_price_in_dollars: row.unit_price_in_dollars,
              stock_quantity: row.stock_quantity,
              reorder_level: row.reorder_level,
              image: row.image,
              tax: row.tax,
              shipping_cost: row.shipping_charge,
              total_price: row.total_price,
              raw_material_features: [],
            });
          }
  
          if (row.feature_id) {
            materialsMap.get(row.material_id).raw_material_features.push({
              feature_id: row.feature_id,
              raw_material_feature: row.raw_material_feature,
              raw_material_value: row.raw_material_value,
            });
          }
        });
  
        res.status(200).json({ raw_materials: Array.from(materialsMap.values()) });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch raw materials', message: err.message });
      }
    }
  );
dashboard.get('/api/raw/stock/history/:raw_material_id',
    // validateJwt,
    // authorizeRoles('admin'),
    async (req, res) => {
      const { raw_material_id } = req.params;
  
      try {
        const historyQuery = `
          SELECT * FROM raw_materials_stock_history 
          WHERE raw_material_id = $1
          ORDER BY updated_at DESC;
        `;
  
        const result = await db.query(historyQuery, [raw_material_id]);
  
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'No history found for the given raw material ID' });
        }
  
        res.status(200).json({ history: result.rows });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch raw material history', message: err.message });
      }
    }
  );
  

// API to add raw material to a model
dashboard.post('/api/model/:modelId/add-raw-material',
  validateJwt,
  authorizeRoles('admin'),
  async (req, res) => {
    const { modelId } = req.params;
    const { raw_material_id, required_qty } = req.body;
    console.log(`raw ${req.body}`)
    // Validate input
    if (!raw_material_id || !required_qty) {
      return res.status(400).json({ error: 'raw_material_id and required_qty are required' });
    }

    try {
      // Check if the model exists
      const modelCheckQuery = `
          SELECT id, model FROM price_table WHERE id = $1;
      `;
      const modelCheckResult = await db.query(modelCheckQuery, [modelId]);

      if (modelCheckResult.rows.length === 0) {
        return res.status(404).json({ error: 'Model not found' });
      }

      const modelName = modelCheckResult.rows[0].model;

      // Check if the raw material exists
      const rawMaterialCheckQuery = `
          SELECT id FROM raw_materials_stock WHERE id = $1;
      `;
      const rawMaterialCheckResult = await db.query(rawMaterialCheckQuery, [raw_material_id]);

      if (rawMaterialCheckResult.rows.length === 0) {
        return res.status(404).json({ error: 'Raw material not found' });
      }

      // Insert new record into thing_raw_materials
      const insertQuery = `
          INSERT INTO thing_raw_materials (raw_material_id, model_name, required_qty, model_id)
          VALUES ($1, $2, $3, $4) RETURNING id;
      `;
      const insertResult = await db.query(insertQuery, [raw_material_id, modelName, required_qty, modelId]);

      res.status(201).json({
        message: 'Raw material added to the model successfully',
        thing_raw_material_id: insertResult.rows[0].id,
      });
    } catch (err) {
      console.error('Error adding raw material to model:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

// API to get a price_table model with its raw materials and required quantities
dashboard.get('/api/model/:modelId',
  validateJwt,
  authorizeRoles('admin'),
  async (req, res) => {
    const { modelId } = req.params;

    try {
      // Query to get model details from price_table
      const modelQuery = `
            SELECT id, model, mrp, retail_price,discount, warranty_period, lastmodified
            FROM price_table
            WHERE id = $1;
        `;
      const modelResult = await db.query(modelQuery, [modelId]);

      if (modelResult.rows.length === 0) {
        return res.status(404).json({ error: 'Model not found' });
      }

      const model = modelResult.rows[0];

      // Query to get raw materials and their required quantities
      const rawMaterialsQuery = `
            SELECT rm.id AS raw_material_id, rm.Component,rm.package, rm.category, rm.value, 
                   rm.reference_no, rm.image, rm.stock_quantity, rm.reorder_level, 
                   trm.required_qty,trm.id,trm.model_id
            FROM thing_raw_materials trm
            INNER JOIN raw_materials_stock rm ON trm.raw_material_id = rm.id
            WHERE trm.model_id = $1;
        `;
      const rawMaterialsResult = await db.query(rawMaterialsQuery, [modelId]);

      // Combine model details with raw materials
      const response = {
        model,
        raw_materials: rawMaterialsResult.rows,
      };

      res.status(200).json(response);
    } catch (err) {
      console.error('Error fetching data:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }

  });

//update of models rawmaterial_req_qty
dashboard.put('/api/update/raw/:modelId/:rawMaterialId',
  validateJwt,
  authorizeRoles('admin'),
  async (req, res) => {
    const { modelId, rawMaterialId } = req.params;
    const { requiredQty } = req.body;
    console.log(modelId, rawMaterialId, requiredQty)
    // Validate inputs
    if (!modelId || !rawMaterialId || requiredQty == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (isNaN(requiredQty) || requiredQty < 0) {
      return res.status(400).json({ error: 'Invalid required quantity' });
    }

    try {
      // Perform update query
      const result = await db.query(
        `UPDATE thing_raw_materials 
       SET required_qty = $1, updated_at = NOW() 
       WHERE model_id = $2 AND id = $3 
       RETURNING *`,
        [requiredQty, modelId, rawMaterialId]
      );


      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Record not found' });
      }

      res.status(200).json({
        message: 'Required quantity updated successfully',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Error updating required quantity:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

//delete raw materials in an model
dashboard.delete('/api/delete/thingrawmaterials/:id',
  validateJwt,
  authorizeRoles('admin'),
  async (req, res) => {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID parameter' });
    }

    try {
      const result = await db.query(
        'DELETE FROM thing_raw_materials WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Record not found' });
      }

      res.status(200).json({ message: 'Record deleted successfully', data: result.rows[0] });
    } catch (error) {
      console.error('Error deleting record:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

// -----------------for dealers------------------
// Get customers by `addedby`
dashboard.get('/api/display/customer/dealers/:dealerid', async (req, res) => {
  const { search } = req.query;
  const { dealerid } = req.params;

  try {
    let query = `
      SELECT 
        id, name, address, email, phone, alt_phone, 
        total_amount, paid_amount, balance, refund_amount, lastmodified 
      FROM 
        customers_details 
      WHERE 
        addedby = $1`;

    const params = [dealerid];

    // Add search filter if provided
    if (search) {
      query += ` AND (name ILIKE $2 OR phone ILIKE $3)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    const result = await db.query(query, params);

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching customer details.',
    });
  }
});
// API to get stock things details by email and optional status
// API to get stock things details by email, status, and serialno
// Route: Fetch dealersStock with thing details

dashboard.get('/api/dealersstock/:status', async (req, res) => {
  const { serialno } = req.query;
  const { status } = req.params;
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email is required.',
    });
  }

  try {
    let query = `
      SELECT 
        ds.id AS stock_id,
        ds.thingid,
        ds.status,
        ds.added_at,
        ds.added_by,
        dd.name AS dealer_name,
        dd.phone AS dealer_phone,
        dd.email AS dealer_email,
        t.thingName AS thing_name,
        t.serialno AS thing_serialno,
        t.model AS thing_model,
        t.latitude AS thing_latitude,
        t.longitude AS thing_longitude,
        t.type AS thing_type,
        t.macaddress AS thing_macaddress
      FROM 
        dealersStock ds
      INNER JOIN 
        dealers_details dd ON ds.user_id = dd.id
      INNER JOIN 
        Things t ON ds.thingid = t.id
      WHERE 
        dd.email = $1
    `;

    const params = [email];

    // Add status filter if provided
    if (status) {
      query += ` AND ds.status = $2`;
      params.push(status);
    }

    // Add serialno filter if provided
    if (serialno) {
      query += ` AND t.serialno ILIKE $${params.length + 1}`;
      params.push(`%${serialno}%`);
    }

    const { rows } = await db.query(query, params);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No matching records found.',
      });
    }

    res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching data.',
    });
  }
});

dashboard.get('/api/display/dealersstock/:status', async (req, res) => {
  const { email } = req.query;
  const { status } = req.params

  if (!status || !email) {
    return res.status(400).json({ error: 'Status and email are required parameters.' });
  }

  try {
    const query = `
          SELECT 
              ds.id AS stock_id,
              ds.thingid,
              ds.user_id,
              ds.status,
              ds.added_at,
              ds.added_by,
              dd.name AS dealer_name,
              dd.email AS dealer_email,
              dd.phone AS dealer_phone,
              dd.total_amount,
              dd.balance
          FROM 
              dealersStock ds
          JOIN 
              dealers_details dd
          ON 
              ds.user_id = dd.id
          WHERE 
              ds.status = $1
              AND dd.email = $2
      `;

    const values = [status, email];

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No matching records found.' });
    }

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching dealers stock:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// API endpoint to insert dealer data
dashboard.post('/api/add-dealer/:user_id', async (req, res) => {
  const { user_id } = req.params;
  const { company_name, GSTIN, logo } = req.body;

  if (!company_name) {
    return res.status(400).json({ error: 'Company name are required' });
  }

  try {
    // Check if the user_id exists in the users table
    const userCheckQuery = `SELECT id FROM users WHERE id = $1`;
    const userCheckResult = await db.query(userCheckQuery, [user_id]);

    if (userCheckResult.rowCount === 0) {
      return res.status(400).json({ error: 'User ID does not exist' });
    }

    // Check if the user_id already exists multiple times in dealers_store table
    const dealerCheckQuery = `SELECT COUNT(*) FROM dealers_store WHERE user_id = $1`;
    const dealerCheckResult = await db.query(dealerCheckQuery, [user_id]);

    if (parseInt(dealerCheckResult.rows[0].count) > 0) {
      return res.status(400).json({ error: 'User ID already has a dealer entry' });
    }

    // Insert dealer data if user_id is valid and not duplicated
    const query = `
      INSERT INTO dealers_store (company_name, GSTIN, logo, user_id) 
      VALUES ($1, $2, $3, $4) 
      RETURNING *;
    `;
    const values = [company_name, GSTIN, logo || null, user_id];

    const result = await pool.query(query, values);
    res.status(201).json({ message: 'Dealer added successfully', dealer: result.rows[0] });

  } catch (error) {
    console.error('Error inserting dealer:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// API endpoint to update dealer data by user_id
dashboard.put('/update-dealer/:user_id', async (req, res) => {
  const { user_id } = req.params;
  const { company_name, GSTIN, logo } = req.body;

  if (!company_name && !GSTIN && !logo) {
    return res.status(400).json({ error: 'At least one field is required to update' });
  }

  try {
    // Check if the user_id exists in the dealers_store table
    const dealerCheckQuery = `SELECT id FROM dealers_store WHERE user_id = $1`;
    const dealerCheckResult = await pool.query(dealerCheckQuery, [user_id]);

    if (dealerCheckResult.rowCount === 0) {
      return res.status(404).json({ error: 'Dealer entry not found for the given user ID' });
    }

    // Construct dynamic update query based on provided fields
    let updateFields = [];
    let values = [];
    let counter = 1;

    if (company_name) {
      updateFields.push(`company_name = $${counter++}`);
      values.push(company_name);
    }
    if (GSTIN) {
      updateFields.push(`GSTIN = $${counter++}`);
      values.push(GSTIN);
    }
    if (logo) {
      updateFields.push(`logo = $${counter++}`);
      values.push(logo);
    }

    values.push(user_id); // Add user_id to values for WHERE condition

    const updateQuery = `
      UPDATE dealers_store 
      SET ${updateFields.join(', ')} 
      WHERE user_id = $${counter} 
      RETURNING *;
    `;

    const result = await pool.query(updateQuery, values);

    res.status(200).json({ message: 'Dealer updated successfully', dealer: result.rows[0] });

  } catch (error) {
    console.error('Error updating dealer:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --------------audit_log------------------
// dashboard.get("/api/display/auditlog/:thingmac", async (req, res) => {
//   const { thingmac } = req.params;
//   const { page, pageSize } = req.query; // Default to page 1 and 10 items per page

//   try {
//     const offset = (page - 1) * pageSize; // Calculate the offset based on the page number and page size
//     const limit = pageSize; // Limit based on the page size

//     const query = `
//       SELECT event_data, timestamp
//       FROM audit_logs
//       WHERE thing_mac = $1
//       ORDER BY timestamp ASC
//      ;
//     `;
//     // LIMIT $2 OFFSET $3
//     const dbResult = await db.query(query, [thingmac]);

//     let events = [];

//     dbResult.rows.forEach((row) => {
//       // ✅ Ensure event_data is valid before parsing
//       const eventData = row.event_data
//         ? typeof row.event_data === "string"
//           ? JSON.parse(row.event_data)
//           : row.event_data
//         : {};

//       // ✅ Use full ISO timestamp instead of local time
//       const timestamp = new Date(row.timestamp).toISOString();

//       // ✅ Ensure method is properly extracted
//       const method = eventData?.status?.desired?.u || "Unknown";

//       // ✅ Handling connection/disconnection events
//       if (eventData?.status?.desired?.command === "device_update") {
//         if (eventData.status.desired.status === "disconnected") {
//           events.push({
//             state: "DISCONNECTED",
//             time: timestamp,
//             method: method,
//             type: "Connection",
//           });
//         } else if (eventData.status.desired.status === "connected") {
//           events.push({
//             state: "CONNECTED",
//             time: timestamp,
//             method: method,
//             type: "Connection",
//           });
//         }
//       }

//       // ✅ Handling switch logs
//       if (eventData.status?.desired) {
//         Object.entries(eventData.status.desired).forEach(([key, value]) => {
//           if (key.startsWith("s") && key.length === 2) {
//             const switchNumber = `${thingmac}_${key.substring(1)}`;
//             const switchState = value === "1" ? "ON" : "OFF";

//             events.push({
//               switch: switchNumber,
//               state: switchState,
//               time: timestamp,
//               method: method,
//               type: "Switch",
//             });
//           }
//         });
//       }
//     });

//     // ✅ Sort by full timestamp, not just time string
//     events.sort((a, b) => new Date(a.time) - new Date(b.time));

//     // ✅ Return the events as JSON, including pagination metadata
//     return res.json({
//       page,
//       pageSize,
//       total: dbResult.rowCount, // You could modify this part to return total records count if needed
//       events,
//     });
//   } catch (err) {
//     console.error("Database query error:", err);
//     return res.status(500).json({ error: "Internal Server Error" });
//   }
// });
// dashboard.get("/api/display/auditlog/:thingmac", async (req, res) => {
//   const { thingmac } = req.params;
//   const page = parseInt(req.query.page) || 1;
//   const pageSize = parseInt(req.query.pageSize) || 10;

//   try {
//     // const offset = (page - 1) * pageSize;
//     // const limit = pageSize;
//       // LIMIT $2 OFFSET $3;
    
//     const query = `
//       SELECT event_data, timestamp, COUNT(*) OVER() AS total_count
//       FROM audit_logs
//       WHERE thing_mac = $1
//       ORDER BY timestamp DESC
//     `;
   
//     const dbResult = await db.query(query, [thingmac]);
//     // , limit, offset
//     let events = [];

//     dbResult.rows.forEach((row) => {
//       const eventData = row.event_data
//         ? typeof row.event_data === "string"
//           ? JSON.parse(row.event_data)
//           : row.event_data
//         : {};

//       const timestamp = new Date(row.timestamp).toISOString();
//       const method = eventData?.status?.desired?.u || "Unknown";

//       if (eventData?.status?.desired?.command === "device_update") {
//         if (eventData.status.desired.status === "disconnected") {
//           events.push({
//             state: "DISCONNECTED",
//             time: timestamp,
//             method: method,
//             type: "Connection",
//           });
//         } else if (eventData.status.desired.status === "connected") {
//           events.push({
//             state: "CONNECTED",
//             time: timestamp,
//             method: method,
//             type: "Connection",
//           });
//         }
//       }

//       if (eventData.status?.desired) {
//         Object.entries(eventData.status.desired).forEach(([key, value]) => {
//           if (key.startsWith("s") && key.length === 2) {
//             const switchNumber = `${thingmac}_${key.substring(1)}`;
//             const switchState = value === "1" ? "ON" : "OFF";

//             events.push({
//               switch: switchNumber,
//               state: switchState,
//               time: timestamp,
//               method: method,
//               type: "Switch",
//             });
//           }
//         });
//       }
//     });

//     // ✅ No need to manually sort, since SQL now orders correctly
//     return res.json({
//       page,
//       pageSize,
//       total: dbResult.rows.length > 0 ? parseInt(dbResult.rows[0].total_count) : 0,
//       events,
//     });
//   } catch (err) {
//     console.error("Database query error:", err);
//     return res.status(500).json({ error: "Internal Server Error" });
//   }
// });

dashboard.get("/api/display/auditlog/:thingmac", async (req, res) => {
  const { thingmac } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = parseInt(req.query.pageSize, 10) || 10;

  try {
    // const offset = (page - 1) * pageSize;
    // const limit = pageSize;

    const query = `
      SELECT event_data, timestamp, COUNT(*) OVER() AS total_count
      FROM audit_logs
      WHERE thing_mac = $1
      ORDER BY timestamp DESC
      
    `;
    // LIMIT $2 OFFSET $3;
    // , limit, offset
    const dbResult = await db.query(query, [thingmac]);

    let events = [];

    dbResult.rows.forEach((row) => {
      const eventData = row.event_data
        ? typeof row.event_data === "string"
          ? JSON.parse(row.event_data)
          : row.event_data
        : {};

      const timestamp = new Date(row.timestamp).toISOString();

      // Handle event data whether it's inside status or status.desired
      const status = eventData?.status || {};
      const desiredStatus = status?.desired || {};

      const method = status?.u || desiredStatus?.u || "Unknown";

      // ✅ Handling connection/disconnection events
      if (status?.command === "device_update" || desiredStatus?.command === "device_update") {
        const deviceStatus = status?.status || desiredStatus?.status;
        if (deviceStatus === "disconnected") {
          events.push({
            state: "DISCONNECTED",
            time: timestamp,
            method,
            type: "Connection",
          });
        } else if (deviceStatus === "connected") {
          events.push({
            state: "CONNECTED",
            time: timestamp,
            method,
            type: "Connection",
          });
        }
      }

      // ✅ Handling switch logs (Check both status and status.desired)
      [status, desiredStatus].forEach((data) => {
        if (data) {
          Object.entries(data).forEach(([key, value]) => {
            if (key.startsWith("s") && key.length === 2) {
              const switchNumber = `${thingmac}_${key.substring(1)}`;
              const switchState = value === "1" ? "ON" : "OFF";

              events.push({
                switch: switchNumber,
                state: switchState,
                time: timestamp,
                method,
                type: "Switch",
              });
            }
          });
        }
      });
    });

    return res.json({
      page,
      pageSize,
      total: dbResult.rows.length > 0 ? parseInt(dbResult.rows[0].total_count, 10) : 0,
      events,
    });
  } catch (err) {
    console.error("Database query error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

dashboard.get("/api/device/wifi/status/:thingmac", wifidata);
                                                             
dashboard.get("/api/display/alert/notifications/", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM alert_notifications ORDER BY sent_at DESC");
    res.json(result.rows);
  } catch (error) {
    console.error(" Error fetching notifications:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

dashboard.delete("/api/delete/notifications/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query("DELETE FROM alert_notifications WHERE id = $1 RETURNING *", [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ message: "Notification deleted", deletedNotification: result.rows[0] });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

dashboard.get("/api/display/single/alert/notifications/:id", async (req, res) => {
  try {
    const { id } = req.params; // Extract id from the route params
    const result = await db.query("SELECT * FROM alert_notifications WHERE id = $1 ORDER BY sent_at DESC", [id]);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// dashboard.put("/api/alert_notifications/:id/toggle-read", async (req, res) => {
//   const { id } = req.params;

//   const client = await db.connect();

//   try {
//     // Toggle the read status
//     const updateQuery = await client.query(
//       `UPDATE alert_notifications 
//        SET read = NOT COALESCE(read, FALSE) 
//        WHERE id = $1 
//        RETURNING id, title, body, topic, read, sent_at`,
//       [id]
//     );

//     if (updateQuery.rowCount === 0) {
//       return res.status(404).json({ error: `Notification with ID ${id} not found` });
//     }

//     return res.status(200).json({
//       message: "Notification read status toggled successfully",
//       notification: updateQuery.rows[0],
//     });
//   } catch (error) {
//     console.error("Error toggling read status:", error);
//     return res.status(500).json({ error: "Internal server error" });
//   } finally {
//     client.release();
//   }
// });
dashboard.put("/api/alert_notifications/:id/toggle-read", async (req, res) => {
  const { id } = req.params;

  const client = await db.connect();

  try {
    // Toggle the read status
    const updateQuery = await client.query(
      `UPDATE alert_notifications 
       SET read = TRUE
       WHERE id = $1  
       RETURNING id, title, body, topic, read, sent_at`,
      [id]
    );

    if (updateQuery.rowCount === 0) {
      return res.status(404).json({ error: `Notification with ID ${id} not found` });
    }

    return res.status(200).json({
      message: "Notification read status toggled successfully",
      notification: updateQuery.rows[0],
    });
  } catch (error) {
    console.error("Error toggling read status:", error);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});


dashboard.get("/api/alert_notifications/unread-count", async (req, res) => {
  const client = await db.connect();

  try {
    const countQuery = await client.query(
      `SELECT COUNT(*) AS unread_count 
       FROM alert_notifications 
       WHERE read IS FALSE OR read IS NULL`
    );

    return res.status(200).json({
      message: "Unread notifications count retrieved successfully",
      unread_count: parseInt(countQuery.rows[0].unread_count, 10),
    });
  } catch (error) {
    console.error("Error fetching unread notifications count:", error);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

dashboard.get("/api/thing-attributes/:thingId", async (req, res) => {
  const { thingId } = req.params; // Get thingId from URL params

  const sql = `
      SELECT thingid, attributename, attributevalue, lastmodified 
      FROM ThingAttributes
      WHERE thingid = $1;
  `;

  try {
      const { rows } = await db.query(sql, [thingId]);

      if (rows.length === 0) {
          return res.status(404).json({ message: "No attributes found for the given thingId" });
      }

      // Transform the results into a structured format
      const groupedData = {
          thingId: parseInt(thingId),
          attributes: {},
          lastModified: rows[0].lastmodified
      };

      rows.forEach(row => {
          groupedData.attributes[row.attributename] = row.attributevalue;
      });

      res.json(groupedData);
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});
module.exports = dashboard;
