const express = require('express');
const homeapp = express.Router();
const db = require('./dbconnection');
const { validateJwt, authorizeRoles } = require('./middlewares/auth');
const { thingSchema } = require('./middlewares/validation');
const { s3, upload } = require('./middlewares/s3');

homeapp.get('/homeapp',(req,res)=>{
    res.send("homeapp working")
});
//ADD home
homeapp.post( '/app/add/home/',
    // validateJwt,
    // authorizeRoles('customer'),
    async (req, res) =>  {
        console.log(req.body)
        console.log(req.body.id)
        try {
            const {name}   = req.body; // Destructure the required fields from the request body
            const username = req.user?.username || req.body.username; // Authenticated user's username
            const id   = req.user?.id|| req.body.id; // Authenticated user's ID
            const user_id =id;
            // Check if required data is provided
            if (!name || !username) {
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
homeapp.get('/app/display/homes/',
    // validateJwt,
    // authorizeRoles('customer'),
    async (req, res) => {          
        try {
            console.log(req.body)
            console.log(req.query)
            
            const userId = req.user?.id ||  req.query.userId; // Get the user_id from the authenticated user
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
homeapp.put('/app/update/home/:id',
    // validateJwt,
    // authorizeRoles('customer'),
     async (req, res) => {
    try {
        const homeId = req.params.id; // Get home ID from URL parameter
        const { name } = req.body; 
        const created_by = req.user?.username||req.body.username; // Extract fields to update from request body

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
homeapp.delete('/app/delete/home/:id',
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
homeapp.post('/app/add/floor/:home_id',
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
homeapp.get('/app/display/floors/:home_id',
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
homeapp.put('/app/update/floors/:id',
    // validateJwt,
    // authorizeRoles('customer'),
    async (req, res) => {
        try {
            console.log(req.params.id);
            console.log(req.params);

            const floorId = req.params.id; // Extract floor ID from the request URL
            const { name } = req.body; // Extract fields to update from the request body

            // Validate input
            if (!name) {
                return res.status(400).json({ error: 'Name must be provided for update' });
            }

            // Build dynamic query based on provided fields
            const updates = [];
            const values = [];

            if (name) {
                updates.push(`name = $${updates.length + 1}`);
                values.push(name);
            }

            // Ensure there are updates to make
            if (updates.length === 0) {
                return res.status(400).json({ error: 'No valid fields to update' });
            }

            values.push(floorId); // Add floorId as the last parameter

            const query = `
                UPDATE floor
                SET ${updates.join(', ')}
                WHERE id = $${values.length}
            `;

            // Execute the update query
            const result = await db.query(query, values);

            if (result.rowCount === 0) {
                return res.status(404).json({ message: 'Floor not found or no changes made' });
            }

            res.status(200).json({ message: 'Floor updated successfully' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'An error occurred while updating the floor' });
        }
    }
);

homeapp.put('/app/reorder/rooms/:floor_id', async (req, res) => {
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
//Delete Floor
homeapp.delete('/app/delete/floors/:id',
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

// ADD Room
homeapp.post('/app/add/room/:floor_id', 
    // validateJwt,
    // authorizeRoles('customer'),
    upload.single('image'), 
    async (req, res) => {
    try {
        const floor_id = req.params.floor_id;
        const { name, alias_name } = req.body; // Include `user_id` in the request body
        const {user_id}=req.user?.id||req.body;
        // Validate input
        if (!floor_id || !name) {
            return res.status(400).json({ error: 'floor_id, name, and user_id are required' });
        }

        // Placeholder for S3 file upload (if needed in the future)
        let fileUrl = null;
        if (req.file) {
            const file=req.file
            const fileKey = `images/${Date.now()}-${file.originalname}`; // Unique file name
            const params = {
                Bucket: process.env.S3_BUCKET_NAME,
                Key: fileKey,
                Body: file.buffer,
                ContentType: file.mimetype,
                // ACL: 'public-read', // Make the file publicly readable
            };

            const uploadResult = await s3.upload(params).promise();
            fileUrl = uploadResult.Location; // S3 file URL
        }; // Implement S3 upload logic here and set fileUrl accordingly

        // Start a database transaction
        await db.query('BEGIN');

        // Calculate the next orderIndex for this user and floor
        const getOrderIndexQuery = `
            SELECT COALESCE(MAX(orderIndex), 0) + 1 AS nextOrderIndex
            FROM UserRoomOrder
            WHERE floor_id = $1 AND user_id = $2
        `;
        const orderIndexResult = await db.query(getOrderIndexQuery, [floor_id, user_id]);
        const nextOrderIndex = orderIndexResult.rows[0].nextorderindex; // Get the next available orderIndex

        // Insert query for the room
        const roomQuery = `
            INSERT INTO room (floor_id, name, alias_name, image_url, home_id) 
            VALUES ($1, $2, $3, $4, $5) 
            RETURNING id
        `;

        const roomValues = [
            floor_id,
            name,
            alias_name || null, // Optional field
            fileUrl, // Replace with actual file URL if integrating S3
            null // Replace with actual home_id if available
        ];

        const roomResult = await db.query(roomQuery, roomValues);
        const roomId = roomResult.rows[0].id; // Retrieve the ID of the inserted row

        // Insert query for UserRoomOrder
        const userRoomOrderQuery = `
            INSERT INTO UserRoomOrder (user_id, floor_id, room_id, orderIndex) 
            VALUES ($1, $2, $3, $4)
        `;

        const userRoomOrderValues = [user_id, floor_id, roomId, nextOrderIndex];

        await db.query(userRoomOrderQuery, userRoomOrderValues);

        // Commit the transaction
        await db.query('COMMIT');

        // Respond with success message and inserted room ID
        res.status(201).json({
            message: 'Room added successfully',
            roomId: roomId
        });
    } catch (error) {
        // Rollback the transaction in case of an error
        await db.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: 'An error occurred while adding the room' });
    }
});

// Display room
homeapp.get('/app/display/rooms/:floor_id', 
    // validateJwt,
    // authorizeRoles('customer'), 
    async (req, res) => {
    try {
        const floorId = req.params.floor_id; // Extract floor ID from the request URL
        // const { user_id } = req.query; // Assume user_id is passed as a query parameter

        // Validate input
        if (!floorId ) {
            return res.status(400).json({ error: 'floor_id and user_id are required' });
        }

        // Query to fetch rooms based on UserRoomOrder orderIndex
        // AND uro.user_id = $2
        const query = `
            SELECT r.*
            FROM room r
            INNER JOIN UserRoomOrder uro
            ON r.id = uro.room_id
            WHERE uro.floor_id = $1
            ORDER BY uro.orderIndex ASC
        `;

        // Execute the query
        const result = await db.query(query, [floorId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No rooms found for this floor and user' });
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

// Update room
homeapp.put('/app/update/rooms/:id',
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
                // ACL: 'public-read', // Make the file publicly readable
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

//Delete Room
homeapp.delete('/app/delete/room/:id',
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

// share access to customer with macAddress and securityKey
homeapp.post('/api/access/customer/:roomid',
    // validateJwt,
    // authorizeRoles('customer'),
    async (req, res) => {
        const client = await db.connect(); // Get a client from the db
        try {
            const roomid = req.params.roomid;
            const user_id = 1; // Replace with actual user ID
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
            const deviceQuery = 'SELECT id, deviceid FROM devices WHERE thingid = $1';
            const deviceResult = await client.query(deviceQuery, [thing_id]);

            if (deviceResult.rows.length === 0) {
                return res.status(404).json({ message: "No devices found for the given thing" });
            }

            const device_ids = deviceResult.rows;

            // Fetch the current maximum orderIndex for the user
            const maxOrderIndexQuery = `
                SELECT COALESCE(MAX(orderIndex), 0) AS max_order_index 
                FROM UserDevicesorder 
                WHERE  roomid= $1
            `;
            const maxOrderIndexResult = await client.query(maxOrderIndexQuery, [user_id]);
            let currentOrderIndex = maxOrderIndexResult.rows[0].max_order_index;

            // Insert into room_device and UserDevicesorder with orderIndex
            const roomDeviceQuery = `
                INSERT INTO room_device (room_id, device_id)
                VALUES ($1, $2)
            `;
            const userDeviceQuery = `
                INSERT INTO UserDevicesorder (roomid, device_id, orderIndex)
                VALUES ($1, $2, $3)
            `;

            for (const { id: device_id, deviceid } of device_ids) {
                currentOrderIndex += 1; // Increment orderIndex
                await client.query(roomDeviceQuery, [roomid, deviceid]);
                await client.query(userDeviceQuery, [roomid, device_id, currentOrderIndex]);
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
    }
);

homeapp.put('/api/reorder/devices/:roomid', async (req, res) => {
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

//change device to other rooms
homeapp.put('/api/devices/:device_id/change/:newroomid', async (req, res) => {
    const { device_id,newroomid } = req.params;
    // const { newroomid } = req.body;
    
    const new_room_id=newroomid;
    // Validate input
    if (!new_room_id) {
        return res.status(400).json({ error: "new_room_id is required" });
    }

    try {
        const client = await pool.connect();

        try {
            // Check if the device exists
            const deviceResult = await client.query(
                'SELECT * FROM devices WHERE deviceid = $1',
                [device_id]
            );
            if (deviceResult.rowCount === 0) {
                return res.status(404).json({ error: "Device not found" });
            }

            // Check if the new room exists
            const roomResult = await client.query(
                'SELECT * FROM room WHERE id = $1',
                [new_room_id]
            );
            if (roomResult.rowCount === 0) {
                return res.status(404).json({ error: "Room not found" });
            }

            // Check if a mapping for the device exists
            const mappingResult = await client.query(
                'SELECT * FROM room_device WHERE device_id = $1',
                [device_id]
            );
            if (mappingResult.rowCount === 0) {
                return res.status(404).json({ error: "Device mapping not found" });
            }

            // Update the room for the device
            await client.query(
                'UPDATE room_device SET room_id = $1 WHERE device_id = $2',
                [new_room_id, device_id]
            );

            res.status(200).json({
                message: "Device room updated successfully.",
                device_id: device_id,
                new_room_id: new_room_id,
            });
        } catch (error) {
            console.error("Error executing query", error);
            res.status(500).json({ error: "An error occurred while updating the room." });
        } finally {
            client.release(); // Release the client back to the pool
        }
    } catch (error) {
        console.error("Error connecting to the database", error);
        res.status(500).json({ error: "Database connection error" });
    }
});

//display all devices with floor name and room name 
homeapp.get('/api/display/all/devices/:userId', async (req, res) => {
    const userId = req.params.userId;
    console.log('Fetching devices for userId:', userId);

    try {
        // Execute the query
        const result = await db.query(
            `
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
                users u
            JOIN 
                home h ON u.id = h.userid
            JOIN 
                floor f ON h.id = f.home_id
            JOIN 
                room r ON f.id = r.floor_id
            JOIN 
                room_device rd ON r.id = rd.room_id
            JOIN 
                devices d ON rd.device_id = d.deviceId
            WHERE 
                u.id = $1
            ORDER BY 
                f.name ASC,
                r.name ASC;
            `,
            [userId] // Parameterized query
        );

        // Debug the result structure
        console.log('Query Result:', result);

        // Extract rows from the result object
        const rows = result.rows;

        if (!rows || rows.length === 0) {
            return res.status(404).json({ message: 'No devices found for this user.' });
        }

        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching devices with full details:', { userId, error });
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

//add device to favorite
homeapp.put('/api/device/favorite/:deviceid', 
    // validateJwt,
    // authorizeRoles('customer'),
    async (req, res) => {
        const client = await db.connect(); // Get a client from the db
        try {
            const deviceid = req.params.deviceid;
            const user_id = req.user.id; // Extract user ID from JWT middleware

            // Update the favorite status of the device for the user
            const updateFavoriteQuery = `
                INSERT INTO UserFavoriteDevices (user_id, device_id, favorite)
                VALUES ($1, $2, $3)
                ON CONFLICT (user_id, device_id)
                DO UPDATE SET favorite = EXCLUDED.favorite, last_modified = CURRENT_TIMESTAMP
            `;
            await client.query(updateFavoriteQuery, [user_id, deviceid, true]);

            res.status(200).json({ message: `Device ${deviceid} marked as favorite successfully.` });
        } catch (error) {
            console.error('Error updating favorite status:', error);
            res.status(500).json({ message: 'An error occurred while updating favorite status.', error });
        } finally {
            client.release(); // Release the client back to the pool
        }
    }
);

//diplay favorite devices
homeapp.get('/api/favorite-devices/:userId', async (req, res) => {
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
homeapp.post('/app/add/scenes/:userid', upload.single('icon'),async (req, res) => {
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
homeapp.get('/app/display/scenes/:userid', async (req, res) => {
    try {
        const { userid } = req.params;
        const result = await db.query('SELECT * FROM Scenes WHERE user_id = $1', [userid]);
        
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

//  Update a Scene
homeapp.put('/app/update/scenes/:id', upload.single('icon'), async (req, res) => {
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
homeapp.delete('/app/delete/scenes/:id', async (req, res) => {
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

homeapp.post('/app/create/scene_devices/:scene_id/:device_id', async (req, res) => {
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
homeapp.get('/api/display/scenes/:scene_id/devices', async (req, res) => {
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
homeapp.put('/app/Update/scene_devices/:id', async (req, res) => {
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
homeapp.delete('/api/delete/scene_devices/:id', async (req, res) => {
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

// 1. Create a new SceneEvent
homeapp.post('/api/scene-events', async (req, res) => {
    const { sceneId, deviceId, action,datatime} = req.body;

    try {
        const result = await db.query(
            `INSERT INTO SceneEvent (sceneId, deviceId, action,eventTime) VALUES ($1, $2, $3,$4) RETURNING *`,
            [sceneId, deviceId, action,datatime]
        );
        res.status(201).json({
            message: 'SceneEvent created successfully',
            sceneEvent: result.rows[0],
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error creating SceneEvent' });
    }
});

homeapp.put('/api/update/scene-events/scene/:sceneId', async (req, res) => {
    const { sceneId } = req.params; // Scene ID from the route parameters
    const { deviceId, action, datatime } = req.body; // Fields to update

    try {
        // Update all SceneEvent records for the given sceneId
        const result = await db.query(
            `UPDATE SceneEvent
             SET deviceId = COALESCE($1, deviceId),
                 action = COALESCE($2, action),
                 eventTime = COALESCE($3, eventTime)
             WHERE sceneId = $4
             RETURNING *`,
            [deviceId, action, datatime, sceneId]
        );

        // Check if any records were updated
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'No SceneEvents found for the specified sceneId' });
        }

        // Respond with the updated records
        res.status(200).json({
            message: 'SceneEvents updated successfully',
            updatedSceneEvents: result.rows,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error updating SceneEvents' });
    }
});

homeapp.get('/api/scene-events/scene/:sceneId', async (req, res) => {
    const { sceneId } = req.params;

    try {
        const result = await db.query(
            `SELECT se.id, se.sceneId, se.deviceId, se.action, se.eventTime,
            s.name AS sceneName, d.name AS deviceName
            FROM SceneEvent se
            JOIN Scenes s ON se.sceneId = s.id
            JOIN Devices d ON se.deviceId = d.id
            WHERE se.sceneId = $1`,
            [sceneId]
        );
        res.status(200).json({ sceneEvents: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error retrieving SceneEvents for sceneId' });
    }
});

homeapp.get("/api/display/user", async (req, res) => {
    const userId = req.user?.id || req.body.userid;
    const fetchUserQuery = "SELECT  userName,userRole,profilePic FROM Users WHERE id = $1";
  
    try {
      const result = await db.query(fetchUserQuery, [userId]);
  
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "User not found." });
      }
  
      res.status(200).json(result.rows[0]);
    } catch (error) {
      console.error("Error fetching user by ID:", error);
      res.status(500).json({ error: "Failed to fetch user by ID." });
    }
  });

// 1. Add a new FCM token
homeapp.post('/api/register/fcmtoken', async (req, res) => {
    const {  fcmToken } = req.body;
    const {userId}=req.user?.id || req.body.id

    try {
        const result = await db.query(
            `INSERT INTO UserFCMTokens (userId, fcmToken) VALUES ($1, $2) RETURNING *`,
            [userId, fcmToken]
        );
        res.status(201).json({ message: 'Token added successfully', token: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error adding token' });
    }
});

homeapp.get('/api/retrieve/fcmtokens/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const result = await db.query(
            `SELECT * FROM UserFCMTokens WHERE userId = $1`,
            [userId]
        );
        res.status(200).json({ tokens: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error retrieving tokens' });
    }
});

// 1. Create a new notification
homeapp.post('/api/notifications', async (req, res) => {
    const { userId, deviceId, message } = req.body;

    try {
        // Insert into Notifications table
        const notificationResult = await db.query(
            `INSERT INTO Notifications (userId, deviceId) VALUES ($1, $2) RETURNING *`,
            [userId, deviceId]
        );

        const notificationId = notificationResult.rows[0].id;

        // Insert into NotificationMessages table
        const messageResult = await db.query(
            `INSERT INTO NotificationMessages (notificationId, message) VALUES ($1, $2) RETURNING *`,
            [notificationId, message]
        );

        res.status(201).json({
            message: 'Notification created successfully',
            notification: notificationResult.rows[0],
            notificationMessage: messageResult.rows[0],
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error creating notification' });
    }
});

// 2. Retrieve notifications for a user
homeapp.get('/api/notifications/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const result = await db.query(
            `SELECT n.id AS notificationId, n.userId, n.deviceId, n.createdAt, nm.id AS messageId, nm.message
             FROM Notifications n
             INNER JOIN NotificationMessages nm ON n.id = nm.notificationId
             WHERE n.userId = $1`,
            [userId]
        );
        res.status(200).json({ notifications: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error retrieving notifications' });
    }
});

// 3. Delete a notification
homeapp.delete('/api/notifications/:notificationId', async (req, res) => {
    const { notificationId } = req.params;

    try {
        const result = await db.query(
            `DELETE FROM Notifications WHERE id = $1 RETURNING *`,
            [notificationId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        res.status(200).json({ message: 'Notification deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error deleting notification' });
    }
});

module.exports=homeapp;