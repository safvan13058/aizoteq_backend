-- Table to store users
CREATE TABLE Users (
    id SERIAL PRIMARY KEY,
    userName VARCHAR(255) NOT NULL,
    jwtsub VARCHAR(255) UNIQUE,
    userRole VARCHAR(255),
    name VARCHAR(255),
    profilePic TEXT,
    phone VARCHAR(15),
    -- Address TEXT, 
    lastModified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table to store things
CREATE TABLE Things (
    id SERIAL PRIMARY KEY,
    thingName VARCHAR(255) NOT NULL,
    createdBy VARCHAR(255), -- User who created the thing
    batchId VARCHAR(255), -- Batch ID
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    model VARCHAR(255),
    serialno VARCHAR(255),
    macaddress varchar(255),
    type VARCHAR(255),
    securityKey VARCHAR(255) UNIQUE,
    lastModified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    added_at TIMESTAMP
);

-- Table to store attributes of things
-- CREATE TABLE ThingAttributes (
--     id SERIAL PRIMARY KEY,
--     thingId INT,
--     attributeName VARCHAR(255), -- e.g., 'light', 'fan', 'plug', 'trm'
--     attributeValue VARCHAR(255), -- e.g., '1', '2', '3', '4'
--     lastModified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     FOREIGN KEY (thingId) REFERENCES Things(id)
-- );

CREATE TABLE ThingAttributes (
    id SERIAL PRIMARY KEY,
    thingId INT,
    attributeName VARCHAR(255), -- e.g., 'light', 'fan', 'plug', 'trm'
    attributeValue VARCHAR(255), -- e.g., '1', '2', '3', '4'
    lastModified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (thingId) REFERENCES Things(id) ON DELETE CASCADE
);
-- Table to store device information
CREATE TABLE Devices (
    id SERIAL PRIMARY KEY,
    thingId INT, -- Foreign key linking Devices to Things
    deviceId VARCHAR(255) NOT NULL UNIQUE,
    macAddress VARCHAR(255),
    hubIndex VARCHAR(255),
    createdBy VARCHAR(255),
    enable BOOLEAN,
    status VARCHAR(255) CHECK (status IN ('new', 'returned', 'rework', 'exchange')), -- Status of the device
    icon VARCHAR(255),
    name VARCHAR(255),
    type VARCHAR(255),
    lastModified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (thingId) REFERENCES Things(id)
);

-- Table to store admin stock information
-- CREATE TABLE AdminStock (
--     id SERIAL PRIMARY KEY,
--     thingId INT,
--     addedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     addedBy VARCHAR(255), -- User who added the device to AdminStock
--     status VARCHAR(255) CHECK (status IN ('new', 'returned', 'rework', 'exchange')), -- Device status in stock
--     FOREIGN KEY (thingId) REFERENCES Things(id),
--     FOREIGN KEY (addedBy) REFERENCES Users(userName),
-- ); 
CREATE TABLE AdminStock (
    id SERIAL PRIMARY KEY,
    thingId INT,
    addedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    addedBy VARCHAR(255), -- User who added the device to AdminStock
    status VARCHAR(255) CHECK (status IN ('new', 'returned', 'rework', 'exchange')), -- Device status in stock
    FOREIGN KEY (thingId) REFERENCES Things(id) ON DELETE SET NULL
);

-- Table to store home information
-- CREATE TABLE HOME (
--     id SERIAL PRIMARY KEY, -- Auto-incrementing primary key
--     userid INT NOT NULL,
--     name VARCHAR(255) NOT NULL, -- Name of the home
--     created_by VARCHAR(255), -- Creator of the entry
--     last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Last modification timestamp
--     FOREIGN KEY (userid) REFERENCES Users(id)
-- );
CREATE TABLE HOME (
    id SERIAL PRIMARY KEY, -- Auto-incrementing primary key
    userid INT NOT NULL,
    name VARCHAR(255) NOT NULL, -- Name of the home
    created_by VARCHAR(255), -- Creator of the entry
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Last modification timestamp
    FOREIGN KEY (userid) REFERENCES Users(id) ON DELETE CASCADE
);

-- Table to store floor information
CREATE TABLE floor (
    id SERIAL PRIMARY KEY, -- Auto-incrementing primary key
    home_id INT NOT NULL, -- Foreign key referencing home table
    floor_index INT NOT NULL, -- Index of the floor
    name VARCHAR(255) NOT NULL, -- Name of the floor
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Last modification timestamp
    FOREIGN KEY (home_id) REFERENCES HOME(id) ON DELETE CASCADE
);

-- Table to store room information
CREATE TABLE room (
    id SERIAL PRIMARY KEY,      -- Auto-incrementing primary key
    home_id INT  NULL,          -- Foreign key referencing home table
    floor_id INT NOT NULL,      -- Foreign key referencing floor table
    name VARCHAR(255) NOT NULL, -- Name of the room
    alias_name VARCHAR(255),    -- Alias name for the room
    image_url VARCHAR(2083),    -- URL to an image of the room
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Last modification timestamp
    FOREIGN KEY (home_id) REFERENCES HOME(id) ON DELETE CASCADE,
    FOREIGN KEY (floor_id) REFERENCES floor(id) ON DELETE CASCADE
);

-- Table to store customer access information
CREATE TABLE customer_access (
    id SERIAL PRIMARY KEY, -- Auto-incrementing primary key
    user_id INT NOT NULL, -- Foreign key referencing users(id)
    email VARCHAR(255), -- Email column (optional)
    thing_id INT NOT NULL, -- Foreign key referencing things(id)
    securityKey VARCHAR(255) NOT NULL, -- Must match things(securityKey)
    FOREIGN KEY (user_id) REFERENCES Users(id),
    FOREIGN KEY (thing_id) REFERENCES things(id) ON DELETE CASCADE,
    FOREIGN KEY (securityKey) REFERENCES things(securityKey) ON DELETE CASCADE
);


-- Table to store room-device mappings
CREATE TABLE room_device (
    id SERIAL PRIMARY KEY, -- Auto-incrementing primary key
    room_id INT NOT NULL, -- Foreign key referencing room table
    device_id VARCHAR(255) NOT NULL, -- Foreign key referencing device table
    FOREIGN KEY (room_id) REFERENCES room(id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES devices(deviceid) ON DELETE CASCADE
);


-- Table to store Scenes
CREATE TABLE Scenes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    aliasName VARCHAR(255),
    createdBy VARCHAR(255),
    icon VARCHAR(2555),
    type VARCHAR(255),
    favorite BOOLEAN DEFAULT FALSE,
    enable BOOLEAN DEFAULT TRUE,
    user_id INTEGER REFERENCES Users(id) ON DELETE CASCADE,
    lastModified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE scene_device (
    id SERIAL PRIMARY KEY,
    device_id INTEGER NOT NULL REFERENCES Devices(id) ON DELETE CASCADE,
    scene_id INTEGER NOT NULL REFERENCES Scenes(id) ON DELETE CASCADE,
    name VARCHAR(255),
    type VARCHAR(255),
    status VARCHAR(255)
);

CREATE TABLE SceneEvent (
    id SERIAL PRIMARY KEY,                    -- Auto-incrementing primary key
    sceneId INT NOT NULL,                     -- Foreign key to Scenes table
    deviceId INT NOT NULL,                    -- Foreign key to Devices table
    action VARCHAR(255) NOT NULL,             -- Action performed (e.g., "ON", "OFF", etc.)
    eventTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Timestamp of the event
    FOREIGN KEY (sceneId) REFERENCES Scenes(id) ON DELETE CASCADE, -- Cascade delete with Scenes table
    FOREIGN KEY (deviceId) REFERENCES Devices(id) ON DELETE CASCADE -- Cascade delete with Devices table
);



CREATE TABLE UserDevicesorder (
    userId INT NULL REFERENCES Users(id) ON DELETE CASCADE,
    roomid INT NOT NULL REFERENCES room(id) ON DELETE CASCADE,
    device_id INT NOT NULL REFERENCES Devices(id) ON DELETE CASCADE,
    orderIndex INT NOT NULL,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE UserRoomOrder (
    user_id INT NULL, -- Foreign key to Users table
    floor_id INT NOT NULL, -- Foreign key to Floor table
    room_id INT NOT NULL, -- Foreign key to Room table
    orderIndex INT NOT NULL, -- Order index for sorting
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Define foreign keys
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    CONSTRAINT fk_floor FOREIGN KEY (floor_id) REFERENCES Floor(id) ON DELETE CASCADE,
    CONSTRAINT fk_room FOREIGN KEY (room_id) REFERENCES Room(id) ON DELETE CASCADE
);

CREATE TABLE UserFavoriteDevices (
    id SERIAL PRIMARY KEY,               -- Auto-incrementing primary key
    user_id INT NOT NULL,                -- Foreign key to Users table
    device_id INT NOT NULL,              -- Foreign key to Devices table
    favorite BOOLEAN DEFAULT FALSE,      -- Indicates if the device is a favorite
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Tracks the last modification
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    CONSTRAINT fk_device FOREIGN KEY (device_id) REFERENCES Devices(id) ON DELETE CASCADE
);

CREATE TABLE TestFailedDevices (
    id SERIAL PRIMARY KEY, -- Unique identifier for each failed device log
    thingId INT NOT NULL, -- Foreign key linking to Things table
    failureReason TEXT NOT NULL, -- Description of the failure
    fixed_by VARCHAR(255) DEFAULT NULL, -- Stores the identifier of the person who fixed the device, default is NULL
                    
    loggedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Timestamp of when the failure was logged
    FOREIGN KEY (thingId) REFERENCES Things(id) ON DELETE CASCADE -- Automatically delete when the associated Thing is deleted
);

CREATE TABLE UserFCMTokens (
    id SERIAL PRIMARY KEY,                 -- Auto-incrementing primary key
    userId INT NOT NULL,                   -- Foreign key to Users table
    fcmToken TEXT NOT NULL,                -- Firebase Cloud Messaging token
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Timestamp of when the token was created
    FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE -- Cascading delete with Users table
);

CREATE TABLE Notifications (
    id SERIAL PRIMARY KEY,                    -- Auto-incrementing primary key
    userId INT NOT NULL,                      -- Foreign key to Users table
    deviceId INT NOT NULL,                    -- Foreign key to Devices table
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Timestamp of notification creation
    FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE, -- Cascade delete if user is deleted
    FOREIGN KEY (deviceId) REFERENCES Devices(id) ON DELETE CASCADE -- Cascade delete if device is deleted
);

CREATE TABLE NotificationMessages (
    id SERIAL PRIMARY KEY,                    -- Auto-incrementing primary key
    notificationId INT NOT NULL,              -- Foreign key to Notifications table
    message TEXT NOT NULL,                    -- Message content of the notification
    FOREIGN KEY (notificationId) REFERENCES Notifications(id) ON DELETE CASCADE -- Cascade delete if notification is deleted
);

-- Create sharedusers table
-- CREATE TABLE sharedusers (
--     id SERIAL PRIMARY KEY,                              -- Unique identifier for each record
--     user_id INT NOT NULL,                               -- Foreign key referencing users table
--     entity_id INT NOT NULL,                             -- ID of the shared entity
--     entity_type VARCHAR(255) NOT NULL,                 -- Type of the entity (e.g., document, folder, etc.)
--     access_type VARCHAR(50) NOT NULL,                  -- Type of access (e.g., read, write, admin, etc.)
--     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE -- Enforces relationship with users table
-- );

CREATE TABLE sharedusers (
    id SERIAL PRIMARY KEY,              -- Unique identifier for each share access record
    user_id INT NOT NULL,               -- Foreign key referencing Users table (user sharing the entity)
    shared_with_user_email VARCHAR(255), -- The email address of the user being shared with
    entity_id INT NOT NULL,             -- ID of the shared entity (home, floor, or room)
    entity_type VARCHAR(50) NOT NULL,   -- The type of entity ('home', 'floor', or 'room')
    access_type VARCHAR(50) NOT NULL,   -- Access type ('read', 'write', 'admin')
    status VARCHAR(50) DEFAULT 'pending', -- Status of the sharing request ('pending', 'accepted', 'rejected')
    shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Timestamp of when the share was created
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IntegrationSettings (
    id SERIAL PRIMARY KEY,
    userId INT NOT NULL, -- Foreign key referencing Users(id)
    integrationType VARCHAR(255) NOT NULL,
    settings JSON NOT NULL, -- Settings stored as JSON
    lastModified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
);


CREATE TABLE DeviceMapping (
    id SERIAL PRIMARY KEY,
    deviceId INT NOT NULL, -- Foreign key referencing Devices(id)
    integrationType VARCHAR(255) NOT NULL,
    integrationId INT NOT NULL, -- Foreign key referencing IntegrationSettings(id)
    lastModified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (deviceId) REFERENCES Devices(id) ON DELETE CASCADE,
    FOREIGN KEY (integrationId) REFERENCES IntegrationSettings(id) ON DELETE CASCADE
);

--------------------------------------------------------------
CREATE TABLE dealersStock (
    id SERIAL PRIMARY KEY, 
    thingid INT,  -- Can be NULL if the referenced `thingid` is deleted
    user_id INT,  -- Can be NULL if the referenced `user_id` is deleted
    status VARCHAR(20) NOT NULL CHECK (status IN ('new', 'returned', 'rework', 'exchange')), 
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Timestamp of when the record was added
    added_id INT,  -- Possible reference to a user who added the entry
    added_by VARCHAR(100) NOT NULL, -- Username of the person who added the record
    
    CONSTRAINT fk_things_id FOREIGN KEY (thingid) REFERENCES things(id) ON DELETE SET NULL,  
    CONSTRAINT fk_users_id FOREIGN KEY (user_id) REFERENCES dealers_details(id) ON DELETE SET NULL
);


CREATE TABLE customersStock (
    id SERIAL PRIMARY KEY,             -- Unique identifier for each record
    thingid INT,                        -- Allow NULL if referenced thing is deleted
    user_id INT,                        -- Allow NULL if referenced user is deleted
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Timestamp of when the record was added
    added_id INT,
    added_by VARCHAR(100) NOT NULL,    -- Username of the person who added the record
    status VARCHAR(20) NOT NULL CHECK (status IN ('new', 'returned', 'rework', 'exchange')),  

    -- Foreign key constraints with ON DELETE SET NULL
    CONSTRAINT fk_things_id FOREIGN KEY (thingid) REFERENCES things(id) ON DELETE SET NULL,    
    CONSTRAINT fk_users_id FOREIGN KEY (user_id) REFERENCES customers_details(id) ON DELETE SET NULL
);
CREATE TABLE onlinecustomerStock (
    id SERIAL PRIMARY KEY, 
    thingid INT,  -- Can be NULL if the referenced `thingid` is deleted
    user_id INT,  -- Can be NULL if the referenced `user_id` is deleted
    status VARCHAR(20) NOT NULL CHECK (status IN ('new', 'returned', 'rework', 'exchange')), 
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Timestamp of when the record was added
    added_id INT,  -- Possible reference to a user who added the entry
    added_by VARCHAR(100) NOT NULL, -- Username of the person who added the record
    
    CONSTRAINT fk_things_id FOREIGN KEY (thingid) REFERENCES things(id) ON DELETE SET NULL,  
    CONSTRAINT fk_users_id FOREIGN KEY (user_id) REFERENCES onlinecustomer_details(id) ON DELETE SET NULL
);
  
-- Create customer_details table
CREATE TABLE onlinecustomer_details (
    id SERIAL PRIMARY KEY,                      -- Unique identifier for each record
    name VARCHAR(255) NOT NULL,                 -- Name of the customer
    addedby INT,
    address TEXT NOT NULL,                      -- Address of the customer
    email VARCHAR(255) NULL,
    phone VARCHAR(15) NOT NULL,                 -- Primary phone number
    alt_phone VARCHAR(15),                      -- Alternate phone number (optional)
    total_amount NUMERIC(10, 2),                -- Total amount associated with the customer
    paid_amount NUMERIC(10, 2) DEFAULT 0,               
    balance NUMERIC(10, 2),                     -- Balance amount for the customer
    refund_amount NUMERIC(10, 2) DEFAULT 0,
    lastmodified TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Automatically track last modification
    CONSTRAINT fk_addedbyFOREIGN KEY (addedby)REFERENCES Users(id)ON DELETE SET NULL;
    
);
-- Create customer_details table
-- Create customers_details table
CREATE TABLE customers_details (
    id SERIAL PRIMARY KEY,                      -- Unique identifier for each record
    name VARCHAR(255) NOT NULL,                 -- Name of the customer
    addedby INT,                                -- User who added the customer
    address TEXT NOT NULL,                      -- Address of the customer
    email VARCHAR(255) NULL,                    
    phone VARCHAR(15) NOT NULL,                 -- Primary phone number
    alt_phone VARCHAR(15),                      -- Alternate phone number (optional)
    total_amount NUMERIC(10, 2),                -- Total amount associated with the customer
    paid_amount NUMERIC(10, 2) DEFAULT 0, 
    balance NUMERIC(10, 2),                     -- Balance amount for the customer
    refund_amount NUMERIC(10, 2) DEFAULT 0,
    lastmodified TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Automatically track last modification
    
    -- Foreign key constraint
    CONSTRAINT fk_addedby FOREIGN KEY (addedby) REFERENCES Users(id) ON DELETE SET NULL
);

CREATE TABLE onlinecustomer_details (
    id SERIAL PRIMARY KEY,                      -- Unique identifier for each record
    name VARCHAR(255) NOT NULL,                 -- Name of the customer
    addedby INT,                                -- User who added the customer
    address TEXT NOT NULL,                      -- Address of the customer
    email VARCHAR(255) NULL,                    
    phone VARCHAR(15) NOT NULL,                 -- Primary phone number
    alt_phone VARCHAR(15),                      -- Alternate phone number (optional)
    total_amount NUMERIC(10, 2),                -- Total amount associated with the customer
    paid_amount NUMERIC(10, 2) DEFAULT 0, 
    balance NUMERIC(10, 2),                     -- Balance amount for the customer
    refund_amount NUMERIC(10, 2) DEFAULT 0,
    lastmodified TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Automatically track last modification
    
    -- Foreign key constraint
    CONSTRAINT fk_addedby FOREIGN KEY (addedby) REFERENCES Users(id) ON DELETE SET NULL
);
-- Create dealers_details table
CREATE TABLE dealers_details (
    id SERIAL PRIMARY KEY,                      -- Unique identifier for each record
    addedby INT,
    name VARCHAR(255) NOT NULL,                 -- Name of the dealer
    address TEXT NOT NULL,                      -- Address of the dealer
    email VARCHAR(255) NULL,
    phone VARCHAR(15) NOT NULL,                 -- Primary phone number
    alt_phone VARCHAR(15),                      -- Alternate phone number (optional)
    total_amount NUMERIC(10, 2),                -- Total amount associated with the dealer
    paid_amount NUMERIC(10, 2) DEFAULT 0, 
    balance NUMERIC(10, 2),                     -- Balance amount for the dealer
    refund_amount NUMERIC(10, 2) DEFAULT 0,
    lastmodified TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Automatically track last modification
    
    CONSTRAINT fk_addedby FOREIGN KEY (addedby) REFERENCES Users(id) ON DELETE SET NULL
);

CREATE TABLE dealers_store (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    GSTIN VARCHAR(15) NULL UNIQUE,
    logo VARCHAR(2080),
    user_id INT NOT NULL,
    CONSTRAINT fk_user FOREIGN KEY (user_id) 
        REFERENCES users(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
);
-- Create price_table
CREATE TABLE price_table (
    id SERIAL PRIMARY KEY,                      -- Unique identifier for each row
    model VARCHAR(255) NOT NULL,                -- Model name or identifier
    mrp NUMERIC(10, 2) NOT NULL,                -- Maximum retail price
    retail_price NUMERIC(10, 2)  NULL,       -- Actual retail price
    sgst NUMERIC(5, 2) DEFAULT 0.00, -- State GST as a percentage
    cgst NUMERIC(5, 2) DEFAULT 0.00,
    igst NUMERIC(5, 2) DEFAULT 0.00,
    discount NUMERIC(10, 2), 
    warranty_period INTERVAL DEFAULT INTERVAL '3 years',                -- Discount applied (optional)
    lastmodified TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Automatically track last modification
    
);
CREATE TABLE billing_receipt (
    id SERIAL PRIMARY KEY, 
    created_by INT NOT NULL REFERENCES Users(id),
    session_id INT NOT NULL REFERENCES billing_session(id), 
    receipt_no VARCHAR(50) NOT NULL UNIQUE,           -- Receipt number
    name VARCHAR(255) NOT NULL,                       -- Customer or dealer name
    phone VARCHAR(15) NOT NULL,                       -- Primary phone number
    email VARCHAR(255) NULL,
    billing_address TEXT NOT NULL,                    -- Billing address
    shipping_address TEXT,                            -- Shipping address (optional)
    dealer_or_customer VARCHAR(100) NOT NULL,        -- Indicates dealer or customer
    total_amount NUMERIC(10, 2) NOT NULL,            -- Total billed amount
    paid_amount NUMERIC(10, 2) DEFAULT 0,  
    balance NUMERIC(10, 2),                          -- Remaining balance to be paid
    discount NUMERIC(10, 2),  
    payable_amount NUMERIC(10, 2),               
    billing_createdby VARCHAR(255) NOT NULL,         -- Name or ID of the creator
    dealers_id INT,
    customers_id INT, 
    onlinecustomer_id INT,      
    type VARCHAR(50),
    datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,    -- Timestamp for billing or transaction date
    lastmodified TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Automatically track last modification  
);


-- Add a trigger to automatically update `lastmodified` for billing_receipt
CREATE OR REPLACE FUNCTION update_billing_receipt_lastmodified()
RETURNS TRIGGER AS $$
BEGIN
    NEW.lastmodified = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_billing_receipt_lastmodified
BEFORE UPDATE ON billing_receipt
FOR EACH ROW
EXECUTE FUNCTION update_billing_receipt_lastmodified();

-- Create payment_details table
CREATE TABLE payment_details (
    id SERIAL PRIMARY KEY,                             -- Unique identifier for each payment record
    receipt_id INT NOT NULL,                           -- Links to the `billing_receipt` table
    payment_method VARCHAR(10) NOT NULL CHECK (payment_method IN ('cash', 'online', 'bank')), -- Payment method
    amount NUMERIC(10, 2) NOT NULL,                    -- Amount paid for this method
    FOREIGN KEY (receipt_id) REFERENCES billing_receipt(id) ON DELETE CASCADE
);

-- Create billing_items table
CREATE TABLE billing_items (
    id SERIAL PRIMARY KEY,                             -- Unique identifier for each record
    receipt_no VARCHAR(50) NOT NULL,                  -- Foreign key referencing `billing_receipt`
    item_name VARCHAR(255) NULL,                      -- Name or description of the item
    model VARCHAR(255) NOT NULL,                      -- Model of the item
    mrp NUMERIC(10, 2) NOT NULL,                      -- Maximum Retail Price (MRP)
    serial_no VARCHAR(255) NOT NULL,                  -- Serial number of the item
    retail_price NUMERIC(10, 2)  NULL,             -- Retail price of the item
    item_discount NUMERIC(10, 2) DEFAULT 0,
    sgst NUMERIC(10, 2) DEFAULT 0,
    cgst NUMERIC(10, 2) DEFAULT 0,
    igst NUMERIC(10, 2) DEFAULT 0,
    final_price NUMERIC(10, 2),
    type VARCHAR(50),                                 -- Type of item
    
    -- Foreign key constraint with ON DELETE CASCADE
    CONSTRAINT fk_receipt_no FOREIGN KEY (receipt_no) REFERENCES billing_receipt(receipt_no) ON DELETE CASCADE
);

CREATE TABLE thing_warranty (
    id SERIAL PRIMARY KEY,                      -- Unique identifier for the warranty record
    serial_no VARCHAR(50) NOT NULL,             -- Serial number of the thing
    receipt_id INT NOT NULL,                    -- ID of the associated receipt (foreign key to billing_receipt table)
    date DATE DEFAULT CURRENT_DATE,             -- Date when the warranty starts (default: current date)
    due_date DATE NOT NULL,                     -- Warranty expiration date
    FOREIGN KEY (receipt_id) REFERENCES billing_receipt(id) ON DELETE CASCADE
);

--  Table: billing_session
CREATE TABLE billing_session (
    id SERIAL PRIMARY KEY,
    session_date DATE NOT NULL DEFAULT CURRENT_DATE,  -- Date of session
    user_id INT,
    opened_by VARCHAR(255) NOT NULL,                 -- User who opened
    opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,   -- Opening timestamp
    closed_by VARCHAR(255),                          -- User who closed
    closed_at TIMESTAMP,                             -- Closing timestamp
    status VARCHAR(20) NOT NULL DEFAULT 'open',      -- Session status
    total_cash NUMERIC(10, 2) DEFAULT 0,             -- Total cash collected in session
    total_bank NUMERIC(10, 2) DEFAULT 0,             -- Total bank payments collected
    total_online NUMERIC(10, 2) DEFAULT 0,           -- Total online payments collected
    total_sales NUMERIC(10, 2) DEFAULT 0,            -- Total sales for the session
    
    -- Foreign key with ON DELETE SET NULL
    CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE daily_report (
    id SERIAL PRIMARY KEY,                       -- Unique identifier for the report
    session_id INT NOT NULL,                     -- Links to the session in `billing_session`
    total_transactions INT DEFAULT 0,           -- Total number of transactions in the session
    total_sales NUMERIC(10, 2) DEFAULT 0,       -- Total sales amount
    total_discount NUMERIC(10, 2) DEFAULT 0,    -- Total discount given
    total_paid NUMERIC(10, 2) DEFAULT 0,        -- Total amount paid
    total_cash NUMERIC(10, 2) DEFAULT 0,        -- Total cash collected
    total_bank NUMERIC(10, 2) DEFAULT 0,        -- Total bank payments collected
    total_online NUMERIC(10, 2) DEFAULT 0,      -- Total online payments collected
    report_date DATE DEFAULT CURRENT_DATE,      -- Date of the report
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Timestamp when the report was created
    FOREIGN KEY (session_id) REFERENCES billing_session(id) ON DELETE CASCADE -- Links to `billing_session`
);


-------------------------------
-- CREATE TABLE raw_materials_stock (
--     id SERIAL PRIMARY KEY,        -- Unique identifier, automatically increments
--     Component VARCHAR(255) NOT NULL,    -- Name of the raw material
--     category VARCHAR(100),   -- Category (e.g., capacitor, resistor)
--     package VARCHAR(100),        
--     value VARCHAR(100),            -- Value or cost of the raw material
--     reference_no VARCHAR(100),     -- Reference number (ensures uniqueness)
--     unit_price_in_rupees DECIMAL(10, 2) DEFAULT 0.00,
--     unit_price_in_dollars DECIMAL(10, 2) DEFAULT 0.00,
--     tax int,
--     shipping_charge int,
--     total_price int ,
--     image VARCHAR(2080),           -- Path or URL to the image of the material
--     stock_quantity INT DEFAULT 0,  -- Stock quantity
--     reorder_level INT DEFAULT 0    -- Reorder level
-- );
CREATE TABLE raw_materials_stock (
    id SERIAL PRIMARY KEY,        
    Component VARCHAR(255) NOT NULL,    
    category VARCHAR(100),   
    package VARCHAR(100),        
    value VARCHAR(100),            
    reference_no VARCHAR(100),     
    unit_price_in_rupees DECIMAL(10, 2) DEFAULT 0.00,
    unit_price_in_dollars DECIMAL(10, 2) DEFAULT 0.00,
    tax DECIMAL(5, 2) DEFAULT 0.00,  -- Store tax as a percentage
    shipping_charge DECIMAL(5, 2) DEFAULT 0.00,  -- Store shipping charge as a percentage
    total_price DECIMAL(10, 2) DEFAULT 0.00,  -- Calculated total price
    image VARCHAR(2080),           
    stock_quantity INT DEFAULT 0,  
    reorder_level INT DEFAULT 0

);

CREATE TABLE raw_material_features (
    id SERIAL PRIMARY KEY,
    material_id INT NOT NULL,
    raw_material_feature VARCHAR(255) NULL,
    raw_material_value VARCHAR(255)  NULL,
    FOREIGN KEY (material_id) REFERENCES raw_materials_stock(id) ON DELETE CASCADE
);
CREATE TABLE model_features (
    id SERIAL PRIMARY KEY,
    model_id INT NOT NULL,
    feature TEXT  NULL, 
    feature_value TEXT  NULL, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (model_id) REFERENCES price_table(id) ON DELETE CASCADE
);
CREATE TABLE model_features_image (
    id SERIAL PRIMARY KEY,
    model_id INT  NULL, 
    model_no TEXT  NULL, 
    image_url TEXT NULL, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (model_id) REFERENCES price_table(id) ON DELETE CASCADE
);

CREATE TABLE web_image (
    id SERIAL PRIMARY KEY,       -- Auto-incrementing unique ID
    model_id INT NOT NULL,       -- Model ID (integer)
    model_no VARCHAR(255) NOT NULL, -- Model Number (string)
    image_url TEXT NOT NULL      -- Image URL (string)
);
CREATE TABLE raw_materials_stock_history (
    id SERIAL PRIMARY KEY,        
    raw_material_id INT NOT NULL,   
    unit_price_in_rupees DECIMAL(10, 2), 
    unit_price_in_dollars DECIMAL(10, 2),
    stock_quantity DECIMAL(10, 2),  
    tax DECIMAL(10, 2),
    shipping_charge DECIMAL(10, 2),
    total_price DECIMAL(10, 2),
    updated_at TIMESTAMP DEFAULT NOW(), 
    updated_by VARCHAR(100)
);

CREATE TABLE sales_graph (
    id SERIAL PRIMARY KEY,           -- Unique identifier for each sale
    sale_by INT NOT NULL,            -- ID of the seller
    sale_to VARCHAR(255),            -- ID or name of the buyer/customer
    thing_id INT,                    -- ID of the item/product being sold
    timeanddate TIMESTAMP NOT NULL    -- Timestamp of the sale
);

CREATE TABLE thing_raw_materials (
    id SERIAL PRIMARY KEY,                       -- Unique identifier for each record
    raw_material_id INT NOT NULL,               -- Foreign key to raw_materials_stock.id
    required_qty INT NOT NULL,                  -- Quantity of the raw material required
    model_name VARCHAR(255),                    -- Name of the model (optional for descriptive purposes)
    model_id INT,                               -- Identifier for the model (foreign key to price_table.id)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Record creation timestamp
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Last update timestamp

    -- Foreign key constraints
    CONSTRAINT fk_raw_material FOREIGN KEY (raw_material_id)
        REFERENCES raw_materials_stock(id)
        ON DELETE CASCADE                       -- Delete records in this table if the raw material is deleted
        ON UPDATE CASCADE,                      -- Update records in this table if the raw material ID changes

    CONSTRAINT fk_price_table FOREIGN KEY (model_id)
        REFERENCES price_table(id)
        ON DELETE SET NULL                      -- If the price table entry is deleted, set model_id to NULL
        ON UPDATE CASCADE                       -- Update records in this table if the price table ID changes
);

CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(255) NULL,
    action VARCHAR(100) NULL,
    event_data JSONB NOT NULL,       -- Storing event details in JSONB format
    user_id VARCHAR(255),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    thing_mac VARCHAR(255) NOT NULL
);
CREATE TABLE alert_notifications ( 
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    topic VARCHAR(100),
    read BOOLEAN,  -- Indicates if the notification has been read
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Timestamp when the notification was sent
);
