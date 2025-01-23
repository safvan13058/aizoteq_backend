const express = require('express');
const homeapp = express.Router();
const db = require('./middlewares/dbconnection');
const { validateJwt, authorizeRoles } = require('./middlewares/auth');
const { thingSchema } = require('./middlewares/validation');
const { s3, upload } = require('./middlewares/s3');

homeapp.use(express.json({ limit: '10mb' }));
homeapp.use(express.urlencoded({ extended: true, limit: '10mb' }));

homeapp.get('/homeapp', (req, res) => {
    res.send("homeapp working")
});
//ADD home
homeapp.post('/app/add/home/',
    // validateJwt,
    // authorizeRoles('customer'),
    async (req, res) => {
        console.log(req.body)
        console.log(req.body.id)
        try {
            const { name } = req.body; // Destructure the required fields from the request body
            const username = req.user?.username || req.body.username; // Authenticated user's username
            const id = req.user?.id || req.body.id; // Authenticated user's ID
            const user_id = id;
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

            // Retrieve the ID of the inserted home
            const homeId = result.rows[0].id;

            // Insert query for the sharedaccess table
            const sharedAccessQuery = `
                 INSERT INTO sharedaccess (user_id, shared_with_user_email, entity_id, entity_type, access_type, status) 
                 VALUES ($1, $2, $3, $4, $5, $6)
             `;

            // Owner's data insertion into sharedaccess table
            const sharedAccessValues = [
                user_id,            // Owner's ID
                username,           // Owner's email or username
                homeId,             // Home ID
                'home',             // Entity type
                'admin',            // Access type (Owner gets 'admin' access)
                'accepted'          // Status (Automatically accepted for the owner)
            ];

            // Execute the query for sharedaccess
            await db.query(sharedAccessQuery, sharedAccessValues);
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

            const userId = req.user?.id || req.query.userId; // Get the user_id from the authenticated user
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


// homeapp.get('/app/display/homes/',  async (req, res) => {
//     try {
//         const { id: userId, email } = req.user || req.query; // Get user details from authentication middleware

//         if (!userId && !email) {
//             return res.status(400).json({ error: 'User authentication required' });
//         }

//         // Query to fetch homes accessible to the user via email or user_id
//         const query = `
//             SELECT 
//                 h.id AS home_id,
//                 h.name AS home_name,
//                 sa.access_type AS access_type,
//                 sa.status AS share_status
//             FROM sharedaccess sa
//             INNER JOIN home h ON sa.entity_id = h.id AND sa.entity_type = 'home'
//             WHERE 
//                 (sa.shared_with_user_email = $1 OR sa.user_id = $2)
//                 AND sa.status = 'accepted'
//         `;

//         // Execute the query with email and user_id
//         const result = await db.query(query, [email, userId]);

//         // If no homes are found, return a 404
//         if (result.rows.length === 0) {
//             return res.status(404).json({ error: 'No shared homes found for this user' });
//         }

//         // Respond with the list of shared homes
//         res.status(200).json({
//             message: 'Shared homes retrieved successfully',
//             sharedHomes: result.rows
//         });
//     } catch (error) {
//         console.error('Error fetching shared homes:', error.message);
//         res.status(500).json({ error: 'An error occurred while fetching shared homes' });
//     }
// });

// Update Home


homeapp.put('/app/update/home/:id',
    // validateJwt,
    // authorizeRoles('customer'),
    async (req, res) => {
        try {
            const homeId = req.params.id; // Get home ID from URL parameter
            const { name } = req.body;
            const created_by = req.user?.username || req.body.username; // Extract fields to update from request body

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
// homeapp.post('/app/add/floor/:home_id',
//     // validateJwt,
//     // authorizeRoles('customer'),
//     async (req, res) => {
//         try {
//             const home_id = req.params.home_id;
//             const { name } = req.body; // Destructure the required fields from the request body

//             // Check if required data is provided
//             if (!home_id || !name) {
//                 return res.status(400).json({ error: 'home_id and name are required' });
//             }

//             // Insert query with RETURNING clause to get the inserted row ID
//             const query = `
//                 INSERT INTO floor (home_id, name) 
//                 VALUES ($1, $2)
//                 RETURNING id
//             `;

//             // Execute the query
//             const result = await db.query(query, [home_id, name]);

//             // Respond with success message and the inserted row ID
//             res.status(201).json({
//                 message: 'Floor added successfully',
//                 floorId: result.rows[0].id // Retrieve the ID of the inserted row
//             });
//         } catch (error) {
//             console.error(error);
//             res.status(500).json({ error: 'An error occurred while adding the floor' });
//         }
//     }
// );


// homeapp.post('/app/add/floor/:home_id', 
//     async (req, res) => {
//         try {
//             const home_id = req.params.home_id;
//             // Check if home_id is provided
//             if (!home_id) {
//                 return res.status(400).json({ error: 'home_id is required' });
//             }

//             // Step 1: Count how many floors already exist for the given home_id
//             const countQuery = `
//                 SELECT COUNT(*) AS floor_count
//                 FROM floor
//                 WHERE home_id = $1
//             `;
//             const countResult = await db.query(countQuery, [home_id]);
//             const floorCount = parseInt(countResult.rows[0].floor_count, 10);

//             // Step 2: Determine the new floor name based on the count
//             const newFloorName = `floor${floorCount + 1}`; // Increment floor count by 1 for the new floor

//             // Step 3: Insert the new floor with the incremented name
//             const insertQuery = `
//                 INSERT INTO floor (home_id, name) 
//                 VALUES ($1, $2)
//                 RETURNING id
//             `;
//             const insertResult = await db.query(insertQuery, [home_id, newFloorName]);

//             // Step 4: Respond with success and the inserted floor ID
//             res.status(201).json({
//                 message: 'Floor added successfully',
//                 floorId: insertResult.rows[0].id, // Retrieve the ID of the inserted row
//                 floorName: newFloorName // Return the determined floor name
//             });
//         } catch (error) {
//             console.error(error);
//             res.status(500).json({ error: 'An error occurred while adding the floor' });
//         }
//     }
// );

homeapp.post('/app/add/floor/:home_id',
    async (req, res) => {
        try {
            const home_id = req.params.home_id;
            const { index } = req.body; // Optional index from request body

            // Check if home_id is provided
            if (!home_id) {
                return res.status(400).json({ error: 'home_id is required' });
            }

            // Step 1: Retrieve existing floors for the given home_id ordered by floor_index
            const floorsQuery = `
                SELECT floor_index, name
                FROM floor
                WHERE home_id = $1
                ORDER BY floor_index
            `;
            const floorsResult = await db.query(floorsQuery, [home_id]);
            const floors = floorsResult.rows; // List of floors with index and names

            // Determine the insertion index
            let insertionIndex;
            if (index !== undefined) {
                // Validate the specified index
                if (index < 0 || index > floors.length) {
                    return res.status(400).json({ error: 'Invalid index specified' });
                }
                insertionIndex = index;
            } else {
                // Append to the end if no index is specified
                insertionIndex = floors.length;
            }

            // Step 2: Shift indices of floors at or after the insertion index
            const shiftQuery = `
                UPDATE floor
                SET floor_index = floor_index + 1
                WHERE home_id = $1 AND floor_index >= $2
            `;
            await db.query(shiftQuery, [home_id, insertionIndex]);

            // Step 3: Determine the new floor name
            const newFloorName = `floor${insertionIndex + 1}`;

            // Step 4: Insert the new floor
            const insertQuery = `
                INSERT INTO floor (home_id, name, floor_index) 
                VALUES ($1, $2, $3)
                RETURNING id
            `;
            const insertResult = await db.query(insertQuery, [home_id, newFloorName, insertionIndex]);
            // Step 5: Insert the owner's details into the sharedaccess table
            const sharedAccessQuery = `
             INSERT INTO sharedaccess (user_id, shared_with_user_email, entity_id, entity_type, access_type, status) 
             VALUES ($1, $2, $3, $4, $5, $6)
         `;
            const sharedAccessValues = [
                user_id,           // Owner's ID
                null,              // No email required for the owner
                floorId,           // Floor ID
                'floor',           // Entity type
                'admin',           // Owner gets 'admin' access
                'accepted'         // Automatically accepted for the owner
            ];
            await db.query(sharedAccessQuery, sharedAccessValues);

            // Step 6: Respond with success and the inserted floor details
            res.status(201).json({
                message: 'Floor added successfully',
                floorId: insertResult.rows[0].id,
                floorName: newFloorName,
                floorIndex: insertionIndex
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
            const query = ` 
                SELECT * 
                FROM floor 
                WHERE home_id = $1 
                ORDER BY floor_index ASC
            `;

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

homeapp.put('/app/reorder/floor/:floor_id', async (req, res) => {
    const floorId = parseInt(req.params.floor_id, 10);
    const { home_id, new_floor_index } = req.body;

    if (!home_id || new_floor_index === undefined) {
        return res.status(400).json({ error: 'home_id and new_floor_index are required.' });
    }

    try {
        // Start a transaction
        const client = await pool.connect();
        await client.query('BEGIN');

        // Get the current floor_index for the specified floor
        const currentFloorQuery = 'SELECT floor_index FROM floor WHERE id = $1 AND home_id = $2';
        const currentFloorResult = await client.query(currentFloorQuery, [floorId, home_id]);

        if (currentFloorResult.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Floor not found for the specified home_id.' });
        }

        const currentFloorIndex = currentFloorResult.rows[0].floor_index;

        if (currentFloorIndex < new_floor_index) {
            // Shift down all floors between the current index and the new index
            const shiftDownQuery = `
          UPDATE floor
          SET floor_index = floor_index - 1
          WHERE home_id = $1 AND floor_index > $2 AND floor_index <= $3
        `;
            await client.query(shiftDownQuery, [home_id, currentFloorIndex, new_floor_index]);
        } else if (currentFloorIndex > new_floor_index) {
            // Shift up all floors between the current index and the new index
            const shiftUpQuery = `
          UPDATE floor
          SET floor_index = floor_index + 1
          WHERE home_id = $1 AND floor_index >= $3 AND floor_index < $2
        `;
            await client.query(shiftUpQuery, [home_id, currentFloorIndex, new_floor_index]);
        }

        // Update the floor_index for the specified floor
        const updateFloorQuery = `
        UPDATE floor
        SET floor_index = $1, last_modified = CURRENT_TIMESTAMP
        WHERE id = $2 AND home_id = $3
      `;
        await client.query(updateFloorQuery, [new_floor_index, floorId, home_id]);

        // Commit the transaction
        await client.query('COMMIT');
        res.status(200).json({ message: 'Floor index updated successfully.' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Internal server error.' });
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
        const floor_id = req.params.floor_id
        const user_id = req.user.id || req.body.user_id
        const { order } = req.body; // order is an array of { room_id, orderIndex }

        // Validate input
        if (!floor_id || !Array.isArray(order)) {
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
            await client.query(updateQuery, [orderIndex, floor_id, room_id]);
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
            const user_id = req.user?.id || req.body.user_id;
            // Validate input
            if (!floor_id || !name) {
                return res.status(400).json({ error: 'floor_id, name, and user_id are required' });
            }

            // Placeholder for S3 file upload (if needed in the future)
            let fileUrl = null;
            if (req.file) {
                const file = req.file
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
            // Insert query for sharedaccess table
            const sharedAccessQuery = `
         INSERT INTO sharedaccess (user_id, shared_with_user_email, entity_id, entity_type, access_type, status) 
         VALUES ($1, $2, $3, $4, $5, $6)
     `;

            const sharedAccessValues = [
                user_id,            // Owner's ID
                null,               // No email required for the owner
                roomId,             // Room ID
                'room',             // Entity type
                'admin',            // Owner gets 'admin' access
                'accepted'          // Automatically accepted for the owner
            ];

            await db.query(sharedAccessQuery, sharedAccessValues);
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
            if (!floorId) {
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
//change room from floor to other floor
homeapp.put('/api/room/:room_id/change-floor/:floor_id', async (req, res) => {
    const client = await db.connect();
    try {
        const room_id = req.params.room_id;
        const new_floor_id = req.params.floor_id; // Retrieve new floor ID from params
        const user_id = req.user?.id || req.body.user_id; // Fetch user ID dynamically

        // Validate input
        if (!room_id || !new_floor_id || !user_id) {
            return res.status(400).json({ message: "Missing required parameters" });
        }

        // Start a transaction
        await client.query('BEGIN');

        // Check if the room exists and is associated with the user
        const checkRoomQuery = `
            SELECT r.id, r.floor_id
            FROM room r
            INNER JOIN UserRoomOrder uro ON r.id = uro.room_id
            WHERE r.id = $1 AND uro.user_id = $2;
        `;
        const checkRoomResult = await client.query(checkRoomQuery, [room_id, user_id]);

        if (checkRoomResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Room not found or not associated with the user" });
        }

        const current_floor_id = checkRoomResult.rows[0].floor_id;

        // Update the floor of the room
        const updateRoomQuery = `
            UPDATE room
            SET floor_id = $1, last_modified = CURRENT_TIMESTAMP
            WHERE id = $2;
        `;
        await client.query(updateRoomQuery, [new_floor_id, room_id]);

        // Update the UserRoomOrder to reflect the new floor
        const updateOrderQuery = `
            UPDATE UserRoomOrder
            SET floor_id = $1, last_modified = CURRENT_TIMESTAMP
            WHERE room_id = $2 AND user_id = $3;
        `;
        await client.query(updateOrderQuery, [new_floor_id, room_id, user_id]);

        // Commit the transaction
        await client.query('COMMIT');

        res.status(200).json({ message: "Room floor updated successfully" });
    } catch (error) {
        // Rollback on error
        await client.query('ROLLBACK');
        console.error("Error updating room floor:", error);
        res.status(500).json({ message: "Internal server error" });
    } finally {
        client.release();
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
            const user_id = req.user?.id || req.body.userid; // Replace with actual user ID
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
//remove access
// homeapp.delete('/api/remove/access/:roomid/:thingid', async (req, res) => {
//     const client = await db.connect(); // Get a client from the database pool
//     try {
//         const roomid = parseInt(req.params.roomid, 10);
//         const thingid = parseInt(req.params.thingid, 10);
//         const user_id = req.user?.id || req.body.userid; // Fetch the user ID dynamically from authentication context

//         // Validate parameters
//         if (isNaN(roomid) || isNaN(thingid) || !user_id) {
//             return res.status(400).json({ message: "Missing or invalid required parameters" });
//         }

//         await client.query('BEGIN'); // Start a transaction

//         // Verify the user has access to the specified thing and room
//         const accessCheckQuery = `
//             SELECT ca.id
//             FROM customer_access ca
//             INNER JOIN devices d ON ca.thing_id = d.thingid
//             INNER JOIN room_device rd ON rd.device_id = d.id
//             WHERE ca.user_id = $1 AND ca.thing_id = $2 AND rd.room_id = $3
//             LIMIT 1;
//         `;
//         const accessCheckResult = await client.query(accessCheckQuery, [user_id, thingid, roomid]);

//         if (accessCheckResult.rows.length === 0) {
//             await client.query('ROLLBACK');
//             return res.status(404).json({ message: "No access found for the specified thing in the room" });
//         }

//         // Remove devices associated with the specified thing from `room_device`
//         const deleteRoomDeviceQuery = `
//             DELETE FROM room_device
//             WHERE room_id = $1 AND device_id IN (
//                 SELECT id FROM devices WHERE thingid = $2
//             );
//         `;
//         await client.query(deleteRoomDeviceQuery, [roomid, thingid]);

//         // Remove devices associated with the specified thing from `UserDevicesorder`
//         const deleteUserDevicesOrderQuery = `
//             DELETE FROM UserDevicesorder
//             WHERE roomid = $1 AND device_id IN (
//                 SELECT id FROM devices WHERE thingid = $2
//             );
//         `;
//         await client.query(deleteUserDevicesOrderQuery, [roomid, thingid]);

//         // Optionally, remove customer access if no devices of the thing are linked to any rooms
//         const deleteCustomerAccessQuery = `
//             DELETE FROM customer_access
//             WHERE user_id = $1 AND thing_id = $2
//             AND NOT EXISTS (
//                 SELECT 1 FROM devices d
//                 INNER JOIN room_device rd ON rd.device_id = d.id
//                 WHERE d.thingid = $2
//             );
//         `;
//         await client.query(deleteCustomerAccessQuery, [user_id, thingid]);

//         await client.query('COMMIT'); // Commit the transaction
//         res.status(200).json({ message: "Access for the specified thing removed successfully" });
//     } catch (error) {
//         await client.query('ROLLBACK'); // Rollback the transaction on error
//         console.error("Error removing access for thing:", error);
//         res.status(500).json({ message: "Internal server error" });
//     } finally {
//         client.release(); // Release the client back to the database pool
//     }
// });

homeapp.delete('/api/remove/access/:roomid/:thingid', async (req, res) => {
    const client = await db.connect(); // Get a client from the database pool


    try {
        const roomid = parseInt(req.params.roomid, 10);
        const thingid = parseInt(req.params.thingid, 10);
        const user_id = parseInt(req.user?.id || req.body.userid); // Fetch the user ID dynamically from authentication context

        console.log("roomid:", roomid);
        console.log("thingid:", thingid);
        console.log("user_id:", user_id);

        if (isNaN(roomid) || isNaN(thingid) || !user_id) {
            return res.status(400).json({ message: "Missing or invalid required parameters" });
        }

        await client.query('BEGIN'); // Start a transaction

        const accessCheckQuery = `
            SELECT ca.id
            FROM customer_access ca
            INNER JOIN devices d ON ca.thing_id = d.thingid
            INNER JOIN room_device rd ON rd.device_id = d.deviceId
            WHERE ca.user_id = $1 AND ca.thing_id = $2 AND rd.room_id = $3
            LIMIT 1;
        `;
        const accessCheckResult = await client.query(accessCheckQuery, [user_id, thingid, roomid]);

        if (accessCheckResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "No access found for the specified thing in the room" });
        }
        console.log(roomid, thingid)
        const deleteRoomDeviceQuery = `
            DELETE FROM room_device
            WHERE room_id = $1 AND device_id IN (
                SELECT deviceId FROM devices WHERE thingid = $2
            );
        `;
        await client.query(deleteRoomDeviceQuery, [roomid, thingid]);

        const deleteUserDevicesOrderQuery = `
            DELETE FROM UserDevicesorder
            WHERE roomid = $1 AND device_id IN (
                SELECT id FROM devices WHERE thingid = $2
            );
        `;
        await client.query(deleteUserDevicesOrderQuery, [roomid, thingid]);
        console.log(user_id, thingid)
        const deleteCustomerAccessQuery = `
            DELETE FROM customer_access
            WHERE user_id = $1 AND thing_id = $2
            AND NOT EXISTS (
                SELECT 1 FROM devices d
                INNER JOIN room_device rd ON rd.device_id = d.deviceId
                WHERE d.thingid = $2
            );
        `;
        await client.query(deleteCustomerAccessQuery, [user_id, thingid]);

        await client.query('COMMIT');
        res.status(200).json({ message: "Access for the specified thing removed successfully" });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error removing access for thing:", error);
        res.status(500).json({ message: "Internal server error" });
    } finally {
        client.release();
    }
});

//reorder devices in an room
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
            await client.query(updateQuery, [orderIndex, roomid, device_id]);
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
    const { device_id, newroomid } = req.params;
    // const { newroomid } = req.body;

    const new_room_id = newroomid;
    // Validate input
    if (!new_room_id) {
        return res.status(400).json({ error: "new_room_id is required" });
    }

    try {
        const client = await db.connect();

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
// homeapp.get('/api/display/all/devices/:userId', async (req, res) => {
//     const userId = req.params.userId;
//     console.log('Fetching devices for userId:', userId);

//     try {
//         // Execute the query
//         const result = await db.query(
//             `
//             SELECT 
//                 d.id AS device_id,
//                 d.deviceId,
//                 d.macAddress,
//                 d.hubIndex,
//                 d.createdBy,
//                 d.enable,
//                 d.status,
//                 d.icon,
//                 d.name AS device_name,
//                 d.type AS device_type,
//                 d.lastModified AS device_last_modified,
//                 f.name AS floor_name,
//                 r.name AS room_name
//             FROM 
//                 users u
//             JOIN 
//                 home h ON u.id = h.userid
//             JOIN 
//                 floor f ON h.id = f.home_id
//             JOIN 
//                 room r ON f.id = r.floor_id
//             JOIN 
//                 room_device rd ON r.id = rd.room_id
//             JOIN 
//                 devices d ON rd.device_id = d.deviceId
//             WHERE 
//                 u.id = $1
//             ORDER BY 
//                 f.name ASC,
//                 r.name ASC;
//             `,
//             [userId] // Parameterized query
//         );

//         // Debug the result structure
//         console.log('Query Result:', result);

//         // Extract rows from the result object
//         const rows = result.rows;

//         if (!rows || rows.length === 0) {
//             return res.status(404).json({ message: 'No devices found for this user.' });
//         }

//         res.status(200).json(rows);
//     } catch (error) {
//         console.error('Error fetching devices with full details:', { userId, error });
//         res.status(500).json({ error: 'Internal Server Error' });
//     }
// });
homeapp.get('/api/display/all/devices/:userId', async (req, res) => {
    const userId = req.params.userId;
    console.log('Fetching devices for userId:', userId);

    try {
        // Execute the query
        const result = await db.query(
            `
            SELECT DISTINCT
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
                r.name AS room_name,
                r.id AS roomid,
                f.id AS floorid
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
    const { userId } = req.params || req.user;

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
homeapp.post('/app/add/scenes/:userid', upload.single('icon'), async (req, res) => {
    const user_id = req.params.userid
    const createdBy = req.user?.username || req.body.createdBy
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
            [name, aliasName, createdBy, iconUrl, type, user_id]
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
    const { sceneId, deviceId, action, datatime } = req.body;

    try {
        const result = await db.query(
            `INSERT INTO SceneEvent (sceneId, deviceId, action,eventTime) VALUES ($1, $2, $3,$4) RETURNING *`,
            [sceneId, deviceId, action, datatime]
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

homeapp.put('/scene-events/scene/:sceneId', async (req, res) => {
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
// homeapp.get('/api/display/device/rooms/:roomid', 
//     // validateJwt,
//     // authorizeRoles('customer'),
//     async (req, res) => {
//         const client = await db.connect();
//         try {
//             const roomid = req.params.roomid;

//             // Fetch devices for the room, ordered by orderIndex
//             const query = `
//                 SELECT d.*
//                 FROM devices d
//                 INNER JOIN room_device rd ON d.deviceid = rd.device_id
//                 INNER JOIN UserDevicesorder udo ON udo.device_id = d.id
//                 WHERE rd.room_id = $1
//                 ORDER BY udo.orderIndex ASC
//             `;
//             const devicesResult = await client.query(query, [roomid]);

//             if (devicesResult.rows.length === 0) {
//                 return res.status(404).json({ message: 'No devices found for this room.' });
//             }

//             // Return the ordered device data
//             res.status(200).json({ devices: devicesResult.rows });
//         } catch (error) {
//             console.error('Error fetching devices:', error);
//             res.status(500).json({ message: 'An error occurred while fetching devices.', error });
//         } finally {
//             client.release();
//         }
//     }
// );

homeapp.get('/api/display/device/rooms/:roomid',
    // validateJwt,
    // authorizeRoles('customer'),
    async (req, res) => {
        const client = await db.connect();
        try {
            const roomid = req.params.roomid;

            // Fetch unique devices for the room, ordered by orderIndex
            const query = `
                SELECT DISTINCT ON (d.id) d.*
                FROM devices d
                INNER JOIN room_device rd ON d.deviceid = rd.device_id
                INNER JOIN UserDevicesorder udo ON udo.device_id = d.id
                WHERE rd.room_id = $1
                ORDER BY d.id, udo.orderIndex ASC
            `;
            const devicesResult = await client.query(query, [roomid]);

            if (devicesResult.rows.length === 0) {
                return res.status(404).json({ message: 'No devices found for this room.' });
            }

            // Return the ordered device data without duplicates
            res.status(200).json({ devices: devicesResult.rows });
        } catch (error) {
            console.error('Error fetching devices:', error);
            res.status(500).json({ message: 'An error occurred while fetching devices.', error });
        } finally {
            client.release();
        }
    }
);

// homeapp.put('/api/update/devices/:id', async (req, res) => {
//     const { id } = req.params; // Get device ID from the URL
//     const { name, icon,newroomid } = req.body; // Get the updated name and icon from the request body

//     // Ensure at least one field is provided
//     if (!name && !icon) {
//       return res.status(400).json({ error: 'At least one of name or icon must be provided' });
//     }

//     try {
//       // Dynamically build the query based on available fields
//       const fields = [];
//       const values = [];
//       let query = 'UPDATE Devices SET ';
//       let paramIndex = 1;

//       if (name) {
//         fields.push(`name = $${paramIndex++}`);
//         values.push(name);
//       }
//       if (icon) {
//         fields.push(`icon = $${paramIndex++}`);
//         values.push(icon);
//       }

//       // Add lastModified field and WHERE condition
//       fields.push(`lastModified = CURRENT_TIMESTAMP`);
//       query += fields.join(', ') + ` WHERE id = $${paramIndex} RETURNING *`;
//       values.push(id);

//       // Execute the update query
//       const result = await db.query(query, values);

//       // Check if a device was updated
//       if (result.rowCount === 0) {
//         return res.status(404).json({ error: 'Device not found' });
//       }

//       res.status(200).json({ message: 'Device updated successfully', device: result.rows[0] });
//     } catch (error) {
//       console.error('Error updating device:', error);
//       res.status(500).json({ error: 'Internal Server Error' });
//     }
//   });

homeapp.put('/api/update/devices/:deviceid', async (req, res) => {
    const device_id = req.params.deviceid; // Get device ID from the URL
    const { name, icon, newroomid } = req.body; // Get the fields to update from the request body

    // Ensure at least one field is provided
    if (!name && !icon && !newroomid) {
        return res.status(400).json({ error: 'At least one of name, icon, or newroomid must be provided' });
    }

    try {
        const client = await db.connect();

        try {
            // Check if the device exists
            const deviceResult = await client.query(
                'SELECT * FROM devices WHERE deviceid = $1',
                [device_id]
            );

            if (deviceResult.rowCount === 0) {
                return res.status(404).json({ error: 'Device not found' });
            }

            // Extract the device ID from the result for room_device mapping
            const deviceid = deviceResult.rows[0].deviceid;

            // If newroomid is provided, validate the room and update the mapping
            if (newroomid) {
                // Check if the room exists
                const roomResult = await client.query(
                    'SELECT * FROM room WHERE id = $1',
                    [newroomid]
                );
                if (roomResult.rowCount === 0) {
                    return res.status(404).json({ error: 'Room not found' });
                }

                // Check if a device-to-room mapping exists
                const mappingResult = await client.query(
                    'SELECT * FROM room_device WHERE device_id = $1',
                    [deviceid]
                );
                if (mappingResult.rowCount === 0) {
                    return res.status(404).json({ error: 'Device mapping not found' });
                }

                // Update the room for the device
                await client.query(
                    'UPDATE room_device SET room_id = $1 WHERE device_id = $2',
                    [newroomid, deviceid]
                );
            }

            // Dynamically build the query for name and icon updates
            const fields = [];
            const values = [];
            let query = 'UPDATE devices SET ';
            let paramIndex = 1;

            if (name) {
                fields.push(`name = $${paramIndex++}`);
                values.push(name);
            }
            if (icon) {
                fields.push(`icon = $${paramIndex++}`);
                values.push(icon);
            }

            // If name or icon is provided, update the device
            if (fields.length > 0) {
                // Add lastModified field and WHERE condition
                fields.push(`lastModified = CURRENT_TIMESTAMP`);
                query += fields.join(', ') + ` WHERE deviceid = $${paramIndex}`;
                values.push(device_id);

                await client.query(query, values);
            }

            res.status(200).json({
                message: 'Device updated successfully',
                device_id,
                updated_fields: { name, icon, newroomid },
            });
        } catch (error) {
            console.error('Error executing query:', error);
            res.status(500).json({ error: 'An error occurred while updating the device.' });
        } finally {
            client.release(); // Release the client back to the pool
        }
    } catch (error) {
        console.error('Error connecting to the database:', error);
        res.status(500).json({ error: 'Database connection error' });
    }
});


// update the enable/disable
homeapp.put('app/devices/enable/:deviceId', async (req, res) => {
    const deviceId = req.params.deviceId;
    const { enable } = req.body;

    if (typeof enable !== 'boolean') {
        return res.status(400).json({ error: "The 'enable' field must be a boolean." });
    }

    try {
        const query = `
        UPDATE Devices
        SET enable = $1, lastModified = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *;
      `;
        const values = [enable, deviceId];
        const result = await db.query(query, values);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Device not found.' });
        }

        res.json({
            message: 'Device updated successfully.',
            device: result.rows[0],
        });
    } catch (error) {
        console.error('Error updating device:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

homeapp.get("/api/display/user",
    validateJwt,
    authorizeRoles('admin', 'dealer', 'staff', 'customer'),
    async (req, res) => {
        console.log(`display user==${req.user}`)
        const userId = req.user.id;
        const fetchUserQuery = "SELECT  userName,userRole,name,profilePic FROM Users WHERE id = $1";

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
homeapp.post("/api/users/profile-pic",
    validateJwt,
    authorizeRoles('admin', 'dealer', 'staff', 'customer'),
    upload.single("profilepic"), 
    async (req, res) => {
        console.log(`Uploaded file size: ${req.file.size} bytes`);
        // console.log(`profilepic changeing===${req.user}`)
        const  userId  = req.user?.id||req.params.userid
        console.log(`change pic id${userId}`)
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        try {
            // Generate unique file name
            const fileExtension = path.extname(req.file.originalname);
            const fileName = `user_${userId}_${Date.now()}${fileExtension}`;

            // Upload file to S3
            const params = {
                Bucket: process.env.S3_BUCKET_NAME,
                Key: fileName,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
                // ACL: "public-read", // Makes the file publicly accessible
            };

            const s3Response = await s3.upload(params).promise();

            // Get the S3 URL
            const profilePicUrl = s3Response.Location;

            // Update profile picture in the database
            const query = `
        UPDATE Users
        SET profilePic = $1, lastModified = CURRENT_TIMESTAMP
        WHERE id = $2
      `;
            await db.query(query, [profilePicUrl, userId]);

            res.status(200).json({
                message: "Profile picture updated successfully",
                profilePic: profilePicUrl,
            });
        } catch (error) {
            console.error("Error uploading file:", error);
            res.status(500).json({ error: "Failed to upload and update profile picture" });
        }
    });
// 1. Add a new FCM token
homeapp.post('/api/register/fcmtoken', async (req, res) => {
    const { fcmToken } = req.body;
    const { userId } = req.user?.id || req.body.id

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

// -------------------------
homeapp.post('/app/share/access', async (req, res) => {
    try {
        const { entity_id, entity_type, shared_with_user_email, access_type } = req.body;
        const user_id = req.user?.id || req.body.userid;

        if (!entity_id || !entity_type || !shared_with_user_email || !access_type) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const query = `
            INSERT INTO sharedaccess (user_id, entity_id, entity_type, shared_with_user_email, access_type, status) 
            VALUES ($1, $2, $3, $4, $5, 'pending')
            RETURNING id
        `;
        const result = await db.query(query, [user_id, entity_id, entity_type, shared_with_user_email, access_type]);

        const shareRequestId = result.rows[0].id;

        // Send email notification to the shared user
        await sendEmailToSharedUser(shared_with_user_email, shareRequestId);

        res.status(201).json({ message: 'Access shared successfully', shareRequestId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while sharing access' });
    }
});


homeapp.get('/app/shared/access', async (req, res) => {
    try {
        const { user_id, email } = req.user || req.query; // Retrieve user details from req.user or fallback to req.body

        if (!user_id || !email) {
            return res.status(400).json({ error: 'User ID and email are required.' });
        }

        // SQL query to fetch shared access data
        const query = `
            SELECT 
                sa.id AS share_id, 
                sa.entity_id, 
                sa.entity_type, 
                sa.access_type, 
                sa.status,
                CASE 
                    WHEN sa.entity_type = 'home' THEN h.name
                    WHEN sa.entity_type = 'floor' THEN f.name
                    WHEN sa.entity_type = 'room' THEN r.name
                END AS entity_name
            FROM sharedaccess sa
            LEFT JOIN home h ON sa.entity_id = h.id AND sa.entity_type = 'home'
            LEFT JOIN floor f ON sa.entity_id = f.id AND sa.entity_type = 'floor'
            LEFT JOIN room r ON sa.entity_id = r.id AND sa.entity_type = 'room'
            WHERE sa.shared_with_user_email = $1 OR sa.user_id = $2
        `;

        // Execute the query
        const result = await db.query(query, [email, user_id]);

        // Respond with the result
        res.status(200).json({
            message: 'Shared access retrieved successfully',
            sharedAccess: result.rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while retrieving shared access.' });
    }
});

const sendEmailToSharedUser = async (email, shareRequestId) => {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USERNAME,
                pass: process.env.EMAIL_PASSWORD
            }
        });

        const info = await transporter.sendMail({
            from: '"Home App" <your-email@gmail.com>',
            to: email,
            subject: 'You have been shared access',
            text: `You have been shared access to an entity in the Home App. Click the link below to accept or reject the request:\n\n` +
                `http://yourapp.com/accept-share/${shareRequestId}`
        });

        console.log('Email sent: ' + info.response);
    } catch (error) {
        console.error('Error sending email:', error);
    }
};

const path = require('path');

homeapp.get('/accept-share/:shareRequestId', async (req, res) => {
    try {
        const shareRequestId = req.params.shareRequestId;

        // Validate the share request ID
        const query = `
            SELECT id, entity_id, entity_type, shared_with_user_email, status
            FROM sharedaccess
            WHERE id = $1
        `;
        const result = await db.query(query, [shareRequestId]);

        if (result.rows.length === 0) {
            return res.status(404).send('Share request not found or invalid.');
        }

        const shareRequest = result.rows[0];

        if (shareRequest.status !== 'pending') {
            return res.send('This share request has already been processed.');
        }

        // Render the HTML form with the share request details
        res.sendFile(path.join(__dirname, 'acceptShare.html')); // Serve your HTML form file
    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred while loading the page.');
    }
});

homeapp.post('/app/revoke/access', async (req, res) => {
    try {
        const { share_id } = req.body; // The ID of the shared access record to revoke
        const user_id = req.user?.id || req.body.userid; // The ID of the user performing the action

        // Validate input
        if (!share_id) {
            return res.status(400).json({ error: 'Share ID is required.' });
        }

        // Verify that the user has `admin` access for the shared access record
        const verifyQuery = `
            SELECT sa.id, sa.access_type
            FROM sharedaccess sa
            WHERE sa.id = $1 AND sa.user_id = $2 AND sa.access_type = 'admin'
        `;

        const verifyResult = await db.query(verifyQuery, [share_id, user_id]);

        if (verifyResult.rowCount === 0) {
            return res.status(403).json({ error: 'You do not have admin permissions to revoke this access.' });
        }

        // Update the shared access status to "revoked"
        const revokeQuery = `
            UPDATE sharedaccess
            SET status = 'revoked'
            WHERE id = $1
        `;

        await db.query(revokeQuery, [share_id]);

        res.status(200).json({
            message: 'Access revoked successfully.',
            share_id: share_id
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while revoking access.' });
    }
});

homeapp.delete('/app/shared/access/:shareId', async (req, res) => {
    try {
        const { id: userId } = req.user || req.body; // Get user details from the authenticated user
        const { shareId } = req.params; // Get the shareId from the URL parameter

        if (!shareId) {
            return res.status(400).json({ error: 'Share ID is required' });
        }

        // Check if the shared access exists and if the user has admin privileges
        const checkQuery = `
            SELECT sa.user_id, sa.access_type
            FROM sharedaccess sa
            WHERE sa.id = $1
        `;
        const checkResult = await db.query(checkQuery, [shareId]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Shared access record not found' });
        }

        const accessRecord = checkResult.rows[0];

        // Validate permissions: Only users with admin access can delete
        if (accessRecord.user_id !== userId || accessRecord.access_type !== 'admin') {
            return res.status(403).json({ error: 'You do not have permission to delete this access' });
        }

        // Delete the shared access
        const deleteQuery = `
            DELETE FROM sharedaccess
            WHERE id = $1
        `;
        await db.query(deleteQuery, [shareId]);

        res.status(200).json({ message: 'Shared access deleted successfully' });
    } catch (error) {
        console.error('Error deleting shared access:', error.message);
        res.status(500).json({ error: 'An error occurred while deleting shared access' });
    }
});

homeapp.post('/app/update/access/status', async (req, res) => {
    try {
        const { share_id, new_status } = req.body; // The ID of the shared access record and the new status
        const user_id = req.user?.id || req.body.userid; // The ID of the user performing the action

        // Validate input
        if (!share_id || !new_status) {
            return res.status(400).json({ error: 'Share ID and new status are required.' });
        }

        // Verify that the user has `admin` access for the shared access record
        const verifyQuery = `
            SELECT sa.id, sa.access_type
            FROM sharedaccess sa
            WHERE sa.id = $1 AND sa.user_id = $2 AND sa.access_type = 'admin'
        `;

        const verifyResult = await db.query(verifyQuery, [share_id, user_id]);

        if (verifyResult.rowCount === 0) {
            return res.status(403).json({ error: 'You do not have admin permissions to update the status of this access.' });
        }

        // Update the shared access status
        const updateQuery = `
            UPDATE sharedaccess
            SET status = $1
            WHERE id = $2
        `;

        await db.query(updateQuery, [new_status, share_id]);

        res.status(200).json({
            message: 'Access status updated successfully.',
            share_id: share_id,
            new_status: new_status
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while updating the access status.' });
    }
});


module.exports = homeapp;