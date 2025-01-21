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
  const removeFromdealersStock = async (thingId) => {
    const result = await db.query(`DELETE FROM dealersStock WHERE thingId = $1 RETURNING *`, [thingId]);
    return result.rows[0] || null;
  };
  const removeFromStock = async (stockTable,thingId) => {
    const result = await db.query(`DELETE FROM ${stockTable} WHERE thingId = $1  RETURNING *`, [thingId]);
    return result.rows[0] || null;
  };
  const removeFromStockdealers = async (stockTable,thingId,user_id) => {
    const result = await db.query(`DELETE FROM ${stockTable} WHERE thingId = $1 AND user_id=$2 RETURNING *`, [thingId,user_id]);
    return result.rows[0] || null;
  };
  
  
  // Helper function: Add thing to dealer's or customer's stock
  const addToStock = async (stockTable, thingId,userid, addedBy,added_id, status = "new") => {
    await db.query(
      `INSERT INTO ${stockTable} (thingid,user_id,added_id,added_by, status) VALUES ($1, $2, $3,$4,$5)`,
      [thingId,userid,added_id, addedBy, status]
    );
  };
   
  // function groupItemsByModel(items) {
  //   const grouped = {};
  //   for (const item of items) {
  //     const { model, item_name, retail_price, mrp } = item;
  //     if (!grouped[model]) {
  //       grouped[model] = {
  //         model,
  //         item_name,
  //         retail_price,
  //         mrp,
  //         qty: 1, // Start with quantity 1 for the first occurrence
  //       };
  //     } else {
  //       grouped[model].qty += 1; // Increment quantity for subsequent occurrences
  //     }
  //   }
  //   return Object.values(grouped); // Convert the grouped object back to an array
  // }

  // function groupItemsByModel(items) {
  //   const grouped = {};
    
  //   for (const item of items) {
  //     const { serial_no, model, item_name, retail_price, mrp, item_discount, discounted_price, sgst, cgst, igst, final_price } = item;
      
  //     if (!grouped[model]) {
  //       grouped[model] = {
  //         model,
  //         item_name,
  //         retail_price,
  //         mrp,
  //         qty: 1, // Start with quantity 1 for the first occurrence
  //         item_discount,
  //         discounted_price,
  //         sgst,
  //         cgst,
  //         igst,
  //         final_price,
  //       };
  //     } else {
  //       grouped[model].qty += 1; // Increment quantity for subsequent occurrences
  
  //       // Accumulate the item properties for each model
  //       grouped[model].item_discount += item_discount;
  //       grouped[model].discounted_price += discounted_price;
  //       grouped[model].sgst += sgst;
  //       grouped[model].cgst += cgst;
  //       grouped[model].igst += igst;
  //       grouped[model].final_price += final_price;
  //     }
  //   }
  
  //   return Object.values(grouped); // Convert the grouped object back to an array
  // }
  function groupItemsByModel(items) {
    const grouped = {};
    let totalSGST = 0; // To accumulate total SGST
    let totalCGST = 0; // To accumulate total CGST
    let totalIGST = 0; // To accumulate total IGST
    let totalDiscountedPrice = 0; // To accumulate total discounted price
    let totalAll = 0;
    let totalRetailPrice = 0;
    for (const item of items) {
        const { serial_no, model, item_name, retail_price, mrp, item_discount, discounted_price, sgst, cgst, igst,psgst,pcgst,pigst, final_price } = item;
        
        // Accumulate tax totals
        totalSGST += sgst;
        totalCGST += cgst;
        totalIGST += igst;
        
        // Accumulate the total discounted price
        totalDiscountedPrice += discounted_price;
        totalAll += sgst + cgst + igst + discounted_price;
        // Accumulate total retail price
        totalRetailPrice += retail_price;

        // Group items by model
        if (!grouped[model]) {
            grouped[model] = {
                model,
                item_name,
                retail_price,
                mrp,
                qty: 1, // Start with quantity 1 for the first occurrence
                item_discount,
                discounted_price,
                sgst,
                cgst,
                igst,
                psgst,
                pcgst,
                pigst,
                final_price,
                totalRetailPrice
            };
        } else {
            grouped[model].qty += 1; // Increment quantity for subsequent occurrences
            
            // Accumulate the item properties for each model
            grouped[model].totalRetailPrice += retail_price;
            grouped[model].item_discount += item_discount;
            grouped[model].discounted_price += discounted_price;
            grouped[model].sgst += sgst;
            grouped[model].cgst += cgst;
            grouped[model].igst += igst;
            grouped[model].final_price += final_price;
        }
    }
    console.log(Object.values(grouped), // Convert the grouped object back to an array
    totalSGST,
    totalCGST,
    totalIGST,
    totalDiscountedPrice, // Return the total discounted price
    totalAll,
    totalRetailPrice)
    return {
        
        groupedItems: Object.values(grouped), // Convert the grouped object back to an array
        totalSGST,
        totalCGST,
        totalIGST,
        totalDiscountedPrice, // Return the total discounted price
        totalAll,
        totalRetailPrice

      };
}

  
  async function isSessionOpen(session_id, client) {
    const result = await client.query(
        `SELECT status FROM billing_session WHERE id = $1`,
        [session_id]
    );
    if (result.rows.length === 0) {
        return { isValid: false, message: "Session does not exist." };
    }
    const status = result.rows[0].status;
    if (status !== 'open') {
        return { isValid: false, message: "Session is closed." };
    }
    return { isValid: true };
}



const PDFDocument = require("pdfkit");
const fs = require("fs");

