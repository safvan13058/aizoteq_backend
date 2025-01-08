-- Table to store users
CREATE TABLE Users (
    id SERIAL PRIMARY KEY,
    userName VARCHAR(255) NOT NULL,
    jwtsub VARCHAR(255) UNIQUE,
    userRole VARCHAR(255),
    profilePic TEXT,
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
    type VARCHAR(255),
    securityKey VARCHAR(255) UNIQUE,
    lastModified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table to store attributes of things
CREATE TABLE ThingAttributes (
    id SERIAL PRIMARY KEY,
    thingId INT,
    attributeName VARCHAR(255), -- e.g., 'light', 'fan', 'plug', 'trm'
    attributeValue VARCHAR(255), -- e.g., '1', '2', '3', '4'
    lastModified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (thingId) REFERENCES Things(id)
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
CREATE TABLE AdminStock (
    id SERIAL PRIMARY KEY,
    thingId INT,
    addedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    addedBy VARCHAR(255), -- User who added the device to AdminStock
    status VARCHAR(255) CHECK (status IN ('new', 'returned', 'rework', 'exchange')), -- Device status in stock
    FOREIGN KEY (thingId) REFERENCES Things(id),
    FOREIGN KEY (addedBy) REFERENCES Users(userName),
);
 
-- Table to store home information
CREATE TABLE HOME (
    id SERIAL PRIMARY KEY, -- Auto-incrementing primary key
    userid INT NOT NULL,
    name VARCHAR(255) NOT NULL, -- Name of the home
    created_by VARCHAR(255), -- Creator of the entry
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Last modification timestamp
    FOREIGN KEY (userid) REFERENCES Users(id)
);

-- Table to store floor information
CREATE TABLE floor (
    id SERIAL PRIMARY KEY, -- Auto-incrementing primary key
    home_id INT NOT NULL, -- Foreign key referencing home table
    name VARCHAR(255) NOT NULL, -- Name of the floor
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Last modification timestamp
    FOREIGN KEY (home_id) REFERENCES HOME(id) ON DELETE CASCADE
);

-- Table to store room information
CREATE TABLE room (
    id SERIAL PRIMARY KEY, -- Auto-incrementing primary key
    home_id INT NOT NULL, -- Foreign key referencing home table
    floor_id INT NOT NULL, -- Foreign key referencing floor table
    name VARCHAR(255) NOT NULL, -- Name of the room
    alias_name VARCHAR(255), -- Alias name for the room
    image_url VARCHAR(2083), -- URL to an image of the room
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
    securityKey VARCHAR(255) NOT NULL, -- Foreign key referencing things(securityKey)
    FOREIGN KEY (user_id) REFERENCES Users(id),
    FOREIGN KEY (thing_id) REFERENCES Things(id),
    FOREIGN KEY (securityKey) REFERENCES Things(securityKey)
);

-- Table to store room-device mappings
CREATE TABLE room_device (
    id SERIAL PRIMARY KEY, -- Auto-incrementing primary key
    room_id INT NOT NULL, -- Foreign key referencing room table
    device_id VARCHAR(255) NOT NULL, -- Foreign key referencing device table
    FOREIGN KEY (room_id) REFERENCES room(id),
    FOREIGN KEY (device_id) REFERENCES Devices(deviceId)
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
    user_id INTEGER REFERENCES Users(id),
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
    orderIndex INT NOT NULL
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
    fixed_by VARCHAR(255) DEFAULT NULL; -- Stores the identifier of the person who fixed the device, default is NULL
                    
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

--------------------------------------------------------------
CREATE TABLE dealersStock (
    id SERIAL PRIMARY KEY,             -- Unique identifier for each record
    user_id INT NOT NULL,              -- Reference to the user ID
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Timestamp of when the record was added
    added_by VARCHAR(100) NOT NULL,    -- Username of the person who added the record
    CONSTRAINT fk_users_username FOREIGN KEY (added_by) REFERENCES users(username) -- Foreign key constraint
);

CREATE TABLE customersStock (
    id SERIAL PRIMARY KEY,             -- Unique identifier for each record
    user_id INT NOT NULL,              -- Reference to the user ID
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Timestamp of when the record was added
    added_by VARCHAR(100) NOT NULL,    -- Username of the person who added the record
    CONSTRAINT fk_users_username FOREIGN KEY (added_by) REFERENCES users(username) -- Foreign key constraint
);

CREATE TABLE customer_details (
    id SERIAL PRIMARY KEY,          -- Unique identifier for each record
    name VARCHAR(255) NOT NULL,     -- Name of the customer
    address TEXT NOT NULL,          -- Address of the customer
    phone VARCHAR(15) NOT NULL,     -- Primary phone number
    alt_phone VARCHAR(15),          -- Alternate phone number (optional)
    total_amount DECIMAL(10, 2),    -- Total amount associated with the customer
    balance DECIMAL(10, 2),          -- Balance amount for the customer
    lastmodified TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE dealers_details (
    id SERIAL PRIMARY KEY,          -- Unique identifier for each record
    name VARCHAR(255) NOT NULL,     -- Name of the dealer
    address TEXT NOT NULL,          -- Address of the dealer
    phone VARCHAR(15) NOT NULL,     -- Primary phone number
    alt_phone VARCHAR(15),          -- Alternate phone number (optional)
    total_amount DECIMAL(10, 2),    -- Total amount associated with the dealer
    balance DECIMAL(10, 2),         -- Balance amount for the dealer
    lastmodified TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

