const express = require('express');
const dashboard = express.Router();
const db = require('../middlewares/dbconnection');
const {getThingBySerialNo,removeFromAdminStock,addToStock} =require('./functions.js')
const { validateJwt, authorizeRoles } = require('../middlewares/auth');
const { thingSchema } = require('../middlewares/validation');
const { s3, upload } = require('../middlewares/s3');

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
  //     type, // 'dealer' or 'customer'
  //     name,
  //     address,
  //     shipping_address,
  //     phone,
  //     alt_phone,
  //     items, // Array of items with serial numbers
  //     payment_methods,
  //     billing_createdby,
  //     TotalAmount,
  //     Balance,
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
  
  //   // Start a transaction
  //   const client = await db.connect();
  
  //   try {
  //     await client.query("BEGIN");  // Start transaction
  
  //     // Step 1: Check if entity exists
  //     let entity = await client.query(`SELECT * FROM ${entityTable} WHERE phone = $1`, [phone]);
  //     if (entity.rows.length === 0) {
  //       // Entity does not exist, create it
  //       const totalAmount = items.reduce((sum, item) => sum + (item.retail_price || 0), 0);
  //       const balance = totalAmount;
  
  //       const result = await client.query(
  //         `INSERT INTO ${entityTable} (name, address, phone, alt_phone, total_amount, balance)
  //          VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
  //         [name, address, phone, alt_phone, totalAmount, balance]
  //       );
  //       entity = result.rows[0];
  //     } else {
  //       entity = entity.rows[0];
  //     }
  
  //     // Step 2: Process each item
  //     let totalAmount = 0;
  //     const billingItems = [];
  
  //     for (const item of items) {
  //       const { serial_no, model } = item;
  
  //       // Step 2.1: Fetch MRP and Retail Price from price_table
  //       const priceQuery = await client.query(
  //         `SELECT mrp, retail_price,warranty_period FROM price_table WHERE model = $1`,
  //         [model]
  //       );
  
  //       if (priceQuery.rows.length === 0) {
  //         return res.status(404).json({ error: `Model ${model} not found in price_table` });
  //       }
  
  //       const { mrp, retail_price,warranty_period } = priceQuery.rows[0];
  //        // Calculate due_date based on warranty_period
  //       // Ensure warranty_period is a valid interval string
  //             const warrantyPeriod = warranty_period || '3 years';

  //          // Use parameterized query to avoid SQL injection
  //       const dueDateQuery = await client.query(
  //       `SELECT CURRENT_DATE + $1::INTERVAL AS due_date`,
  //       [warrantyPeriod]
  //       );

  //     // Fetch the due_date from the result
  //      const due_date = dueDateQuery.rows[0].due_date;

  //       // Step 2.1: Check if Thing exists in Things table
  //       const thing = await getThingBySerialNo(serial_no);
  //       if (!thing) {
  //         return res.status(404).json({ error: `Thing with serial_no ${serial_no} not found in Things table` });
  //       }
  
  //       // Step 2.2: Remove Thing from AdminStock
  //       const removedStock = await removeFromAdminStock(thing.id);
  //       if (!removedStock) {
  //         return res.status(400).json({ error: `Thing with serial_no ${serial_no} is not in AdminStock` });
  //       }
  
  //       // Step 2.3: Add Thing to Dealer's or Customer's Stock
  //       await addToStock(stockTable, thing.id, entity.id, billing_createdby);
  
  //       // Add item to billingItems array
  //       billingItems.push({
  //         item_name: thing.thingName,
  //         serial_no: serial_no,
  //         model: thing.model,
  //         mrp: mrp,
  //         retail_price: retail_price || 0,
  //       });
  
  //       // Add to total amount
  //       totalAmount += retail_price || 0;
  //     }
  
  //     // Step 3: Insert into billing_receipt
  //     let receiptno;
  
  //     // Fetch the last receipt_no
  //     const lastReceiptQuery = await client.query(
  //       `SELECT receipt_no FROM billing_receipt ORDER BY id DESC LIMIT 1`
  //     );
  
  //     if (lastReceiptQuery.rows.length > 0) {
  //       const lastReceiptNo = parseInt(lastReceiptQuery.rows[0].receipt_no, 10);
  //       receiptno = lastReceiptNo + 1; // Increment by 1
  //     } else {
  //       receiptno = 1000; // Start with 1 if no previous receipts exist
  //     }
  
  //     const billingReceiptResult = await client.query(
  //       `INSERT INTO billing_receipt 
  //         (receipt_no, name, phone, billing_address, shipping_address, dealer_or_customer, total_amount, balance, billing_createdby, ${type}_id,lastmodified,datetime)
  //         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, receipt_no`,
  //       [
  //         receiptno,
  //         name,
  //         phone,
  //         address,
  //         shipping_address || null, // No shipping address provided
  //         type,
  //         TotalAmount,
  //         Balance, // Initially, balance = totalAmount; will adjust after payments
  //         billing_createdby,
  //         entity.id
  //       ]
  //     );
  
  //     const { id: billingReceiptId, receipt_no: receiptNo } = billingReceiptResult.rows[0];
  
  //     // Step 4: Insert billing items into billing_items table
  //     for (const item of billingItems) {
  //       await client.query(
  //         `INSERT INTO billing_items 
  //         (receipt_no, item_name, model, serial_no, mrp, retail_price) 
  //         VALUES ($1, $2, $3, $4, $5, $6)`,
  //         [receiptNo, item.model, item.model, item.serial_no, item.mrp, item.retail_price]
  //       );
  //     }
  
  //     // Step 5: Insert payment methods into payment_details table
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

  //     await client.query(`
  //       UPDATE ${entityTable}
  //       SET 
  //           total_amount = COALESCE((
  //               SELECT SUM(total_amount) 
  //               FROM billing_receipt 
  //               WHERE dealer_or_customer = $1 AND ${type}_id = ${entityTable}.id
  //           ), 0),
  //           balance = COALESCE((
  //               SELECT SUM(balance) 
  //               FROM billing_receipt 
  //               WHERE dealer_or_customer = $1 AND ${type}_id = ${entityTable}.id
  //           ), 0),
  //           lastmodified = CURRENT_TIMESTAMP
  //       WHERE id = $2
  //     `, [type, entity.id]);
  
  //     // Step 6: Commit the transaction
  //     await client.query("COMMIT");
  
  //     return res.status(200).json({
  //       message: "Billing receipt created successfully",
  //       entity_id: entity.id,
  //       receipt_id: billingReceiptId,
  //       total_amount: TotalAmount,
  //       total_paid: totalPaid,
  //       Balance,
  //     });
  //   } catch (error) {
  //     // Rollback the transaction in case of error
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
      items,
      payment_methods,
      billing_createdby,
      TotalAmount,
      Balance,
    } = req.body;
  
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
      await client.query("BEGIN");
  
      // Step 1: Check if entity exists or create it
      let entity = await client.query(`SELECT * FROM ${entityTable} WHERE phone = $1`, [phone]);
      if (entity.rows.length === 0) {
        const totalAmount = items.reduce((sum, item) => sum + (item.retail_price || 0), 0);
        const result = await client.query(
          `INSERT INTO ${entityTable} (name, address, phone, alt_phone, total_amount, balance)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [name, address, phone, alt_phone, totalAmount, totalAmount]
        );
        entity = result.rows[0];
      } else {
        entity = entity.rows[0];
      }
  
      let totalAmount = 0;
      const billingItems = [];
      const warrantyEntries = [];
  
      for (const item of items) {
        const { serial_no, model } = item;
  
        // Fetch price and warranty period
        const priceQuery = await client.query(
          `SELECT mrp, retail_price, warranty_period FROM price_table WHERE model = $1`,
          [model]
        );
        if (priceQuery.rows.length === 0) {
          return res.status(404).json({ error: `Model ${model} not found in price_table` });
        }
  
        const { mrp, retail_price, warranty_period } = priceQuery.rows[0];
        const warrantyPeriod = warranty_period || '3 years';
        const dueDateQuery = await client.query(`SELECT CURRENT_DATE + $1::INTERVAL AS due_date`, [
          warrantyPeriod,
        ]);
        const due_date = dueDateQuery.rows[0].due_date;
  
        const thing = await getThingBySerialNo(serial_no);
        if (!thing) {
          return res.status(404).json({ error: `Thing with serial_no ${serial_no} not found in Things table` });
        }
  
        await removeFromAdminStock(thing.id);
        await addToStock(stockTable, thing.id, entity.id, billing_createdby);
  
        billingItems.push({
          item_name: thing.thingName,
          serial_no: serial_no,
          model: thing.model,
          mrp: mrp,
          retail_price: retail_price || 0,
        });
  
        warrantyEntries.push({ serial_no, due_date });
        totalAmount += retail_price || 0;
      }
  
      const lastReceiptQuery = await client.query(`SELECT receipt_no FROM billing_receipt ORDER BY id DESC LIMIT 1`);
      const receiptno = lastReceiptQuery.rows.length > 0 ? parseInt(lastReceiptQuery.rows[0].receipt_no) + 1 : 1000;
  
      const billingReceiptResult = await client.query(
        `INSERT INTO billing_receipt 
         (receipt_no, name, phone, billing_address, shipping_address, dealer_or_customer, total_amount, balance, billing_createdby, ${type}_id, lastmodified, datetime)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id, receipt_no`,
        [receiptno, name, phone, address, shipping_address || null, type, TotalAmount, Balance, billing_createdby, entity.id]
      );
  
      const { id: billingReceiptId, receipt_no: receiptNo } = billingReceiptResult.rows[0];
  
      for (const item of billingItems) {
        await client.query(
          `INSERT INTO billing_items (receipt_no, item_name, model, serial_no, mrp, retail_price) VALUES ($1, $2, $3, $4, $5, $6)`,
          [receiptNo,  item.model, item.model, item.serial_no, item.mrp, item.retail_price]
        );
      }
  
      for (const warranty of warrantyEntries) {
        await client.query(
          `INSERT INTO thing_warranty (serial_no, receipt_id, date, due_date) VALUES ($1, $2, CURRENT_DATE, $3)`,
          [warranty.serial_no, billingReceiptId, warranty.due_date]
        );
      }
  
      let totalPaid = 0;
      for (const payment of payment_methods) {
        const { payment_method, amount } = payment;
        if (!payment_method || !amount || amount <= 0) {
          return res.status(400).json({ error: "Invalid payment method or amount" });
        }
        totalPaid += amount;
        await client.query(
          `INSERT INTO payment_details (receipt_id, payment_method, amount) VALUES ($1, $2, $3)`,
          [billingReceiptId, payment_method, amount]
        );
      }
  
      await client.query(`UPDATE ${entityTable} SET total_amount = total_amount + $1, balance = balance + $2 WHERE id = $3`, [
        TotalAmount,
        Balance,
        entity.id,
      ]);
  
      await client.query("COMMIT");
  
      return res.status(200).json({
        message: "Billing receipt created successfully",
        entity_id: entity.id,
        receipt_id: billingReceiptId,
        total_amount: TotalAmount,
        total_paid: totalPaid,
        Balance,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error processing billing:", error);
      return res.status(500).json({ error: "Internal server error" });
    } finally {
      client.release();
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
  
  dashboard.get("/api/billing/all/timestamp", async (req, res) => {
    try {
      // Step 1: Fetch all billing receipts along with payment details, billing items, and timestamps
      const billingQuery = `
        SELECT 
          br.id AS receipt_id,
          br.receipt_no,
          br.name AS customer_name,
          br.phone,
          br.billing_address,
          br.shipping_address,
          br.dealer_or_customer,
          br.lastmodified,
          br.total_amount,
          br.balance,
          br.billing_createdby,
          br.datetime,   -- Billing creation timestamp
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
        ORDER BY br.lastmodified DESC
      `;
  
      const result = await db.query(billingQuery);
  
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "No billing receipts" });
      }
  
      // Step 2: Format the results to group payments and items under each receipt
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
  
        // Add payment details to the current receipt, ensuring no duplicates
        if (row.payment_method && row.payment_amount) {
          const existingPayment = currentReceipt.payments.find(
            payment => payment.payment_method === row.payment_method
          );
          if (!existingPayment) {
            currentReceipt.payments.push({
              payment_method: row.payment_method,
              payment_amount: row.payment_amount
            });
          } else {
            // If the payment method already exists, aggregate the amount
            existingPayment.payment_amount += parseFloat(row.payment_amount);
          }
        }
  
        // Add billing item details to the current receipt, ensuring no duplicates
        if (row.item_name) {
          const existingItem = currentReceipt.items.find(
            item => item.serial_no === row.serial_no
          );
          if (!existingItem) {
            currentReceipt.items.push({
              item_name: row.item_name,
              model: row.model,
              mrp: row.mrp,
              serial_no: row.serial_no,
              retail_price: row.retail_price
            });
          }
        }
      });
  
      // Push the last receipt after processing all rows
      if (currentReceipt) billingReceipts.push(currentReceipt);
  
      // Step 3: Return the list of billing receipts with payment and item details
      return res.status(200).json({
        message: "Billing receipts with payment and item details successfully",
        data: billingReceipts
      });
    } catch (error) {
      console.error("Error fetching all billing receipts:", error);
      return res.status(500).json({ error: "Internal server error" });
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
  


  
  
module.exports=dashboard;