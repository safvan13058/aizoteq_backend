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
async function generatePDF(filePath, name, receiptNo, totalAmount, totalPaid, balance) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      const writeStream = fs.createWriteStream(filePath);

      doc.pipe(writeStream);

      // Add content to the PDF
      doc.fontSize(20).text("Billing Receipt", { align: "center" });
      doc.moveDown();
      doc.fontSize(12).text(`Receipt No: ${receiptNo}`);
      doc.text(`Name: ${name}`);
      doc.text(`Total Amount: $${totalAmount}`);
      doc.text(`Total Paid: $${totalPaid}`);
      doc.text(`Balance: $${balance}`);
      doc.text("\nThank you for your business!", { align: "center" });

      doc.end();

      writeStream.on("finish", () => resolve(filePath));
      writeStream.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });
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

  module.exports={getThingBySerialNo,removeFromAdminStock,addToStock,generatePDF}
