const express = require('express');
const dashboard = express.Router();
const db = require('../middlewares/dbconnection');
// const {getThingBySerialNo,removeFromAdminStock,addToStock} =require('./functions.js')
const { validateJwt, authorizeRoles } = require('../middlewares/auth');
const { thingSchema } = require('../middlewares/validation');
const { s3, upload } = require('../middlewares/s3');
const path = require('path');
const fs = require('fs');
const {getThingBySerialNo,removeFromAdminStock,addToStock,generatePDF,sendEmailWithAttachment,isSessionOpen,groupItemsByModel}=require("./functions.js");
dashboard.get('/',(req,res)=>{
    res.send('dashboard working ')
  })
  const { swaggerU, spec } = require("./swaggerdoc_dash/swagger.js");
  dashboard.use("/api-dashboard", swaggerU.serve, swaggerU.setup(spec));

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
//api for user graph
dashboard.get("/api/users/graph", async (req, res) => {
  const { groupBy } = req.query;  // Accept 'day' or 'month' as a query parameter

  if (!["day", "month"].includes(groupBy)) {
    return res.status(400).json({ error: "Invalid groupBy value. Use 'day' or 'month'." });
  }

  // Query to group users by day or month
  const query = `
    SELECT 
      ${groupBy === "day" ? "DATE(lastModified)" : "TO_CHAR(lastModified, 'YYYY-MM')"} AS period,
      COUNT(*) AS user_count
    FROM 
      Users
    GROUP BY 
      ${groupBy === "day" ? "DATE(lastModified)" : "TO_CHAR(lastModified, 'YYYY-MM')"}
    ORDER BY 
      period;
  `;

  try {
    const client = await db.connect();
    const result = await client.query(query);

    res.status(200).json({
      groupBy,
      data: result.rows, // Rows contain the grouped data
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

// Unified Route: Create Entity, Process Things, and Billing Receipt
  dashboard.post("/api/billing/create", async (req, res) => {
    const {
      sessionid,
      type,
      name,
      address,
      shipping_address,
      phone,
      alt_phone,
      email,
      items,
      discount,
      payment_methods,
      billing_createdby,
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
    if(!sessionid){

    }
  
    const entityTable = `${type}_details`;
    const stockTable = `${type}Stock`;
    const discountValue = parseFloat(discount) || 0;
  
    if (discountValue < 0) {
      return res.status(400).json({ error: "Invalid discount value" });
    }
  
    const client = await db.connect();
    try {

       // Validate if session is open
       const sessionValidation = await isSessionOpen(sessionid, client);
       if (!sessionValidation.isValid) {
           return res.status(400).json({ error: sessionValidation.message });
       }

      let entity = await client.query(`SELECT * FROM ${entityTable} WHERE phone = $1`, [phone]);
      if (entity.rows.length === 0) {
        const result = await client.query(
          `INSERT INTO ${entityTable} (name, address, phone, email, alt_phone, total_amount, paid_amount, balance)
           VALUES ($1, $2, $3, $4, $5, 0, 0, 0) RETURNING id, email`,
          [name, address, phone, email, alt_phone]
        );
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
        const priceQuery = await client.query(
          `SELECT mrp, retail_price, warranty_period FROM price_table WHERE model = $1`,
          [model]
        );
  
        if (priceQuery.rows.length === 0) {
          errors.push(`Model ${model} not found in price_table`);
          continue;
        }
  
        const { retail_price, warranty_period,mrp } = priceQuery.rows[0];
        const thing = await getThingBySerialNo(serial_no);
        if (!thing) {
          errors.push(`Thing with serial_no ${serial_no} not found`);
          continue;
        }
  
        const adminStockCheck = await client.query(
          `SELECT * FROM AdminStock WHERE thingId = $1 AND status = 'new'`,
          [thing.id]
        );
        if (adminStockCheck.rows.length === 0) {
          errors.push(`Item with serial_no ${serial_no} is not available`);
          continue;
        }
  
        await removeFromAdminStock(thing.id);
        await addToStock(stockTable, thing.id, entity.id, billing_createdby);
  
        billingItems.push({
          item_name: thing.thingName,
          serial_no,
          model,
          mrp:mrp,
          retail_price: retail_price || 0,
        });
  
        const dueDateQuery = await client.query(
          `SELECT CURRENT_DATE + $1::INTERVAL AS due_date`,
          [warranty_period || "3 years"]
        );
        warrantyEntries.push({ serial_no, due_date: dueDateQuery.rows[0].due_date });
        totalAmount += parseFloat(retail_price) || 0;
      }
  
      if (billingItems.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "No valid items for billing.", details: errors });
      }
  
      const receiptQuery = await client.query(
        `SELECT receipt_no FROM billing_receipt ORDER BY id DESC LIMIT 1`
      );
      const receiptno = receiptQuery.rows.length > 0 ? parseInt(receiptQuery.rows[0].receipt_no) + 1 : 1000;
  
      let totalPaid = 0;
      for (const payment of payment_methods) {
        const parsedAmount = parseFloat(payment.amount);
        if (!payment.payment_method || isNaN(parsedAmount) || parsedAmount <= 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Invalid payment method or amount" });
        }
        totalPaid += parsedAmount;
      }
  
      
      const discountedTotal = totalAmount - discountValue;
      const payableAmount = Math.max(discountedTotal, 0); // Ensure it's non-negative
      if (discountedTotal < 0) {
        await client.query("ROLLBACK"); 
        return res.status(400).json({ error: "Discount exceeds the total amount" });
      }
  
      const balance = discountedTotal - totalPaid;
      
      const billingReceiptResult = await client.query(
        `INSERT INTO billing_receipt 
           (session_id,receipt_no, name, phone, email, billing_address, shipping_address, dealer_or_customer, total_amount, discount, paid_amount, balance, payable_amount, billing_createdby, ${type}_id, type, lastmodified, datetime)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,$16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id, receipt_no`,
        [ 
          sessionid,
          receiptno, 
          name, 
          phone, 
          email, 
          address, 
          shipping_address, 
          type, 
          totalAmount, 
          discountValue, 
          totalPaid, 
          balance, 
          payableAmount, 
          billing_createdby, 
          entity.id, 
          "sold"
        ]
      );
  
      const { id: receiptId } = billingReceiptResult.rows[0];
  
      for (const payment of payment_methods) {
        await client.query(
          `INSERT INTO payment_details (receipt_id, payment_method, amount) VALUES ($1, $2, $3)`,
          [receiptId, payment.payment_method, parseFloat(payment.amount)]
        );
      }
  
      for (const item of billingItems) {
        await client.query(
          `INSERT INTO billing_items (receipt_no, item_name, model, serial_no, retail_price,mrp, type) VALUES ($1, $2, $3, $4, $5, $6,$7)`,
          [receiptno, item.item_name, item.model, item.serial_no, item.retail_price,item.mrp, "sold"]
        );
      }

      if(type==="customers"||type==="onlinecustomer"){
  
      for (const warranty of warrantyEntries) {
        await client.query(
          `INSERT INTO thing_warranty (serial_no, receipt_id, date, due_date) VALUES ($1, $2, CURRENT_DATE, $3)`,
          [warranty.serial_no, receiptId, warranty.due_date]
        );
       } };
  
      await client.query(
        `UPDATE ${entityTable} 
           SET total_amount = total_amount + $1, 
               paid_amount = paid_amount + $2, 
               balance = total_amount - paid_amount,
               lastmodified = CURRENT_TIMESTAMP
           WHERE id = $3`,
        [discountedTotal, totalPaid, entity.id]
      );
  
      if (email) {
        const receiptDir = path.join(__dirname, "receipt");
        if (!fs.existsSync(receiptDir)) {
          fs.mkdirSync(receiptDir);
        }
        const groupedBillingItems = groupItemsByModel(billingItems);
        const pdfPath = path.join(receiptDir, `receipt_${receiptno}.pdf`);
        await generatePDF(pdfPath, {
           receiptNo: receiptno,
           date: new Date().toLocaleDateString(),
           name,
           phone,
           items: groupedBillingItems,
           totalAmount,
           payableAmount,
           discount: discountValue,
           paidAmount: totalPaid,
           balance,
         });
        await sendEmailWithAttachment(email, name, receiptno, pdfPath);
      
        if (fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath);
        }
      }
  
      await client.query("COMMIT");
      res.status(200).json({
        message: "Billing receipt created successfully",
        entity_id: entity.id,
        receipt_id: receiptId,
        total_amount: totalAmount,
        discount: discountValue,
        paid_amount: totalPaid,
        balance,
        errors: errors.length > 0 ? errors : null,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
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

//Api to display
  dashboard.get('/api/display/party/:Party', async (req, res) => {
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
   
    // Function to validate warranty_period
    function isValidWarrantyPeriod(warrantyPeriod) {
      const regex = /^\d+\s?(years?|months?|days?)((\s\d+\s?(years?|months?|days?))?)*$/i;
      return regex.test(warrantyPeriod);
    }
 
       // Validate input data
  if (!model || !mrp || !retail_price || !tax) {
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
      `INSERT INTO price_table (model, mrp, retail_price, tax, discount, warranty_period)
       VALUES ($1, $2, $3, $4, $5, $6::INTERVAL) RETURNING *`,
      [model, mrp, retail_price, tax, discount, warranty_period]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create entry' });
  }
});

// Read all entries from the price_table
dashboard.get('/api/display/prices-table', async (req, res) => {
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
  console.log(req.body)
  // Function to validate warranty_period
  function isValidWarrantyPeriod(warrantyPeriod) {
    const regex = /^\d+\s?(years?|months?|days?)((\s\d+\s?(years?|months?|days?))?)*$/i;
    return regex.test(warrantyPeriod);
  }


     // Validate input data
if (!model || !mrp || !retail_price || !tax) {
  return res.status(400).json({ error: 'Missing required fields: model, mrp, retail_price, or tax' });
}

if (warranty_period && !isValidWarrantyPeriod(warranty_period)) {
  return res.status(400).json({
    error: 'Invalid warranty period format. Use formats like "2 years", "6 months", or "1 year 6 months".',
  });
}
  try {
    console.log(warranty_period)
    const result = await db.query(
      `UPDATE price_table
       SET model = $1, mrp = $2, retail_price = $3, tax = $4, discount = $5, warranty_period = $6::INTERVAL
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

// API Endpoint to fetch billing details for any entity (dealer, customer, or online customer)
dashboard.get("/api/billing/:entity_type/:entity_id", async (req, res) => {
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
dashboard.post('/open-session', async (req, res) => {
  const { opened_by } = req.body;
  try {
      const result = await db.query(
          `INSERT INTO billing_session (session_date, opened_by) 
           VALUES (CURRENT_DATE, $1) RETURNING *`, 
           [opened_by]
      );
      res.status(201).json({ message: 'Session opened', session: result.rows[0] });
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});

// 2. Close Billing Session
dashboard.post('/close-session', async (req, res) => {
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

      const { opened_at,opened_by } = sessionDetails.rows[0];

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
dashboard.get("/api/reports/daily", async (req, res) => {
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
dashboard.post('/api/raw_materials/create', upload.single('image'), async (req, res) => {
  const { name, category, value, reference_no, stock_quantity, reorder_level } = req.body;
  let fileUrl = null;

  if (req.file) {
    console.log(req.file)
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

  const query = `INSERT INTO raw_materials_stock (name, category, value, reference_no, image, stock_quantity, reorder_level)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`;

  try {
      const result = await db.query(query, [name, category, value, reference_no, fileUrl, stock_quantity, reorder_level]);
      res.status(201).json({ message: 'Raw material created successfully', id: result.rows[0].id });
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create raw material', message: err.message });
  }
});

// API to update a raw material by ID
dashboard.put('/api/raw_materials/update/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, category, value, reference_no, stock_quantity, reorder_level } = req.body;
  let fileUrl = null;

  if (req.file) {
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

  const query = `UPDATE raw_materials_stock
                 SET name = $1, category = $2, value = $3, reference_no = $4, image = $5, stock_quantity = $6, reorder_level = $7
                 WHERE id = $8`;

  try {
      await db.query(query, [name, category, value, reference_no, fileUrl, stock_quantity, reorder_level, id]);
      res.status(200).json({ message: 'Raw material updated successfully' });
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update raw material', message: err.message });
  }
});

dashboard.put('/api/raw/stock/update/:id', async (req, res) => {
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
dashboard.delete('/api/raw_materials/delete/:id', async (req, res) => {
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
dashboard.get('/api/raw_materials', async (req, res) => {
  const query = 'SELECT * FROM raw_materials_stock';

  try {
      const result = await db.query(query);
      res.status(200).json({ raw_materials: result.rows });
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch raw materials', message: err.message });
  }
});

// API to add raw material to a model
dashboard.post('/api/model/:modelId/add-raw-material', async (req, res) => {
  const { modelId } = req.params;
  const { raw_material_id, required_qty } = req.body;

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
dashboard.get('/api/model/:modelId', async (req, res) => {
    const { modelId } = req.params;

    try {
        // Query to get model details from price_table
        const modelQuery = `
            SELECT id, model, mrp, retail_price, tax, discount, warranty_period, lastmodified
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
            SELECT rm.id AS raw_material_id, rm.name, rm.category, rm.value, 
                   rm.reference_no, rm.image, rm.stock_quantity, rm.reorder_level, 
                   trm.required_qty
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



module.exports=dashboard;