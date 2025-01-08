// s3.js
const AWS = require('aws-sdk');
const multer = require('multer');

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});

const storage = multer.memoryStorage();
const upload = multer({ storage });

module.exports = { s3, upload };
