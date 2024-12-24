app.post('/api/access/customer/:roomid', async (req, res) => {
    try {
        const roomid=req.params.roomid
        const user_id = req.user.id; // ID of the customer to whom access is being shared
        const { securitykey, serialno } = req.body; // Request body containing security key and serial number
        
        // Verify if the thing exists with the given serial number and security key
        const [verify] = await db.query(
            'SELECT * FROM things WHERE serialno = ? AND securityKey = ?',
            [serialno, securitykey]
        );

        if (!verify || verify.length === 0) {
            // If no matching record is found, return an error response
            return res.status(404).json({ message: "Thing not found or invalid security key" });
        }

        // Extract necessary information
        const thing_id = verify.id; // ID of the thing
        const key = verify.securityKey; // Security key of the thing

        // Insert into customer_access table
        await db.query(
            'INSERT INTO customer_access (user_id, email, thing_id, securitykey) VALUES (?, ?, ?, ?)',
            [user_id, null, thing_id, key]
        );

        const [room_device] = await db.query('select deviceid from device where thingId=?',[thing_id])

        const device_id =room_device.map(item => item.deviceid);

        await db.query(
            'INSERT INTO room_device(room_id , device_id) VALUES (?, ?)',
            [roomid,thingIds]
        )

        // Return a success response
        res.status(201).json({ message: "Access shared successfully" });
    } catch (error) {
        console.error("Error sharing access:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});