/**
 * Generates a PDF receipt.
 * @param {string} filePath - Path to save the PDF file.
 * @param {string} name - Recipient's name.
 * @param {string} receiptNo - Receipt number.
 * @param {number} totalAmount - Total amount for the receipt.
 * @param {number} totalPaid - Total paid amount.
 * @param {number} balance - Remaining balance.
 * @returns {Promise<string>} - The path to the generated PDF file.
 */
// async function generatePDF(filePath, name, receiptNo, totalAmount, totalPaid, balance) {
//   return new Promise((resolve, reject) => {
//     try {
//       const doc = new PDFDocument();
//       const writeStream = fs.createWriteStream(filePath);

//       doc.pipe(writeStream);

//       // Add content to the PDF
//       doc.fontSize(20).text("Billing Receipt", { align: "center" });
//       doc.moveDown();
//       doc.fontSize(12).text(`Receipt No: ${receiptNo}`);
//       doc.text(`Name: ${name}`);
//       doc.text(`Total Amount: $${totalAmount}`);
//       doc.text(`Total Paid: $${totalPaid}`);
//       doc.text(`Balance: $${balance}`);
//       doc.text("\nThank you for your business!", { align: "center" });

//       doc.end();

//       writeStream.on("finish", () => resolve(filePath));
//       writeStream.on("error", reject);
//     } catch (error) {
//       reject(error);
//     }
//   });
// }
// async function generatePDF(filePath, name, receiptNo, totalAmount, totalPaid, balance, billingItems) {
//   return new Promise((resolve, reject) => {
//     try {
//       const doc = new PDFDocument();
//       const writeStream = fs.createWriteStream(filePath);

//       doc.pipe(writeStream);

//       // Header
//       doc.fontSize(20).text("Billing Receipt", { align: "center" });
//       doc.moveDown();

//       // Receipt and Customer Details
//       doc.fontSize(12).text(`Receipt No: ${receiptNo}`);
//       doc.text(`Customer Name: ${name}`);
//       doc.text(`Total Amount: $${totalAmount.toFixed(2)}`);
//       doc.text(`Total Paid: $${totalPaid.toFixed(2)}`);
//       doc.text(`Balance: $${balance.toFixed(2)}`);
//       doc.moveDown();

//       // Product Details Header
//       doc.fontSize(14).text("Product Details:", { underline: true });
//       doc.moveDown(0.5);

//       // Table Header
//       doc.fontSize(12)
//         .text("Item Name", { continued: true, width: 200 })
//         .text("Model", { continued: true, align: "center", width: 150 })
//         .text("Serial No", { continued: true, align: "center", width: 150 })
//         .text("Price", { align: "right", width: 100 });
//       doc.moveDown(0.5);

//       // Product Details Table
//       billingItems.forEach((item) => {
//         const retailPrice = parseFloat(item.retail_price) || 0; // Convert to number, fallback to 0 if invalid
//         doc.text(item.item_name || "N/A", { continued: true, width: 200 })
//           .text(item.model || "N/A", { continued: true, align: "center", width: 150 })
//           .text(item.serial_no || "N/A", { continued: true, align: "center", width: 150 })
//           .text(`$${retailPrice.toFixed(2)}`, { align: "right", width: 100 });
//         doc.moveDown(0.5);
//       });

//       doc.moveDown();

//       // Footer
//       doc.text("Thank you for your business!", { align: "center" });

//       doc.end();

//       writeStream.on("finish", () => resolve(filePath));
//       writeStream.on("error", reject);
//     } catch (error) {
//       reject(error);
//     }
//   });
// }

const puppeteer = require("puppeteer");
const Handlebars = require("handlebars");
// Register the `multiply` helper
Handlebars.registerHelper("multiply", function (a, b) {
  return a * b;
});

// Register the `increment` helper
Handlebars.registerHelper("increment", function (value) {
  return parseInt(value) + 1; // Increment the value by 1
});
async function generatePDF(filePath, data) {
  // Load HTML template
  const templateHtml = fs.readFileSync("./dashboard/receipt/invoice2.html", "utf8");
  const template = Handlebars.compile(templateHtml);

  // Replace placeholders with data
  const compiledHtml = template(data);

  // Launch Puppeteer
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Set content
  await page.setContent(compiledHtml, { waitUntil: "domcontentloaded" });

  // Generate PDF
  await page.pdf({ path: filePath, format: "A4" });

  await browser.close();
}

const nodemailer = require("nodemailer");

/**
 * Sends an email with a PDF receipt attached.
 * @param {string} toEmail - Recipient's email address.
 * @param {string} name - Recipient's name.
 * @param {string} receiptNo - Receipt number.
 * @param {string} pdfPath - Path to the PDF file.
 * @returns {Promise<void>}
 */
async function sendEmailWithAttachment(toEmail, name, receiptNo, pdfPath) {
  if (!toEmail) {
    console.warn("No email provided. Skipping email receipt.");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER, // Your email
      pass: process.env.EMAIL_PASSWORD, // Your email password
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: toEmail,
    subject: `Billing Receipt #${receiptNo}`,
    text: `Dear ${name},\n\nPlease find your receipt attached.\n\nBest regards,\nYour Company`,
    attachments: [
      {
        filename: `receipt_${receiptNo}.pdf`,
        path: pdfPath,
      },
    ],
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email with receipt sent to ${toEmail}`);
  } catch (error) {
    console.error("Failed to send email receipt:", error);
    throw error;
  }
}

  module.exports={getThingBySerialNo,removeFromAdminStock,removeFromStockdealers,removeFromStock,addToStock,generatePDF,sendEmailWithAttachment,isSessionOpen,groupItemsByModel,removeFromdealersStock}
