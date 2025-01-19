const express = require('express');
const testapp = express.Router();
const db = require('./middlewares/dbconnection');
const { validateJwt, authorizeRoles } = require('./middlewares/auth');
const { thingSchema } = require('./middlewares/validation');
const { s3, upload } = require('./middlewares/s3');
// create Security  key for things---------
 function SecurityKey(macAddress) {
    // Remove colons or hyphens and extract the last 6 digits of the MAC address
    const lastSixDigits = macAddress.replace(/[:-]/g, '').slice(-6);
    // Generate 4 random digits
    const randomDigits = Math.floor(1000 + Math.random() * 9000); // Random 4-digit number
    // Combine the random digits with the last 6 digits of the MAC address
    const randomKey = `${randomDigits}${lastSixDigits}`;
    return randomKey;
}

testapp.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'https://demo.ollinwon.com'); // Allow only the specified origin
    res.setHeader('Access-Control-Allow-Credentials', 'true'); // Allow cookies and credentials
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS'); // Specify allowed HTTP methods
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // Specify allowed headers
    if (req.method === 'OPTIONS') {
        return res.status(200).end(); // Handle preflight requests
    }
    next();
});
testapp.get('/testapp',(req,res)=>{
    res.send("testapp working")
})
// Protect the /app/addThing endpoint for admins and staff
testapp.post( "/app/addThing",
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
                            attr.attributeName,
                            name,
                            attr.attributeName,
                        ]);
                    

                    counter++;
                }
            }
            
            
         // Find associated raw materials for the model
           const rawMaterialsQuery = `
                      SELECT 
                        trm.raw_material_id, 
                        trm.required_qty, 
                        rm.stock_quantity, 
                        pt.model
                        FROM thing_raw_materials trm
                        INNER JOIN raw_materials_stock rm 
                        ON trm.raw_material_id = rm.id
                        INNER JOIN price_table pt 
                        ON trm.model_id = pt.id
                        WHERE pt.model = $1;
                        `;

                const rawMaterialsResult = await client.query(rawMaterialsQuery, [thing.model]);

                const insufficientStock = rawMaterialsResult.rows.filter(
                 (item) => item.stock_quantity < item.required_qty
                  );

            if (insufficientStock.length > 0) {
                throw new Error(
                  `Insufficient stock for raw materials: ${insufficientStock
                  .map((item) => item.raw_material_id)
                  .join(', ')}`
                 );
                }
          // Update stock quantities
           for (const material of rawMaterialsResult.rows) {
              const updateStockQuery = `
                 UPDATE raw_materials_stock
                  SET stock_quantity = stock_quantity - $1
                  WHERE id = $2;
                  `;
         await client.query(updateStockQuery, [material.required_qty, material.raw_material_id]);
     }

    // Handle AdminStock and Failed Devices if status is 'rework'
    if (status === 'rework') {

         // Validate failureReason
      if (!failureReason || typeof failureReason !== 'string' || failureReason.trim().length === 0) {
        return res.status(400).json({
            error: {
                code: "INVALID_FAILURE_REASON",
                message: "Failure reason must be provided and cannot be empty when the status is 'rework'.",
            },
        });
       }
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
 //display all things
 testapp.get('/api/display/things',
    // validateJwt,
    // authorizeRoles('admin,staff'), 
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

// display things with id
testapp.get('/api/display/things/:id',
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
  
//count the stock item with status is new , rework etc
testapp.get('/api/adminstock/:status/count', async (req, res) => {
    try {
        console.log("working");
        const { status } = req.params;
 
        // Ensure the status parameter is not empty and is a valid string
        if (!status || typeof status !== 'string') {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid or missing status parameter',
            });
        }

        // SQL query with parameterized value to prevent SQL injection
        const query = `
            SELECT COUNT(*) AS count
            FROM AdminStock
            WHERE status = $1
        `;

        // Execute the query with the status parameter
        const result = await db.query(query, [status]);

        // Check if result is returned
        if (result.rows.length > 0) {
            // Return the count of the records with the given status
            console.log("working success");
            res.status(200).json({
                status: 'success',
                count: result.rows[0].count,
            });
        } else {
            
            res.status(404).json({
                status: 'error',
                message: 'No records found with the specified status',
            });
        }
    } catch (error) {
        console.error('Error fetching count:', error);

        // Return an internal server error response
        res.status(500).json({
            status: 'error',
            message: 'Internal server error',
            details: error.message, // Include error details for debugging
        });
    }
});

testapp.get('/app/searchThings/:status',
     // validateJwt,
    // authorizeRoles("admin", "staff"), 
    async (req, res) => {
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
                t.batchId,
                t.lastModified,
                t.model,
                as_.status AS adminStockStatus,
                as_.addedby AS addedby,
                tfd.failureReason,
                tfd.fixed_by,
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

//display thing with status "new","rework",etc.. and search on serialno
testapp.get('/api/searchThings/working/:status', async (req, res) => {
    const { serialno } = req.query;
    const { status } = req.params;


    try {
        // Default to showing all records with 'rework' status if no serialno is provided
        let query = `
            SELECT 
                t.id AS thing_id,
                t.thingName,
                t.createdby,
                t.batchId,
                t.model,
                t.securityKey,
                t.serialno,
                a.status AS admin_stock_status,
                a.addedAt,
                a.addedby,
                tf.failureReason,
                tf.fixed_by,
                tf.loggedAt
            FROM Things t
            LEFT JOIN AdminStock a ON t.id = a.thingId
            LEFT JOIN TestFailedDevices tf ON t.id = tf.thingId
            WHERE a.status = $1
        `;
        
        // If serialno is provided, modify the query to filter by serialno using ILIKE
        if (serialno) {
            query += ` AND t.serialno ILIKE $2`;
        }

        // Log the query and parameters for debugging
        console.log('Executing query:', query);
        console.log('Query parameters:', serialno ? [status, `%${serialno}%`] : [status]);

        // Execute the query with appropriate parameters
        const result = await db.query(query, serialno ? [status, `%${serialno}%`] : [status]);

        // Check if results exist
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No matching records found' });
        }

        // Return results
        res.json(result.rows);
    } catch (err) {
        // Log the full error for debugging
        console.error('Error executing query', err);

        // Respond with more detailed error information
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    }
});

// 
testapp.get('/api/adminstock/search/:model',
     // validateJwt,
    // authorizeRoles("admin", "staff"), 
    async (req, res) => {
    const { page = 1, limit = 10, status } = req.query; // Extract query params with defaults
    const { model } = req.params;

    // Define allowed status values    const allowedStatuses = ['new', 'returned', 'rework', 'exchange'];

    if (!model) {
        return res.status(400).json({ error: 'Model is required' });
    }

    // Check if the status is provided and valid (commented out, but can be uncommented if validation is required)
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
                adminStock.*, 
                t.*, -- Fetch all details from the Things table
                tfd.failureReason 
            FROM AdminStock adminStock
            JOIN Things t ON adminStock.thingId = t.id
            LEFT JOIN TestFailedDevices tfd ON adminStock.thingId = tfd.thingId 
            WHERE t.model = $1
        `;

        // Add status condition if status is provided
        const queryParams = [model];
        if (status) {
            // Only apply the status filter if a status is provided
            query += ` AND adminStock.status = $2`;
            queryParams.push(status);
        }

        // Finalize query with pagination
        query += `
            ORDER BY adminStock.addedAt DESC
            LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2};
        `;

        // Add pagination parameters to the query
        queryParams.push(limitNumber, offset);

        // Execute the query
        const result = await db.query(query, queryParams);

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

// update status of adminstoke
testapp.put("/api/update_adminstock/status/:thingId", 
     // validateJwt,
    // authorizeRoles("admin", "staff"), 
    async (req, res) => {
        console.log(req.body)
    const  {thingId} =req.params
    const { status } = req.body;
    const  fixedBy= req.user?.username ||req.body.fixedBy;
  
    // Input validation
    if (!thingId || !status || !fixedBy) {
      return res.status(400).json({ error: "thingId, status, and fixedBy are required" });
    }
  
    const client = await db.connect(); // Connect to the database
    try {
      // Start a transaction
      await client.query("BEGIN");
  
      // Update the status in AdminStock
      const updateAdminStockQuery = `
        UPDATE AdminStock
        SET status = $1
        WHERE thingId = $2
      `;
      const adminStockResult = await client.query(updateAdminStockQuery, [status, thingId]);
  
      if (adminStockResult.rowCount === 0) {
        throw new Error("No matching record found in AdminStock for the given thingId");
      }
  
      // Update the fixed_by column in TestFailedDevices
      const updateTestFailedDevicesQuery = `
        UPDATE TestFailedDevices
        SET fixed_by = $1
        WHERE thingId = $2
      `;
      const testFailedDevicesResult = await client.query(updateTestFailedDevicesQuery, [fixedBy, thingId]);
  
      if (testFailedDevicesResult.rowCount === 0) {
        throw new Error("No matching record found in TestFailedDevices for the given thingId");
      }
  
      // Commit the transaction
      await client.query("COMMIT");
  
      res.status(200).json({
        message: "AdminStock status and TestFailedDevices fixed_by updated successfully",
      });
    } catch (err) {
      // Rollback the transaction in case of an error
      await client.query("ROLLBACK");
      console.error("Error:", err.message);
      res.status(500).json({ error: "An error occurred", details: err.message });
    } finally {
      client.release(); // Release the client back to the pool
    }
  });

testapp.get('/api/recent/adminstock/activities', async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1; // Default to page 1
        const limit = parseInt(req.query.limit, 10) || 10; // Default to 10 records per page

        if (page < 1 || limit < 1) {
            return res.status(400).json({ error: 'Invalid page or limit value. Both must be positive integers.' });
        }

        const offset = (page - 1) * limit;

        const dataQuery = `
            SELECT 
                t.id AS thing_id,
                t.thingName,
                t.serialno,
                t.batchId,
                t.model,
                a.addedAt,
                a.status AS admin_stock_status,
                COALESCE(a.addedBy, 'Unknown') AS addedBy, -- Handle NULL in addedBy
                COALESCE(u.userName, 'Unknown') AS addedByUserName, -- Handle NULL in userName
                tf.fixed_by,
                tf.failureReason
            FROM AdminStock a
            JOIN Things t ON a.thingId = t.id
            LEFT JOIN TestFailedDevices tf ON t.id = tf.thingId
            LEFT JOIN Users u ON a.addedBy = u.userName
            ORDER BY a.addedAt DESC
            LIMIT $1 OFFSET $2;
        `;
        const result = await db.query(dataQuery, [limit, offset]);

        const countQuery = `
            SELECT COUNT(*) AS total
            FROM AdminStock a
            JOIN Things t ON a.thingId = t.id
            LEFT JOIN TestFailedDevices tf ON t.id = tf.thingId;
        `;
        const countResult = await db.query(countQuery);
        const total = parseInt(countResult.rows[0].total, 10);
        const totalPages = Math.ceil(total / limit);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No devices found in AdminStock' });
        }

        res.status(200).json({
            page,
            limit,
            total,
            totalPages,
            data: result.rows,
        });
    } catch (error) {
        console.error('Error fetching data from database:', error.message);
        res.status(500).json({
            error: 'Internal Server Error',
            details: error.message,
        });
    }
});

// DELETE endpoint to delete a Thing by ID
testapp.delete('/api/delete/things/:id',
     // validateJwt,
    // authorizeRoles("admin", "staff"), 
     async (req, res) => {
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
testapp.delete('/api/delete/all/things',
     async (req, res) => {
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

//search details of thing adminstock test with 
testapp.get('/api/search/things', async (req, res) => {
    const { searchTerm, page = 1, pageSize = 10 } = req.query;
  
    if (!searchTerm) {
      return res.status(400).json({ error: 'Search term is required' });
    }
  
    const offset = (page - 1) * pageSize;
    const limit = parseInt(pageSize, 10);
  
    try {
      // Query to fetch the paginated results along with the total count
      const result = await db.query(
        `
        WITH search_results AS (
          SELECT
            t.id AS thingId,
            t.thingName,
            t.batchId,
            t.latitude,
            t.longitude,
            t.model,
            t.serialno,
            t.type,
            t.securityKey,
            t.lastModified,
            a.id AS adminStockId,
            a.addedAt,
            a.addedBy,
            a.status AS adminStockStatus,
            f.id AS failedDeviceId,
            f.failureReason,
            f.fixed_by AS fixedBy,
            f.loggedAt AS failureLoggedAt,
            COUNT(*) OVER () AS totalCount
          FROM
            Things t
          LEFT JOIN
            AdminStock a ON t.id = a.thingId
          LEFT JOIN
            TestFailedDevices f ON t.id = f.thingId
          WHERE
            (
              t.thingName ILIKE $1 OR
              t.batchId ILIKE $1 OR
              t.model ILIKE $1 OR
              t.serialno ILIKE $1 OR
              a.status ILIKE $1 OR
              a.addedBy ILIKE $1 OR
              f.failureReason ILIKE $1 OR
              f.fixed_by ILIKE $1
            )
        )
        SELECT
          *
        FROM
          search_results
        ORDER BY
          thingId
        LIMIT $2 OFFSET $3;
        `,
        [`%${searchTerm}%`, limit, offset]
      );
  
      const rows = result.rows;
      console.log(rows)
      const totalCount = rows.length;
      console.log(totalCount)
      res.status(200).json({
       
        pagination: {
          page: parseInt(page, 10),
          pageSize: limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
        data: rows,
      });
    } catch (err) {
      console.error('Error querying database:', err.message);
      res.status(500).json({ error: 'An error occurred while searching', details: err.message });
    }
  });

testapp.get('/api/display/thingattribute/:serialno', 
    // validateJwt,
    // authorizeRoles('admin', 'staff'),
    async (req, res) => {
        const serialno = req.params.serialno; // Get the serialno from the route parameter
        const page = parseInt(req.query.page, 10) || 1; // Default to page 1
        const limit = parseInt(req.query.limit, 10) || 10; // Default to 10 records per page

        // Validate serialno
        if (!serialno) {
            return res.status(400).json({ error: 'Invalid or missing serialno parameter' });
        }

        if (page < 1 || limit < 1) {
            return res.status(400).json({ error: 'Invalid page or limit value' });
        }

        try {
            const offset = (page - 1) * limit; // Calculate offset for the query

            // Fetch the thingid using the serialno
            const thingQuery = 'SELECT id FROM Things WHERE serialno = $1';
            const thingResult = await db.query(thingQuery, [serialno]);

            if (thingResult.rows.length === 0) {
                return res.status(404).json({ error: 'No thing found with the given serialno' });
            }

            const thingid = thingResult.rows[0].id; // Get the thingid from the result

            // Fetch paginated records from ThingAttributes
            const query = `
                SELECT * FROM ThingAttributes
                WHERE thingId = $1
                ORDER BY id ASC
                LIMIT $2 OFFSET $3
            `;
            const values = [thingid, limit, offset];
            const result = await db.query(query, values);

            // Fetch total count for the thingId
            const countQuery = 'SELECT COUNT(*) AS total FROM ThingAttributes WHERE thingId = $1';
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
                res.status(404).json({ message: 'No attributes found for the given serialno' });
            }
        } catch (error) {
            // Log the full error for debugging
            console.error('Error fetching paginated thing attributes:', error);

            // Respond with a generic error
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
);
//display things with  status
testapp.get('/api/display/status/:status',
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
//display devices with thingid
testapp.get('/api/display/devices/:thingid', 
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


module.exports = testapp;