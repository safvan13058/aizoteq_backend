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
const {wifidata}=require('../MQTT/mqtt.js')

dashboard.get('/', (req, res) => {
  res.send('dashboard working ')
})
const { swaggerU, spec } = require("./swaggerdoc_dash/swagger.js");
dashboard.use("/api-dashboard", swaggerU.serve, swaggerU.setup(spec));

// API endpoint to count users
dashboard.get('/api/users/count',
  validateJwt,
  authorizeRoles('admin', 'dealers'),
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

dashboard.get('/api/searchThings/working/:status',
  validateJwt,
  authorizeRoles('admin', 'dealers'),
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
// dashboard.post("/api/billing/return/:status", async (req, res) => {
//     const { serial_numbers, returned_by } = req.body;
//     const { status } = req.params;

//     // Ensure serial_numbers is present and has at least one item
//     if (!serial_numbers || serial_numbers.length === 0) {
//       return res.status(400).json({ error: "At least one serial number is required" });
//     }

//     const client = await db.connect();

//     try {
//       await client.query("BEGIN");

//       let totalReturnAmount = 0;
//       const receiptItems = []; // To store item details for the billing receipt
//       let data;
//       let source;
//       let sourceType;
//       let itemResult;
//       // Process each serial number
//       for (let serial_no of serial_numbers) {
//         // Locate the item in the relevant stock tables using serial_no
//         const itemQuery = await client.query(
//           `
//           SELECT 'dealersStock' AS source, id, user_id, thing_id
//           FROM dealersStock
//           WHERE thing_id = (SELECT id FROM Things WHERE serialno = $1) AND status != 'returned'

//           UNION ALL

//           SELECT 'customersStock' AS source, id, user_id, thing_id
//           FROM customersStock
//           WHERE thing_id = (SELECT id FROM Things WHERE serialno = $1) AND status != 'returned'

//           UNION ALL

//           SELECT 'onlinecustomerStock' AS source, id, user_id, thing_id
//           FROM onlinecustomerStock
//           WHERE thing_id = (SELECT id FROM Things WHERE serialno = $1) AND status != 'returned'
//           `,
//           [serial_no]
//         );

//         // Check if the item is found
//         if (itemQuery.rows.length === 0) {
//           throw new Error(`Item with serial number ${serial_no} not found or already returned`);
//         }
//          itemResult = await client.query(
//           `SELECT * FROM billing_items WHERE serial_no = $1 LIMIT 1`,
//           [serial_no]
//         );


//         if (itemResult.rows.length > 0) {
//           const retailPrice = itemResult.rows[0].retail_price;
//           console.log('Retail Price:',itemResult.rows[0] );
//         } else {
//           console.log('No item found with the provided serial number');
//         }
//         const retail_price = itemResult.rows[0].retail_price;
//         const { source, id: stockId, user_id, thing_id } = itemQuery.rows[0];
//         sourceType = source ? source.replace("Stock", "") : null;
//         // Remove item from its source stock table
//         await client.query(`DELETE FROM ${source} WHERE id = $1`, [stockId]);

//         // Add item to AdminStock with status "returned"

//         await client.query(
//           `
//           INSERT INTO AdminStock (thingId, addedBy, status)
//           VALUES ($1, $2, $3)
//           `,
//           [thing_id, returned_by, status]
//         );

//         let table;
//         if (source === "onlinecustomerStock") {
//           table = "onlinecustomer_details";
//         }
//         if (source === "customersStock") {
//           table = "customers_details";
//         }
//         if (source === "dealersStock") {
//           table = "dealers_details";
//         }

//         // Fetch the user data from the respective table
//         const dataQuery = await client.query(`SELECT * FROM ${table} WHERE id = $1`, [user_id]);
//         data = dataQuery.rows[0];
//         console.log(data)
//         if (!data) {
//           throw new Error(`User with ID ${user_id} not found`);
//         }

//         // Update the balance in the relevant customer/dealer table
//        // Update the balance and refund_amount in the relevant customer/dealer table
//       let balanceUpdateQuery = '';
//       let balanceUpdateValues = [];

//       if (status === "return") {
//         // Refund scenario
//         balanceUpdateQuery = `
//           UPDATE ${table}
//           SET balance = balance - $1, refund_amount = refund_amount + $2
//           WHERE id = $3
//           RETURNING balance, refund_amount;
//         `;
//         balanceUpdateValues = [retail_price, retail_price, user_id];
//       } else if (status === "exchange") {
//         // Exchange scenario
//         const priceDifference = new_item_price - retail_price;

//         if (priceDifference > 0) {
//           // Customer needs to pay extra
//           balanceUpdateQuery = `
//             UPDATE ${table}
//             SET balance = balance + $1
//             WHERE id = $2
//             RETURNING balance;
//           `;
//           balanceUpdateValues = [priceDifference, user_id];
//         } else {
//           // Customer receives a refund
//           balanceUpdateQuery = `
//             UPDATE ${table}
//             SET balance = balance - $1, refund_amount = refund_amount + $2
//             WHERE id = $3
//             RETURNING balance, refund_amount;
//           `;
//           balanceUpdateValues = [-priceDifference, -priceDifference, user_id];
//         }
//       }

//       // Execute the balance update
//       const balanceResult = await client.query(balanceUpdateQuery, balanceUpdateValues);
//       const updatedBalance = balanceResult.rows[0].balance;

//       // Update total return amount (only for returns)
//       if (status === "returned") {
//         totalReturnAmount += retail_price;
//       }


//         // Store item details for the billing receipt
//         receiptItems.push({
//           serial_no,
//           retail_price: -retail_price, // Negative value for return
//         });

//         // Update warranty table if applicable
//         await client.query(
//           `
//           DELETE FROM thing_warranty
//           WHERE serial_no = $1
//           `,
//           [serial_no]
//         );
//       }

//       // Generate the next receipt number
//       const lastReceiptQuery = await client.query(
//         `SELECT receipt_no FROM billing_receipt ORDER BY id DESC LIMIT 1`
//       );
//       const receiptNo =
//         lastReceiptQuery.rows.length > 0 ? parseInt(lastReceiptQuery.rows[0].receipt_no) + 1 : 1000;
//         console.log(data);
//         console.log(data.name);
//       // Insert return record into `billing_receipt`
//       const billingReceiptResult = await client.query(
//         `
//         INSERT INTO billing_receipt (
//           receipt_no, name, phone, dealer_or_customer, total_amount, balance, billing_createdby,
//           dealers_id, customers_id, onlinecustomer_id, type,billing_address, datetime
//         ) VALUES (
//           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,$12, CURRENT_TIMESTAMP
//         ) RETURNING id, receipt_no
//         `,
//         [
//           receiptNo,
//           data.name, // Name of the person performing the return
//           data.phone, // Phone number (optional, can be updated if required)
//           sourceType, // Source type (dealers, customers, or onlinecustomers)
//           -totalReturnAmount, // Return amount as a negative value
//           updatedBalance, // Balance for this return
//           returned_by, // User who processed the return
//           source === "dealersStock" ? user_id : null,
//           source === "customersStock" ? user_id : null,
//           source === "onlinecustomerStock" ? user_id : null,
//           status ,// The status passed in the request params
//           data.address
//         ]
//       );

//       const { id: billingReceiptId } = billingReceiptResult.rows[0];

//       // Insert returned item details into `billing_items`
//       for (let item of receiptItems) {
//         await client.query(
//           `
//           INSERT INTO billing_items (
//             receipt_no, type, model, serial_no, mrp, retail_price
//           ) VALUES ($1, $2, $3, $4, $5, $6)
//           `,
//           [
//             receiptNo,
//             status, // The status passed in the request params
//             itemResult.rows[0].model, // Model (optional, can be retrieved if needed)
//             item.serial_no,
//             0, // MRP (optional)
//             item.retail_price, // Refund amount
//           ]
//         );
//       }

//       await client.query("COMMIT");

//       // Respond with success details
//       return res.status(200).json({
//         message: "Items successfully returned and added to AdminStock",
//         total_return_amount: totalReturnAmount,
//         receipt_no: receiptNo,
//       });
//     } catch (error) {
//       await client.query("ROLLBACK");
//       console.error("Error processing return:", error);
//       return res.status(500).json({ error: "Internal server error" });
//     } finally {
//       client.release();
//     }
//   });

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
    const allowedRoles = ['admin', 'staff', 'customer', 'dealers']; // Valid roles

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
  authorizeRoles('admin','dealer'),
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
  authorizeRoles('admin','dealer'),
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

// Read all entries from the price_table
dashboard.get('/api/display/prices-table',
  validateJwt,
  authorizeRoles('admin','dealer'),
  async (req, res) => {
    console.log(`working pricetable ${req.user} `)
    const { search } = req.query; // Get the search query from the request

    try {
      // Base query
      let query = 'SELECT * FROM price_table';
      const params = [];

      // Add search condition if a search query is provided
      if (search) {
        query += ' WHERE model ILIKE $1'; // Use ILIKE for case-insensitive search
        params.push(`%${search}%`); // Add wildcards for partial matching
      }

      // Execute the query
      const result = await db.query(query, params);
      res.status(200).json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to retrieve prices' });
    }
  });

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

// dashboard.post("/api/upload-images/:model_id", upload.array("images", 5), async (req, res) => {
//     const { model_id } = req.params;
  
//     try {
//       if (!req.files || req.files.length === 0) {
//         return res.status(400).json({ message: "No files uploaded" });
//       }
  
//       // Save image URLs to the database
//       const imageUrls = req.files.map((file) => file.location); // S3 public URLs
//       const queries = imageUrls.map((url) =>
//         pool.query(
//           "INSERT INTO model_features_image (model_id, image_url) VALUES ($1, $2)",
//           [model_id, url]
//         )
//       );
//       await Promise.all(queries);
  
//       res.status(200).json({
//         message: "Images uploaded successfully",
//         imageUrls,
//       });
//     } catch (error) {
//       console.error("Error uploading images:", error);
//       res.status(500).json({ message: "Internal server error" });
//     }
//   });

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
//       return res.status(400).json({ message: "Maximum of 5 images allowed per model." });
//     }

//     // Determine how many new images can be uploaded
//     const availableSlots = 5 - currentImageCount;
//     if (req.files.length > availableSlots) {
//       return res.status(400).json({ message: `You can only upload ${availableSlots} more images.` });
//     }

//     // Save local image file paths to the database
//     const imagePaths = req.files.map((file) => `/uploads/${file.filename}`);
//     const queries = imagePaths.map((filePath) =>
//       db.query(
//         "INSERT INTO model_features_image (model_id, image_url) VALUES ($1, $2)",
//         [model_id, filePath]
//       )
    
//     );
//     console.log(`imagepaths:${imagePaths}`)
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
// API to delete an image by its ID
dashboard.delete("/api/delete-image/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // // Fetch the image_url from the database
    // const queryResult = await db.query(
    //   "SELECT image_url FROM model_features_image WHERE id = $1",
    //   [id]
    // );

    // if (queryResult.rows.length === 0) {
    //   return res.status(404).json({ message: "Image not found" });
    // }

    // const imageUrl = queryResult.rows[0].image_url;

    // // Extract the S3 key from the image URL
    // const bucketName = "YOUR_BUCKET_NAME"; // Replace with your bucket name
    // const s3Key = imageUrl.split(`${bucketName}/`)[1];

    // // Delete the image from S3
    // await s3
    //   .deleteObject({
    //     Bucket: bucketName,
    //     Key: s3Key,
    //   })
    //   .promise();

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
// Serve images from the "uploads" folder
// dashboard.use('/uploads', express.static(path.join(__dirname,'/uploads')));
  // API to get images and features of a model by model_id
// dashboard.get("/api/display/model/features/:model_id", async (req, res) => {
//   const { model_id } = req.params;

//   try {
//     // Query to fetch features
//     const featuresQuery = `
//       SELECT feature 
//       FROM model_features 
//       WHERE model_id = $1;
//     `;
//     const featuresResult = await db.query(featuresQuery, [model_id]);

//     // Query to fetch image URLs
//     const imagesQuery = `
//       SELECT image_url 
//       FROM model_features_image 
//       WHERE model_id = $1;
//     `;
//     const imagesResult = await db.query(imagesQuery, [model_id]);

//     // Combine results
//     const features = featuresResult.rows.map(row => row.feature);
//     const images = imagesResult.rows.map(row => row.image_url);

//     if (features.length === 0 && images.length === 0) {
//       return res.status(404).json({ message: "No data found for the given model_id" });
//     }

//     res.json({
//       model_id,
//       features,
//       images,
//     });
//   } catch (error) {
//     console.error("Error fetching data:", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// });
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
dashboard.post("/api/upload-images/:model_id", uploads.array("images", 5), async (req, res) => {
  const { model_id } = req.params;
  console.log("Uploaded files:", req.files);

  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

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
        "INSERT INTO model_features_image (model_id, image_url) VALUES ($1, $2)",
        [model_id, filePath]
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


// Example: Your existing API route
// dashboard.get('/api/display/model/features/:model_id', async (req, res) => {
//   const { model_id } = req.params;

//   try {
//     // Query to fetch features
//     const featuresQuery = `
//       SELECT feature 
//       FROM model_features 
//       WHERE model_id = $1;
//     `;
//     const featuresResult = await db.query(featuresQuery, [model_id]);

//     // Query to fetch image filenames (stored in 'uploads' directory)
//     const imagesQuery = `
//       SELECT image_url
//       FROM model_features_image 
//       WHERE model_id = $1;
//     `;
//     const imagesResult = await db.query(imagesQuery, [model_id]);

//     // Combine results
//     const features = featuresResult.rows.map(row => row.feature);
//     const images = imagesResult.rows.map(row => `/uploads/${row.image_filename}`); // Construct the full URL

//     if (features.length === 0 && images.length === 0) {
//       return res.status(404).json({ message: "No data found for the given model_id" });
//     }

//     res.json({
//       model_id,
//       features,
//       images,
//     });
//   } catch (error) {
//     console.error("Error fetching data:", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// });

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
dashboard.post('/api/raw_materials/create',
  validateJwt,
  authorizeRoles('admin'),
  upload.single('image'), async (req, res) => {
    const { Component, package, category, value, unit_price_in_rupees, unit_price_in_dollars, reference_no, stock_quantity, reorder_level } = req.body;
    let fileUrl = null;
    console.log(req.body)
    if (req.file) {
      // console.log(req.file)
      const file = req.file;
      const fileKey = `raw_materials/${Date.now()}-${file.originalname}`; // Unique file name
      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: fileKey,
        Body: file.buffer,
        ContentType: file.mimetype,
        // ACL: 'public-read', // Uncomment if you want the file to be publicly readable
      };

      const uploadResult = await s3.upload(params).promise();
      fileUrl = uploadResult.Location; // S3 file URL
    }

    const query = `INSERT INTO raw_materials_stock (Component, category,package, value, reference_no, image,unit_price_in_rupees,unit_price_in_dollars,stock_quantity, reorder_level)
                 VALUES ($1, $2, $3, $4, $5, $6, $7,$8,$9,$10) RETURNING id`;

    try {
      const result = await db.query(query, [Component, category, package, value, reference_no, fileUrl, unit_price_in_rupees, unit_price_in_dollars, stock_quantity, reorder_level]);
      res.status(201).json({ message: 'Raw material created successfully', id: result.rows[0].id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create raw material', message: err.message });
    }
  });

// API to update a raw material by ID
dashboard.put('/api/raw_materials/update/:id',
  validateJwt,
  authorizeRoles('admin'),
  upload.single('image'), async (req, res) => {
    const { id } = req.params;
    console.log(req.body)
    const {
      Component, category, package: pkg, value, reference_no,
      unit_price_in_rupees, unit_price_in_dollars, stock_quantity, reorder_level
    } = req.body;

    let fileUrl = null;

    // If an image file is uploaded, process it for S3
    if (req.file) {
      const file = req.file;
      const fileKey = `raw_materials/${Date.now()}-${file.originalname}`; // Unique file name
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
      // Dynamically construct query
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
      console.error(err);
      res.status(500).json({ error: 'Failed to update raw material', message: err.message });
    }
  });

dashboard.put('/api/raw/stock/update/:id',
  validateJwt,
  authorizeRoles('admin'),
  async (req, res) => {
    const { id } = req.params;
    const { stock_quantity } = req.body;  // Only extract stock_quantity

    const query = `
    UPDATE raw_materials_stock
    SET stock_quantity = $1
    WHERE id = $2
  `;

    try {
      await db.query(query, [stock_quantity, id]); // Update only stock_quantity
      res.status(200).json({ message: 'Stock quantity updated successfully' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update stock quantity', message: err.message });
    }
  });

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
dashboard.get('/api/raw_materials',
  validateJwt,
  authorizeRoles('admin'),
  async (req, res) => {
    const { search, category } = req.query;
    console.log(req.query)
    let query = 'SELECT * FROM raw_materials_stock WHERE 1=1';
    const params = [];
    let paramIndex = 1; // Keeps track of parameter indices for SQL injection protection

    if (search) {
      query += ` AND (
      Component ILIKE $${paramIndex} OR
      category ILIKE $${paramIndex} OR
      package ILIKE $${paramIndex} OR
      value ILIKE $${paramIndex} OR
      reference_no ILIKE $${paramIndex}
    )`;
      params.push(`%${search}%`);
      paramIndex++; // Increment index after adding a parameter
    }

    if (category) {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
    }

    try {
      const result = await db.query(query, params);
      res.status(200).json({ raw_materials: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch raw materials', message: err.message });
    }
  });

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

  if (!company_name ) {
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
// dashboard.get('/api/display/auditlog/:thingmac'),async(req,res)=>{
   
//   const mac=req.params.thingmac;
//   try {
//     await client.connect();
//     const query = `
//       SELECT event_data, timestamp
//       FROM audit_logs
//       WHERE thing_mac = $1
//       ORDER BY timestamp ASC;
//     `;

//     const res = await client.query(query, [deviceId]);
    
//     let switchLogs = {};
//     let connectionStatus = null;
//     let lastDisconnectTime = null;

//     console.log("\nEvent History:\n");
//     console.log("Switch | Status       | Time");
//     console.log("-----------------------------");

//     res.rows.forEach((row) => {
//       const eventData = JSON.parse(row.event_data);
//       const timestamp = new Date(row.timestamp).toLocaleTimeString();
      
//       // Handle device connection & disconnection
//       if (
//         eventData.status &&
//         eventData.status.desired &&
//         eventData.status.desired.command === "device_update"
//       ) {
//         if (eventData.status.desired.status === "disconnected") {
//           console.log(`       | DISCONNECTED | ${timestamp}`);
//           connectionStatus = "disconnected";
//           lastDisconnectTime = timestamp;
//         }
//       }

//       // Detect reconnection (if any switch event comes after disconnection)
//       if (connectionStatus === "disconnected" && eventData.status?.desired) {
//         console.log(`       | CONNECTED    | ${timestamp}`);
//         connectionStatus = "connected";
//       }

//       // Handle switch status updates
//       if (eventData.status && eventData.status.desired) {
//         Object.entries(eventData.status.desired).forEach(([key, value]) => {
//           if (key.startsWith("s") && key.length === 2) { 
//             const switchNumber = key.substring(1);
//             const switchState = value === "1" ? "ON" : "OFF";

//             console.log(`   ${switchNumber}   | ${switchState}      | ${timestamp}`);
//           }
//         });
//       }
//     });

//   } catch (err) {
//     console.error("Database query error:", err);
//   } finally {
//     await client.end();
//   }
// }
// API Route to Get Audit Logs
// dashboard.get("/api/display/auditlog/:thingmac", async (req, res) => {
//   const { thingmac} = req.params;



//   try {
//     await client.connect();
//     const query = `
//       SELECT event_data, timestamp, method
//       FROM audit_logs
//       WHERE thing_mac = $1
//       ORDER BY timestamp ASC;
//     `;

//     const dbResult = await client.query(query, [thingmac]);

//     let response = {
//       deviceId: deviceId,
//       connectionEvents: [],
//       switchLogs: {}
//     };

//     dbResult.rows.forEach((row) => {
//       const eventData = JSON.parse(row.event_data);
//       const timestamp = new Date(row.timestamp).toLocaleTimeString();
//       const method = eventData.status?.desired?.u || "Unknown"; // Extract method from 'u' field in event_data

//       if (eventData.status && eventData.status.desired) {
//         Object.entries(eventData.status.desired).forEach(([key, value]) => {
//           if (key.startsWith("s") && key.length === 2) { 
//             const switchNumber = key.substring(1);
//             const switchState = value === "1" ? "ON" : "OFF";

//             if (!response.switchLogs[switchNumber]) {
//               response.switchLogs[switchNumber] = [];
//             }

//             response.switchLogs[switchNumber].push({
//               state: switchState,
//               time: timestamp,
//               method: method
//             });
//           }
//         });
//       }

//       // Handling connection/disconnection events
//       if (eventData.status?.desired?.command === "device_update") {
//         if (eventData.status.desired.status === "disconnected") {
//           response.connectionEvents.push({
//             event: "DISCONNECTED",
//             time: timestamp,
//             method: method
//           });
//         } else if (eventData.status.desired.status === "connected") {
//           response.connectionEvents.push({
//             event: "CONNECTED",
//             time: timestamp,
//             method: method
//           });
//         }
//       }
//     });

//     res.json(response);
//   } catch (err) {
//     console.error("Database query error:", err);
//     res.status(500).json({ error: "Internal Server Error" });
//   } finally {
//     await client.end();
//   }
// });
dashboard.get("/api/display/auditlog/:thingmac", async (req, res) => {
  const { thingmac } = req.params;
  const { page = 1, pageSize = 10 } = req.query; // Default to page 1 and 10 items per page

  try {
    const offset = (page - 1) * pageSize; // Calculate the offset based on the page number and page size
    const limit = pageSize; // Limit based on the page size

    const query = `
      SELECT event_data, timestamp
      FROM audit_logs
      WHERE thing_mac = $1
      ORDER BY timestamp ASC
      LIMIT $2 OFFSET $3;
    `;

    const dbResult = await db.query(query, [thingmac, limit, offset]);

    let events = [];

    dbResult.rows.forEach((row) => {
      // ✅ Ensure event_data is valid before parsing
      const eventData = row.event_data
        ? typeof row.event_data === "string"
          ? JSON.parse(row.event_data)
          : row.event_data
        : {};

      // ✅ Use full ISO timestamp instead of local time
      const timestamp = new Date(row.timestamp).toISOString();

      // ✅ Ensure method is properly extracted
      const method = eventData?.status?.desired?.u || "Unknown";

      // ✅ Handling connection/disconnection events
      if (eventData?.status?.desired?.command === "device_update") {
        if (eventData.status.desired.status === "disconnected") {
          events.push({
            state: "DISCONNECTED",
            time: timestamp,
            method: method,
            type: "Connection",
          });
        } else if (eventData.status.desired.status === "connected") {
          events.push({
            state: "CONNECTED",
            time: timestamp,
            method: method,
            type: "Connection",
          });
        }
      }

      // ✅ Handling switch logs
      if (eventData.status?.desired) {
        Object.entries(eventData.status.desired).forEach(([key, value]) => {
          if (key.startsWith("s") && key.length === 2) {
            const switchNumber = `${thingmac}_${key.substring(1)}`;
            const switchState = value === "1" ? "ON" : "OFF";

            events.push({
              switch: switchNumber,
              state: switchState,
              time: timestamp,
              method: method,
              type: "Switch",
            });
          }
        });
      }
    });

    // ✅ Sort by full timestamp, not just time string
    events.sort((a, b) => new Date(a.time) - new Date(b.time));

    // ✅ Return the events as JSON, including pagination metadata
    return res.json({
      page,
      pageSize,
      total: dbResult.rowCount, // You could modify this part to return total records count if needed
      events,
    });
  } catch (err) {
    console.error("Database query error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});


dashboard.get("/api/device/wifi/status/:thingmac",wifidata);
module.exports = dashboard;