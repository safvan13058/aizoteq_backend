const express = require('express');
const dashboard = express.Router();
const db = require('./dbconnection');

const { validateJwt, authorizeRoles } = require('./middlewares/auth');
const { thingSchema } = require('./middlewares/validation');
const { s3, upload } = require('./middlewares/s3');

dashboard.get('/',(req,res)=>{
    res.send('dashboard working ')
  })
// API endpoint to count users
dashboard.get('/api/users/count', async (req, res) => {
    try {
        const result = await db.query('SELECT COUNT(*) AS user_count FROM Users');
        res.json({ user_count: result.rows[0].user_count });
    } catch (err) {
        console.error('Error querying the database:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint for full count
dashboard.get('/api/things/count', async (req, res) => {
    try {
        const result = await db.query('SELECT COUNT(*) AS total_count FROM Things');
        res.json({ total_count: result.rows[0].total_count });
    } catch (err) {
        console.error('Error querying the database:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint for sorted count by model
// dashboard.get('/api/things/model-count', async (req, res) => {
//     try {
//         const result = await db.query(`
//             SELECT 
//                 model, 
//                 COUNT(*) AS model_count,
//                 SUM(COUNT(*)) OVER () AS total_count
//             FROM Things
//             GROUP BY model
//             ORDER BY model_count DESC, model ASC
//         `);

//         res.json(result.rows);
//     } catch (err) {
//         console.error('Error querying the database:', err);
//         res.status(500).json({ error: 'Internal server error' });
//     }
// });

dashboard.get('/api/things/model-count', async (req, res) => {
    try {
        // Query to get grouped counts
        const groupedResult = await db.query(`
            SELECT model, COUNT(*) AS model_count
            FROM Things
            GROUP BY model
            ORDER BY model_count DESC, model ASC
        `);

        // Query to get the total count
        const totalResult = await db.query(`
            SELECT COUNT(*) AS total_count
            FROM Things
        `);

        const totalCount = totalResult.rows[0].total_count;

        // Add total count to the response
        res.json({
            total_count: totalCount,
            model_counts: groupedResult.rows
        });
    } catch (err) {
        console.error('Error querying the database:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


module.exports=dashboard;