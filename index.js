const express = require('express');
const app = express();
const db = require('./dbconnection');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const jwksClient = require('jwks-rsa');
const { promisify } = require('util');
const Joi = require('joi');
const signup=require('./signup')

app.use('/signup',signup);
app.use(express.json());
// app.use(bodyParser.json());
// Cognito settings
const COGNITO_REGION = process.env.COGNITO_REGION;
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;  // Updated with your user pool ID
const COGNITO_ISSUER = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`;
const client = jwksClient({
    jwksUri: `${COGNITO_ISSUER}/.well-known/jwks.json`,  // JWK URI for your pool
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
async function validateJwt(req, res, next) {
    const token = req.headers.authorization;
    if (!token || !token.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Invalid authorization header format' });
    }

    const bearerToken = token.split(' ')[1]; // Remove "Bearer " prefix
    try {
        const decoded = await jwt.verify(
            bearerToken,
            async (header) => {
                const key = await getSigningKey(header.kid);
                return key.getPublicKey();
            },
            { issuer: COGNITO_ISSUER }
        );

        req.user = decoded; // Add decoded token to the request object

        const userSub = decoded.sub; // Assuming `sub` is the identifier
        if (!userSub) {
            return res.status(403).json({ message: 'JWT does not contain a valid sub field' });
        }

        // Check if the user exists in the database and retrieve their role and jwtsub
        const connection = await db.getConnection();
        const [rows] = await connection.query(
            'SELECT userRole, jwtsub FROM Users WHERE jwtsub = ?',
            [userSub]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Attach user data (role and jwtsub) to the request object
        req.user.role = rows[0].userRole;
        req.user.jwtsub = rows[0].jwtsub;

        connection.release();
        next();
    } catch (err) {
        console.error('JWT verification failed:', err);
        return res.status(401).json({ message: 'Invalid or expired token', error: err.message });
    }
}

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
    validateJwt,
    authorizeRoles("admin", "staff"), // Allow only admin and staff
    async (req, res) => {
        const { error } = bodySchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: "Invalid input data", error: error.details });
        }

        const { thing, attributes} = req.body;
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            // create security key for thing 
            const securityKey= await SecurityKey(thing.serialno)
            console.log(securityKey)

            // Insert Thing
            const [thingResult] = await connection.query(
                `INSERT INTO things (thingName, createdBy, batchId, model, serialno, type,securityKey)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    thing.thingName,
                    req.user.username, // Using the authenticated user's username
                    // "admin",
                    thing.batchId,
                    thing.model,
                    thing.serialno,
                    thing.type,
                    securityKey
                ]
            );
              console.log(thingResult)
            // Insert Attributes and Devices
            let counter = 1;
            for (const attr of attributes) {
                // Insert ThingAttributes
                await connection.query(
                    `INSERT INTO ThingAttributes (thingId, attributeName, attributeValue)
                     VALUES (?, ?, ?)`,
                    [thingResult.insertId, attr.attributeName, attr.attributeValue]
                );

                // Validate and Insert Devices
                const totalDevices = parseInt(attr.attributeValue, 10);
                if (totalDevices > 100) { // Limit the number of devices
                    throw new Error(
                        `Too many devices requested for attribute ${attr.attributeName}`
                    );
                }

                for (let i = 1; i <= totalDevices; i++) {
                    const deviceId = `${thing.serialno}_${counter}`;
                    const name = `${attr.attributeName}_${i}`;
                    await connection.query(
                        `INSERT INTO Devices (thingId, deviceId, macAddress, hubIndex,  createdBy, enable, status, icon, name, type)
                         VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?,?)`,
                        [    
                            thingResult.insertId,
                            deviceId,
                            thing.serialno,
                            counter,
                            // null,
                            // "admin",
                            req.user.username,
                            true,
                            null,
                            null,
                            name,
                            attr.attributeName
                        ]
                    );

                    counter++;
                }
            }

            // Insert into AdminStock
            await connection.query(
                `INSERT INTO AdminStock (thingId, addedAt, addedBy, status)
                 VALUES (?, CURRENT_TIMESTAMP, ?, ?)`,
                [thingResult.insertId, 
                    req.user.username,
                    // "admin",
                     "new"]
            );

            // Commit transaction
            await connection.commit();
            res.status(201).json({ message: "Data inserted successfully" });
        } catch (error) {
            if (connection) await connection.rollback();
            console.error(error);
            res.status(500).json({ message: "An error occurred", error: error.message });
        } finally {
            if (connection) connection.release();
        }
    }
);


