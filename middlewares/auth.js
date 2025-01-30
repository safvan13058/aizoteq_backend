// auth.js
const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const db=require('./dbconnection')
const { client, COGNITO_ISSUER } = require('./cognito');

const getSigningKey = promisify(client.getSigningKey.bind(client));


// Middleware for JWT validation
// Middleware to validate JWT
// async function validateJwt(req, res, next) {
//     console.log(req.headers);
//     console.log(req.headers.authorization);

//     const token = req.headers.authorization;
//     if (!token || !token.startsWith('Bearer ')) {
//         return res.status(401).json({ message: 'Invalid authorization header format' });
//     }

//     const bearerToken = token.split(' ')[1]; // Remove "Bearer " prefix
//     try {
//         jwt.verify(
//             bearerToken,
//             async (header, callback) => {
//                 console.log('JWT Header:', header);
//                 try {
//                     const key = await getSigningKey(header.kid); // Ensure getSigningKey is defined
//                     console.log(key);
//                     callback(null, key.getPublicKey());
//                 } catch (err) {
//                     console.error('Error retrieving signing key:', err);
//                     callback(err);
//                 }
//             },
//             { issuer: COGNITO_ISSUER },
//             async (err, decoded) => {
//                 if (err) {
//                     console.error('JWT verification failed:', err);
//                     return res.status(401).json({ message: 'Invalid or expired token', error: err.message });
//                 }

//                 req.user = decoded; // Add decoded token to the request object

//                 const userSub = decoded.sub; // Assuming `sub` is the identifier
//                 if (!userSub) {
//                     return res.status(403).json({ message: 'JWT does not contain a valid sub field' });
//                 }

//                 // Check if the user exists in the database and retrieve their role and jwtsub
//                 const client = await db.connect(); // Get a client from the pool
//                 try {
//                     const result = await client.query(
//                         'SELECT * FROM users WHERE jwtsub = $1',
//                         [userSub]
//                     );
//                     console.log(`usersub${userSub}`)
                    
//                     if (result.rows.length === 0) {
//                         return res.status(404).json({ message: 'User not found' });
//                     }
//                     console.log(`result${ result.rows[0]}`)
//                     // Attach user data (role and jwtsub) to the request object
//                     req.user.role = result.rows[0].userRole;
//                     req.user.jwtsub = result.rows[0].jwtsub;
//                     req.user.id = result.rows[0].id;
//                     req.user.username = result.rows[0].userName;
//                     console.log("all set")
//                     console.log(req.user)
//                     console.log(req.user.role)
                   
//                 } finally {

//                     client.release();
//                      // Release the client back to the pool
//                     console.log("all set final")
//                     next();
//                 }
//             }
//         );
//     } catch (err) {
//         console.error('Unexpected error:', err);
//         return res.status(500).json({ message: 'Internal server error' });
//     }
// }
async function validateJwt(req, res, next) {
    try {
        // console.log(`headers ==${req.headers.authorization}`);

        const token = req.headers.authorization;
        if (!token || !token.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Invalid authorization header format' });
        }

        const bearerToken = token.split(' ')[1]; // Extract the token
        const verifyOptions = { issuer: COGNITO_ISSUER };

        jwt.verify(
            bearerToken,
            async (header, callback) => {
                try {
                    // console.log('JWT Header:', header);
                    const key = await getSigningKey(header.kid);
                    // console.log('Retrieved key:', key);
                    callback(null, key.getPublicKey());
                } catch (err) {
                    console.error('Error retrieving signing key:', err);
                    callback(err);
                }
            },
            verifyOptions,
            async (err, decoded) => {
                if (err) {
                    console.error('JWT verification failed:', err);
                    return res.status(401).json({ message: 'Invalid or expired token', error: err.message });
                }

                const userSub = decoded.sub;
                if (!userSub) {
                    return res.status(403).json({ message: 'JWT does not contain a valid sub field' });
                }

                req.user = decoded; // Attach decoded token to request object

                // Query database for user information
                const client = await db.connect();
                try {
                    const query = 'SELECT * FROM users WHERE jwtsub = $1';
                    const result = await client.query(query, [userSub]);

                    if (result.rows.length === 0) {
                        return res.status(404).json({ message: 'User not found' });
                    }

                    const user = result.rows[0];
                    
                    req.user = {
                        ...req.user,
                        role: user.userrole,
                        jwtsub: user.jwtsub,
                        id: user.id,
                        username: user.username,
                    };

                    // console.log('User authenticated:', req.user);
                    next();
                } catch (dbError) {
                    console.error('Database query error:', dbError);
                    return res.status(500).json({ message: 'Database error', error: dbError.message });
                } finally {
                    client.release(); // Ensure client is released
                }
            }
        );
    } catch (err) {
        console.error('Unexpected error:', err);
        return res.status(500).json({ message: 'Internal server error', error: err.message });
    }
}

// Middleware for role-based access control
function authorizeRoles(...allowedRoles) {
   
    return (req, res, next) => {
        // console.log(`authorizerole ${req.user.role}`)
        const userRole = req.user.role;
        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({ message: 'Access forbidden: insufficient role' });
        }
        next();
    };
}


module.exports = { validateJwt, authorizeRoles };