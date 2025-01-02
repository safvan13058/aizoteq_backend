const express = require('express');
const app = express();
const db = require('./dbconnection');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const jwksClient = require('jwks-rsa');
const { promisify } = require('util');
const Joi = require('joi');
const login = require('./login');
const signup=require('./signup')

app.use('/signup',signup);
app.use('/signup',login);

app.use(express.json());
// app.use(bodyParser.json());
// Cognito settings
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
  
  // Configure Multer for file uploads
  const storage = multer.memoryStorage();
  const upload = multer({ storage });
// -------------------------------------
// -----------create Security  key for things------------
function SecurityKey(macAddress) {
    // Remove colons or hyphens and extract the last 6 digits of the MAC address
    const lastSixDigits = macAddress.replace(/[:-]/g, '').slice(-6);
    
    // Generate 4 random digits
    const randomDigits = Math.floor(1000 + Math.random() * 9000); // Random 4-digit number
    
    // Combine the random digits with the last 6 digits of the MAC address
    const randomKey = `${randomDigits}${lastSixDigits}`;
    return randomKey;
}
// --------------------------------

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
//                     const key = await getSigningKey(header.kid);
//                     console.log(key)
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
//                 const connection = await db.connect();
//                 const [rows] = await connection.query(
//                     'SELECT * FROM Users WHERE jwtsub = $1',
//                     [userSub]
//                 );

//                 if (rows.length === 0) {
//                     return res.status(404).json({ message: 'User not found' });
//                 }

//                 // Attach user data (role and jwtsub) to the request object
//                 req.user.role = rows[0].userRole;
//                 req.user.jwtsub = rows[0].jwtsub;
//                 req.user.id = rows[0].id;
//                 req.user.username = rows[0].username;

//                 connection.release();
//                 next();
//             }
//         );
//     } catch (err) {
//         console.error('Unexpected error:', err);
//         return res.status(500).json({ message: 'Internal server error' });
//     }
// }
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
//     console.log(req.headers)
//     const token = req.headers.authorization;
//     if (!token || !token.startsWith('Bearer ')) {
//         return res.status(401).json({ message: 'Invalid authorization header format' });
//     }
//     const bearerToken = token.split(' ')[1]; // Remove "Bearer " prefix
//     try {
//         const decoded = await jwt.verify(
//             bearerToken,
//             async (header) => {
//                 console.log(header)
//                 const key = await getSigningKey(header.kid);
//                 return key.getPublicKey();
//             },
//             { issuer: COGNITO_ISSUER }
//         );

//         req.user = decoded; // Add decoded token to the request object

//         const userSub = decoded.sub; // Assuming `sub` is the identifier
//         if (!userSub) {
//             return res.status(403).json({ message: 'JWT does not contain a valid sub field' });
//         }

//         // Check if the user exists in the database and retrieve their role and jwtsub
//         const connection = await db.getConnection();
//         const [rows] = await connection.query(
//             'SELECT userRole, jwtsub FROM Users WHERE jwtsub = $1',
//             [userSub]
//         );

//         if (rows.length === 0) {
//             return res.status(404).json({ message: 'User not found' });
//         }

//         // Attach user data (role and jwtsub) to the request object
//         req.user.role = rows[0].userRole;
//         req.user.jwtsub = rows[0].jwtsub;

//         connection.release();
//         next();
//     } catch (err) {
//         console.error('JWT verification failed:', err);
//         return res.status(401).json({ message: 'Invalid or expired token', error: err.message });
//     }
// }

// Middleware for role-based access control
function authorizeRoles(...allowedRoles) {
    return (req, res, next) => {
        const userRole = req.user.role;
        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({ message: 'Access forbidden: insufficient role' });
        }
        next();
    };
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




app.get('/',(req,res)=>{
    res.send('working EC2 ')
})

// Protect the /app/addThing endpoint for admins and staff
app.post(
    "/app/addThing",
    // validateJwt,
    // authorizeRoles("admin", "staff"), // Allow only admin and staff
    async (req, res) => {
        // const { error } = bodySchema.validate(req.body);
        // if (error) {
        //     return res.status(400).json({ message: "Invalid input data", error: error.details });
        // }

        const { thing, attributes,status,failureReason} = req.body;
        const{username}=req.body||req.user;
        const client = await db.connect(); // Get a client connection

        try {
            await client.query("BEGIN"); // Start transaction

            // Create security key for thing
            const securityKey = await SecurityKey(thing.serialno);
            console.log(securityKey);

            // Insert Thing
            const thingQuery = `
                INSERT INTO things (thingName, createdBy, batchId, model, serialno, type, securityKey)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id
            `;
            const thingResult = await client.query(thingQuery, [
                thing.thingName,
                username,
                         // Using the authenticated user's username
                thing.batchId,
                thing.model,
                thing.serialno,
                thing.type || null,
                securityKey
            ]);
            const thingId = thingResult.rows[0].id; // Retrieve the inserted thing ID
            console.log(thingResult);

            // Insert Attributes and Devices
            let counter = 1;
            for (const attr of attributes) {
                // Insert ThingAttributes
                const attributeQuery = `
                    INSERT INTO ThingAttributes (thingId, attributeName, attributeValue)
                    VALUES ($1, $2, $3)
                `;
                await client.query(attributeQuery, [thingId, attr.attributeName, attr.attributeValue]);

                // Validate and Insert Devices
                const totalDevices = parseInt(attr.attributeValue, 10);
                if (totalDevices > 100) {
                    throw new Error(`Too many devices requested for attribute ${attr.attributeName}`);
                }

                for (let i = 1; i <= totalDevices; i++) {
                    const deviceId = `${thing.serialno}_${counter}`;
                    const name = `${attr.attributeName}_${i}`;
                    const deviceQuery = `
                        INSERT INTO Devices (thingId, deviceId, macAddress, hubIndex, createdBy, enable, status, icon, name, type)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    `;
                    
                        await client.query(deviceQuery, [
                            thingId,
                            deviceId,
                            thing.serialno,
                            counter,
                            username,
                            true,
                            null,
                            null,
                            name,
                            attr.attributeName,
                        ]);
                    

                    counter++;
                }
            }
            
            // Handle AdminStock and Failed Devices if status is 'rework'
    
    if (status === 'rework') {
        // const failureReason = `Rework needed due to ${thing.reason || 'unspecified issues'}`;

        // Update AdminStock status to 'rework'
        const updateAdminStockQuery = `
            INSERT INTO AdminStock (thingId, addedAt, addedBy, status)
            VALUES ($1, CURRENT_TIMESTAMP, $2, $3)
        `;
        await client.query(updateAdminStockQuery, [thingId, username, "rework"]);

        // Log the failure in TestFailedDevices
        const insertFailedDeviceQuery = `
            INSERT INTO TestFailedDevices (thingId, failureReason)
            VALUES ($1, $2)
        `;
        await client.query(insertFailedDeviceQuery, [thingId, failureReason]);
    } else {
        // Insert into AdminStock
        const adminStockQuery = `
            INSERT INTO AdminStock (thingId, addedAt, addedBy, status)
            VALUES ($1, CURRENT_TIMESTAMP, $2, $3)
        `;
        await client.query(adminStockQuery, [thingId, username, "new"]);
    }
            // // Insert into AdminStock
            // const adminStockQuery = `
            //     INSERT INTO AdminStock (thingId, addedAt, addedBy, status)
            //     VALUES ($1, CURRENT_TIMESTAMP, $2, $3)
            // `;
            // await client.query(adminStockQuery, [thingId, username, "new"]);

            // Commit transaction
            await client.query("COMMIT");
            res.status(201).json({ message: "Data inserted successfully"});
        } catch (error) {

            if (client) await client.query("ROLLBACK"); // Rollback transaction on error
            console.error(error);
            if (error.code === "23505") {
                // Duplicate deviceId error
                return res.status(409).json({
                    error: {
                        code: "DUPLICATE_DEVICE_ID",
                        message: "A device with the provided deviceId already exists. Please use a unique deviceId.",
                    },
                });
            }
        
            // Handle other errors or generic errors
            res.status(500).json({ message: "An internal server error occurred." });
        } finally {
            if (client) client.release(); // Release the client back to the db
        }
    }
);




