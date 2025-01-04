const express = require('express');
const dashboard = express();
const db = require('./dbconnection');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const jwksClient = require('jwks-rsa');
const { promisify } = require('util');
const Joi = require('joi');
const path = require('path');


const COGNITO_REGION = process.env.COGNITO_REGION;
const COGNITO_USER_db_ID = process.env.COGNITO_USER_POOL_ID;  // Updated with your user db ID
const COGNITO_ISSUER =`https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_db_ID}`;
const client = jwksClient({
    jwksUri: `${COGNITO_ISSUER}/.well-known/jwks.json`,  // JWK URI for your db
});

// ----------------s3 bucket------------------
const AWS = require('aws-sdk');
const multer = require('multer');
const { access } = require('fs');
// Configure S3
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
  });


  const getSigningKey = promisify(client.getSigningKey.bind(client));


  // Middleware for JWT validation
  // Middleware to validate JWT
  async function validateJwt(req, res, next) {
      console.log(req.headers);
      console.log(req.headers.authorization);
  
      const token = req.headers.authorization;
      if (!token || !token.startsWith('Bearer ')) {
          return res.status(401).json({ message: 'Invalid authorization header format' });
      }
  
      const bearerToken = token.split(' ')[1]; // Remove "Bearer " prefix
      try {
          jwt.verify(
              bearerToken,
              async (header, callback) => {
                  console.log('JWT Header:', header);
                  try {
                      const key = await getSigningKey(header.kid); // Ensure getSigningKey is defined
                      console.log(key);
                      callback(null, key.getPublicKey());
                  } catch (err) {
                      console.error('Error retrieving signing key:', err);
                      callback(err);
                  }
              },
              { issuer: COGNITO_ISSUER },
              async (err, decoded) => {
                  if (err) {
                      console.error('JWT verification failed:', err);
                      return res.status(401).json({ message: 'Invalid or expired token', error: err.message });
                  }
  
                  req.user = decoded; // Add decoded token to the request object
  
                  const userSub = decoded.sub; // Assuming `sub` is the identifier
                  if (!userSub) {
                      return res.status(403).json({ message: 'JWT does not contain a valid sub field' });
                  }
  
                  // Check if the user exists in the database and retrieve their role and jwtsub
                  const client = await db.connect(); // Get a client from the pool
                  try {
                      const result = await client.query(
                          'SELECT * FROM users WHERE jwtsub = $1',
                          [userSub]
                      );
                      console.log(result)
                      if (result.rows.length === 0) {
                          return res.status(404).json({ message: 'User not found' });
                      }
  
                      // Attach user data (role and jwtsub) to the request object
                      req.user.role = result.rows[0].userRole;
                      req.user.jwtsub = result.rows[0].jwtsub;
                      req.user.id = result.rows[0].id;
                      req.user.username = result.rows[0].username;
                      console.log("all set")
                      next();
                  } finally {
  
                      client.release();
                       // Release the client back to the pool
                      console.log("all set final")
                  }
              }
          );
      } catch (err) {
          console.error('Unexpected error:', err);
          return res.status(500).json({ message: 'Internal server error' });
      }
  }

  // Validation schemas
  const thingSchema = Joi.object({
      thingName: Joi.string().required(),
      batchId: Joi.string().required(),
      model: Joi.string().required(),
      serialno: Joi.string().required(),
      type: Joi.string().required(),
  });
  
  const attributesSchema = Joi.array().items(
      Joi.object({
          attributeName: Joi.string().required(),
          attributeValue: Joi.string().required(),
      })
  );
  
  const bodySchema = Joi.object({
      thing: thingSchema,
      attributes: attributesSchema,
  });
  
  dashboard.get('/',(req,res)=>{
    res.send('dashboard working ')
  })