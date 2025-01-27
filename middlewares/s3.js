// s3.js
const AWS = require('aws-sdk');
const multer = require('multer');
const path = require("path");
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});

const storage = multer.memoryStorage();
// const upload = multer({ storage });
// Use memory storage for handling file buffers
const upload = multer({
    storage, // Specify memory storage
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB file size limit
});


const store = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(__dirname, "uploads");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  });
  
  const uploads = multer({ store });
    
module.exports = { s3, upload,uploads};
