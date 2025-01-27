const AWS = require('aws-sdk');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// S3 Client Configuration
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Multer Memory Storage (for S3 uploads)
const memoryStorage = multer.memoryStorage();
const upload = multer({
  storage: memoryStorage, // Specify memory storage
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB file size limit
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
  
// Export S3 client and Multer configurations
module.exports = {
  s3,
  upload,
  uploads,
};
