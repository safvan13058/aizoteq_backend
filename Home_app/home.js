const express = require('express');
const home = express.Router();
const db = require('./middlewares/dbconnection');
const { validateJwt, authorizeRoles } = require('./middlewares/auth');
const { thingSchema } = require('./middlewares/validation');
const { s3, upload } = require('./middlewares/s3');


home.get('/homeworking',(req,res)=>{
    res.send('homeworking')
})

home.post( '/app/add/home/',
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
            
             // Retrieve the ID of the inserted home
            const homeId =result.rows[0].id;

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