app.get('/app/searchThings/:status', async (req, res) => {
    const  {status}=req.params;
    const {limit, offset } = req.query; // Get status, limit, and offset from query parameters
    const client = await db.connect();

    try {
        // Validate input
        if (!status) {
            return res.status(400).json({ message: "Status parameter is required" });
        }

        // Ensure limit and offset are numbers and have default values if not provided
        const rowsLimit = parseInt(limit, 10) || 10; // Default limit is 10
        const rowsOffset = parseInt(offset, 10) || 0; // Default offset is 0
        const page = Math.floor(rowsOffset / rowsLimit) + 1; // Calculate the current page

        // Query to get the total count of records matching the status
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM AdminStock as_
            WHERE as_.status = $1;
        `;
        const countResult = await client.query(countQuery, [status]);
        const total = parseInt(countResult.rows[0].total, 10); // Total number of matching records
        const totalPages = Math.ceil(total / rowsLimit); // Calculate the total number of pages

        // Query to fetch the paginated data
        const dataQuery = `
            SELECT 
                t.id AS thingId,
                t.thingName,
                t.serialno,
                t.lastModified,
                t.model,
                as_.status AS adminStockStatus,
                as_.addedby AS addedby,
                tfd.failureReason,
                tfd.loggedAt
            FROM 
                AdminStock as_
                JOIN Things t ON as_.thingId = t.id
                LEFT JOIN TestFailedDevices tfd ON t.id = tfd.thingId
            WHERE 
                as_.status = $1
            ORDER BY 
                t.id
            LIMIT $2 OFFSET $3;
        `;
        const dataResult = await client.query(dataQuery, [status, rowsLimit, rowsOffset]);

        // Return paginated data with meta information
        res.status(200).json({
            page,
            limit: rowsLimit,
            total,
            totalPages,
            data: dataResult.rows,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "An error occurred while searching things", error: error.message });
    } finally {
        client.release();
    }
});
 
app.get('/api/adminstock/search/:model/?status', async (req, res) => {
    const { page = 1, limit = 10 ,status} = req.query; // Extract query params with defaults
    const { model } = req.params;

    // Define allowed status values
    const allowedStatuses = ['new', 'returned', 'rework', 'exchange'];

    if (!model) {
        return res.status(400).json({ error: 'Model is required' });
    }

    // Check if the status is provided and valid
    // if (status && !allowedStatuses.includes(status)) {
    //     return res.status(400).json({ error: 'Invalid status. Allowed values are: new, returned, rework, exchange' });
    // }

    // Convert page and limit to integers
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    const offset = (pageNumber - 1) * limitNumber;

    try {
        // Base query
        let query = `
            SELECT 
                COUNT(*) OVER () AS total_count,
                as.*, 
                t.*, -- Fetch all details from the Things table
                tfd.failureReason -- Fetch failure reason if available
            FROM AdminStock as
            JOIN Things t ON as.thingId = t.id
            LEFT JOIN TestFailedDevices tfd ON as.thingId = tfd.thingId -- Join with TestFailedDevices table
            WHERE t.model = $1
        `;

        // Add status condition if status is provided
        const queryParams = [model];
        if (status) {
            query += ` AND as.status = $2`;
            queryParams.push(status);
        }

        // Finalize query with pagination
        query += `
            ORDER BY as.addedAt DESC
            LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2};
        `;

        // Add pagination parameters to the query
        queryParams.push(limitNumber, offset);

        // Execute the query
        const result = await pool.query(query, queryParams);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No records found for the given model and status' });
        }

        // Extract total count
        const total = result.rows[0]?.total_count || 0;
        const totalPages = Math.ceil(total / limitNumber);

        // Respond with pagination details and data
        res.status(200).json({
            page: pageNumber,
            limit: limitNumber,
            total,
            totalPages,
            data: result.rows.map(row => {
                const { total_count, ...rest } = row; // Remove duplicate count from each row
                return rest;
            }),
        });
    } catch (err) {
        console.error('Error querying the database:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// DELETE endpoint to delete a Thing by ID
app.delete('/api/delete/things/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // Query to delete the Thing
        const result = await db.query('DELETE FROM Things WHERE id = $1 RETURNING *', [id]);

        if (result.rowCount === 0) {

            return res.status(404).json({ message: `Thing with id ${id} not found.` });

        }

        res.status(200).json({ message: `Thing with id ${id} deleted successfully.`, thing: result.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
});
// DELETE endpoint to delete all Things
app.delete('/api/delete/all/things', async (req, res) => {
    try {
        // Query to delete all records from Things
        const result = await db.query('DELETE FROM Things RETURNING *');

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'No things found to delete.' });
        }

        res.status(200).json({
            message: 'All things deleted successfully.',
            deletedThings: result.rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
});



// --------only for demo=------------
const cors = require('cors');
app.use(cors({
    origin:['http://127.0.0.1:5500', 'http://172.20.10.7:5500'], // Allow all origins
    credentials: true, // Allow cookies to be sent
}));


//ADD home
app.post(
    '/app/add/home/',
    // validateJwt,
    // authorizeRoles('customer'),
    async (req, res) =>  {
        try {
            const {name}   = req.body; // Destructure the required fields from the request body
            const {username} = req.user || req.body; // Authenticated user's username
            const {id}    = req.user|| req.body; // Authenticated user's ID
            const user_id =id;
            // Check if required data is provided
            if (!name || !created_by) {
                return res.status(400).json({ error: 'name and created_by are required' });
            }

            // Insert query
            const query = `
                INSERT INTO home (name, created_by, userid) 
                VALUES ($1, $2, $3)
                RETURNING id
            `;

            // Execute the query
            const result = await db.query(query, [name, username, user_id]);

            // Respond with success message and the inserted row ID
            res.status(201).json({
                message: 'Home added successfully',
                homeId: result.rows[0].id // Retrieve the ID of the inserted row
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'An error occurred while adding the home' });
        }
    }
);


//display home
app.get(
    '/app/display/homes/',
    // validateJwt,
    // authorizeRoles('customer'),
    async (req, res) => {          
        try {
            const userId = req.user.id || req.body.id; // Get the user_id from the authenticated user
            // const userId = req.body; // for testing

            // Query to fetch homes by user_id
            const query = `
                SELECT * 
                FROM home
                WHERE userid = $1
            `;

            // Execute the query
            const result = await db.query(query, [userId]);

            // If no homes are found, return a 404
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'No homes found for this user' });
            }

            // Respond with the homes
            res.status(200).json(result.rows);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'An error occurred while fetching homes' });
        }
    }
);




// Update Home
app.put('/app/update/home/:id',
    // validateJwt,
    // authorizeRoles('customer'),
     async (req, res) => {
    try {
        const homeId = req.params.id; // Get home ID from URL parameter
        const { name } = req.body; 
        const created_by = req.user.username||req.body.username; // Extract fields to update from request body

        // Validate input
        if (!name && !created_by) {
            return res.status(400).json({ error: 'At least one of name or created_by must be provided' });
        }

        // Build dynamic query based on provided fields
        const updates = [];
        const values = [];
        if (name) {
            updates.push('name = $' + (values.length + 1));
            values.push(name);
        }
        if (created_by) {
            updates.push('created_by = $' + (values.length + 1));
            values.push(created_by);
        }
        values.push(homeId); // Add homeId for the WHERE clause

        const query = `
            UPDATE home
            SET ${updates.join(', ')}
            WHERE id = $${values.length}
        `;

        // Execute the update query
        const result = await db.query(query, values);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Home not found or no changes made' });
        }

        res.status(200).json({ message: 'Home updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while updating the home' });
    }
});


// Delete Home
app.delete('/app/delete/home/:id',
    // validateJwt,
    // authorizeRoles('customer'),
     async (req, res) => {
    try {
        const homeId = req.params.id; // Get the home ID from the URL parameter

        // Delete query
        const query = `
            DELETE FROM home
            WHERE id = $1
        `;

        // Execute the query
        const result = await db.query(query, [homeId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Home not found' }); // No home with the specified ID
        }

        res.status(200).json({ message: 'Home deleted successfully' }); // Success response
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while deleting the home' });
    }
});



// ADD floor

app.post(
    '/app/add/floor/:home_id',
    // validateJwt,
    // authorizeRoles('customer'),
    async (req, res) => {
        try {
            const home_id = req.params.home_id;
            const { name } = req.body; // Destructure the required fields from the request body

            // Check if required data is provided
            if (!home_id || !name) {
                return res.status(400).json({ error: 'home_id and name are required' });
            }

            // Insert query with RETURNING clause to get the inserted row ID
            const query = `
                INSERT INTO floor (home_id, name) 
                VALUES ($1, $2)
                RETURNING id
            `;

            // Execute the query
            const result = await db.query(query, [home_id, name]);

            // Respond with success message and the inserted row ID
            res.status(201).json({
                message: 'Floor added successfully',
                floorId: result.rows[0].id // Retrieve the ID of the inserted row
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'An error occurred while adding the floor' });
        }
    }
);


    
// Display floor
app.get('/app/display/floors/:home_id',
    // validateJwt,
    // authorizeRoles('customer'),
     async (req, res) => {
    try {
        const homeId = req.params.home_id; // Extract home ID from the request URL

        // Validate input
        if (!homeId) {
            return res.status(400).json({ error: 'home_id is required' });
        }

        // Query to fetch floors by home_id
        const query = `SELECT * FROM floor WHERE home_id = $1`;

        // Execute the query
        const result = await db.query(query, [homeId]);

        // Check if floors exist
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No floors found for the specified home' });
        }

        // Respond with the list of floors
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching floors:', error.message);
        res.status(500).json({ error: 'An error occurred while fetching floors' });
    }
});


//Update Floor
app.put('/app/update/floors/:id',
    // validateJwt,
    // authorizeRoles('customer'),
     async (req, res) => {
    try {
        const floorId = req.params.id;  // Extract floor ID from the request URL
        const { name} = req.body;  // Extract fields to update from the request body
        // Validate input
        if (!name) {
            return res.status(400).json({ error: 'At least one of name or home_id must be provided' });
        }

        // Build dynamic query based on provided fields
        const updates = [];
        const values = [];

        if (name) {
            updates.push('name = ?');
            values.push(name);
        }

        values.push(floorId);  // Add floorId for the WHERE clause

        const query = `
            UPDATE floor
            SET ${updates.join(', ')}
            WHERE id = ?
        `;

        // Execute the update query
        const [result] = await db.query(query, values);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Floor not found or no changes made' });
        }

        res.status(200).json({ message: 'Floor updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while updating the floor' });
    }
});

//Delete Floor
app.delete('/app/delete/floors/:id',
    // validateJwt,
    // authorizeRoles('customer'),
     async (req, res) => {
    try {
        const floorId = req.params.id; // Extract floor ID from the request URL

        // Delete query with parameterized input
        const query = 'DELETE FROM floor WHERE id = $1';

        // Execute the query
        const result = await db.query(query, [floorId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Floor not found' });
        }

        res.status(200).json({ message: 'Floor deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while deleting the floor' });
    }
});

//ADD room
app.post('/app/add/room/:floor_id', 
    // validateJwt,
    // authorizeRoles('customer'),
    upload.single('image'), async (req, res) => {
    try {
        const floor_id = req.params.floor_id;
        const { name, alias_name } = req.body;

        // Validate input
        if (!floor_id || !name) {
            return res.status(400).json({ error: 'floor_id and name are required' });
        }

        // Placeholder for S3 file upload (if needed in the future)
        let fileUrl = null;
        if (req.file) {
            // const file=req.file
            // const fileKey = images/${Date.now()}-${file.originalname}; // Unique file name
            // const params = {
            //     Bucket: process.env.S3_BUCKET_NAME,
            //     Key: fileKey,
            //     Body: file.buffer,
            //     ContentType: file.mimetype,
            //     ACL: 'public-read', // Make the file publicly readable
            // };

            // const uploadResult = await s3.upload(params).promise();
            // fileUrl = uploadResult.Location; // S3 file URL
        };// Implement S3 upload logic here and set fileUrl accordingly

        // Insert query with PostgreSQL
        const query = `
            INSERT INTO room (floor_id, name, alias_name, image_url, home_id) 
            VALUES ($1, $2, $3, $4, $5) 
            RETURNING id
        `;

        const values = [
            floor_id,
            name,
            alias_name || null, // Optional field
            fileUrl, // Replace with actual file URL if integrating S3
            1 // Replace with actual home_id if available
        ];

        // Execute the query
        const result = await db.query(query, values);

        // Respond with success message and inserted room ID
        res.status(201).json({
            message: 'Room added successfully',
            roomId: result.rows[0].id // Retrieve the ID of the inserted row
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while adding the room' });
    }
});

// app.post('/app/add/room/:floor_id', 
//     // validateJwt,
//     // authorizeRoles('customer'),
//     upload.single('image'), 
//     async (req, res) => {
//     try {
//         const floor_id = req.params.floor_id;
//         const { name, alias_name, user_id } = req.body; // Include `user_id` in the request body

//         // Validate input
//         if (!floor_id || !name || !user_id) {
//             return res.status(400).json({ error: 'floor_id, name, and user_id are required' });
//         }

//         // Placeholder for S3 file upload (if needed in the future)
//         let fileUrl = null;
//         if (req.file) {
//             // const file=req.file
//             // const fileKey = `images/${Date.now()}-${file.originalname}`; // Unique file name
//             // const params = {
//             //     Bucket: process.env.S3_BUCKET_NAME,
//             //     Key: fileKey,
//             //     Body: file.buffer,
//             //     ContentType: file.mimetype,
//             //     ACL: 'public-read', // Make the file publicly readable
//             // };

//             // const uploadResult = await s3.upload(params).promise();
//             // fileUrl = uploadResult.Location; // S3 file URL
//         }; // Implement S3 upload logic here and set fileUrl accordingly

//         // Start a database transaction
//         await db.query('BEGIN');

//         // Calculate the next orderIndex for this user and floor
//         const getOrderIndexQuery = `
//             SELECT COALESCE(MAX(orderIndex), 0) + 1 AS nextOrderIndex
//             FROM UserRoomOrder
//             WHERE floor_id = $1 AND user_id = $2
//         `;
//         const orderIndexResult = await db.query(getOrderIndexQuery, [floor_id, user_id]);
//         const nextOrderIndex = orderIndexResult.rows[0].nextorderindex; // Get the next available orderIndex

//         // Insert query for the room
//         const roomQuery = `
//             INSERT INTO room (floor_id, name, alias_name, image_url, home_id) 
//             VALUES ($1, $2, $3, $4, $5) 
//             RETURNING id
//         `;

//         const roomValues = [
//             floor_id,
//             name,
//             alias_name || null, // Optional field
//             fileUrl, // Replace with actual file URL if integrating S3
//             1 // Replace with actual home_id if available
//         ];

//         const roomResult = await db.query(roomQuery, roomValues);
//         const roomId = roomResult.rows[0].id; // Retrieve the ID of the inserted row

//         // Insert query for UserRoomOrder
//         const userRoomOrderQuery = `
//             INSERT INTO UserRoomOrder (user_id, floor_id, room_id, orderIndex) 
//             VALUES ($1, $2, $3, $4)
//         `;

//         const userRoomOrderValues = [user_id, floor_id, roomId, nextOrderIndex];

//         await db.query(userRoomOrderQuery, userRoomOrderValues);

//         // Commit the transaction
//         await db.query('COMMIT');

//         // Respond with success message and inserted room ID
//         res.status(201).json({
//             message: 'Room added successfully',
//             roomId: roomId
//         });
//     } catch (error) {
//         // Rollback the transaction in case of an error
//         await db.query('ROLLBACK');
//         console.error(error);
//         res.status(500).json({ error: 'An error occurred while adding the room' });
//     }
// });


//Delete Room

app.put('/app/reorder/rooms/:floor_id', async (req, res) => {
    const client = await db.connect();
    try {
        const floor_id=req.params.floor_id
        const user_id=req.user.id||req.body.user_id
        const {  order } = req.body; // order is an array of { room_id, orderIndex }

        // Validate input
        if ( !floor_id || !Array.isArray(order)) {
            return res.status(400).json({ error: 'user_id, floor_id, and order array are required' });
        }

        await client.query('BEGIN'); // Start a transaction

        // Update the orderIndex for each room
        // user_id = $2 AND
        const updateQuery = `
            UPDATE UserRoomOrder
            SET orderIndex = $1
            WHERE 
           
             floor_id = $2 AND room_id = $3
        `;
        for (const { room_id, orderIndex } of order) {
            await client.query(updateQuery, [orderIndex,  floor_id, room_id]);
        }

        await client.query('COMMIT'); // Commit the transaction

        res.status(200).json({ message: 'Rooms reordered successfully.' });
    } catch (error) {
        await client.query('ROLLBACK'); // Rollback the transaction in case of error
        console.error('Error reordering rooms:', error);
        res.status(500).json({ error: 'An error occurred while reordering rooms.' });
    } finally {
        client.release(); // Release the client back to the pool
    }
});

app.delete('/app/delete/room/:id',
    // validateJwt,
    // authorizeRoles('customer'),
     async (req, res) => {
    try {
        const roomId = req.params.id; // Get the room ID from the URL parameter

        // Delete query with parameterized input
        const query = 'DELETE FROM room WHERE id = $1';

        // Execute the query
        const result = await db.query(query, [roomId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Room not found' }); // No room with the specified ID
        }

        res.status(200).json({ message: 'Room deleted successfully' }); // Success response
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while deleting the room' });
    }
});


//Display room

app.get('/app/display/rooms/:floor_id',
    // validateJwt,
    // authorizeRoles('customer'), 
    async (req, res) => {
    try {
        const floorId = req.params.floor_id; // Extract floor ID from the request URL

        // Query to fetch rooms with parameterized input
        const query = 'SELECT * FROM room WHERE floor_id = $1';

        // Execute the query
        const result = await db.query(query, [floorId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No rooms found for this floor' });
        }

        res.status(200).json({
            message: 'Rooms retrieved successfully',
            rooms: result.rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while retrieving rooms' });
    }
});

// app.get('/app/display/rooms/:floor_id', 
//     // validateJwt,
//     // authorizeRoles('customer'), 
//     async (req, res) => {
//     try {
//         const floorId = req.params.floor_id; // Extract floor ID from the request URL
//         // const { user_id } = req.query; // Assume user_id is passed as a query parameter

//         // Validate input
//         if (!floorId ) {
//             return res.status(400).json({ error: 'floor_id and user_id are required' });
//         }

//         // Query to fetch rooms based on UserRoomOrder orderIndex
//         // AND uro.user_id = $2
//         const query = `
//             SELECT r.*
//             FROM room r
//             INNER JOIN UserRoomOrder uro
//             ON r.id = uro.room_id
//             WHERE uro.floor_id = $1
//             ORDER BY uro.orderIndex ASC
//         `;

//         // Execute the query
//         const result = await db.query(query, [floorId]);

//         if (result.rows.length === 0) {
//             return res.status(404).json({ message: 'No rooms found for this floor and user' });
//         }

//         res.status(200).json({
//             message: 'Rooms retrieved successfully',
//             rooms: result.rows
//         });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ error: 'An error occurred while retrieving rooms' });
//     }
// });



// Update room


app.put('/app/update/rooms/:id',
    // validateJwt,
    // authorizeRoles('customer'), 
    upload.single('image'), async (req, res) => {
    try {
        const roomId = req.params.id; // Extract room ID from the request URL
        const { name, alias_name } = req.body; // Extract fields from the request body
        const file = req.file; // Extract the uploaded file

        // Validate input
        if (!name && !alias_name && !file) {
            return res.status(400).json({ error: 'At least one of name, alias_name, or image must be provided' });
        }

        let fileUrl;
        if (file) {
            // Define S3 upload parameters
            const fileKey = `images/${Date.now()}-${file.originalname}`; // Unique file name
            const params = {
                Bucket: process.env.S3_BUCKET_NAME,
                Key: fileKey,
                Body: file.buffer,
                ContentType: file.mimetype,
                ACL: 'public-read', // Make the file publicly readable
            };

            // Upload file to S3
            const uploadResult = await s3.upload(params).promise();
            fileUrl = uploadResult.Location;
        }

        // Build dynamic query
        const updates = [];
        const values = [];

        if (name) {
            updates.push('name = $' + (values.length + 1));
            values.push(name);
        }
        if (alias_name) {
            updates.push('alias_name = $' + (values.length + 1));
            values.push(alias_name);
        }
        if (fileUrl) {
            updates.push('image_url = $' + (values.length + 1));
            values.push(fileUrl);
        }

        values.push(roomId); // Add room ID for WHERE clause

        const query = `
            UPDATE room
            SET ${updates.join(', ')}
            WHERE id = $${values.length}
        `;

        // Execute the query
        const result = await db.query(query, values);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Room not found or no changes made' });
        }

        res.status(200).json({ message: 'Room updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while updating the room' });
    }
});


// display things with id
app.get('/api/display/things/:id',
    // validateJwt,
    // authorizeRoles('customer'),
     async (req, res) => {
    const id = req.params.id;
    try {
        const query = `
            SELECT * 
            FROM things 
            WHERE id = $1
        `;

        const result = await db.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Thing not found' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});



 //display all things
 app.get('/api/display/things',
    // validateJwt,
    // authorizeRoles('customer'), 
    async (req, res) => {
        try {
            // Get `page` and `limit` query parameters, with default values if not provided
            const page = parseInt(req.query.page, 10) || 1; // Default to page 1
            const limit = parseInt(req.query.limit, 10) || 10; // Default to 10 records per page

            if (page < 1 || limit < 1) {
                return res.status(400).json({ error: 'Invalid page or limit value' });
            }

            const offset = (page - 1) * limit; // Calculate the offset

            // Fetch records with LIMIT and OFFSET for pagination
            const result = await db.query(
                'SELECT * FROM things ORDER BY id ASC LIMIT $1 OFFSET $2',
                [limit, offset]
            );

            // Fetch the total number of records to calculate total pages
            const countResult = await db.query('SELECT COUNT(*) AS total FROM things');
            const total = parseInt(countResult.rows[0].total, 10);
            const totalPages = Math.ceil(total / limit);

            res.status(200).json({
                page,
                limit,
                total,
                totalPages,
                data: result.rows,
            });
        } catch (error) {
            console.error('Error fetching things:', error); // Log the error for debugging
            res.status(500).json({ error: 'Internal Server Error' }); // Respond with an error
        }
    }
);



 //display thingattribute with thingid
 app.get('/api/display/thingattribute/:thingid',
    // validateJwt,
    // authorizeRoles('admin', 'staff'),
    async (req, res) => {
        const thingid = req.params.thingid; // Get the thingid from the route parameter
        const page = parseInt(req.query.page, 10) || 1; // Default to page 1
        const limit = parseInt(req.query.limit, 10) || 10; // Default to 10 records per page

        // Validate thingid
        if (!thingid || isNaN(thingid)) {
            return res.status(400).json({ error: 'Invalid or missing thingid parameter' });
        }

        if (page < 1 || limit < 1) {
            return res.status(400).json({ error: 'Invalid page or limit value' });
        }

        try {
            const offset = (page - 1) * limit; // Calculate offset for the query

            // Fetch paginated records
            const query = `
                SELECT * FROM thingattributes
                WHERE thingid = $1
                ORDER BY id ASC
                LIMIT $2 OFFSET $3
            `;
            const values = [thingid, limit, offset];
            const result = await db.query(query, values);

            // Fetch total count for the thingid
            const countQuery = 'SELECT COUNT(*) AS total FROM thingattributes WHERE thingid = $1';
            const countResult = await db.query(countQuery, [thingid]);
            const total = parseInt(countResult.rows[0].total, 10);
            const totalPages = Math.ceil(total / limit);

            if (result.rows.length > 0) {
                // Return paginated data with meta information
                res.status(200).json({
                    page,
                    limit,
                    total,
                    totalPages,
                    data: result.rows,
                });
            } else {
                res.status(404).json({ message: 'No records found for the given thingid' });
            }
        } catch (error) {
            // Log the full error for debugging
            console.error('Error fetching paginated thing attributes:', error);

            // Respond with a generic error
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
);



//display devices with thingid
app.get('/api/display/devices/:thingid', 
    // validateJwt,
    // authorizeRoles('admin','staff'),
    async (req, res) => {
    const thingid = req.params.thingid; // Extract the thingid from the route parameter
    try {
        // Execute the query with a parameterized WHERE clause
        const query = 'SELECT * FROM devices WHERE thingid = $1';
        const values = [thingid];
        const result = await db.query(query, values);

        if (result.rows.length > 0) {
            // Send the result as JSON if records are found
            res.status(200).json(result.rows);
        } else {
            // Handle the case where no records match
            res.status(404).json({ message: 'No records found' });
        }
    } catch (error) {
        // Log the error for debugging
        console.error('Error fetching devices:', error.message);

        // Respond with a generic error
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


//display thing that new,rework,failed,etc.....
app.get('/api/display/test/:type',
    // validateJwt,
    // authorizeRoles('admin', 'staff'),
    async (req, res) => {
        try {
            // Get the 'type' parameter and pagination parameters from the request
            const { type } = req.params;
            const page = parseInt(req.query.page, 10) || 1; // Default to page 1
            const limit = parseInt(req.query.limit, 10) || 10; // Default to 10 records per page

            if (page < 1 || limit < 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid page or limit value',
                });
            }

            const offset = (page - 1) * limit; // Calculate offset for pagination

            // Perform the paginated query
            const query = `
                SELECT * FROM things 
                WHERE type = $1
                ORDER BY id ASC
                LIMIT $2 OFFSET $3
            `;
            const values = [type, limit, offset];
            const result = await db.query(query, values);

            // Fetch total count for the specified type
            const countQuery = 'SELECT COUNT(*) AS total FROM things WHERE type = $1';
            const countResult = await db.query(countQuery, [type]);
            const total = parseInt(countResult.rows[0].total, 10);
            const totalPages = Math.ceil(total / limit);

            if (result.rows.length > 0) {
                res.status(200).json({
                    success: true,
                    page,
                    limit,
                    total,
                    totalPages,
                    data: result.rows,
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: 'No records found',
                });
            }
        } catch (error) {
            // Handle any errors
            console.error('Error fetching data from the database:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while fetching data',
            });
        }
    }
);


//display things with  status
app.get('/api/display/status/:status',
    // validateJwt,
    // authorizeRoles('admin', 'staff'),
    async (req, res) => {
        try {
            // Get the 'status' parameter and pagination parameters from the request
            const { status } = req.params;
            const page = parseInt(req.query.page, 10) || 1; // Default to page 1
            const limit = parseInt(req.query.limit, 10) || 10; // Default to 10 records per page

            if (page < 1 || limit < 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid page or limit value',
                });
            }

            const offset = (page - 1) * limit; // Calculate the offset for pagination

            // Perform the first query to fetch adminstock entries with pagination
            const queryAdminStock = `
                SELECT * FROM adminstock 
                WHERE status = $1
                ORDER BY id ASC 
                LIMIT $2 OFFSET $3
            `;
            const resultAdminStock = await db.query(queryAdminStock, [status, limit, offset]);

            if (resultAdminStock.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No data found for the provided status',
                });
            }

            // Extract thingIds from the adminstock results
            const thingIds = resultAdminStock.rows.map(item => item.thingid);

            // Fetch total count for the specified status in adminstock
            const countQuery = 'SELECT COUNT(*) AS total FROM adminstock WHERE status = $1';
            const countResult = await db.query(countQuery, [status]);
            const total = parseInt(countResult.rows[0].total, 10);
            const totalPages = Math.ceil(total / limit);

            // Perform the second query to fetch data from the `things` table for the matching thingIds
            const queryThings = 'SELECT * FROM things WHERE id = ANY($1)';
            const resultThings = await db.query(queryThings, [thingIds]);

            // Send the paginated results back to the client
            res.status(200).json({
                success: true,
                page,
                limit,
                total,
                totalPages,
                data: {
                    adminStock: resultAdminStock.rows,
                    things: resultThings.rows,
                },
            });
        } catch (error) {
            // Handle any errors
            console.error('Error fetching data from the database:', error);

            res.status(500).json({
                success: false,
                message: 'An error occurred while fetching data',
            });
        }
    }
);



// share access to customer with macAddress and securityKey
app.post('/api/access/customer/:roomid',
    // validateJwt,
    // authorizeRoles('customer'),
     async (req, res) => {
    const client = await db.connect(); // Get a client from the db
    try {
        const roomid = req.params.roomid;
        const user_id = req.user.id ||req.body.user_id; // Replace with actual user ID
        const { securitykey, serialno } = req.body;

        await client.query('BEGIN'); // Start a transaction

        // Verify the thing
        const verifyQuery = 'SELECT * FROM things WHERE serialno = $1 AND securitykey = $2';
        const verifyResult = await client.query(verifyQuery, [serialno, securitykey]);

        if (verifyResult.rows.length === 0) {
            return res.status(404).json({ message: "Thing not found or invalid security key" });
        }

        const thing_id = verifyResult.rows[0].id;
        const key = verifyResult.rows[0].securitykey;

        // Insert into customer_access
        const insertAccessQuery = `
            INSERT INTO customer_access (user_id, email, thing_id, securitykey)
            VALUES ($1, $2, $3, $4)
        `;
        await client.query(insertAccessQuery, [user_id, null, thing_id, key]);

        // Retrieve device IDs
        const deviceQuery = 'SELECT deviceid FROM devices WHERE thingid = $1';
        const deviceResult = await client.query(deviceQuery, [thing_id]);

        if (deviceResult.rows.length === 0) {
            return res.status(404).json({ message: "No devices found for the given thing" });
        }

        const device_ids = deviceResult.rows.map(item => item.deviceid);

        // Insert into room_device
        const roomDeviceQuery = `
            INSERT INTO room_device (room_id, device_id)
            VALUES ($1, $2)
        `;
        for (const device_id of device_ids) {
            await client.query(roomDeviceQuery, [roomid, device_id]);
        }

        await client.query('COMMIT'); // Commit the transaction
        res.status(201).json({ message: "Access shared successfully" });
    } catch (error) {
        await client.query('ROLLBACK'); // Rollback the transaction on error
        console.error("Error sharing access:", error);
        res.status(500).json({ message: "Internal server error" });
    } finally {
        client.release(); // Release the client back to the db
    }
});

// app.post('/api/access/customer/:roomid',
//     // validateJwt,
//     // authorizeRoles('customer'),
//     async (req, res) => {
//         const client = await db.connect(); // Get a client from the db
//         try {
//             const roomid = req.params.roomid;
//             const user_id = 1; // Replace with actual user ID
//             const { securitykey, serialno } = req.body;

//             await client.query('BEGIN'); // Start a transaction

//             // Verify the thing
//             const verifyQuery = 'SELECT * FROM things WHERE serialno = $1 AND securitykey = $2';
//             const verifyResult = await client.query(verifyQuery, [serialno, securitykey]);

//             if (verifyResult.rows.length === 0) {
//                 return res.status(404).json({ message: "Thing not found or invalid security key" });
//             }

//             const thing_id = verifyResult.rows[0].id;
//             const key = verifyResult.rows[0].securitykey;

//             // Insert into customer_access
//             const insertAccessQuery = `
//                 INSERT INTO customer_access (user_id, email, thing_id, securitykey)
//                 VALUES ($1, $2, $3, $4)
//             `;
//             await client.query(insertAccessQuery, [user_id, null, thing_id, key]);

//             // Retrieve device IDs
//             const deviceQuery = 'SELECT id, deviceid FROM devices WHERE thingid = $1';
//             const deviceResult = await client.query(deviceQuery, [thing_id]);

//             if (deviceResult.rows.length === 0) {
//                 return res.status(404).json({ message: "No devices found for the given thing" });
//             }

//             const device_ids = deviceResult.rows;

//             // Fetch the current maximum orderIndex for the user
//             const maxOrderIndexQuery = `
//                 SELECT COALESCE(MAX(orderIndex), 0) AS max_order_index 
//                 FROM UserDevicesorder 
//                 WHERE  room_id= $1
//             `;
//             const maxOrderIndexResult = await client.query(maxOrderIndexQuery, [user_id]);
//             let currentOrderIndex = maxOrderIndexResult.rows[0].max_order_index;

//             // Insert into room_device and UserDevicesorder with orderIndex
//             const roomDeviceQuery = `
//                 INSERT INTO room_device (room_id, device_id)
//                 VALUES ($1, $2)
//             `;
//             const userDeviceQuery = `
//                 INSERT INTO UserDevicesorder (room_id, device_id, orderIndex)
//                 VALUES ($1, $2, $3)
//             `;

//             for (const { id: device_id, deviceid } of device_ids) {
//                 currentOrderIndex += 1; // Increment orderIndex
//                 await client.query(roomDeviceQuery, [roomid, deviceid]);
//                 await client.query(userDeviceQuery, [roomid, device_id, currentOrderIndex]);
//             }

//             await client.query('COMMIT'); // Commit the transaction
//             res.status(201).json({ message: "Access shared successfully" });
//         } catch (error) {
//             await client.query('ROLLBACK'); // Rollback the transaction on error
//             console.error("Error sharing access:", error);
//             res.status(500).json({ message: "Internal server error" });
//         } finally {
//             client.release(); // Release the client back to the db
//         }
//     }
// );



//display devices with roomsid

app.put('/api/reorder/devices/:roomid', async (req, res) => {
    const client = await db.connect();
    try {
        const { roomid } = req.params;
        const { order } = req.body; // Array of { device_id, orderIndex }

        await client.query('BEGIN');

        // Update orderIndex for each device
        const updateQuery = `
            UPDATE UserDevices
            SET orderIndex = $1
            WHERE roomid = $2 AND device_id = $3
        `;
        for (const { device_id, orderIndex } of order) {
            await client.query(updateQuery, [orderIndex,roomid, device_id]);
        }

        await client.query('COMMIT');
        res.status(200).json({ message: 'Devices reordered successfully.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error reordering devices:', error);
        res.status(500).json({ message: 'Internal server error' });
    } finally {
        client.release();
    }
});


app.get('/api/display/device/rooms/:roomid', 
    // validateJwt,
    // authorizeRoles('customer'),
    async (req, res) => {
    const client = await db.connect(); // Get a client from the db
    try {
        const roomid = req.params.roomid;

        // Fetch device IDs associated with the room
        const deviceIdsQuery = 'SELECT device_id FROM room_device WHERE room_id = $1';
        const deviceIdsResult = await client.query(deviceIdsQuery, [roomid]);

        if (deviceIdsResult.rows.length === 0) {
            return res.status(404).json({ message: 'No devices found for this room.' });
        }

        // Extract device IDs
        const deviceIds = deviceIdsResult.rows.map(item => item.device_id);

        // Dynamically generate placeholders for the device IDs
        const placeholders = deviceIds.map((_, index) => `$${index + 1}`).join(',');
        const query = `SELECT * FROM devices WHERE deviceid IN (${placeholders})`;

        // Fetch device details
        const devicesResult = await client.query(query, deviceIds);

        // Return the device data
        res.status(200).json({ devices: devicesResult.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while fetching devices.', error });
    } finally {
        client.release(); // Release the client back to the db
    }
});



//display all devices with floor name and room name 
app.get('/api/display/all/devices/:userId',
     async (req, res) => {
    const userId = req.params.userId;

    try {
        const [rows] = await db.query(`
            SELECT 
                d.id AS device_id,
                d.deviceId,
                d.macAddress,
                d.hubIndex,
                d.createdBy,
                d.enable,
                d.status,
                d.icon,
                d.name AS device_name,
                d.type AS device_type,
                d.lastModified AS device_last_modified,
                f.name AS floor_name,
                r.name AS room_name
            FROM 
                Users u
            JOIN 
                HOME h ON u.id = h.userid
            JOIN 
                floor f ON h.id = f.home_id
            JOIN 
                room r ON f.id = r.floor_id
            JOIN 
                room_device rd ON r.id = rd.room_id
            JOIN 
                Devices d ON rd.device_id = d.deviceId
            WHERE 
                u.id = ?
            ORDER BY 
                f.name ASC,
                r.name ASC;
        `, [userId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'No devices found for this user.' });
        }

        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching devices with full details:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

//diplay favorite devices
app.get('/api/favorite-devices/:userId', async (req, res) => {
    const { userId } = req.params||req.user;

    try {
        const devices = await db
            .select('d.*')
            .from('Devices as d')
            .join('UserFavoriteDevices as ufd', 'd.id', 'ufd.device_id')
            .where('ufd.user_id', userId)
            .andWhere('ufd.favorite', true);

        res.status(200).json({ success: true, data: devices });
    } catch (error) {
        console.error('Error fetching favorite devices:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch favorite devices' });
    }
});

//Scene
// 1. Create a Scene
app.post('/app/add/scenes/:userid', upload.single('icon'),async (req, res) => {
    const user_id =req.params.userid
    const  createdBy=req.user?.username || req.body.createdBy
    const { name, aliasName, type } = req.body;
    const file = req.file;
    try {
        let iconUrl = null;

        // If an icon file is provided, upload it to S3
        if (file) {
            const fileKey = `icons/${Date.now()}-${file.originalname}`; // Generate unique file name
            const params = {
                Bucket: process.env.S3_BUCKET_NAME,
                Key: fileKey,
                Body: file.buffer,
                ContentType: file.mimetype,
                ACL: 'public-read', // Make the file publicly readable
            };

            // Upload file to S3
            const uploadResult = await s3.upload(params).promise();
            iconUrl = uploadResult.Location; // Get the public URL of the uploaded file
        }
        const result = await db.query(
            `INSERT INTO Scenes (name, aliasName, createdBy, icon,  type, user_id)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [name, aliasName, createdBy, iconUrl, type,user_id]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

//  Get All Scenes by userid
app.get('/app/display/scenes/:userid', async (req, res) => {
    try {
        const { userid } = req.params;
        const result = await db.query('SELECT * FROM Scenes WHERE userid = $1', [userid]);
        
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


//  Update a Scene
app.put('/app/update/scenes/:id', upload.single('icon'), async (req, res) => {
    const { id } = req.params;
    const fields = req.body; // Extract other fields from the request body
    const file = req.file; // Extract the uploaded file (if any)

    if (Object.keys(fields).length === 0 && !file) {
        return res.status(400).json({ message: 'No fields to update' });
    }

    const setClauses = [];
    const values = [];
    let index = 1;

    try {
        let iconUrl;

        // If an icon file is provided, upload it to S3
        if (file) {
            const fileKey = `icons/${Date.now()}-${file.originalname}`;
            const params = {
                Bucket: process.env.S3_BUCKET_NAME,
                Key: fileKey,
                Body: file.buffer,
                ContentType: file.mimetype,
                ACL: 'public-read', // Make the file publicly readable
            };

            const uploadResult = await s3.upload(params).promise();
            iconUrl = uploadResult.Location;

            // Add `icon` field update
            setClauses.push(`icon = $${index}`);
            values.push(iconUrl);
            index++;
        }

        // Dynamically add other fields to the query
        for (const [key, value] of Object.entries(fields)) {
            setClauses.push(`${key} = $${index}`);
            values.push(value);
            index++;
        }

        // Add `id` for the WHERE clause
        values.push(id);

        const query = `
            UPDATE Scenes
            SET ${setClauses.join(', ')}, lastModified = CURRENT_TIMESTAMP
            WHERE id = $${index}
            RETURNING *`;

        // Execute the query
        const result = await db.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Scene not found' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error updating scene:', error);
        res.status(500).json({ error: error.message });
    }
});


// 5. Delete a Scene
app.delete('/app/delete/scenes/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query('DELETE FROM Scenes WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Scene not found' });
        }
        res.status(200).json({ message: 'Scene deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



app.post('/app/create/scene_devices/:scene_id/:device_id', async (req, res) => {
    // const { device_id, scene_id } = req.body;
    const { device_id, scene_id } = req.params;
    try {
        const result = await db.query(
            `INSERT INTO scene_device (device_id, scene_id)
             VALUES ($1, $2) RETURNING *`,
            [device_id, scene_id]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating scene_device:', error);
        res.status(500).json({ error: error.message });
    }
});

//display devices in scenes with scene_id
app.get('/api/display/scenes/:scene_id/devices', async (req, res) => {
    const { scene_id } = req.params;

    try {
        const query = `
            SELECT 
                sd.*,
                d.*
            FROM 
                scene_device sd
            JOIN 
                Devices d ON sd.device_id = d.id
            WHERE 
                sd.scene_id = $1;
        `;

        const result = await db.query(query, [scene_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No devices found for the specified scene ID' });
        }

        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching scene devices:', error);
        res.status(500).json({ error: error.message });
    }
});


// 4. Update a Scene Device
app.put('/app/Update/scene_devices/:id', async (req, res) => {
    const { id } = req.params;
    const fields = req.body;

    if (Object.keys(fields).length === 0) {
        return res.status(400).json({ message: 'No fields to update' });
    }

    const setClauses = [];
    const values = [];
    let index = 1;

    for (const [key, value] of Object.entries(fields)) {
        setClauses.push(`${key} = $${index}`);
        values.push(value);
        index++;
    }

    values.push(id);

    const query = `
        UPDATE scene_device
        SET ${setClauses.join(', ')}
        WHERE id = $${index}
        RETURNING *`;

    try {
        const result = await db.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Scene device not found' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error updating scene_device:', error);
        res.status(500).json({ error: error.message });
    }
});

// 5. Delete a Scene Device
app.delete('/api/delete/scene_devices/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(
            `DELETE FROM scene_device WHERE id = $1 RETURNING *`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Scene device not found' });
        }

        res.status(200).json({ message: 'Scene device deleted successfully' });
    } catch (error) {
        console.error('Error deleting scene_device:', error);
        res.status(500).json({ error: error.message });
    }
});



const { swaggerUi, specs } = require("./swagger.js");
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));


module.exports={validateJwt,authorizeRoles};


const PORT = process.env.PORT || 3000;
app.listen(PORT,
    '0.0.0.0',
     () => {
    console.log(`Server running on port ${PORT}`);
});
