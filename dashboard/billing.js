const express = require("express");
// const  billing= express.Router();
const db = require('../middlewares/dbconnection');// Replace with your actual database connection
const path = require("path");
const fs = require("fs");
const { exec } = require('child_process');
const { getThingBySerialNo, removeFromStock, removeFromStockdealers, addToStock, generatePDF, sendEmailWithAttachment, isSessionOpen, groupItemsByModel, removeFromdealersStock, printPDF,convertToWords } = require("./functions"); // Utility functions

const billing = async (req, res) => {
  const {
    sessionid,
    user_id,
    type,
    name,
    address,
    shipping_address,
    phone,
    alt_phone,
    email,
    items,
    discount,
    gstin,
    payment_methods,
    billing_createdby,
  } = req.body;

  try {
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

    // Fetch user role
    const userRoleQuery = await db.query(`SELECT userRole,userName FROM users WHERE id = $1`, [user_id]);
    if (!userRoleQuery.rows.length) {
      return res.status(400).json({ error: "Invalid user ID" });
    }
    const userRole = userRoleQuery.rows[0].userrole;

    // Validate session
    // if (!sessionid) {
    //   return res.status(400).json({ error: "Session ID is required" });
    // }
    // const sessionValidation = await isSessionOpen(sessionid, db);
    // if (!sessionValidation.isValid) {
    //   return res.status(400).json({ error: sessionValidation.message });
    // }

    const username = email;
    // Handle billing based on user role
    if (userRole === "admin") {
      await handleAdminBilling(req.body, username, res);
    } else if (userRole === "dealers") {
      if (type !== "customers") {
        return res.status(400).json({ error: `Dealers cannot sell to ${type}` });
      }
      await handleDealerBilling(req.body, username, res);
    } else {
      return res.status(403).json({ error: "Unauthorized role" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Helper Functions
async function handleAdminBilling(data, username, res) {
  await processBilling(data, "AdminStock", username, res);
}

async function handleDealerBilling(data, username, res) {
  await processBilling(data, "dealersStock", username, res);
}

async function processBilling(data, stockTable, username, res) {
console.log(convertToWords(2645.09)); // Output: "Two Thousand Six Hundred Forty-Five Rupees and Nine Paise"
console.log(convertToWords(5005.09)); // Output: "Five Thousand Five Rupees and Nine Paise"
console.log(convertToWords(1234567.89)); // Output: "Twelve Lakh Thirty-Four Thousand Five Hundred Sixty-Seven Rupees and Eighty-Nine Paise"
console.log(convertToWords(0.50)); // Output: "Zero Rupees and Fifty Paise"
console.log(convertToWords(1000000));
  const {
    sessionid,
    type,
    user_id,
    name,
    address,
    shipping_address,
    phone,
    alt_phone,
    email,
    items,
    discount,
    gstin,
    payment_methods,
    billing_createdby,
  } = data;

  const entityTable = `${type}_details`;
  const stock = `${type}Stock`;
  const discountValues = parseFloat(discount) || 0;

  if (discountValues < 0) {
    return res.status(400).json({ error: "Invalid discount value" });
  }

  const allowedStockTables = ["AdminStock", "dealersStock"];
  if (!allowedStockTables.includes(stockTable)) {
    return res.status(400).json({ error: "Invalid stock table" });
  }

  const client = await db.connect();
  try {
    let entity = await client.query(`SELECT * FROM ${entityTable} WHERE phone = $1 AND addedby=$2`, [phone, user_id]);
    if (entity.rows.length === 0) {
      const result = await client.query(
        `INSERT INTO ${entityTable} (name, address, phone, email, alt_phone,addedby, total_amount, paid_amount, balance)
           VALUES ($1, $2, $3, $4, $5,$6, 0, 0, 0) RETURNING id, email`,
        [name, address, phone, email, alt_phone, user_id]
      );
      entity = result.rows[0];
    } else {
      entity = entity.rows[0];
    }

    await client.query("BEGIN");

    const billingItems = [];
    const warrantyEntries = [];
    const errors = [];
    let totalAmount = 0;

    for (const item of items) {
      const { serial_no, model } = item;

      // Fetch price details along with taxes and discounts
      const priceQuery = await client.query(
        `SELECT mrp, retail_price, warranty_period, sgst, cgst, igst, discount FROM price_table WHERE model = $1`,
        [model]
      );

      if (priceQuery.rows.length === 0) {
        errors.push(`Model ${model} not found in price_table`);
        continue;
      }

      const { mrp, retail_price, warranty_period, sgst, cgst, igst, discount } = priceQuery.rows[0];
      const thing = await getThingBySerialNo(serial_no);
      if (!thing) {
        errors.push(`Thing with serial_no ${serial_no} not found`);
        continue;
      }

      // Calculate item-specific discount and final price
      const itemDiscountPercentage = parseFloat(discount) || 0; // discount in percentage
      const itemDiscount = (mrp * itemDiscountPercentage) / 100; // calculate discount value
      const discountedPrice = Math.max(0, mrp - itemDiscount);


      // Calculate taxes
      const sgstAmount = (discountedPrice * (sgst || 0)) / 100;
      const cgstAmount = (discountedPrice * (cgst || 0)) / 100;
      const igstAmount = (discountedPrice * (igst || 0)) / 100;
      const totalTax = sgstAmount + cgstAmount + igstAmount;
      const finalPrice = discountedPrice + totalTax;

      // Stock validation and management
      if (stockTable === "AdminStock") {
        const stockCheck = await client.query(
          `SELECT * FROM ${stockTable} WHERE thingId = $1 AND status = 'new'`,
          [thing.id]
        );

        if (stockCheck.rows.length === 0) {
          errors.push(`Item with serial_no ${serial_no} is not available`);
          continue;
        }
        await removeFromStock(stockTable, thing.id);
        await addToStock(stock, thing.id, entity.id, billing_createdby, user_id);
      } else if (stockTable === "dealersStock") {
        const dealerQuery = `SELECT id FROM dealers_details WHERE email = $1`;
        const dealerResult = await client.query(dealerQuery, [username]);

        if (dealerResult.rows.length === 0) {
          errors.push(`Dealer with email ${username} not found`);
          continue;
        }

        const dealerId = dealerResult.rows[0].id;
        const stockQuery = `SELECT * FROM dealersStock WHERE user_id = $1 AND thingid = $2`;
        const stockResult = await client.query(stockQuery, [dealerId, thing.id]);

        if (stockResult.rows.length === 0) {
          errors.push(`Item with serial_no ${serial_no} not available in dealer's stock`);
          continue;
        }

        await removeFromStockdealers(stockTable, thing.id, dealerId);
        await addToStock(stockTable, thing.id, entity.id, billing_createdby, user_id);
      }

      billingItems.push({
        item_name: thing.thingName,
        serial_no,
        model,
        mrp,
        retail_price: parseFloat(retail_price).toFixed(2) || "0.00",
        item_discount: parseFloat(itemDiscount).toFixed(2),
        discounted_price: parseFloat(discountedPrice).toFixed(2),
        sgst: parseFloat(sgstAmount).toFixed(2),
        cgst: parseFloat(cgstAmount).toFixed(2),
        igst: parseFloat(igstAmount).toFixed(2),
        psgst: parseFloat(sgst).toFixed(2),
        pcgst: parseFloat(cgst).toFixed(2),
        pigst: parseFloat(igst).toFixed(2),
        final_price: parseFloat(finalPrice).toFixed(2)
      });

      const dueDateQuery = await client.query(
        `SELECT CURRENT_DATE + $1::INTERVAL AS due_date`,
        [warranty_period || "3 years"]
      );
      warrantyEntries.push({ serial_no, due_date: dueDateQuery.rows[0].due_date });

      totalAmount += finalPrice;
    }

    if (billingItems.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "No valid items for billing", details: errors });
    }
     const discountValue =(totalAmount * discountValues / 100)
    if (discountValue > totalAmount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Global discount exceeds total amount" });
    }

    // const discountedTotal = totalAmount - discountValue;
    const discountedTotal = totalAmount - discountValue;

    const paidAmount = payment_methods.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    //   const finaltotal=discountedTotal-discount
    const balance = parseFloat((discountedTotal - paidAmount).toFixed(2));

    // Insert billing receipt
    const receiptQuery = await client.query(`SELECT receipt_no FROM billing_receipt ORDER BY id DESC LIMIT 1`);
    const receiptNo = receiptQuery.rows.length > 0 ? parseInt(receiptQuery.rows[0].receipt_no) + 1 : 1000;
    const billtype = "sold"
    const receiptResult = await client.query(
      `INSERT INTO billing_receipt (session_id, receipt_no, created_by, name, phone, email, billing_address, shipping_address, dealer_or_customer, total_amount, discount,payable_amount, paid_amount, balance, billing_createdby, ${type}_id, type, datetime)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,$17, CURRENT_TIMESTAMP) RETURNING id`,
      [sessionid, receiptNo, user_id, name, phone, email, address, shipping_address, type, totalAmount, discountValue, discountedTotal, paidAmount, balance, billing_createdby, entity.id, billtype]
    );

    const receiptId = receiptResult.rows[0].id;

    // Insert payment details
    for (const payment of payment_methods) {
      await client.query(
        `INSERT INTO payment_details (receipt_id, payment_method, amount) VALUES ($1, $2, $3)`,
        [receiptId, payment.payment_method, parseFloat(payment.amount)]
      );
    }
    for (const item of billingItems) {
      await client.query(
        `INSERT INTO billing_items (receipt_no, item_name, model, serial_no, mrp,item_discount,sgst,cgst,igst,final_price, type,retail_price) VALUES ($1, $2, $3, $4, $5, $6,$7,$8,$9,$10,$11,$12)`,
        [receiptNo, item.item_name, item.model, item.serial_no, item.mrp, item.item_discount, item.sgst, item.cgst, item.igst, item.final_price, "sold", item.mrp]
      );
    }

    // Insert sales data into sales_graph
    for (const item of billingItems) {
      await client.query(
        `INSERT INTO sales_graph (sale_by, sale_to, thing_id, timeanddate) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
        [user_id || req.user?.id, email, item.serial_no]
      );
    }/*  */

    // Handle warranties
    if (type === "customers" || type === "onlinecustomer") {
      for (const warranty of warrantyEntries) {
        await client.query(
          `INSERT INTO thing_warranty (serial_no, receipt_id, date, due_date) VALUES ($1, $2, CURRENT_DATE, $3)`,
          [warranty.serial_no, receiptId, warranty.due_date]
        );
      }
    }

    await client.query("COMMIT");

    // if (email) {
    const receiptDir = path.join(__dirname, "receipt");
    if (!fs.existsSync(receiptDir)) {
      fs.mkdirSync(receiptDir);
    }
    const { groupedItems, totalSGST, totalCGST, totalIGST, totalDiscountedPrice, totalAll } = groupItemsByModel(billingItems);
    const pdfPath = path.join(receiptDir, `receipt_${receiptNo}.pdf`);

    await generatePDF(pdfPath, {
      receiptNo,
      date: new Date().toLocaleDateString(),
      name,
      phone,
      gstin,
      address,
      shipping_address,
      items: groupedItems, // This will be the grouped items array
      totalDiscountedPrice, // Total discounted price
      totalSGST, // Total SGST
      totalCGST, // Total CGST
      totalIGST, // Total IGST
      totalAll, // Total amount // Total in words
      totalAmount:parseFloat(totalAmount).toFixed(2), // Total invoice amount
      totalInFigures:convertToWords(parseFloat(totalAmount)),
      discount: parseFloat(discountValue).toFixed(2),
      discountedTotal:parseFloat(discountedTotal).toFixed(2), // Discounted total
      paidAmount,
      balance,
      billtype

      // preparedBy,
      // salesman
    });

    // await sendEmailWithAttachment(email, name, receiptNo, pdfPath);
    if (email) {
      await sendEmailWithAttachment(email, name, receiptNo, pdfPath);
    }
    printPDF(pdfPath);
    // if (fs.existsSync(pdfPath)) {
    //   fs.unlinkSync(pdfPath);
    // }
    // }

    res.status(200).json({
      message: "Billing receipt created successfully",
      receipt_id: receiptId,
      total_amount: totalAmount,
      discount: discountValue,
      balance,
      pdfpath: pdfPath,
      errors: errors.length ? errors : null,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
}

// const returned=async (req,res)=>{
//    const {serial_numbers,userid}=req.body;
//    const{status}=req.params


//    if (!serial_numbers || serial_numbers.length === 0) {
//     return res.status(400).json({ error: "At least one serial number is required" });
//   }
//   //  const checkrole=query(`select id, userRole,userName from Users where id=$1`,[userid]);
//    const client = await db.connect();
//    try {
//     await client.query("BEGIN");
//     // Fetch user role
//   const checkrole = await client.query(
//     `SELECT id, userRole, userName FROM Users WHERE id = $1`,
//     [userid]
//   );
//   const userRole = checkrole.rows[0]?.userRole;
//   const userName = checkrole.rows[0]?.userName;
//   const addedid= checkrole.rows[0]?.id;

//   if (!userRole) {
//     throw new Error("User role not found");
//   }

//     // Initialize variables
//    let totalReturnAmount = 0;
//    const receiptItems = [];
//    let updatedBalance = 0;
//    let table = null;
//    let returned_by = userName; // Assuming this is fetched or provided elsewhere

//    if(userRole==="admin"){
//       // Process each serial number
//     for (let serial_no of serial_numbers) { 
//       // Locate the item in the relevant stock tables using serial_no
//       const itemQuery = await client.query(
//         `
//         SELECT 'dealersStock' AS source, id, user_id, thing_id
//         FROM dealersStock
//         WHERE thing_id = (SELECT id FROM Things WHERE serialno = $1) AND status != 'returned'

//         UNION ALL

//         SELECT 'customersStock' AS source, id, user_id, thing_id
//         FROM customersStock
//         WHERE thing_id = (SELECT id FROM Things WHERE serialno = $1) AND status != 'returned'

//         UNION ALL

//         SELECT 'onlinecustomerStock' AS source, id, user_id, thing_id
//         FROM onlinecustomerStock
//         WHERE thing_id = (SELECT id FROM Things WHERE serialno = $1) AND status != 'returned'
//         `,
//         [serial_no]
//       );
//       // / Check if the item is found
//       if (itemQuery.rows.length === 0) {
//         throw new Error(`Item with serial number ${serial_no} not found or already returned`);
//       }
//       itemResult = await client.query(
//         `SELECT * FROM billing_items WHERE serial_no = $1 LIMIT 1`,
//         [serial_no]
//       );

//       if (itemResult.rows.length > 0) {
//         // const retailPrice = itemResult.rows[0].retail_price;
//         console.log('Retail Price:',itemResult.rows[0] );
//       } else {
//         console.log('No item found with the provided serial number');
//       }
//       const retail_price = itemResult.rows[0].retail_price;
//       const { source, id: stockId, user_id, thing_id } = itemQuery.rows[0];
//       sourceType = source ? source.replace("Stock", "") : null;
//       // Remove item from its source stock table
//       await client.query(`DELETE FROM ${source} WHERE id = $1`, [stockId]);
//       await client.query(
//         `
//         INSERT INTO AdminStock (thingId, addedBy, status)
//         VALUES ($1, $2, $3)
//         `,
//         [thing_id, userName, status]
//       );


//       if (source === "onlinecustomerStock") {
//         table = "onlinecustomer_details";
//       }
//       if (source === "customersStock") {
//         table = "customers_details";
//       }
//       if (source === "dealersStock") {
//         table = "dealers_details";
//       }


//      // Fetch the user data from the respective table
//      const dataQuery = await client.query(`SELECT * FROM ${table} WHERE id = $1`, [user_id]);
//      data = dataQuery.rows[0];
//      console.log(data)
//      if (!data) {
//        throw new Error(`User with ID ${user_id} not found`);
//      }
//     }

//     let balanceUpdateQuery = '';
//     let balanceUpdateValues = [];


//     if (status === "return") {
//       // Refund scenario
//       balanceUpdateQuery = `
//         UPDATE ${table}
//         SET balance = balance - $1, refund_amount = refund_amount + $2
//         WHERE id = $3
//         RETURNING balance, refund_amount;
//       `;
//       balanceUpdateValues = [retail_price, retail_price, user_id];
//     }else if (status === "exchange") {
//       // Exchange scenario
//       const priceDifference = new_item_price - retail_price;

//       if (priceDifference > 0) {
//         // Customer needs to pay extra
//         balanceUpdateQuery = `
//           UPDATE ${table}
//           SET balance = balance + $1
//           WHERE id = $2
//           RETURNING balance;
//         `;
//         balanceUpdateValues = [priceDifference, user_id];
//       } else {
//         // Customer receives a refund
//         balanceUpdateQuery = `
//           UPDATE ${table}
//           SET balance = balance - $1, refund_amount = refund_amount + $2
//           WHERE id = $3
//           RETURNING balance, refund_amount;
//         `;
//         balanceUpdateValues = [-priceDifference, -priceDifference, user_id];
//       }
//       // Execute the balance update
//     const balanceResult = await client.query(balanceUpdateQuery, balanceUpdateValues);
//     const updatedBalance = balanceResult.rows[0].balance;

//     // Update total return amount (only for returns)
//     if (status === "returned") {
//       totalReturnAmount += retail_price;
//     }


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
//      // Generate the next receipt number
//      const lastReceiptQuery = await client.query(
//       `SELECT receipt_no FROM billing_receipt ORDER BY id DESC LIMIT 1`
//     );
//     const receiptNo =
//       lastReceiptQuery.rows.length > 0 ? parseInt(lastReceiptQuery.rows[0].receipt_no) + 1 : 1000;
//       console.log(data);
//       console.log(data.name);
//     // Insert return record into `billing_receipt`
//     const billingReceiptResult = await client.query(
//       `
//       INSERT INTO billing_receipt (
//         receipt_no, name, phone, dealer_or_customer, total_amount, balance, billing_createdby,
//         dealers_id, customers_id, onlinecustomer_id, type,billing_address, datetime
//       ) VALUES (
//         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,$12, CURRENT_TIMESTAMP
//       ) RETURNING id, receipt_no
//       `,
//       [
//         receiptNo,
//         data.name, // Name of the person performing the return
//         data.phone, // Phone number (optional, can be updated if required)
//         sourceType, // Source type (dealers, customers, or onlinecustomers)
//         -totalReturnAmount, // Return amount as a negative value
//         updatedBalance, // Balance for this return
//         returned_by, // User who processed the return
//         source === "dealersStock" ? user_id : null,
//         source === "customersStock" ? user_id : null,
//         source === "onlinecustomerStock" ? user_id : null,
//         status ,// The status passed in the request params
//         data.address
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
//           status, // The status passed in the request params
//           itemResult.rows[0].model, // Model (optional, can be retrieved if needed)
//           item.serial_no,
//           0, // MRP (optional)
//           item.retail_price, // Refund amount
//         ]
//       );

//     }
//   }
//   else if(userRole==="dealers"){
//     for (let serial_no of serial_numbers) {
//       // Locate the item in the relevant stock tables using serial_no
//       const itemQuery = await client.query(
//         `
//         SELECT 'customersStock' AS source, id, user_id, thing_id
//         FROM customersStock
//         WHERE thing_id = (SELECT id FROM Things WHERE serialno = $1) AND status != 'returned AND addedby=$2'`,
//         [serial_no,addedid]
//       );
//       if (itemQuery.rows.length === 0) {
//         throw new Error(`Item with serial number ${serial_no} not found or already returned`);
//       }
//        itemResult = await client.query(
//         `SELECT * FROM billing_items WHERE serial_no = $1 LIMIT 1`,
//         [serial_no]
//       );
//       if (itemResult.rows.length > 0) {
//         const retailPrice = itemResult.rows[0].retail_price;
//         console.log('Retail Price:',itemResult.rows[0] );
//       } else {
//         console.log('No item found with the provided serial number');
//       }
//       const retail_price = itemResult.rows[0].retail_price;
//       const { source, id: stockId, user_id, thing_id } = itemQuery.rows[0];
//       sourceType = source ? source.replace("Stock", "") : null;
//       // Remove item from its source stock table
//       await client.query(`DELETE FROM ${source} WHERE id = $1`, [stockId]);
//        // Add item to dealersStock with status "returned"

//        await client.query(
//         `
//         INSERT INTO dealersStock (thingId, addedBy,added_id, status)
//         VALUES ($1, $2, $3,$4)
//         `,
//         [thing_id, returned_by,addedid, status]
//       );
//       if (source === "customersStock") {
//         table = "customers_details";
//       }
//        // Fetch the user data from the respective table
//        const dataQuery = await client.query(`SELECT * FROM ${table} WHERE id = $1 AND addedby=$2`, [user_id,addedid]);
//        data = dataQuery.rows[0];
//        console.log(data)
//        if (!data) {
//          throw new Error(`User with ID ${user_id} not found`);
//        }
//         // Update the balance and refund_amount in the relevant customer/dealer table
//     let balanceUpdateQuery = '';
//     let balanceUpdateValues = [];

//     if (status === "return") {
//       // Refund scenario
//       balanceUpdateQuery = `
//         UPDATE ${table}
//         SET balance = balance - $1, refund_amount = refund_amount + $2
//         WHERE id = $3
//         RETURNING balance, refund_amount;
//       `;
//       balanceUpdateValues = [retail_price, retail_price, user_id];
//     } else if (status === "exchange") {
//       // Exchange scenario
//       const priceDifference = new_item_price - retail_price;

//       if (priceDifference > 0) {
//         // Customer needs to pay extra
//         balanceUpdateQuery = `
//           UPDATE ${table}
//           SET balance = balance + $1
//           WHERE id = $2
//           RETURNING balance;
//         `;
//         balanceUpdateValues = [priceDifference, user_id];
//       } else {
//         // Customer receives a refund
//         balanceUpdateQuery = `
//           UPDATE ${table}
//           SET balance = balance - $1, refund_amount = refund_amount + $2
//           WHERE id = $3
//           RETURNING balance, refund_amount;
//         `;
//         balanceUpdateValues = [-priceDifference, -priceDifference, user_id];
//       }
//     }

//     // Execute the balance update
//     const balanceResult = await client.query(balanceUpdateQuery, balanceUpdateValues);
//     const updatedBalance = balanceResult.rows[0].balance;

//     // Update total return amount (only for returns)
//     if (status === "returned") {
//       totalReturnAmount += retail_price;
//     }


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
//       console.log(data);
//       console.log(data.name);
//     // Insert return record into `billing_receipt`
//     const billingReceiptResult = await client.query(
//       `
//       INSERT INTO billing_receipt (
//         receipt_no, name, phone, dealer_or_customer, total_amount, balance, billing_createdby,
//         dealers_id, customers_id, onlinecustomer_id, type,billing_address, datetime
//       ) VALUES (
//         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,$12, CURRENT_TIMESTAMP
//       ) RETURNING id, receipt_no
//       `,
//       [
//         receiptNo,
//         data.name, // Name of the person performing the return
//         data.phone, // Phone number (optional, can be updated if required)
//         sourceType, // Source type (dealers, customers, or onlinecustomers)
//         -totalReturnAmount, // Return amount as a negative value
//         updatedBalance, // Balance for this return
//         returned_by, // User who processed the return
//         source === "dealersStock" ? user_id : null,
//         source === "customersStock" ? user_id : null,
//         source === "onlinecustomerStock" ? user_id : null,
//         status ,// The status passed in the request params
//         data.address
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
//           status, // The status passed in the request params
//           itemResult.rows[0].model, // Model (optional, can be retrieved if needed)
//           item.serial_no,
//           0, // MRP (optional)
//           item.retail_price, // Refund amount
//         ]
//       );
//     }
//   }
//     await client.query("COMMIT");

//     // Respond with success details
//     return res.status(200).json({
//       message: "Items successfully returned and added to AdminStock",
//       total_return_amount: totalReturnAmount,
//       receipt_no: receiptNo,
//     });

//    }catch (error) {
//     await client.query("ROLLBACK");
//     console.error("Error processing return:", error);
//     return res.status(500).json({ error: "Internal server error" });
//   } finally {
//     client.release();
//   }

//   };

const returned = async (req, res) => {
  const { serial_numbers, userid } = req.body;
  const { status } = req.params;

  // Validate input
  if (!serial_numbers || serial_numbers.length === 0) {
    return res.status(400).json({ error: "At least one serial number is required" });
  }
  if (!["returned", "exchange"].includes(status)) {
    return res.status(400).json({ error: "Invalid status parameter. Must be 'return' or 'exchange'" });
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    // Fetch user role and details
    const user = await fetchUserRole(client, userid);
    if (!user) throw new Error("User not found");
    const { userrole:userRole, username:userName } = user;
  console.log(`role${userRole}`)
    // Initialize variables for processing
    let totalReturnAmount = 0;
    let receiptItems = [];
    let receiptNo = null;

    if (userRole === "admin") {
      // Process returns or exchanges for admin
      ({ totalReturnAmount, receiptItems } = await processAdminReturn(
        client,
        serial_numbers,
        userName,
        status
      ));
    } else if (userRole === "dealers") {
      // Process returns or exchanges for dealers
      ({ totalReturnAmount, receiptItems } = await processDealerReturn(
        client,
        serial_numbers,
        userid,
        userName,
        status
      ));
    } else {
      throw new Error("Unauthorized user role");
    }

    // Generate receipt for the transaction
    receiptNo = await generateReceipt(client, receiptItems, totalReturnAmount, status, userName);

    await client.query("COMMIT");

    // Respond with success details
    return res.status(200).json({
      message: "Items successfully processed",
      total_return_amount: totalReturnAmount,
      receipt_no: receiptNo,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error processing return or exchange:", error);
    return res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

async function fetchUserRole(client, userId) {
  const result = await client.query(`SELECT id, userRole, userName FROM Users WHERE id = $1`, [userId]);
  return result.rows[0];
}

async function locateItem(client, serialNo) {
  const query = `
      SELECT 'dealersStock' AS source, id, user_id, thingid
      FROM dealersStock
      WHERE thingid = (SELECT id FROM Things WHERE serialno = $1) AND status != 'returned'
      UNION ALL
      SELECT 'customersStock' AS source, id, user_id, thingid
      FROM customersStock
      WHERE thingid = (SELECT id FROM Things WHERE serialno = $1) AND status != 'returned'
      UNION ALL
      SELECT 'onlinecustomerStock' AS source, id, user_id, thingid
      FROM onlinecustomerStock
      WHERE thingid = (SELECT id FROM Things WHERE serialno = $1) AND status != 'returned'
    `;
  const result = await client.query(query, [serialNo]);
  return result.rows[0];
}
async function processAdminReturn(client, serialNumbers, userName, status) {
  let totalReturnAmount = 0;
  let receiptItems = [];

  for (const serialNo of serialNumbers) {
    const item = await locateItem(client, serialNo);
    if (!item) throw new Error(`Item with serial number ${serialNo} not found or already returned`);

    const items = await fetchItemsBySerialNumbers(client, serialNo);
    const { id, serial_no, model, final_price, thing_id, } = items;
    // Remove from original stock and add to AdminStock
    await client.query(`DELETE FROM ${item.source} WHERE id = $1`, [item.id]);
    await client.query(
      `INSERT INTO AdminStock (thingId, addedBy, status) VALUES ($1, $2, $3)`,
      [item.thing_id, userName, status]
    );

    totalReturnAmount += items.final_price;

    receiptItems.push({
      serial_no:serialNo,
      model,
      mrp: items.mrp,
      retail_price: items.retail_price,
      item_discount: items.item_discount,
      sgst: items.sgst,
      cgst: items.cgst,
      igst: items.igst,
      final_price: -final_price, // Negating the amount for return
      type: items.type,
    });
  }
  return { totalReturnAmount, receiptItems };
}
async function processDealerReturn(client, serialNumbers, dealerId, userName, status) {
  let totalReturnAmount = 0;
  let receiptItems = [];

  for (const serialNo of serialNumbers) {
    const item = await locateDealerItem(client, serialNo, dealerId);
    if (!item) throw new Error(`Item with serial number ${serialNo} not found or already returned`);
     
    const items = await fetchItemsBySerialNumbers(client, serialNo);
    const { id, serial_no, model, final_price, thing_id, } = items;
    // const retailPrice = await fetchItemsBySerialNumbers(client, serialNo);

    // Remove from customersStock and add to dealersStock
    await client.query(`DELETE FROM customersStock WHERE id = $1`, [item.id]);
    await client.query(
      `INSERT INTO dealersStock (thingId, addedBy, added_id, status) VALUES ($1, $2, $3, $4)`,
      [item.thing_id, userName, dealerId, status]
    );

    totalReturnAmount += retailPrice;

     // Push all item details to receiptItems
     receiptItems.push({
      serial_no:serialNo,
      model: item.model,
      mrp: item.mrp,
      retail_price: item.retail_price,
      item_discount: item.item_discount,
      sgst: item.sgst,
      cgst: item.cgst,
      igst: item.igst,
      final_price: -final_price, // Negating the amount for return
      type: item.type,
    });
  }

  return { totalReturnAmount, receiptItems };
}

async function fetchItemsBySerialNumbers(client, serialNo) {
  const result = await client.query(`SELECT * FROM billing_items WHERE serial_no = $1 LIMIT 1`, [serialNo]);
  if (result.rows.length === 0) throw new Error(`Retail price not found for serial number ${serialNo}`);
  return result.rows[0];
}
async function generateReceipt(client, receiptItems, totalReturnAmount, status, returnedBy) {
  // Generate the next receipt number
  const lastReceipt = await client.query(`SELECT receipt_no FROM billing_receipt ORDER BY id DESC LIMIT 1`);
  const receiptNo = lastReceipt.rows.length > 0 ? parseInt(lastReceipt.rows[0].receipt_no) + 1 : 1000;

  // Insert into billing_receipt
  await client.query(
    `INSERT INTO billing_receipt (receipt_no, total_amount, billing_createdby, type, datetime)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
    [receiptNo, -totalReturnAmount, returnedBy, status]
  );

  // Insert into billing_items
  for (const item of receiptItems) {
    await client.query(
      `INSERT INTO billing_items (receipt_no, serial_no, mrp,model,retail_price) VALUES ($1, $2, $3)`,
      [receiptNo, item.serial_no, item.mrp,item.model,item.mrp]
    );
  }
  const receiptDir = path.join(__dirname, "returned");
    if (!fs.existsSync(receiptDir)) {
      fs.mkdirSync(receiptDir);
    }
  const { groupedItems, totalSGST, totalCGST, totalIGST, totalDiscountedPrice, totalAll } = groupItemsByModel(receiptItems);
  const pdfPath = path.join(receiptDir, `receipt_${receiptNo}.pdf`);
  await generatePDF(pdfPath, {
    receiptNo,
    date: new Date().toLocaleDateString(),
    name,
    phone,
    gstin,
    address,
    shipping_address,
    items: groupedItems, // This will be the grouped items array
    totalDiscountedPrice, // Total discounted price
    totalSGST, // Total SGST
    totalCGST, // Total CGST
    totalIGST, // Total IGST
    totalAll, // Total amount // Total in words
    totalAmount:parseFloat(totalAmount).toFixed(2), // Total invoice amount
    totalInFigures:convertToWords(parseFloat(totalAmount)),
    discount: parseFloat(discountValue).toFixed(2),
    discountedTotal:parseFloat(discountedTotal).toFixed(2), // Discounted total
    paidAmount,
    balance,
    billtype: status
    // preparedBy,
    // salesman
  });
  
    await sendEmailWithAttachment('safvan13473@gmail.com', name, "000", pdfPath);
  
  printPDF(pdfPath);
  return receiptNo;
}


module.exports = { billing, returned };
