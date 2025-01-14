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

async function generatePDF(filePath, data) {
  // Load HTML template
  const templateHtml = fs.readFileSync("./receipt/invoice.html", "utf8");
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

  module.exports={getThingBySerialNo,removeFromAdminStock,addToStock,generatePDF,sendEmailWithAttachment}
