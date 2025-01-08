// cognito.js
const jwksClient = require('jwks-rsa');
require('dotenv').config();

const COGNITO_REGION = process.env.COGNITO_REGION;
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const COGNITO_ISSUER = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`;

const client = jwksClient({
    jwksUri: `${COGNITO_ISSUER}/.well-known/jwks.json`,
});

module.exports = {
    COGNITO_ISSUER,
    client,
};
