const express = require("express");
// const  billing= express.Router();
const db = require('../middlewares/dbconnection');// Replace with your actual database connection
const path = require("path");
const fs = require("fs");
const {getThingBySerialNo,removeFromStock,addToStock,generatePDF,sendEmailWithAttachment,isSessionOpen,groupItemsByModel,removeFromdealersStock}= require("./functions"); // Utility functions

 const billing=async (req, res) => {
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
    if (!sessionid) {
      return res.status(400).json({ error: "Session ID is required" });
    }
    const sessionValidation = await isSessionOpen(sessionid, db);
    if (!sessionValidation.isValid) {
      return res.status(400).json({ error: sessionValidation.message });
    }
     
    const username=email;
    // Handle billing based on user role
    if (userRole === "admin") {
      await handleAdminBilling(req.body,username, res);
    } else if (userRole === "dealers") {
      if (type !== "customers") {
        return res.status(400).json({ error: `Dealers cannot sell to ${type}` });
      }
      await handleDealerBilling(req.body,username, res);
    } else {
      return res.status(403).json({ error: "Unauthorized role" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Helper Functions

async function handleAdminBilling(data,username, res) {
  await processBilling(data, "AdminStock",username, res);
}

async function handleDealerBilling(data,username, res) {
  await processBilling(data, "dealersStock",username, res);
}

// async function processBilling(data, stockTable,username, res) {
//   const {
//     sessionid,
//     type,
//     user_id,
//     name,
//     address,
//     shipping_address,
//     phone,
//     alt_phone,
//     email,
//     items,
//     discount,
//     payment_methods,
//     billing_createdby,
//   } = data;

//   const entityTable = `${type}_details`;
//   const stock= `${type}Stock`;
//   const discountValue = parseFloat(discount) || 0;

//   if (discountValue < 0) {
//     return res.status(400).json({ error: "Invalid discount value" });
//   }

//   const client = await db.connect();
//   try {
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

//     // Process items
//     // for (const item of items) {
//     //   const { serial_no, model } = item;

//     //   const priceQuery = await client.query(
//     //     `SELECT mrp, retail_price, warranty_period FROM price_table WHERE model = $1`,
//     //     [model]
//     //   );

//     //   if (priceQuery.rows.length === 0) {
//     //     errors.push(`Model ${model} not found in price_table`);
//     //     continue;
//     //   }

//     //   const { mrp, retail_price, warranty_period } = priceQuery.rows[0];
//     //   const thing = await getThingBySerialNo(serial_no);
//     //   if (!thing) {
//     //     errors.push(`Thing with serial_no ${serial_no} not found`);
//     //     continue;
//     //   }
      
//     //   if(stockTable==="AdminStock"){
//     //   const stockCheck = await client.query(
//     //     `SELECT * FROM ${stockTable} WHERE thingId = $1 AND status = 'new'`,
//     //     [thing.id]
//     //   );

//     //   if (stockCheck.rows.length === 0) {
//     //     errors.push(`Item with serial_no ${serial_no} is not available`);
//     //     continue;
//     //   }
//     //   await removeFromStock(stockTable, thing.id);
//     //   await addToStock(stock, thing.id, entity.id, billing_createdby);
//     // }
//     // else if (stockTable === "dealersStock") {
//     //     const dealerQuery = `
//     //       SELECT id FROM dealers_details WHERE email = $1
//     //     `;
//     //     const dealerResult = await db.query(dealerQuery, [username]);
      
//     //     if (dealerResult.rows.length === 0) {
//     //       errors.push(`Dealer with email ${username} not found`);
//     //       continue;
//     //     }
      
//     //     const dealerId = dealerResult.rows[0].id;
      
//     //     const stockQuery = `
//     //       SELECT * FROM dealersStock WHERE user_id = $1 AND thingid = $2
//     //     `;
//     //     const stockResult = await db.query(stockQuery, [dealerId, thing.id]);
      
//     //     if (stockResult.rows.length === 0) {
//     //       errors.push(
//     //         `Item with serial_no ${serial_no} and thingid ${thing.id} is not available in dealer's stock`
//     //       );
//     //       continue;
//     //     }
      
//     //     // Update stock
//     //     await removeFromStock(stockTable, thing.id);
//     //     await addToStock(stockTable, thing.id, entity.id, billing_createdby);
//     //   }
      
//     //   billingItems.push({
//     //     item_name: thing.thingName,
//     //     serial_no,
//     //     model,
//     //     mrp,
//     //     retail_price: retail_price || 0,
//     //   });

//     //   const dueDateQuery = await client.query(
//     //     `SELECT CURRENT_DATE + $1::INTERVAL AS due_date`,
//     //     [warranty_period || "3 years"]
//     //   );
//     //   warrantyEntries.push({ serial_no, due_date: dueDateQuery.rows[0].due_date });
//     //   totalAmount += parseFloat(retail_price) || 0;
//     // }
//     for (const item of items) {
//         const { serial_no, model } = item;
      
//         // Fetch price details along with SGST, CGST, IGST, and discount
//         const priceQuery = await client.query(
//           `SELECT mrp, retail_price, warranty_period, sgst, cgst, igst, discount FROM price_table WHERE model = $1`,
//           [model]
//         );
      
//         if (priceQuery.rows.length === 0) {
//           errors.push(`Model ${model} not found in price_table`);
//           continue;
//         }
      
//         const { mrp, retail_price, warranty_period, sgst, cgst, igst, discount } = priceQuery.rows[0];
//         const thing = await getThingBySerialNo(serial_no);
//         if (!thing) {
//           errors.push(`Thing with serial_no ${serial_no} not found`);
//           continue;
//         }
      
//         // Apply item-specific discount
//         const itemDiscount = parseFloat(discount) || 0;
//         const discountedPrice = Math.max(0, retail_price - itemDiscount);
      
//         // Tax calculations
//         const sgstAmount = (discountedPrice * (sgst || 0)) / 100;
//         const cgstAmount = (discountedPrice * (cgst || 0)) / 100;
//         const igstAmount = (discountedPrice * (igst || 0)) / 100;
      
//         const totalTax = sgstAmount + cgstAmount + igstAmount;
//         const finalPrice = discountedPrice + totalTax;
      
//         if (stockTable === "AdminStock") {
//           const stockCheck = await client.query(
//             `SELECT * FROM ${stockTable} WHERE thingId = $1 AND status = 'new'`,
//             [thing.id]
//           );
      
//           if (stockCheck.rows.length === 0) {
//             errors.push(`Item with serial_no ${serial_no} is not available`);
//             continue;
//           }
//           await removeFromStock(stockTable, thing.id);
//           await addToStock(stock, thing.id, entity.id, billing_createdby);
//         } else if (stockTable === "dealersStock") {
//           const dealerQuery = `
//             SELECT id FROM dealers_details WHERE email = $1
//           `;
//           const dealerResult = await db.query(dealerQuery, [username]);
      
//           if (dealerResult.rows.length === 0) {
//             errors.push(`Dealer with email ${username} not found`);
//             continue;
//           }
      
//           const dealerId = dealerResult.rows[0].id;
      
//           const stockQuery = `
//             SELECT * FROM dealersStock WHERE user_id = $1 AND thingid = $2
//           `;
//           const stockResult = await db.query(stockQuery, [dealerId, thing.id]);
      
//           if (stockResult.rows.length === 0) {
//             errors.push(
//               `Item with serial_no ${serial_no} and thingid ${thing.id} is not available in dealer's stock`
//             );
//             continue;
//           }
      
//           // Update stock
//           await removeFromStock(stockTable, thing.id);
//           await addToStock(stockTable, thing.id, entity.id, billing_createdby);
//         }
      
//         billingItems.push({
//           item_name: thing.thingName,
//           serial_no,
//           model,
//           mrp,
//           retail_price: parseFloat(retail_price) || 0,
//           item_discount: itemDiscount,
//           discounted_price: discountedPrice,
//           sgst: sgstAmount,
//           cgst: cgstAmount,
//           igst: igstAmount,
//           final_price: finalPrice,
//         });
      
//         const dueDateQuery = await client.query(
//           `SELECT CURRENT_DATE + $1::INTERVAL AS due_date`,
//           [warranty_period || "3 years"]
//         );
//         warrantyEntries.push({ serial_no, due_date: dueDateQuery.rows[0].due_date });
      
//         // Add to total amounts
//         totalAmount += finalPrice;
//       }
//       if (billingItems.length === 0) {
//         await client.query("ROLLBACK");
//         return res.status(400).json({ error: "No valid items for billing", details: errors });
//       }
      
//       // Calculate totals based on item-specific prices
//       let totalAmount = billingItems.reduce((sum, item) => sum + item.final_price, 0);
//       const discountedTotal = totalAmount - discountValue; // Global discount applied on totalAmount
      
//       if (discountedTotal < 0) {
//         await client.query("ROLLBACK");
//         return res.status(400).json({ error: "Discount exceeds the total amount" });
//       }
      
//       // Calculate balance after payments
//       const paidAmount = payment_methods.reduce((sum, p) => sum + parseFloat(p.amount), 0);
//       const balance = discountedTotal - paidAmount;
      
//       // Insert billing receipt
//       const receiptQuery = await client.query(
//         `SELECT receipt_no FROM billing_receipt ORDER BY id DESC LIMIT 1`
//       );
//       const receiptNo = receiptQuery.rows.length > 0 ? parseInt(receiptQuery.rows[0].receipt_no) + 1 : 1000;
      
//       const receiptResult = await client.query(
//         `INSERT INTO billing_receipt (session_id, receipt_no, created_by, name, phone, email, billing_address, shipping_address, dealer_or_customer, total_amount, discount, paid_amount, balance, billing_createdby, ${type}_id, type, datetime)
//          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP) RETURNING id`,
//         [sessionid, receiptNo, user_id, name, phone, email, address, shipping_address, type, totalAmount, discountValue, paidAmount, balance, billing_createdby, entity.id, "sold"]
//       );
      
//       const receiptId = receiptResult.rows[0].id;
      
//       // Insert payment details
//       for (const payment of payment_methods) {
//         await client.query(
//           `INSERT INTO payment_details (receipt_id, payment_method, amount) VALUES ($1, $2, $3)`,
//           [receiptId, payment.payment_method, parseFloat(payment.amount)]
//         );
//       }
      
//       // Handle warranties if applicable
//       if (type === "customers" || type === "onlinecustomer") {
//         for (const warranty of warrantyEntries) {
//           await client.query(
//             `INSERT INTO thing_warranty (serial_no, receipt_id, date, due_date) VALUES ($1, $2, CURRENT_DATE, $3)`,
//             [warranty.serial_no, receiptId, warranty.due_date]
//           );
//         }
//       }
      
//       await client.query("COMMIT");
      
//       res.status(200).json({
//         message: "Billing receipt created successfully",
//         receipt_id: receiptId,
//         total_amount: totalAmount,
//         discount: discountValue,
//         balance,
//         errors: errors.length ? errors : null,
//       });
      
//   } catch (error) {
//     await client.query("ROLLBACK");
//     console.error(error);
//     res.status(500).json({ error: "Internal server error" });
//   } finally {
//     client.release();
//   }
// }
async function processBilling(data, stockTable, username, res) {
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
      payment_methods,
      billing_createdby,
    } = data;
  
    const entityTable = `${type}_details`;
    const stock = `${type}Stock`;
    const discountValue = parseFloat(discount) || 0;
  
    if (discountValue < 0) {
      return res.status(400).json({ error: "Invalid discount value" });
    }
  
    const allowedStockTables = ["AdminStock", "dealersStock"];
    if (!allowedStockTables.includes(stockTable)) {
      return res.status(400).json({ error: "Invalid stock table" });
    }
  
    const client = await db.connect();
    try {
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
        const itemDiscount = parseFloat(discount) || 0;
        const discountedPrice = Math.max(0, retail_price - itemDiscount);
  
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
          await addToStock(stock, thing.id, entity.id, billing_createdby);
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
  
          await removeFromStock(stockTable, thing.id);
          await addToStock(stockTable, thing.id, entity.id, billing_createdby);
        }
  
        billingItems.push({
          item_name: thing.thingName,
          serial_no,
          model,
          mrp,
          retail_price: parseFloat(retail_price) || 0,
          item_discount: itemDiscount,
          discounted_price: discountedPrice,
          sgst: sgstAmount,
          cgst: cgstAmount,
          igst: igstAmount,
          final_price: finalPrice,
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
  
      if (discountValue > totalAmount) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Global discount exceeds total amount" });
      }
  
      const discountedTotal = totalAmount - discountValue;
      const paidAmount = payment_methods.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    //   const finaltotal=discountedTotal-discount
      const balance = discountedTotal - paidAmount;
  
      // Insert billing receipt
      const receiptQuery = await client.query(`SELECT receipt_no FROM billing_receipt ORDER BY id DESC LIMIT 1`);
      const receiptNo = receiptQuery.rows.length > 0 ? parseInt(receiptQuery.rows[0].receipt_no) + 1 : 1000;
  
      const receiptResult = await client.query(
        `INSERT INTO billing_receipt (session_id, receipt_no, created_by, name, phone, email, billing_address, shipping_address, dealer_or_customer, total_amount, discount,payable_amount, paid_amount, balance, billing_createdby, ${type}_id, type, datetime)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,$17, CURRENT_TIMESTAMP) RETURNING id`,
        [sessionid, receiptNo, user_id, name, phone, email, address, shipping_address, type, totalAmount,discountValue,discountedTotal, paidAmount, balance, billing_createdby, entity.id, "sold"]
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
                    `INSERT INTO billing_items (receipt_no, item_name, model, serial_no, retail_price,mrp,item_discount,sgst,cgst,igst,final_price, type) VALUES ($1, $2, $3, $4, $5, $6,$7,$8,$9,$10,$11,$12)`,
                    [receiptNo, item.item_name, item.model, item.serial_no, item.retail_price,item.mrp,item.item_discount,item.sgst,item.cgst,item.igst,item.final_price, "sold"]
                  );
                }
  
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
      
      if (email) {
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
                    address,
                    shipping_address,
                    items: groupedItems, // This will be the grouped items array
                    totalDiscountedPrice, // Total discounted price
                    totalSGST, // Total SGST
                    totalCGST, // Total CGST
                    totalIGST, // Total IGST
                    totalAll, // Total amount // Total in words
                    totalAmount, // Total invoice amount
                    discount: discountValue,
                    discountedTotal, // Discounted total
                    paidAmount,
                    balance,
                    // preparedBy,
                    // salesman
                  });
                  
                  await sendEmailWithAttachment(email, name, receiptNo, pdfPath);
                
                  if (fs.existsSync(pdfPath)) {
                    fs.unlinkSync(pdfPath);
                  }
                }

      res.status(200).json({
        message: "Billing receipt created successfully",
        receipt_id: receiptId,
        total_amount: totalAmount,
        discount: discountValue,
        balance,
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
  
module.exports ={ billing};