// --------only for demo=------------
const cors = require('cors');
app.use(cors());
// app.use(cors({
//     origin: 'http://172.20.10.7:5500',  // Allow requests only from this origin
//   }));
// // ------------------------------------


//ADD home
app.post(
    '/app/add/home/',
    async (req, res) => {

        try {
            const { name } = req.body;// Destructure the required fields from the request body
            const created_by=  req.user.username;
            // const created_by= 1;
            const user_id= req.user.id;
            // const user_id= 1;
    
            // Check if required data is provided
            if (!name || !created_by) {
                return res.status(400).json({ error: 'name and created_by are required' });
            }
    
            // Insert query
            const query = `
                INSERT INTO home (name, created_by,userid) 
                VALUES (?, ?, ?)
            `;
    
            // Execute the query
            const [result] = await db.execute(query, [name, created_by,user_id]);
    
            // Respond with success message and the inserted row ID
            res.status(201).json({
                message: 'Home added successfully',
                homeId: result.insertId // Retrieve the ID of the inserted row
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'An error occurred while adding the home' });
        }


});

//display home
app.get(
    // '/app/display/homes/:user_id',
    '/app/display/homes/',
     async (req, res) => {          
    try {
        const userId = req.user.id; // Get the user_id from the URL parameter
        // const userId = 1; // for checking

        // Query to fetch homes by user_id
        const query = `
            SELECT * 
            FROM home
            WHERE userid = ?
        `;

        // Execute the query
        const [rows] = await db.execute(query, [userId]);

        // If no homes are found, return a 404
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No homes found for this user' });
        }

        // Respond with the homes
        res.status(200).json(rows);
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while fetching homes' });
    }
});



// Update Home
app.put('/app/update/home/:id', async (req, res) => {
    try {
        const homeId = req.params.id; // Get home ID from URL parameter
        const { name} = req.body; 
        const created_by=  req.user.username// Extract fields to update from request body

        // Validate input
        if (!name && !created_by) {
            return res.status(400).json({ error: 'At least one of name or created_by must be provided' });
        }

        // Build dynamic query based on provided fields
        const updates = [];
        const values = [];
        if (name) {
            updates.push('name = ?');
            values.push(name);
        }
        if (created_by) {
            updates.push('created_by = ?');
            values.push(created_by);
        }
        values.push(homeId); // Add homeId for the WHERE clause

        const query = `
            UPDATE home
            SET ${updates.join(', ')}
            WHERE id = ?
        `;

        // Execute the update query
        const [result] = await db.execute(query, values);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Home not found or no changes made' });
        }

        res.status(200).json({ message: 'Home updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while updating the home' });
    }
});

