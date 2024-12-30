-- Table to store users
CREATE TABLE Users (
    id SERIAL PRIMARY KEY,
    userName VARCHAR(255) NOT NULL,
    jwtsub VARCHAR(255) UNIQUE,
    userRole VARCHAR(255),
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
    addedBy INT, -- User who added the device to AdminStock
    status VARCHAR(255) CHECK (status IN ('new', 'returned', 'rework', 'exchange')), -- Device status in stock
    FOREIGN KEY (thingId) REFERENCES Things(id),
    FOREIGN KEY (addedBy) REFERENCES Users(id)
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


