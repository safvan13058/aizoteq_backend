const express = require('express');
const dashboard = express.Router();
const db = require('../middlewares/dbconnection');
// const {getThingBySerialNo,removeFromAdminStock,addToStock} =require('./functions.js')
const { validateJwt, authorizeRoles } = require('../middlewares/auth');
const { thingSchema } = require('../middlewares/validation');
const { s3, upload } = require('../middlewares/s3');
const path = require('path');
const fs = require('fs');
const {getThingBySerialNo,removeFromAdminStock,addToStock,generatePDF,sendEmailWithAttachment}=require("./functions.js");
dashboard.get('/',(req,res)=>{
    res.send('dashboard working ')
  })
// API endpoint to count users
dashboard.get('/api/users/count', async (req, res) => {
    try {
        const result = await db.query('SELECT COUNT(*) AS user_count FROM Users');
        res.json({ user_count: result.rows[0].user_count });
    } catch (err) {
        console.error('Error querying the database:', err);
        res.status(500).json({ error: 'Internal server error' });
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


// Unified Route: Create Entity, Process Things, and Billing Receipt
// dashboard.post("/api/billing/create", async (req, res) => {
//     const {
//       type, // 'dealer' or 'customer'
//       name,
//       address,
//       shipping_address,
//       phone,
//       alt_phone,
//       items, // Array of items with serial numbers
//       payment_methods,
//       billing_createdby,
//       TotalAmount,
//       Balance,
//     } = req.body;
  
//     if (
//       !type ||
//       !name ||
//       !phone ||
//       !items ||
//       items.length === 0 ||
//       !payment_methods ||
//       payment_methods.length === 0 ||
//       !billing_createdby
//     ) {
//       return res.status(400).json({ error: "Required fields are missing or invalid" });
//     }
  
//     const entityTable = `${type}_details`;
//     const stockTable = `${type}Stock`;
  
//     try {
//       // Step 1: Check if entity exists
//       let entity = await db.query(`SELECT * FROM ${entityTable} WHERE phone = $1`, [phone]);
//       if (entity.rows.length === 0) {
//         // Entity does not exist, create it
//         const totalAmount = items.reduce((sum, item) => sum + (item.retail_price || 0), 0);
//         const balance = totalAmount;
  
//         const result = await db.query(
//           `INSERT INTO ${entityTable} (name, address, phone, alt_phone, total_amount, balance)
//            VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
//           [name, address, phone, alt_phone, totalAmount, balance]
//         );
//         entity = result.rows[0];
//       } else {
//         entity = entity.rows[0];
//       }
  
//       // Step 2: Process each item
//       let totalAmount = 0;
//       const billingItems = [];
  
//       for (const item of items) {
//         const { serial_no, model } = item;

//         // Step 2.1: Fetch MRP and Retail Price from price_table
//         const priceQuery = await db.query(
//           `SELECT mrp, retail_price FROM price_table WHERE model = $1`,
//           [model]
//         );
      
//         if (priceQuery.rows.length === 0) {
//           return res.status(404).json({ error: `Model ${model} not found in price_table` });
//         }
      
//         const { mrp, retail_price } = priceQuery.rows[0];
      
//         // Step 2.1: Check if Thing exists in Things table
//         const thing = await getThingBySerialNo(serial_no);
//         if (!thing) {
//           return res.status(404).json({ error: `Thing with serial_no ${serial_no} not found in Things table` });
//         }
  
//         // Step 2.2: Remove Thing from AdminStock
//         const removedStock = await removeFromAdminStock(thing.id);
//         if (!removedStock) {
//           return res.status(400).json({ error: `Thing with serial_no ${serial_no} is not in AdminStock` });
//         }
  
//         // Step 2.3: Add Thing to Dealer's or Customer's Stock
//         await addToStock(stockTable, thing.id,entity.id,billing_createdby);
  
//         // Add item to billingItems array
//         billingItems.push({
//           item_name: thing.thingName,
//           serial_no: serial_no,
//           model: thing.model,
//           mrp:mrp,
//           retail_price: retail_price || 0,
//         });
  
//         // Add to total amount
//         totalAmount += retail_price || 0;
//       }
      
//       // Step 3: Insert into billing_receipt
//      let receiptno;

//      // Fetch the last receipt_no
//      const lastReceiptQuery = await db.query(
//      `SELECT receipt_no FROM billing_receipt ORDER BY id DESC LIMIT 1`
//      );

//      if (lastReceiptQuery.rows.length > 0) {
//      const lastReceiptNo = parseInt(lastReceiptQuery.rows[0].receipt_no, 10);
//      receiptno = lastReceiptNo + 1; // Increment by 1
//     } else {
//       receiptno = 1; // Start with 1 if no previous receipts exist
//     }

//       // Step 3: Insert into billing_receipt
//       console.log(type)
//       console.log(`entity${entity.id}`)
//       const billingReceiptResult = await db.query(
//         `INSERT INTO billing_receipt 
//         (receipt_no,name, phone, billing_address, shipping_address, dealer_or_customer, total_amount, balance, billing_createdby,${type}_id) 
//         VALUES ($1, $2, $3, $4, $5, $6, $7, $8,$9,$10) RETURNING id,receipt_no`,
//         [ 
//           receiptno,
//           name,
//           phone,
//           address,
//           shipping_address||null, // No shipping address provided
//           type,
//           TotalAmount,
//           Balance, // Initially, balance = totalAmount; will adjust after payments
//           billing_createdby,
//           entity.id
//         ]
//       );
  
//       const { id: billingReceiptId, receipt_no } = billingReceiptResult.rows[0];
  
//       // Step 4: Insert billing items into billing_items table
//       for (const item of billingItems) {
//         await db.query(
//           `INSERT INTO billing_items 
//           (receipt_no, item_name, model, serial_no,mrp, retail_price) 
//           VALUES ($1, $2, $3, $4, $5,$6)`,
//           [receipt_no, item.model, item.model, item.serial_no,item.mrp, item.retail_price]
//         );
//       }
  
//       // Step 5: Insert payment methods into payment_details table
//       let totalPaid = 0;
  
//       for (const payment of payment_methods) {
//         const { payment_method, amount } = payment;
  
//         if (!payment_method || !amount || amount <= 0) {
//           return res.status(400).json({ error: "Invalid payment method or amount" });
//         }
  
//         totalPaid += amount;
  
//         await db.query(
//           `INSERT INTO payment_details (receipt_id, payment_method, amount) VALUES ($1, $2, $3)`,
//           [billingReceiptId, payment_method, amount]
//         );
//       }
  
//       // Step 6: Update balance in billing_receipt
//     //   const balance = totalAmount - totalPaid;
//     //   await db.query(`UPDATE billing_receipt SET balance = $1 WHERE id = $2`, [balance, billingReceiptId]);
  
//       return res.status(200).json({
//         message: "Billing receipt created successfully",
//         entity_id: entity.id,
//         receipt_id: billingReceiptId,
//         total_amount: totalAmount,
//         total_paid: totalPaid,
//         Balance,
//       });
//     } catch (error) {
//       console.error("Error processing billing:", error);
//       return res.status(500).json({ error: "Internal server error" });
//     }
//   });

  // dashboard.post("/api/billing/create", async (req, res) => {
  //   const {
  //     type,
  //     name,
  //     address,
  //     shipping_address,
  //     phone,
  //     alt_phone,
  //     email,
  //     items,
  //     payment_methods,
  //     billing_createdby,
  //     // TotalAmount,
  //     // paidAmount,
  //     // Balance,
  //   } = req.body;
  
  //   if (
  //     !type ||
  //     !name ||
  //     !phone ||
  //     !items ||
  //     items.length === 0 ||
  //     !payment_methods ||
  //     payment_methods.length === 0 ||
  //     !billing_createdby
  //   ) {
  //     return res.status(400).json({ error: "Required fields are missing or invalid" });
  //   }
  
  //   const entityTable = `${type}_details`;
  //   const stockTable = `${type}Stock`;
  
  //   const client = await db.connect();
  
  //   try {
  //     // Step 1: Check if entity exists or create it
  //     let entity = await db.query(`SELECT * FROM ${entityTable} WHERE phone = $1`, [phone]);
  //     if (entity.rows.length === 0) {
  //       const result = await db.query(
  //         `INSERT INTO ${entityTable} (name, address, phone, email, alt_phone, total_amount, balance)
  //          VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, email`,
  //         [name, address, phone, email, alt_phone,null, null]
  //       );
  //       entity = result.rows[0];
  //     } else {
  //       entity = entity.rows[0];
  //     }
  
  //     await client.query("BEGIN");
  
  //     let totalAmount = 0;
  //     const billingItems = [];
  //     const warrantyEntries = [];
  
  //     for (const item of items) {
  //       const { serial_no, model } = item;
  
  //       // Fetch price and warranty period
  //       const priceQuery = await client.query(
  //         `SELECT mrp, retail_price, warranty_period FROM price_table WHERE model = $1`,
  //         [model]
  //       );
  //       if (priceQuery.rows.length === 0) {
  //         client.query("ROLLBACK");
  //         return res.status(404).json({ error: `Model ${model} not found in price_table` });
  //       }
  
  //       const { mrp, retail_price, warranty_period } = priceQuery.rows[0];
  //       const warrantyPeriod = warranty_period || "3 years";
  //       const dueDateQuery = await client.query(`SELECT CURRENT_DATE + $1::INTERVAL AS due_date`, [
  //         warrantyPeriod,
  //       ]);
  //       const due_date = dueDateQuery.rows[0].due_date;
  
  //       const thing = await getThingBySerialNo(serial_no);
  //       if (!thing) {
  //         return res
  //           .status(404)
  //           .json({ error: `Thing with serial_no ${serial_no} not found in Things table` });
  //       }
  //       const adminStockCheck = await client.query(
  //         `SELECT * FROM AdminStock WHERE thingId = $1`,
  //         [thing.id]
  //       );
  //       if (adminStockCheck.rows.length === 0) {
  //         client.query("ROLLBACK");
  //         return res
  //           .status(400)
  //           .json({ error: `Item with serial_no ${serial_no} is not available in AdminStock` });
  //       }
  //       await removeFromAdminStock(thing.id);
  //       await addToStock(stockTable, thing.id, entity.id, billing_createdby);
  
  //       billingItems.push({
  //         item_name: thing.thingName,
  //         serial_no: serial_no,
  //         model: thing.model,
  //         mrp: mrp,
  //         retail_price: retail_price || 0,
  //       });
  
  //       warrantyEntries.push({ serial_no, due_date });
  //       totalAmount += retail_price || 0;
  //     }
  
  //     const lastReceiptQuery = await client.query(
  //       `SELECT receipt_no FROM billing_receipt ORDER BY id DESC LIMIT 1`
  //     );
  //     const receiptno = lastReceiptQuery.rows.length > 0
  //       ? parseInt(lastReceiptQuery.rows[0].receipt_no) + 1
  //       : 1000;
  
  //     const calculatedBalance = totalAmount - (paidAmount || 0);
  
  //     const billingReceiptResult = await client.query(
  //       `INSERT INTO billing_receipt 
  //          (receipt_no, name, phone, email, billing_address, shipping_address, dealer_or_customer, total_amount, paid_amount, balance, billing_createdby, ${type}_id, lastmodified, datetime)
  //          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id, receipt_no`,
  //       [
  //         receiptno,
  //         name,
  //         phone,
  //         email,
  //         address,
  //         shipping_address || null,
  //         type,
  //         totalAmount,
  //         totalPaid ,
  //         calculatedBalance,
  //         billing_createdby,
  //         entity.id,
  //       ]
  //     );
  
  //     const { id: billingReceiptId, receipt_no: receiptNo } = billingReceiptResult.rows[0];
  
  //     for (const item of billingItems) {
  //       await client.query(
  //         `INSERT INTO billing_items (receipt_no, item_name, model, serial_no, mrp, retail_price) VALUES ($1, $2, $3, $4, $5, $6)`,
  //         [receiptNo, item.item_name, item.model, item.serial_no, item.mrp, item.retail_price]
  //       );
  //     }
  
  //     for (const warranty of warrantyEntries) {
  //       await client.query(
  //         `INSERT INTO thing_warranty (serial_no, receipt_id, date, due_date) VALUES ($1, $2, CURRENT_DATE, $3)`,
  //         [warranty.serial_no, billingReceiptId, warranty.due_date]
  //       );
  //     }
  
  //     let totalPaid = 0;
  //     for (const payment of payment_methods) {
  //       const { payment_method, amount } = payment;
  //       if (!payment_method || !amount || amount <= 0) {
  //         return res.status(400).json({ error: "Invalid payment method or amount" });
  //       }
  //       totalPaid += amount;
  //       await client.query(
  //         `INSERT INTO payment_details (receipt_id, payment_method, amount) VALUES ($1, $2, $3)`,
  //         [billingReceiptId, payment_method, amount]
  //       );
  //     }
  //     await client.query(
  //       `UPDATE ${entityTable} 
  //        SET 
  //          total_amount = total_amount + $1, 
  //          paid_amount = paid_amount + $2, 
  //          balance = total_amount - paid_amount,
  //          lastmodified = CURRENT_TIMESTAMP
  //        WHERE id = $3`,
  //       [totalAmount, totalPaid, entity.id]
  //     );
  //     // Generate PDF and send email
  //     if (email) {
  //       const receiptDir = path.join(__dirname, "receipt");
  //       if (!fs.existsSync(receiptDir)) {
  //         fs.mkdirSync(receiptDir);
  //       }
  //       const pdfPath = path.join(receiptDir, `receipt_${receiptNo}.pdf`);
  //       await generatePDF(pdfPath, name, receiptNo, TotalAmount, totalPaid, calculatedBalance);
  
  //       await sendEmailWithAttachment(email, name, receiptNo, pdfPath);
  
  //       if (fs.existsSync(pdfPath)) {
  //         fs.unlinkSync(pdfPath);
  //       }
  //     }
  
  //     await client.query("COMMIT");
  //     return res.status(200).json({
  //       message: "Billing receipt created successfully",
  //       entity_id: entity.id,
  //       receipt_id: billingReceiptId,
  //       total_amount: TotalAmount,
  //       paid_amount: totalPaid,
  //       balance: calculatedBalance,
  //     });
  //   } catch (error) {
  //     await client.query("ROLLBACK");
  //     console.error("Error processing billing:", error);
  //     return res.status(500).json({ error: "Internal server error" });
  //   } finally {
  //     client.release();
  //   }
  // });
  
  // dashboard.post("/api/billing/create", async (req, res) => {
  //   const {
  //     type,
  //     name,
  //     address,
  //     shipping_address,
  //     phone,
  //     alt_phone,
  //     email,
  //     items,
  //     payment_methods,
  //     billing_createdby,
  //   } = req.body;
  
  //   if (
  //     !type ||
  //     !name ||
  //     !phone ||
  //     !items ||
  //     items.length === 0 ||
  //     !payment_methods ||
  //     payment_methods.length === 0 ||
  //     !billing_createdby
  //   ) {
  //     return res.status(400).json({ error: "Required fields are missing or invalid" });
  //   }
  
  //   const entityTable = `${type}_details`;
  //   const stockTable = `${type}Stock`;
  
  //   const client = await db.connect();
  
  //   try {
  //     // Step 1: Check if entity exists or create it
  //     let entity = await client.query(`SELECT * FROM ${entityTable} WHERE phone = $1`, [phone]);
  //     if (entity.rows.length === 0) {
  //       const result = await client.query(
  //         `INSERT INTO ${entityTable} (name, address, phone, email, alt_phone, total_amount, paid_amount, balance)
  //          VALUES ($1, $2, $3, $4, $5, 0, 0, 0) RETURNING id, email`,
  //         [name, address, phone, email, alt_phone]
  //       );
  //       entity = result.rows[0];
  //     } else {
  //       entity = entity.rows[0];
  //     }
  
  //     await client.query("BEGIN");
  
  //     let totalAmount = 0;
  //     const billingItems = [];
  //     const warrantyEntries = [];
  //     const errors = [];
  
  //     for (const item of items) {
  //       const { serial_no, model } = item;
  //       let itemValid = true;
  
  //       // Fetch price and warranty period
  //       const priceQuery = await client.query(
  //         `SELECT mrp, retail_price, warranty_period FROM price_table WHERE model = $1`,
  //         [model]
  //       );
  //       if (priceQuery.rows.length === 0) {
  //         errors.push(`Model ${model} not found in price_table`);
  //         itemValid = false;
  //       } else {
  //         const { mrp, retail_price, warranty_period } = priceQuery.rows[0];
  //         const warrantyPeriod = warranty_period || "3 years";
  //         const dueDateQuery = await client.query(
  //           `SELECT CURRENT_DATE + $1::INTERVAL AS due_date`,
  //           [warrantyPeriod]
  //         );
  //         const due_date = dueDateQuery.rows[0].due_date;
  
  //         // Fetch item details
  //         const thing = await getThingBySerialNo(serial_no);
  //         if (!thing) {
  //           errors.push(`Thing with serial_no ${serial_no} not found in Things table`);
  //           itemValid = false;
  //         } else {
  //           // Check availability in AdminStock
  //           const adminStockCheck = await client.query(
  //             `SELECT * FROM AdminStock WHERE thingId = $1 AND status = 'new'`,
  //             [thing.id]
  //           );
  //           if (adminStockCheck.rows.length === 0) {
  //             errors.push(`Item with serial_no ${serial_no} is not available in AdminStock`);
  //             itemValid = false;
  //           } else {
  //             // Add to billing items if valid
  //             if (itemValid) {
  //               await removeFromAdminStock(thing.id);
  //               await addToStock(stockTable, thing.id, entity.id, billing_createdby);
  
  //               billingItems.push({
  //                 item_name: thing.thingName,
  //                 serial_no,
  //                 model: thing.model,
  //                 mrp,
  //                 retail_price: retail_price || 0,
  //               });
  
  //               warrantyEntries.push({ serial_no, due_date });
  //               totalAmount += retail_price || 0;
  //             }
  //           }
  //         }
  //       }
  //     }
  
  //     if (errors.length > 0) {
  //       console.warn("Errors encountered for some items:", errors.join(", "));
  //     }
  
  //     const lastReceiptQuery = await client.query(
  //       `SELECT receipt_no FROM billing_receipt ORDER BY id DESC LIMIT 1`
  //     );
  //     const receiptno =
  //       lastReceiptQuery.rows.length > 0
  //         ? parseInt(lastReceiptQuery.rows[0].receipt_no) + 1
  //         : 1000;
  
  //     let totalPaid = 0;
  //     for (const payment of payment_methods) {
  //       const { payment_method, amount } = payment;
  //       if (!payment_method || !amount || amount <= 0) {
  //         return res.status(400).json({ error: "Invalid payment method or amount" });
  //       }
  //       totalPaid += amount;
  //     }
  
  //     const calculatedBalance = totalAmount - totalPaid;
  
  //     const billingReceiptResult = await client.query(
  //       `INSERT INTO billing_receipt 
  //          (receipt_no, name, phone, email, billing_address, shipping_address, dealer_or_customer, total_amount, paid_amount, balance, billing_createdby, ${type}_id, type, lastmodified, datetime)
  //          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id, receipt_no`,
  //       [
  //         receiptno,
  //         name,
  //         phone,
  //         email,
  //         address,
  //         shipping_address || null,
  //         type,
  //         totalAmount,
  //         totalPaid,
  //         calculatedBalance,
  //         billing_createdby,
  //         entity.id,
  //         "sold",
  //       ]
  //     );
  
  //     const { id: billingReceiptId, receipt_no: receiptNo } = billingReceiptResult.rows[0];
  
  //     for (const item of billingItems) {
  //       await client.query(
  //         `INSERT INTO billing_items (receipt_no, item_name, model, serial_no, mrp, retail_price, type) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
  //         [receiptNo, item.item_name, item.model, item.serial_no, item.mrp, item.retail_price, "sold"]
  //       );
  //     }
  
  //     for (const warranty of warrantyEntries) {
  //       await client.query(
  //         `INSERT INTO thing_warranty (serial_no, receipt_id, date, due_date) VALUES ($1, $2, CURRENT_DATE, $3)`,
  //         [warranty.serial_no, billingReceiptId, warranty.due_date]
  //       );
  //     }
  
  //     await client.query(
  //       `UPDATE ${entityTable} 
  //        SET 
  //          total_amount = total_amount + $1, 
  //          paid_amount = paid_amount + $2, 
  //          balance = total_amount - paid_amount,
  //          lastmodified = CURRENT_TIMESTAMP
  //        WHERE id = $3`,
  //       [totalAmount, totalPaid, entity.id]
  //     );
  
  //     if (email) {
  //       const receiptDir = path.join(__dirname, "receipt");
  //       if (!fs.existsSync(receiptDir)) {
  //         fs.mkdirSync(receiptDir);
  //       }
  //       const pdfPath = path.join(receiptDir, `receipt_${receiptNo}.pdf`);
  //       await generatePDF(pdfPath, name, receiptNo, totalAmount, totalPaid, calculatedBalance);
  
  //       await sendEmailWithAttachment(email, name, receiptNo, pdfPath);
  
  //       if (fs.existsSync(pdfPath)) {
  //         fs.unlinkSync(pdfPath);
  //       }
  //     }
  
  //     await client.query("COMMIT");
  //     return res.status(200).json({
  //       message: "Billing receipt created successfully",
  //       entity_id: entity.id,
  //       receipt_id: billingReceiptId,
  //       total_amount: totalAmount,
  //       paid_amount: totalPaid,
  //       balance: calculatedBalance,
  //     });
  //   } catch (error) {
  //     await client.query("ROLLBACK");
  //     console.error("Error processing billing:", error);
  //     return res.status(500).json({ error: "Internal server error" });
  //   } finally {
  //     client.release();
  //   }
  // });

  // dashboard.post("/api/billing/create", async (req, res) => {
  //   const {
  //     type,
  //     name,
  //     address,
  //     shipping_address,
  //     phone,
  //     alt_phone,
  //     email,
  //     items,
  //     payment_methods,
  //     billing_createdby,
  //   } = req.body;
  
  //   // Validate required fields
  //   if (
  //     !type ||
  //     !name ||
  //     !phone ||
  //     !items ||
  //     items.length === 0 ||
  //     !payment_methods ||
  //     payment_methods.length === 0 ||
  //     !billing_createdby
  //   ) {
  //     return res.status(400).json({ error: "Required fields are missing or invalid" });
  //   }
  
  //   const entityTable = `${type}_details`;
  //   const stockTable = `${type}Stock`;
  
  //   const client = await db.connect();
  
  //   try {
  //     let itemValid = true;
  
  //     // Step 1: Check if entity exists or create it
  //     let entity = await client.query(`SELECT * FROM ${entityTable} WHERE phone = $1`, [phone]);
  //     if (entity.rows.length === 0) {
  //       const result = await client.query(
  //         `INSERT INTO ${entityTable} (name, address, phone, email, alt_phone, total_amount, paid_amount, balance)
  //          VALUES ($1, $2, $3, $4, $5, 0, 0, 0) RETURNING id, email`,
  //         [name, address, phone, email, alt_phone]
  //       );
  //       entity = result.rows[0];
  //     } else {
  //       entity = entity.rows[0];
  //     }
  
  //     await client.query("BEGIN");
  
  //     let totalAmount = 0;
  //     const billingItems = [];
  //     const warrantyEntries = [];
  
  //     for (const item of items) {
  //       const { serial_no, model } = item;
  
  //       // Fetch price and warranty period
  //       const priceQuery = await client.query(
  //         `SELECT mrp, retail_price, warranty_period FROM price_table WHERE model = $1`,
  //         [model]
  //       );
  //       if (priceQuery.rows.length === 0) {
  //         return res.status(404).json({ error: `Model ${model} not found in price_table` });
  //       }
  
  //       const { mrp, retail_price, warranty_period } = priceQuery.rows[0];
  //       const warrantyPeriod = warranty_period || "3 years";
  //       const dueDateQuery = await client.query(
  //         `SELECT CURRENT_DATE + $1::INTERVAL AS due_date`,
  //         [warrantyPeriod]
  //       );
  //       const due_date = dueDateQuery.rows[0].due_date;
  
  //       const thing = await getThingBySerialNo(serial_no);
  //       if (!thing) {
  //         await client.query("ROLLBACK");
  //         return res
  //           .status(404)
  //           .json({ error: `Thing with serial_no ${serial_no} not found in Things table` });
  //       }
  
  //       const adminStockCheck = await client.query(
  //         `SELECT * FROM AdminStock WHERE thingId = $1 AND status = 'new'`,
  //         [thing.id]
  //       );
  //       if (adminStockCheck.rows.length === 0) {
  //         return res
  //           .status(400)
  //           .json({ error: `Item with serial_no ${serial_no} is not available in AdminStock` });
  //       }
  
  //       await removeFromAdminStock(thing.id);
  //       await addToStock(stockTable, thing.id, entity.id, billing_createdby);
  
  //       billingItems.push({
  //         item_name: thing.thingName,
  //         serial_no,
  //         model: thing.model,
  //         mrp,
  //         retail_price: retail_price || 0,
  //       });
  
  //       warrantyEntries.push({ serial_no, due_date });
  //       totalAmount += parseFloat(retail_price) || 0;
  //     }
  
  //     const lastReceiptQuery = await client.query(
  //       `SELECT receipt_no FROM billing_receipt ORDER BY id DESC LIMIT 1`
  //     );
  //     const receiptno =
  //       lastReceiptQuery.rows.length > 0
  //         ? parseInt(lastReceiptQuery.rows[0].receipt_no) + 1
  //         : 1000;
  
  //     let totalPaid = 0;
  //     for (const payment of payment_methods) {
  //       const { payment_method, amount } = payment;
  //       const parsedAmount = parseFloat(amount);
  //       if (!payment_method || isNaN(parsedAmount) || parsedAmount <= 0) {
  //         await client.query("ROLLBACK");
  //         return res.status(400).json({ error: "Invalid payment method or amount" });
  //       }
  //       totalPaid += parsedAmount;
  //     }
  
  //     const calculatedBalance = parseFloat(totalAmount) - parseFloat(totalPaid);
  
  //     const billingReceiptResult = await client.query(
  //       `INSERT INTO billing_receipt 
  //          (receipt_no, name, phone, email, billing_address, shipping_address, dealer_or_customer, total_amount, paid_amount, balance, billing_createdby, ${type}_id, type, lastmodified, datetime)
  //          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id, receipt_no`,
  //       [
  //         receiptno,
  //         name,
  //         phone,
  //         email,
  //         address,
  //         shipping_address || null,
  //         type,
  //         totalAmount,
  //         totalPaid,
  //         calculatedBalance,
  //         billing_createdby,
  //         entity.id,
  //         "sold",
  //       ]
  //     );
  
  //     const { id: billingReceiptId, receipt_no: receiptNo } = billingReceiptResult.rows[0];
  
  //     for (const item of billingItems) {
  //       await client.query(
  //         `INSERT INTO billing_items (receipt_no, item_name, model, serial_no, mrp, retail_price, type) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
  //         [receiptNo, item.item_name, item.model, item.serial_no, item.mrp, item.retail_price, "sold"]
  //       );
  //     }
  
  //     for (const warranty of warrantyEntries) {
  //       await client.query(
  //         `INSERT INTO thing_warranty (serial_no, receipt_id, date, due_date) VALUES ($1, $2, CURRENT_DATE, $3)`,
  //         [warranty.serial_no, billingReceiptId, warranty.due_date]
  //       );
  //     }
  
  //     await client.query(
  //       `UPDATE ${entityTable} 
  //        SET 
  //          total_amount = total_amount + $1, 
  //          paid_amount = paid_amount + $2, 
  //          balance = total_amount - paid_amount,
  //          lastmodified = CURRENT_TIMESTAMP
  //        WHERE id = $3`,
  //       [totalAmount, totalPaid, entity.id]
  //     );
  
  //     if (email) {
  //       const receiptDir = path.join(__dirname, "receipt");
  //       if (!fs.existsSync(receiptDir)) {
  //         fs.mkdirSync(receiptDir);
  //       }
  //       const pdfPath = path.join(receiptDir, `receipt_${receiptNo}.pdf`);
  //       await generatePDF(pdfPath, name, receiptNo, totalAmount, totalPaid, calculatedBalance);
  
  //       await sendEmailWithAttachment(email, name, receiptNo, pdfPath);
  
  //       if (fs.existsSync(pdfPath)) {
  //         fs.unlinkSync(pdfPath);
  //       }
  //     }
  
  //     await client.query("COMMIT");
  //     return res.status(200).json({
  //       message: "Billing receipt created successfully",
  //       entity_id: entity.id,
  //       receipt_id: billingReceiptId,
  //       total_amount: totalAmount,
  //       paid_amount: totalPaid,
  //       balance: calculatedBalance,
  //     });
  //   } catch (error) {
  //     await client.query("ROLLBACK");
  //     console.error("Error processing billing:", error);
  //     return res.status(500).json({ error: "Internal server error" });
  //   } finally {
  //     client.release();
  //   }
  // });
  
  dashboard.post("/api/billing/create", async (req, res) => {
    const {
      type,
      name,
      address,
      shipping_address,
      phone,
      alt_phone,
      email,
      items,
      payment_methods,
      billing_createdby,
    } = req.body;
  
    // Validate required fields
    if (
      !type ||
      !name ||
      !phone ||
      !items ||
      items.length === 0 ||
      !payment_methods ||
      payment_methods.length === 0 ||
      !billing_createdby
    ) {
      return res.status(400).json({ error: "Required fields are missing or invalid" });
    }
  
    const entityTable = `${type}_details`;
    const stockTable = `${type}Stock`;
  
    const client = await db.connect();
  
    try {
      // Step 1: Check if entity exists or create it
      let entity = await client.query(`SELECT * FROM ${entityTable} WHERE phone = $1`, [phone]);
      if (entity.rows.length === 0) {
        console.log("working")
        const result = await client.query(
          `INSERT INTO ${entityTable} (name, address, phone, email, alt_phone, total_amount, paid_amount, balance)
           VALUES ($1, $2, $3, $4, $5, 0, 0, 0) RETURNING id, email`,
          [name, address, phone, email, alt_phone]
        );
        console.log()
        entity = result.rows[0];
      } else {
        entity = entity.rows[0];
      }
      await client.query("BEGIN");
      let totalAmount = 0;
      const billingItems = [];
      const warrantyEntries = [];
      const errors = [];
  
      for (const item of items) {
        const { serial_no, model } = item;
  
        // Fetch price and warranty period
        const priceQuery = await client.query(
          `SELECT mrp, retail_price, warranty_period FROM price_table WHERE model = $1`,
          [model]
        );
        if (priceQuery.rows.length === 0) {
          errors.push(`Model ${model} not found in price_table`);
          continue;
        }
  
        const { mrp, retail_price, warranty_period } = priceQuery.rows[0];
        const warrantyPeriod = warranty_period || "3 years";
        const dueDateQuery = await client.query(
          `SELECT CURRENT_DATE + $1::INTERVAL AS due_date`,
          [warrantyPeriod]
        );
        const due_date = dueDateQuery.rows[0].due_date;
  
        const thing = await getThingBySerialNo(serial_no);
        if (!thing) {
          errors.push(`Thing with serial_no ${serial_no} not found in Things table`);
          continue;
        }
  
        const adminStockCheck = await client.query(
          `SELECT * FROM AdminStock WHERE thingId = $1 AND status = 'new'`,
          [thing.id]
        );
        if (adminStockCheck.rows.length === 0) {
          errors.push(`Item with serial_no ${serial_no} is not available in AdminStock`);
          continue;
        }
  
        await removeFromAdminStock(thing.id);
        await addToStock(stockTable, thing.id, entity.id, billing_createdby);
  
        billingItems.push({
          item_name: thing.thingName || null, // Make this nullable
          serial_no,
          model: thing.model,
          mrp,
          retail_price: retail_price || 0,
        });
  
        warrantyEntries.push({ serial_no, due_date });
        totalAmount += parseFloat(retail_price) || 0;
        
      }
  
      if (billingItems.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "No valid items for billing.",
          details: errors,
        });
      }
  
      const lastReceiptQuery = await client.query(
        `SELECT receipt_no FROM billing_receipt ORDER BY id DESC LIMIT 1`
      );
      const receiptno =
        lastReceiptQuery.rows.length > 0
          ? parseInt(lastReceiptQuery.rows[0].receipt_no) + 1
          : 1000;
  
      let totalPaid = 0;
      for (const payment of payment_methods) {
        const { payment_method, amount } = payment;
        const parsedAmount = parseFloat(amount);
        if (!payment_method || isNaN(parsedAmount) || parsedAmount <= 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Invalid payment method or amount" });
        }
        totalPaid += parsedAmount;
      }
  
      const calculatedBalance = parseFloat(totalAmount) - parseFloat(totalPaid);
  
      const billingReceiptResult = await client.query(
        `INSERT INTO billing_receipt 
           (receipt_no, name, phone, email, billing_address, shipping_address, dealer_or_customer, total_amount, paid_amount, balance, billing_createdby, ${type}_id, type, lastmodified, datetime)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id, receipt_no`,
        [
          receiptno,
          name,
          phone,
          email,
          address,
          shipping_address || null,
          type,
          totalAmount,
          totalPaid,
          calculatedBalance,
          billing_createdby,
          entity.id,
          "sold",
        ]
      );
  
      const { id: billingReceiptId, receipt_no: receiptNo } = billingReceiptResult.rows[0];
      
      for (const payment of payment_methods) {
        const { payment_method, amount } = payment;
        if (!payment_method || !amount || amount <= 0) {
          return res.status(400).json({ error: "Invalid payment method or amount" });
        }
        await client.query(
          `INSERT INTO payment_details (receipt_id, payment_method, amount) VALUES ($1, $2, $3)`,
          [billingReceiptId, payment_method, amount]
        );
      }
      for (const item of billingItems) {
        await client.query(
          `INSERT INTO billing_items (receipt_no, item_name, model, serial_no, mrp, retail_price, type) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [receiptNo, item.model, item.model, item.serial_no, item.mrp, item.retail_price, "sold"]
        );
      }
  
      for (const warranty of warrantyEntries) {
        await client.query(
          `INSERT INTO thing_warranty (serial_no, receipt_id, date, due_date) VALUES ($1, $2, CURRENT_DATE, $3)`,
          [warranty.serial_no, billingReceiptId, warranty.due_date]
        );
      }
  
      await client.query(
        `UPDATE ${entityTable} 
         SET 
           total_amount = total_amount + $1, 
           paid_amount = paid_amount + $2, 
           balance = total_amount - paid_amount,
           lastmodified = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [totalAmount, totalPaid, entity.id]
      );
       
      if (email) {
              const receiptDir = path.join(__dirname, "receipt");
              if (!fs.existsSync(receiptDir)) {
                fs.mkdirSync(receiptDir);
              }
              const pdfPath = path.join(receiptDir, `receipt_${receiptNo}.pdf`);
              await generatePDF(pdfPath, name, receiptNo, totalAmount, totalPaid, calculatedBalance);
        
              await sendEmailWithAttachment(email, name, receiptNo, pdfPath);
        
              if (fs.existsSync(pdfPath)) {
                fs.unlinkSync(pdfPath);
              }
            }
      await client.query("COMMIT");
  
      return res.status(200).json({
        message: "Billing receipt created successfully",
        entity_id: entity.id,
        receipt_id: billingReceiptId,
        total_amount: totalAmount,
        paid_amount: totalPaid,
        balance: calculatedBalance,
        errors: errors.length > 0 ? errors : null,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error processing billing:", error);
      return res.status(500).json({ error: "Internal server error" });
    } finally {
      client.release();
    }
  });
   
  dashboard.post("/api/billing/return/:status", async (req, res) => {
    const { serial_numbers, returned_by } = req.body;
    const { status } = req.params;
  
    // Ensure serial_numbers is present and has at least one item
    if (!serial_numbers || serial_numbers.length === 0) {
      return res.status(400).json({ error: "At least one serial number is required" });
    }
  
    const client = await db.connect();
  
    try {
      await client.query("BEGIN");
  
      let totalReturnAmount = 0;
      const receiptItems = []; // To store item details for the billing receipt
      let data;
      let source;
      let sourceType;
      let itemResult;
      // Process each serial number
      for (let serial_no of serial_numbers) {
        // Locate the item in the relevant stock tables using serial_no
        const itemQuery = await client.query(
          `
          SELECT 'dealersStock' AS source, id, user_id, thing_id
          FROM dealersStock
          WHERE thing_id = (SELECT id FROM Things WHERE serialno = $1) AND status != 'returned'
  
          UNION ALL
  
          SELECT 'customersStock' AS source, id, user_id, thing_id
          FROM customersStock
          WHERE thing_id = (SELECT id FROM Things WHERE serialno = $1) AND status != 'returned'
  
          UNION ALL
  
          SELECT 'onlinecustomerStock' AS source, id, user_id, thing_id
          FROM onlinecustomerStock
          WHERE thing_id = (SELECT id FROM Things WHERE serialno = $1) AND status != 'returned'
          `,
          [serial_no]
        );
        
        // Check if the item is found
        if (itemQuery.rows.length === 0) {
          throw new Error(`Item with serial number ${serial_no} not found or already returned`);
        }
         itemResult = await client.query(
          `SELECT * FROM billing_items WHERE serial_no = $1 LIMIT 1`,
          [serial_no]
        );

        
        if (itemResult.rows.length > 0) {
          const retailPrice = itemResult.rows[0].retail_price;
          console.log('Retail Price:',itemResult.rows[0] );
        } else {
          console.log('No item found with the provided serial number');
        }
        const retail_price = itemResult.rows[0].retail_price;
        const { source, id: stockId, user_id, thing_id } = itemQuery.rows[0];
        sourceType = source ? source.replace("Stock", "") : null;
        // Remove item from its source stock table
        await client.query(`DELETE FROM ${source} WHERE id = $1`, [stockId]);
  
        // Add item to AdminStock with status "returned"
        await client.query(
          `
          INSERT INTO AdminStock (thingId, addedBy, status)
          VALUES ($1, $2, $3)
          `,
          [thing_id, returned_by, status]
        );
  
        let table;
        if (source === "onlinecustomerStock") {
          table = "onlinecustomer_details";
        }
        if (source === "customersStock") {
          table = "customers_details";
        }
        if (source === "dealersStock") {
          table = "dealers_details";
        }
  
        // Fetch the user data from the respective table
        const dataQuery = await client.query(`SELECT * FROM ${table} WHERE id = $1`, [user_id]);
        data = dataQuery.rows[0];
        console.log(data)
        if (!data) {
          throw new Error(`User with ID ${user_id} not found`);
        }
  
        // Update the balance in the relevant customer/dealer table
       // Update the balance and refund_amount in the relevant customer/dealer table
      let balanceUpdateQuery = '';
      let balanceUpdateValues = [];

      if (status === "return") {
        // Refund scenario
        balanceUpdateQuery = `
          UPDATE ${table}
          SET balance = balance - $1, refund_amount = refund_amount + $2
          WHERE id = $3
          RETURNING balance, refund_amount;
        `;
        balanceUpdateValues = [retail_price, retail_price, user_id];
      } else if (status === "exchange") {
        // Exchange scenario
        const priceDifference = new_item_price - retail_price;

        if (priceDifference > 0) {
          // Customer needs to pay extra
          balanceUpdateQuery = `
            UPDATE ${table}
            SET balance = balance + $1
            WHERE id = $2
            RETURNING balance;
          `;
          balanceUpdateValues = [priceDifference, user_id];
        } else {
          // Customer receives a refund
          balanceUpdateQuery = `
            UPDATE ${table}
            SET balance = balance - $1, refund_amount = refund_amount + $2
            WHERE id = $3
            RETURNING balance, refund_amount;
          `;
          balanceUpdateValues = [-priceDifference, -priceDifference, user_id];
        }
      }

      // Execute the balance update
      const balanceResult = await client.query(balanceUpdateQuery, balanceUpdateValues);
      const updatedBalance = balanceResult.rows[0].balance;

      // Update total return amount (only for returns)
      if (status === "returned") {
        totalReturnAmount += retail_price;
      }

  
        // Store item details for the billing receipt
        receiptItems.push({
          serial_no,
          retail_price: -retail_price, // Negative value for return
        });
  
        // Update warranty table if applicable
        await client.query(
          `
          DELETE FROM thing_warranty
          WHERE serial_no = $1
          `,
          [serial_no]
        );
      }
  
      // Generate the next receipt number
      const lastReceiptQuery = await client.query(
        `SELECT receipt_no FROM billing_receipt ORDER BY id DESC LIMIT 1`
      );
      const receiptNo =
        lastReceiptQuery.rows.length > 0 ? parseInt(lastReceiptQuery.rows[0].receipt_no) + 1 : 1000;
        console.log(data);
        console.log(data.name);
      // Insert return record into `billing_receipt`
      const billingReceiptResult = await client.query(
        `
        INSERT INTO billing_receipt (
          receipt_no, name, phone, dealer_or_customer, total_amount, balance, billing_createdby,
          dealers_id, customers_id, onlinecustomer_id, type,billing_address, datetime
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,$12, CURRENT_TIMESTAMP
        ) RETURNING id, receipt_no
        `,
        [
          receiptNo,
          data.name, // Name of the person performing the return
          data.phone, // Phone number (optional, can be updated if required)
          sourceType, // Source type (dealers, customers, or onlinecustomers)
          -totalReturnAmount, // Return amount as a negative value
          updatedBalance, // Balance for this return
          returned_by, // User who processed the return
          source === "dealersStock" ? user_id : null,
          source === "customersStock" ? user_id : null,
          source === "onlinecustomerStock" ? user_id : null,
          status ,// The status passed in the request params
          data.address
        ]
      );
  
      const { id: billingReceiptId } = billingReceiptResult.rows[0];
  
      // Insert returned item details into `billing_items`
      for (let item of receiptItems) {
        await client.query(
          `
          INSERT INTO billing_items (
            receipt_no, type, model, serial_no, mrp, retail_price
          ) VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            receiptNo,
            status, // The status passed in the request params
            itemResult.rows[0].model, // Model (optional, can be retrieved if needed)
            item.serial_no,
            0, // MRP (optional)
            item.retail_price, // Refund amount
          ]
        );
      }
  
      await client.query("COMMIT");
  
      // Respond with success details
      return res.status(200).json({
        message: "Items successfully returned and added to AdminStock",
        total_return_amount: totalReturnAmount,
        receipt_no: receiptNo,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error processing return:", error);
      return res.status(500).json({ error: "Internal server error" });
    } finally {
      client.release();
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

        const { name, phone, email,address, balance } = result.rows[0];

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
  dashboard.put('/api/users/:id/role', async (req, res) => {
    const { id } = req.params;
    const { userRole } = req.body;
    const allowedRoles = ['admin', 'staff', 'customer'];
    // Input validation: Check if userRole exists and is valid
    if (!userRole) {
        return res.status(400).json({ error: 'userRole is required' });
    }
    if (!allowedRoles.includes(userRole.toLowerCase())) {
        return res.status(400).json({
            error: `Invalid userRole. Allowed roles are: ${allowedRoles.join(', ')}`,
        });
    }

    try {
        const result = await pool.query(
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
dashboard.get('/api/users/:role', async (req, res) => {
  const { search } = req.query;
  const role = req.params.role.toLowerCase(); // Normalize case for role comparison
  const allowedRoles = ['admin', 'staff', 'customer']; // Valid roles

  try {
      // Validate role
      if (!allowedRoles.includes(role)) {
          return res.status(400).json({ error: 'Invalid userRole' });
      }

      let query = `SELECT id, userName, userRole, profilePic, lastModified, email, phone FROM Users WHERE LOWER(userRole) = $1`;
      const values = [role];

      // Add search condition if search query is provided
      if (search) {
          query += ` AND (LOWER(userName) LIKE $2 
                      OR LOWER(email) LIKE $2 
                      OR phone LIKE $2)`;
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

  // dashboard.post("/api/billing/return", async (req, res) => {
  //   const { serial_no, returned_by } = req.body;
  
  //   if (!serial_no) {
  //     return res.status(400).json({ error: "Serial number is required" });
  //   }
  
  //   const client = await db.connect();
  
  //   try {
  //     await client.query("BEGIN");
  
  //     // Locate the item in the relevant stock tables using serial_no
  //     const itemQuery = await client.query(
  //       `
  //       SELECT 'dealersStock' AS source, id, user_id, thing_id, retail_price 
  //       FROM dealersStock 
  //       WHERE thing_id = (SELECT id FROM Things WHERE serialno = $1) AND status != 'returned'
  
  //       UNION ALL
  
  //       SELECT 'customersStock' AS source, id, user_id, thing_id, retail_price 
  //       FROM customersStock 
  //       WHERE thing_id = (SELECT id FROM Things WHERE serialno = $1) AND status != 'returned'
  
  //       UNION ALL
  
  //       SELECT 'onlinecustomerStock' AS source, id, user_id, thing_id, retail_price 
  //       FROM onlineStock 
  //       WHERE thing_id = (SELECT id FROM Things WHERE serialno = $1) AND status != 'returned'
  //       `,
  //       [serial_no]
  //     );
  
  //     if (itemQuery.rows.length === 0) {
  //       throw new Error("Item not found in any stock table or already returned");
  //     }
  
  //     const { source, id: stockId, user_id, thing_id, retail_price } = itemQuery.rows[0];
  
  //     // Remove item from its source stock table
  //     await client.query(`DELETE FROM ${source} WHERE id = $1`, [stockId]);
  
  //     // Add item to AdminStock with status "returned"
  //     await client.query(
  //       `
  //       INSERT INTO AdminStock (thingId, addedBy, status) 
  //       VALUES ($1, $2, 'returned')
  //       `,
  //       [thing_id, returned_by]
  //     );
  
  //     // Generate the next receipt number
  //     const lastReceiptQuery = await client.query(
  //       `SELECT receipt_no FROM billing_receipt ORDER BY id DESC LIMIT 1`
  //     );
  //     const receiptNo =
  //       lastReceiptQuery.rows.length > 0 ? parseInt(lastReceiptQuery.rows[0].receipt_no) + 1 : 1000;
  
  //     // Insert return record into `billing_receipt`
  //     const billingReceiptResult = await client.query(
  //       `
  //       INSERT INTO billing_receipt (
  //         receipt_no, name, phone, dealer_or_customer, total_amount, balance, billing_createdby, 
  //         dealers_id, customers_id, onlinecustomers_id, datetime
  //       ) VALUES (
  //         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP
  //       ) RETURNING id, receipt_no
  //       `,
  //       [
  //         receiptNo,
  //         returned_by, // Name of the person performing the return
  //         null, // Phone number (optional, can be updated if required)
  //         source.replace("Stock", ""), // Source type (dealers, customers, or onlinecustomers)
  //         -retail_price, // Return amount as a negative value
  //         0, // Balance for this return
  //         returned_by, // User who processed the return
  //         source === "dealersStock" ? user_id : null,
  //         source === "customersStock" ? user_id : null,
  //         source === "onlinecustomerStock" ? user_id : null,
  //       ]
  //     );
  
  //     const { id: billingReceiptId } = billingReceiptResult.rows[0];
  
  //     // Insert returned item details into `billing_items`
  //     await client.query(
  //       `
  //       INSERT INTO billing_items (
  //         receipt_no, item_name, model, serial_no, mrp, retail_price
  //       ) VALUES ($1, $2, $3, $4, $5, $6)
  //       `,
  //       [
  //         receiptNo,
  //         "Returned Item", // Placeholder for item name, update if available
  //         null, // Model (optional, can be retrieved if needed)
  //         serial_no,
  //         0, // MRP (optional)
  //         -retail_price, // Refund amount
  //       ]
  //     );
  
  //     // Update warranty table if applicable
  //     await client.query(
  //       `
  //       DELETE FROM thing_warranty 
  //       WHERE serial_no = $1
  //       `,
  //       [serial_no]
  //     );
  
  //     await client.query("COMMIT");
  
  //     // Respond with success details
  //     return res.status(200).json({
  //       message: "Item successfully returned and added to AdminStock",
  //       return_amount: retail_price,
  //       receipt_no: receiptNo,
  //     });
  //   } catch (error) {
  //     await client.query("ROLLBACK");
  //     console.error("Error processing return:", error);
  //     return res.status(500).json({ error: "Internal server error" });
  //   } finally {
  //     client.release();
  //   }
  // });
  
  // dashboard.post("/api/billing/return_exchange/:status", async (req, res) => {
  //   const { serial_numbers, returned_by } = req.body;
  //   const {status}=req.params;
  //   if (!serial_numbers || serial_numbers.length === 0) {
  //     return res.status(400).json({ error: "At least one serial number is required" });
  //   }
  
  //   const client = await db.connect();
  
  //   try {
  //     await client.query("BEGIN");
  
  //     let totalReturnAmount = 0;
  //     const receiptItems = []; // To store item details for the billing receipt
  
  //     // Process each serial number
  //     for (let serial_no of serial_numbers) {
  //       // Locate the item in the relevant stock tables using serial_no
  //       const itemQuery = await client.query(
  //         `
  //         SELECT 'dealersStock' AS source, id, user_id, thing_id, retail_price
  //         FROM dealersStock
  //         WHERE thing_id = (SELECT id FROM Things WHERE serialno = $1) AND status != 'returned'
  
  //         UNION ALL
  
  //         SELECT 'customersStock' AS source, id, user_id, thing_id, retail_price
  //         FROM customersStock
  //         WHERE thing_id = (SELECT id FROM Things WHERE serialno = $1) AND status != 'returned'
  
  //         UNION ALL
  
  //         SELECT 'onlinecustomerStock' AS source, id, user_id, thing_id, retail_price
  //         FROM onlineStock
  //         WHERE thing_id = (SELECT id FROM Things WHERE serialno = $1) AND status != 'returned'
  //         `,
  //         [serial_no]
  //       );
  
  //       if (itemQuery.rows.length === 0) {
  //         throw new Error(`Item with serial number ${serial_no} not found or already returned`);
  //       }
     
  //       const { source, id: stockId, user_id, thing_id, retail_price } = itemQuery.rows[0];
        
  //       // Remove item from its source stock table
  //       await client.query(`DELETE FROM ${source} WHERE id = $1`, [stockId]);
  
  //       // Add item to AdminStock with status "returned"
  //       await client.query(
  //         `
  //         INSERT INTO AdminStock (thingId, addedBy, status)
  //         VALUES ($1, $2, ${status})
  //         `,
  //         [thing_id, returned_by]
  //       );
  //       let table;
  //       if (source === "onlinecustomerStock") {
  //          table="onlinecustomer_details";
  //       }
  //       if (source === "customersStock") {
  //         table="customers_details";
  //        }
  //       if (source ==="dealersStock") {
  //         table="dealers_details";
  //        }
         
  //       const data = await client.query(`Select * from ${table} whare id=${user_id}`)
  //       // Update the balance in the relevant customer/dealer table
        
  //       let balanceUpdateQuery = '';
  //       let balanceUpdateValues = [];
  //       if (source === "onlinecustomerStock") {
  //         balanceUpdateQuery = `
  //           UPDATE onlinecustomer_details
  //           SET balance = balance - $1
  //           WHERE id = $2
  //           RETURNING balance;
  //         `;
  //         balanceUpdateValues = [retail_price, user_id];
  //       } else if (source === "customersStock") {
  //         balanceUpdateQuery = `
  //           UPDATE customers_details
  //           SET balance = balance - $1
  //           WHERE id = $2
  //           RETURNING balance;
  //         `;
  //         balanceUpdateValues = [retail_price, user_id];
  //       } else if (source === "dealersStock") {
  //         balanceUpdateQuery = `
  //           UPDATE dealers_details
  //           SET balance = balance - $1
  //           WHERE id = $2
  //           RETURNING balance;
  //         `;
  //         balanceUpdateValues = [retail_price, user_id];
  //       }
  
  //       // Execute the balance update
  //       const balanceResult = await client.query(balanceUpdateQuery, balanceUpdateValues);
  
  //       // Accumulate total return amount
  //       totalReturnAmount += retail_price;
  
  //       // Store item details for the billing receipt
  //       receiptItems.push({
  //         serial_no,
  //         retail_price: -retail_price, // Negative value for return
  //       });
  
  //       // Update warranty table if applicable
  //       await client.query(
  //         `
  //         DELETE FROM thing_warranty
  //         WHERE serial_no = $1
  //         `,
  //         [serial_no]
  //       );
  //     }
  
  //     // Generate the next receipt number
  //     const lastReceiptQuery = await client.query(
  //       `SELECT receipt_no FROM billing_receipt ORDER BY id DESC LIMIT 1`
  //     );
  //     const receiptNo =
  //       lastReceiptQuery.rows.length > 0 ? parseInt(lastReceiptQuery.rows[0].receipt_no) + 1 : 1000;
  
  //     // Insert return record into `billing_receipt`
  //     const billingReceiptResult = await client.query(
  //       `
  //       INSERT INTO billing_receipt (
  //         receipt_no, name, phone, dealer_or_customer, total_amount, balance, billing_createdby,
  //         dealers_id, customers_id, onlinecustomers_id,type, datetime
  //       ) VALUES (
  //         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,$11,CURRENT_TIMESTAMP
  //       ) RETURNING id, receipt_no
  //       `,
  //       [
  //         receiptNo,
  //         data.name, // Name of the person performing the return
  //         data.phone, // Phone number (optional, can be updated if required)
  //         source.replace("Stock", ""), // Source type (dealers, customers, or onlinecustomers)
  //         -retail_price, // Return amount as a negative value
  //         0, // Balance for this return
  //         returned_by, // User who processed the return
  //         source === "dealersStock" ? user_id : null,
  //         source === "customersStock" ? user_id : null,
  //         source === "onlinecustomerStock" ? user_id : null,
  //         `${status}`
  //       ]
  //     );
  
  //     const { id: billingReceiptId } = billingReceiptResult.rows[0];
  
  //     // Insert returned item details into `billing_items`
  //     for (let item of receiptItems) {
  //       await client.query(
  //         `
  //         INSERT INTO billing_items (
  //           receipt_no, type, model, serial_no, mrp, retail_price
  //         ) VALUES ($1, $2, $3, $4, $5, $6)
  //         `,
  //         [
  //           receiptNo,
  //           `${status}`, // Placeholder for item name, update if available
  //           null, // Model (optional, can be retrieved if needed)
  //           item.serial_no,
  //           0, // MRP (optional)
  //           item.retail_price, // Refund amount
  //         ]
  //       );
  //     }
  
  //     await client.query("COMMIT");
  
  //     // Respond with success details
  //     return res.status(200).json({
  //       message: "Items successfully returned and added to AdminStock",
  //       total_return_amount: totalReturnAmount,
  //       receipt_no: receiptNo,
  //     });
  //   } catch (error) {
  //     await client.query("ROLLBACK");
  //     console.error("Error processing return:", error);
  //     return res.status(500).json({ error: "Internal server error" });
  //   } finally {
  //     client.release();
  //   }
  // });
  
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
  dashboard.post('/api/create/account/for/:Party', async (req, res) => {
  const {table}=req.params.Party;
  const { name, address, email, phone, alt_phone} = req.body;

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
  //delete account 
  dashboard.delete('/api/delete/account/for/:Party/:id', async (req, res) => {
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
  dashboard.put('/api/update/account/for/:Party/:id', async (req, res) => {
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
dashboard.post('/api/create/price_table', async (req, res) => {
  const { model, mrp, retail_price, tax, discount, warranty_period } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO price_table (model, mrp, retail_price, tax, discount, warranty_period)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [model, mrp, retail_price, tax, discount, warranty_period]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create entry' });
  }
});

// Read all entries from the price_table
dashboard.get('/api/diaplay/prices-table', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM price_table');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve prices' });
  }
});

// Read a single entry by ID
dashboard.get('/api/display/single/price_table/:id', async (req, res) => {
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
dashboard.put('/api/update/price_table/:id', async (req, res) => {
  const { id } = req.params;
  const { model, mrp, retail_price, tax, discount, warranty_period } = req.body;
  try {
    const result = await db.query(
      `UPDATE price_table
       SET model = $1, mrp = $2, retail_price = $3, tax = $4, discount = $5, warranty_period = $6
       WHERE id = $7 RETURNING *`,
      [model, mrp, retail_price, tax, discount, warranty_period, id]
    );
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
dashboard.delete('/api/delete/price_table/:id', async (req, res) => {
  const { id } = req.params;
  try {
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

  

module.exports=dashboard;