// Delete Home
app.delete('/app/delete/home/:id', async (req, res) => {
    try {
        const homeId = req.params.id; // Get the home ID from the URL parameter

        // Delete query
        const query = `
            DELETE FROM home
            WHERE id = ?
        `;

        // Execute the query
        const [result] = await db.execute(query, [homeId]);

        if (result.affectedRows === 0) {
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
    async (req, res) => {
    try {
        const home_id = req.params.home_id;
        const {name } = req.body; // Destructure the required fields from the request body

        // Check if required data is provided
        if (!home_id || !name) {
            return res.status(400).json({ error: 'home_id and name are required' });
        }

        // Insert query
        const query = `
            INSERT INTO floor (home_id, name) 
            VALUES ($1, $2)
        `;

        // Execute the query
        const [result] = await db.query(query, [home_id, name]);

        // Respond with success message and the inserted row ID
        res.status(201).json({
            message: 'Floor added successfully',
            floorId: result.insertId // Retrieve the ID of the inserted row
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while adding the floor' });
    }
});

    
// Display floor
app.get('/app/display/floors/:home_id', async (req, res) => {
    try {
        const homeId = req.params.home_id;  // Extract home ID from the request URL

        // Query to fetch floors by home_id
        const query = `SELECT * FROM floor WHERE home_id = $1`;

        // Execute the query
        const result = await db.query(query, [homeId]);

        // Check if floors exist
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No floors found for the specified home' });
        }

        // Respond with the list of floors
        console.log(result.rows);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while fetching floors' });
    }
});

//Update Floor
app.put('/app/update/floors/:id', async (req, res) => {
    try {
        const floorId = req.params.id;  // Extract floor ID from the request URL
        const { name, home_id } = req.body;  // Extract fields to update from the request body

        // Validate input
        if (!name && !home_id) {
            return res.status(400).json({ error: 'At least one of name or home_id must be provided' });
        }

        // Build dynamic query based on provided fields
        const updates = [];
        const values = [];

        if (name) {
            updates.push('name = ?');
            values.push(name);
        }
        if (home_id) {
            updates.push('home_id = ?');
            values.push(home_id);
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
app.delete('/app/delete/floors/:id', async (req, res) => {
    try {
        const floorId = req.params.id;  // Extract floor ID from the request URL

        // Delete query
        const query = `
            DELETE FROM floor
            WHERE id = ?
        `;

        // Execute the query
        const [result] = await db.query(query, [floorId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Floor not found' });
        }

        res.status(200).json({ message: 'Floor deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while deleting the floor' });
    }
});

//ADD room
app.post(
    '/app/add/room/:floor_id',
    upload.single('image'),
    async (req, res) => {
        try {
            const floor_id = req.params.floor_id;
            console.log(floor_id);
            const { name, alias_name } = req.body;

            // Validate input
            if (!floor_id || !name) {
                return res.status(400).json({ error: 'floor_id and name are required' });
            }

            // Placeholder for S3 file upload (if needed in the future)
            // Uncomment and integrate the following logic if S3 upload is required.
            /*
            const file = req.file;
            let fileUrl = null;
            if (file) {
                const fileKey = `images/${Date.now()}-${file.originalname}`; // Unique file name
                const params = {
                    Bucket: process.env.S3_BUCKET_NAME,
                    Key: fileKey,
                    Body: file.buffer,
                    ContentType: file.mimetype,
                    ACL: 'public-read', // Make the file publicly readable
                };

                const uploadResult = await s3.upload(params).promise();
                fileUrl = uploadResult.Location; // S3 file URL
            }
            */

            // Insert query with PostgreSQL
            const query = `
                INSERT INTO room (floor_id, name, alias_name, image_url,home_id) 
                VALUES ($1, $2, $3, $4,$5) 
                RETURNING id
            `;

            // Execute the query
            const result = await db.query(query, [
                floor_id,
                name,
                alias_name || null, // Optional field
                null ,// Replace with `fileUrl` if integrating S3
                null
            ]);

            // Respond with success message and inserted room ID
            res.status(201).json({
                message: 'Room added successfully',
                roomId: result.rows[0].id // Retrieve the ID of the inserted row
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'An error occurred while adding the room' });
        }
    }
);



//Delete Room
app.delete('/app/delete/room/:id', async (req, res) => {
    try {
        const roomId = req.params.id; // Get the room ID from the URL parameter

        // Delete query
        const query = `
            DELETE FROM room
            WHERE id = ?
        `;

        // Execute the query
        const [result] = await db.execute(query, [roomId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Room not found' }); // No room with the specified ID
        }

        res.status(200).json({ message: 'Room deleted successfully' }); // Success response
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while deleting the room' });
    }
});

//Display room

app.get('/app/display/rooms/:floor_id', async (req, res) => {
    try {
        const floorId = req.params.floor_id;  // Extract floor ID from the request URL

        // Query to fetch rooms
        const query = `
            SELECT * 
            FROM room 
            WHERE floor_id = ?
        `;

        // Execute the query
        const [rooms] = await db.execute(query, [floorId]);

        if (rooms.length === 0) {
            return res.status(404).json({ message: 'No rooms found for this floor' });
        }
         console.log(rooms)
        res.status(200).json({
            message: 'Rooms retrieved successfully',
            rooms: rooms
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while retrieving rooms' });
    }
});


// Update room
app.put('/app/update/rooms/:id', upload.single('image'), async (req, res) => {
    try {
        const roomId = req.params.id; // Extract room ID from the request URL
        const { name, alias_name, image_url } = req.body; // Extract fields from the request body

        // Validate input
        if (!name && !alias_name && !image_url) {
            return res.status(400).json({ error: 'At least one of name, alias_name, or image_url must be provided' });
        }
        
        if( image_url){
        // Define S3 upload parameters
        const fileKey = `images/${Date.now()}-${image_url.originalname}`; // Unique file name
        const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: fileKey,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read', // Make the file publicly readable
       };

        // Upload file to S3
        const uploadResult = await s3.upload(params).promise();
        var fileUrl = uploadResult.Location;
        }

        // Build dynamic query
        const updates = [];
        const values = [];
        
        if (name) {
            updates.push('name = ?');
            values.push(name);
        }
        if (alias_name) {
            updates.push('alias_name = ?');
            values.push(alias_name);
        }
        if (fileUrl) {
            updates.push('image_url = ?');
            values.push(fileUrl);
        }

        values.push(roomId); // Add room ID for WHERE clause

        const query = `
            UPDATE room
            SET ${updates.join(', ')}
            WHERE id = ?
        `;

        // Execute the query
        const [result] = await db.execute(query, values);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Room not found or no changes made' });
        }

        res.status(200).json({ message: 'Room updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while updating the room' });
    }
});

// display things with id
app.get('/api/display/things/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const query = `
            SELECT * 
            FROM things 
            WHERE id = ?
        `;

        const [result] = await db.execute(query, [id]);

        if (result.length === 0) {
            return res.status(404).json({ error: 'Thing not found' });
        }

        res.status(200).json(result[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


 //display all things
  app.get('/api/display/things', async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM things'); // Fetch all records
      res.status(200).json(result[0]); // Send result as JSON
    } catch (error) {
      console.error('Error fetching things:', error); // Log the error for debugging
      res.status(500).json({ error: 'Internal Server Error' }); // Respond with an error
    }
  });

 //display thingattribute with thingid
 app.get('/api/display/thingattribute/:thingid', async (req, res) => {
    const thingid = req.params.thingid; // Get the thingid from the route parameter
    try {
        // Execute the query with a proper WHERE clause
        const [result] = await db.query('SELECT * FROM thingattributes WHERE thingid = ?', [thingid]);

        if (result.length > 0) {
            // Send the result as JSON if records are found
            res.status(200).json(result);
        } else {
            // Handle the case where no records match
            res.status(404).json({ message: 'No records found' });
        }
    } catch (error) {
        // Log the error for debugging
        console.error('Error fetching thing attributes:', error.message);

        // Respond with a generic error
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


//display devices with thingid
app.get('/api/display/devices/:thingid', async (req, res) => {
    const thingid = req.params.thingid; // Get the thingid from the route parameter
    try {
        const result = await db.query('SELECT * FROM devi  ces WHERE thingid = ?', [thingid]); 
        if (result.length > 0) {
            res.status(200).json(result[0]); // Send the result as JSON if records are found
        } else {
            res.status(404).json({ message: 'No records found' });// Handle case where no records match
        }
    } catch (error) {
        console.error('Error fetching things:', error.message); // Log the error for debugging
        res.status(500).json({ error: 'Internal Server Error' }); // Respond with a generic error
    }
});

//display thing that new,rework,failed,etc.....
app.get('/api/display/test/:type', async (req, res) => {
    try {
        // Get the 'type' parameter from the request URL
        const type = req.params.type;

        // Perform the database query
        const result = await db.query('SELECT * FROM things WHERE type = ?', [type]);

        // Send the result back to the client
        res.status(200).json({
            success: true,
            data: result[0]
        });
    } catch (error) {
        // Handle any errors
        console.error('Error fetching data from the database:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching data'
        });
    }
});

//display things with  status
app.get('/api/display/status/:status', async (req, res) => {
    try {
        // Get the 'status' parameter from the request URL
        const status = req.params.status;

        // Perform the first database query to fetch adminstock entries
        const [results] = await db.query('SELECT * FROM adminstock WHERE status = ?', [status]);

        if (results.length === 0) {
            // If no records are found for the given status, return a 404
            return res.status(404).json({
                success: false,
                message: 'No data found for the provided status',
            });
        }

        console.log('AdminStock Results:', results);

        // Extract thingIds from the results
        const thingIds = results.map(item => item.thingId);
        console.log('Extracted Thing IDs:', thingIds);

        // Perform the second query to fetch data from the `things` table for all matching thingIds
        const [datas] = await db.query('SELECT * FROM things WHERE id IN (?)', [thingIds]);

        // Send the result back to the client
        res.status(200).json({
            success: true,
            data: datas,
        });
    } catch (error) {
        // Handle any errors
        console.error('Error fetching data from the database:', error);

        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching data',
        });
    }
});


// share access to customer with macAddress and securityKey
app.post('/api/access/customer/:roomid', async (req, res) => {
    const connection = await db.getConnection(); // Get a transactional connection
    try {
        const roomid = req.params.roomid;
        const user_id = 1; 
        const { securitykey, serialno } = req.body; 
        
        await connection.beginTransaction();

        const [verify] = await connection.query(
            'SELECT * FROM things WHERE serialno = ? AND securityKey = ?',
            [serialno, securitykey]
        );

        if (!verify || verify.length === 0) {
            return res.status(404).json({ message: "Thing not found or invalid security key" });
        }

        const thing_id = verify[0].id; 
        const key = verify[0].securityKey; 

        await connection.query(
            'INSERT INTO customer_access (user_id, email, thing_id, securitykey) VALUES (?, ?, ?, ?)',
            [user_id, null, thing_id, key]
        );

        const [room_device] = await connection.query(
            'SELECT deviceid FROM devices WHERE thingId = ?', 
            [thing_id]
        );
        console.log(thing_id)
        console.log(room_device)

        const device_ids = room_device.map(item => item.deviceid);
        console.log(device_ids)
        for (const device_id of device_ids) {
            await connection.query(
                'INSERT INTO room_device (room_id, device_id) VALUES (?, ?)',
                [roomid, device_id]
            );
        }

        await connection.commit();
        res.status(201).json({ message: "Access shared successfully" });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Error sharing access:", error);
        res.status(500).json({ message: "Internal server error" });
    } finally {
        if (connection) connection.release();
    }
});


//display devices with roomsid

app.get('/api/display/device/rooms/:roomid', async (req, res) => {
    try {
        const roomid = req.params.roomid;

        // Fetch device IDs associated with the room
        const [device_ids] = await db.query('SELECT device_id FROM room_device WHERE room_id = ?', [roomid]);

        if (device_ids.length === 0) {
            return res.status(404).json({ message: 'No devices found for this room.' });
        }

        // Extract device IDs
        const deviceIds = device_ids.map(item => item.device_id);

        // Dynamically generate placeholders for the device IDs
        const placeholders = deviceIds.map(() => '?').join(',');
        const query = `SELECT * FROM devices WHERE deviceid IN (${placeholders})`;

        // Fetch device details
        const [devices] = await db.query(query, deviceIds);

        // Return the device data
        console.log(devices)
        res.status(200).json({ devices });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while fetching devices.', error });
    }
});




const PORT = process.env.PORT || 3002;
app.listen(PORT,
    '0.0.0.0',
     () => {
    console.log(`Server running on port ${PORT}`);
});
