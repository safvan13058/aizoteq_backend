const Swaggerdoc = {
    "/app/addThing": {
      post: {
        summary: "Add a new thing",
        description: "Create a thing with associated attributes and devices, and insert it into the stock.",
        tags: ["Things"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  thing: {
                    type: "object",
                    properties: {
                      thingName: { type: "string" },
                      batchId: { type: "string" },
                      model: { type: "string" },
                      serialno: { type: "string" },
                      type: { type: "string" },
                    },
                  },
                  attributes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        attributeName: { type: "string" },
                        attributeValue: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: "Thing successfully created",
          },
          400: {
            description: "Invalid input data",
          },
          500: {
            description: "Internal server error",
          },
        },
      },
    },


    "/app/add/home/": {
        post: {
          summary: "Add a new home",
          description: "Create a new home entry in the database with the specified name and user details.",
          tags: ["Homes"],
          security: [
            {
              bearerAuth: [], // Include this if your API uses JWT
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: {
                      type: "string",
                      description: "Name of the home",
                    },
                  },
                  required: ["name"],
                },
                example: {
                  name: "My Sweet Home",
                },
              },
            },
          },
          responses: {
            201: {
              description: "Home added successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: {
                        type: "string",
                        example: "Home added successfully",
                      },
                      homeId: {
                        type: "integer",
                        example: 1,
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: "Bad Request - Missing or invalid data",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: {
                        type: "string",
                        example: "name and created_by are required",
                      },
                    },
                  },
                },
              },
            },
            500: {
              description: "Internal Server Error",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: {
                        type: "string",
                        example: "An error occurred while adding the home",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    //   ------------------------
    "/app/display/homes/": {
        get: {
          summary: "Get all homes for a user",
          description: "Retrieve a list of homes associated with the authenticated user.",
          tags: ["Homes"],
          security: [
            {
              bearerAuth: [], // Include if your API uses JWT authentication
            },
          ],
          responses: {
            200: {
              description: "A list of homes for the authenticated user",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: {
                          type: "integer",
                          description: "Unique identifier for the home",
                          example: 1,
                        },
                        name: {
                          type: "string",
                          description: "Name of the home",
                          example: "My Sweet Home",
                        },
                        created_by: {
                          type: "string",
                          description: "User who created the home",
                          example: "john_doe",
                        },
                        userid: {
                          type: "integer",
                          description: "ID of the user associated with the home",
                          example: 42,
                        },
                      },
                    },
                  },
                },
              },
            },
            404: {
              description: "No homes found for the user",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: {
                        type: "string",
                        example: "No homes found for this user",
                      },
                    },
                  },
                },
              },
            },
            500: {
              description: "Internal server error",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: {
                        type: "string",
                        example: "An error occurred while fetching homes",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    //   --------------------------------------
    "/app/update/home/{id}": {
        put: {
          summary: "Update an existing home",
          description: "Update the name or created_by field of a home entry in the database.",
          tags: ["Homes"],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              description: "ID of the home to update",
              schema: {
                type: "integer",
              },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: {
                      type: "string",
                      description: "New name of the home",
                    },
                    created_by: {
                      type: "string",
                      description: "Username of the person updating the home",
                    },
                  },
                },
                example: {
                  name: "Updated Home Name",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Home updated successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: {
                        type: "string",
                        example: "Home updated successfully",
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: "Invalid input data",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: {
                        type: "string",
                        example: "At least one of name or created_by must be provided",
                      },
                    },
                  },
                },
              },
            },
            404: {
              description: "Home not found or no changes made",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: {
                        type: "string",
                        example: "Home not found or no changes made",
                      },
                    },
                  },
                },
              },
            },
            500: {
              description: "Internal server error",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: {
                        type: "string",
                        example: "An error occurred while updating the home",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },

    //   -----------------------------------
    "/app/delete/home/{id}": {
        delete: {
            summary: "Delete an existing home",
            description: "Delete a home entry in the database by its ID.",
            tags: ["Homes"],
            parameters: [
                {
                    in: "path",
                    name: "id",
                    required: true,
                    description: "ID of the home to delete",
                    schema: {
                        type: "integer",
                    },
                },
            ],
            responses: {
                200: {
                    description: "Home deleted successfully",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    message: {
                                        type: "string",
                                        example: "Home deleted successfully",
                                    },
                                },
                            },
                        },
                    },
                },
                404: {
                    description: "Home not found",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    error: {
                                        type: "string",
                                        example: "Home not found",
                                    },
                                },
                            },
                        },
                    },
                },
                500: {
                    description: "Internal server error",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    error: {
                                        type: "string",
                                        example: "An error occurred while deleting the home",
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
    // -----------------

    "/app/add/floor/{home_id}": {
        post: {
            summary: "Add a new floor to a home",
            description: "Create a new floor entry in the database associated with a specific home.",
            tags: ["Floors"],
            parameters: [
                {
                    in: "path",
                    name: "home_id",
                    required: true,
                    description: "ID of the home to which the floor belongs",
                    schema: {
                        type: "integer",
                    },
                },
            ],
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                name: {
                                    type: "string",
                                    description: "Name of the floor",
                                },
                            },
                        },
                        example: {
                            name: "Ground Floor",
                        },
                    },
                },
            },
            responses: {
                201: {
                    description: "Floor added successfully",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    message: {
                                        type: "string",
                                        example: "Floor added successfully",
                                    },
                                    floorId: {
                                        type: "integer",
                                        example: 1,
                                    },
                                },
                            },
                        },
                    },
                },
                400: {
                    description: "Bad Request - Missing or invalid data",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    error: {
                                        type: "string",
                                        example: "home_id and name are required",
                                    },
                                },
                            },
                        },
                    },
                },
                500: {
                    description: "Internal server error",
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                properties: {
                                    error: {
                                        type: "string",
                                        example: "An error occurred while adding the floor",
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    },

    // --------------------
    "/app/display/floors/{home_id}": {
    get: {
        summary: "Get floors by home ID",
        description: "Retrieve a list of all floors associated with a specific home ID.",
        tags: ["Floors"],
        parameters: [
            {
                in: "path",
                name: "home_id",
                required: true,
                description: "ID of the home to fetch floors for",
                schema: {
                    type: "integer"
                }
            }
        ],
        responses: {
            200: {
                description: "List of floors retrieved successfully",
                content: {
                    "application/json": {
                        schema: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    id: {
                                        type: "integer",
                                        example: 1
                                    },
                                    home_id: {
                                        type: "integer",
                                        example: 123
                                    },
                                    name: {
                                        type: "string",
                                        example: "Ground Floor"
                                    }
                                }
                            }
                        }
                    }
                }
            },
            400: {
                description: "Bad Request - Missing or invalid home_id",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                error: {
                                    type: "string",
                                    example: "home_id is required"
                                }
                            }
                        }
                    }
                }
            },
            404: {
                description: "Not Found - No floors found for the specified home ID",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                message: {
                                    type: "string",
                                    example: "No floors found for the specified home"
                                }
                            }
                        }
                    }
                }
            },
            500: {
                description: "Internal server error",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                error: {
                                    type: "string",
                                    example: "An error occurred while fetching floors"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
},
// -----------------
"/app/update/floors/{id}": {
    put: {
        summary: "Update a floor by ID",
        description: "Update the details of an existing floor by its ID. Currently, only the `name` field can be updated.",
        tags: ["Floors"],
        parameters: [
            {
                in: "path",
                name: "id",
                required: true,
                description: "ID of the floor to update",
                schema: {
                    type: "integer"
                }
            }
        ],
        requestBody: {
            required: true,
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            name: {
                                type: "string",
                                description: "New name for the floor"
                            }
                        },
                        required: ["name"]
                    },
                    example: {
                        name: "Updated Floor Name"
                    }
                }
            }
        },
        responses: {
            200: {
                description: "Floor updated successfully",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                message: {
                                    type: "string",
                                    example: "Floor updated successfully"
                                }
                            }
                        }
                    }
                }
            },
            400: {
                description: "Bad Request - Missing or invalid data",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                error: {
                                    type: "string",
                                    example: "At least one of name or home_id must be provided"
                                }
                            }
                        }
                    }
                }
            },
            404: {
                description: "Not Found - Floor not found or no changes made",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                message: {
                                    type: "string",
                                    example: "Floor not found or no changes made"
                                }
                            }
                        }
                    }
                }
            },
            500: {
                description: "Internal server error",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                error: {
                                    type: "string",
                                    example: "An error occurred while updating the floor"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
},
// --------------------
"/app/delete/floors/{id}": {
    delete: {
        summary: "Delete a floor by ID",
        description: "Remove a floor from the database using its ID.",
        tags: ["Floors"],
        parameters: [
            {
                in: "path",
                name: "id",
                required: true,
                description: "ID of the floor to delete",
                schema: {
                    type: "integer"
                }
            }
        ],
        responses: {
            200: {
                description: "Floor deleted successfully",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                message: {
                                    type: "string",
                                    example: "Floor deleted successfully"
                                }
                            }
                        }
                    }
                }
            },
            404: {
                description: "Not Found - Floor not found",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                message: {
                                    type: "string",
                                    example: "Floor not found"
                                }
                            }
                        }
                    }
                }
            },
            500: {
                description: "Internal server error",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                error: {
                                    type: "string",
                                    example: "An error occurred while deleting the floor"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
},
// --------------
"/app/add/room/{floor_id}": {
    post: {
        summary: "Add a new room to a floor",
        description: "Create a new room entry in the database associated with a specific floor. Optionally, an image can be uploaded.",
        tags: ["Rooms"],
        parameters: [
            {
                in: "path",
                name: "floor_id",
                required: true,
                description: "ID of the floor to which the room belongs",
                schema: {
                    type: "integer"
                }
            }
        ],
        requestBody: {
            required: true,
            content: {
                "multipart/form-data": {
                    schema: {
                        type: "object",
                        properties: {
                            name: {
                                type: "string",
                                description: "Name of the room",
                                example: "Living Room"
                            },
                            alias_name: {
                                type: "string",
                                description: "Alias name for the room",
                                example: "Main Hall"
                            },
                            image: {
                                type: "string",
                                format: "binary",
                                description: "Optional image file for the room"
                            }
                        },
                        required: ["name"]
                    }
                }
            }
        },
        responses: {
            201: {
                description: "Room added successfully",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                message: {
                                    type: "string",
                                    example: "Room added successfully"
                                },
                                roomId: {
                                    type: "integer",
                                    example: 1
                                }
                            }
                        }
                    }
                }
            },
            400: {
                description: "Bad Request - Missing or invalid data",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                error: {
                                    type: "string",
                                    example: "floor_id and name are required"
                                }
                            }
                        }
                    }
                }
            },
            500: {
                description: "Internal server error",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                error: {
                                    type: "string",
                                    example: "An error occurred while adding the room"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
},
// ------------------

"/app/delete/room/{id}": {
    delete: {
        summary: "Delete a room by ID",
        description: "Remove a room from the database using its unique ID.",
        tags: ["Rooms"],
        parameters: [
            {
                in: "path",
                name: "id",
                required: true,
                description: "ID of the room to delete",
                schema: {
                    type: "integer"
                }
            }
        ],
        responses: {
            200: {
                description: "Room deleted successfully",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                message: {
                                    type: "string",
                                    example: "Room deleted successfully"
                                }
                            }
                        }
                    }
                }
            },
            404: {
                description: "Not Found - Room does not exist",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                error: {
                                    type: "string",
                                    example: "Room not found"
                                }
                            }
                        }
                    }
                }
            },
            500: {
                description: "Internal server error",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                error: {
                                    type: "string",
                                    example: "An error occurred while deleting the room"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
},
// -----------------
"/app/display/rooms/{floor_id}": {
    get: {
        summary: "Get all rooms by floor ID",
        description: "Retrieve a list of rooms associated with a specific floor.",
        tags: ["Rooms"],
        parameters: [
            {
                in: "path",
                name: "floor_id",
                required: true,
                description: "ID of the floor to retrieve rooms for",
                schema: {
                    type: "integer"
                }
            }
        ],
        responses: {
            200: {
                description: "Rooms retrieved successfully",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                message: {
                                    type: "string",
                                    example: "Rooms retrieved successfully"
                                },
                                rooms: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            id: {
                                                type: "integer",
                                                example: 1
                                            },
                                            name: {
                                                type: "string",
                                                example: "Living Room"
                                            },
                                            alias_name: {
                                                type: "string",
                                                example: "Main Hall"
                                            },
                                            image_url: {
                                                type: "string",
                                                example: "https://example.com/image.jpg"
                                            },
                                            floor_id: {
                                                type: "integer",
                                                example: 10
                                            },
                                            home_id: {
                                                type: "integer",
                                                example: 5
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            404: {
                description: "No rooms found for the specified floor",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                message: {
                                    type: "string",
                                    example: "No rooms found for this floor"
                                }
                            }
                        }
                    }
                }
            },
            500: {
                description: "Internal server error",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                error: {
                                    type: "string",
                                    example: "An error occurred while retrieving rooms"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
},
// --------------------

"/app/update/rooms/{id}": {
    put: {
        summary: "Update a room's details",
        description: "Update the details of a specific room, including its name, alias name, or image.",
        tags: ["Rooms"],
        parameters: [
            {
                in: "path",
                name: "id",
                required: true,
                description: "ID of the room to update",
                schema: {
                    type: "integer"
                }
            }
        ],
        requestBody: {
            required: false,
            content: {
                "multipart/form-data": {
                    schema: {
                        type: "object",
                        properties: {
                            name: {
                                type: "string",
                                description: "New name for the room",
                                example: "Updated Living Room"
                            },
                            alias_name: {
                                type: "string",
                                description: "New alias name for the room",
                                example: "Main Hall Updated"
                            },
                            image: {
                                type: "string",
                                format: "binary",
                                description: "New image for the room"
                            }
                        }
                    }
                }
            }
        },
        responses: {
            200: {
                description: "Room updated successfully",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                message: {
                                    type: "string",
                                    example: "Room updated successfully"
                                }
                            }
                        }
                    }
                }
            },
            400: {
                description: "Bad Request - Missing or invalid data",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                error: {
                                    type: "string",
                                    example: "At least one of name, alias_name, or image must be provided"
                                }
                            }
                        }
                    }
                }
            },
            404: {
                description: "Room not found or no changes made",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                error: {
                                    type: "string",
                                    example: "Room not found or no changes made"
                                }
                            }
                        }
                    }
                }
            },
            500: {
                description: "Internal server error",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                error: {
                                    type: "string",
                                    example: "An error occurred while updating the room"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
},
// ------------------------

"/api/display/things/{id}": {
    get: {
        summary: "Get details of a specific thing",
        description: "Fetch details of a specific thing by its ID.",
        tags: ["Things"],
        parameters: [
            {
                in: "path",
                name: "id",
                required: true,
                description: "ID of the thing to retrieve",
                schema: {
                    type: "integer"
                }
            }
        ],
        responses: {
            200: {
                description: "Thing found successfully",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                id: {
                                    type: "integer",
                                    example: 1
                                },
                                name: {
                                    type: "string",
                                    example: "Example Thing"
                                },
                                description: {
                                    type: "string",
                                    example: "Description of the thing"
                                },
                                // Include other fields as per the 'things' table structure
                            }
                        }
                    }
                }
            },
            404: {
                description: "Thing not found",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                error: {
                                    type: "string",
                                    example: "Thing not found"
                                }
                            }
                        }
                    }
                }
            },
            500: {
                description: "Internal server error",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                error: {
                                    type: "string",
                                    example: "Internal Server Error"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
},
// ---------------------
"/api/display/things": {
    get: {
        summary: "Get a list of all things",
        description: "Fetch a list of all things stored in the database.",
        tags: ["Things"],
        responses: {
            200: {
                description: "List of things retrieved successfully",
                content: {
                    "application/json": {
                        schema: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    id: {
                                        type: "integer",
                                        example: 1
                                    },
                                    name: {
                                        type: "string",
                                        example: "Example Thing"
                                    },
                                    description: {
                                        type: "string",
                                        example: "Description of the thing"
                                    },
                                    // Include other fields as per the 'things' table structure
                                }
                            }
                        }
                    }
                }
            },
            500: {
                description: "Internal server error",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                error: {
                                    type: "string",
                                    example: "Internal Server Error"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
},

"/api/display/thingattribute/{thingid}": {
    get: {
        summary: "Get attributes of a specific thing",
        description: "Fetch a list of attributes for a specific thing identified by its ID.",
        tags: ["ThingAttributes"],
        parameters: [
            {
                in: "path",
                name: "thingid",
                required: true,
                description: "ID of the thing whose attributes are to be retrieved",
                schema: {
                    type: "integer"
                }
            }
        ],
        responses: {
            200: {
                description: "Attributes retrieved successfully",
                content: {
                    "application/json": {
                        schema: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    thingid: {
                                        type: "integer",
                                        example: 1
                                    },
                                    attribute_name: {
                                        type: "string",
                                        example: "Color"
                                    },
                                    attribute_value: {
                                        type: "string",
                                        example: "Red"
                                    },
                                    // Include other attributes as per the 'thingattributes' table structure
                                }
                            }
                        }
                    }
                }
            },
            404: {
                description: "No attributes found for the specified thing",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                message: {
                                    type: "string",
                                    example: "No records found"
                                }
                            }
                        }
                    }
                }
            },
            500: {
                description: "Internal server error",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                error: {
                                    type: "string",
                                    example: "Internal Server Error"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
},
"/api/display/thingattribute/{thingid}": {
    get: {
        summary: "Get attributes of a specific thing",
        description: "Fetch a list of attributes for a specific thing identified by its ID.",
        tags: ["ThingAttributes"],
        parameters: [
            {
                in: "path",
                name: "thingid",
                required: true,
                description: "ID of the thing whose attributes are to be retrieved",
                schema: {
                    type: "integer"
                }
            }
        ],
        responses: {
            200: {
                description: "Attributes retrieved successfully",
                content: {
                    "application/json": {
                        schema: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    thingid: {
                                        type: "integer",
                                        example: 1
                                    },
                                    attribute_name: {
                                        type: "string",
                                        example: "Color"
                                    },
                                    attribute_value: {
                                        type: "string",
                                        example: "Red"
                                    },
                                    // Add additional attribute fields as per the 'thingattributes' table schema
                                }
                            }
                        }
                    }
                }
            },
            404: {
                description: "No attributes found for the specified thing",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                message: {
                                    type: "string",
                                    example: "No records found"
                                }
                            }
                        }
                    }
                }
            },
            500: {
                description: "Internal server error",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                error: {
                                    type: "string",
                                    example: "Internal Server Error"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
},
// ---------------
"/api/display/test/{type}": {
    get: {
        summary: "Get thing by type",
        description: "Fetch a thing record based on the provided type parameter.",
        tags: ["Things"],
        parameters: [
            {
                in: "path",
                name: "type",
                required: true,
                description: "Type of the thing to be retrieved",
                schema: {
                    type: "string"
                }
            }
        ],
        responses: {
            200: {
                description: "Thing retrieved successfully",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                success: {
                                    type: "boolean",
                                    example: true
                                },
                                data: {
                                    type: "object",
                                    properties: {
                                        id: {
                                            type: "integer",
                                            example: 1
                                        },
                                        name: {
                                            type: "string",
                                            example: "Laptop"
                                        },
                                        type: {
                                            type: "string",
                                            example: "Electronics"
                                        },
                                        // Add additional thing properties as per your 'things' table schema
                                    }
                                }
                            }
                        }
                    }
                }
            },
            404: {
                description: "No records found for the given type",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                success: {
                                    type: "boolean",
                                    example: false
                                },
                                message: {
                                    type: "string",
                                    example: "No records found"
                                }
                            }
                        }
                    }
                }
            },
            500: {
                description: "Internal server error",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                success: {
                                    type: "boolean",
                                    example: false
                                },
                                message: {
                                    type: "string",
                                    example: "An error occurred while fetching data"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
},
// ------------------------
"/api/display/status/{status}": {
    get: {
        summary: "Get things by status",
        description: "Fetch things based on the status from the adminstock table.",
        tags: ["Things"],
        parameters: [
            {
                in: "path",
                name: "status",
                required: true,
                description: "The status of the items to be retrieved",
                schema: {
                    type: "string"
                }
            }
        ],
        responses: {
            200: {
                description: "Things retrieved successfully based on status",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                success: {
                                    type: "boolean",
                                    example: true
                                },
                                data: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            id: {
                                                type: "integer",
                                                example: 1
                                            },
                                            name: {
                                                type: "string",
                                                example: "Laptop"
                                            },
                                            type: {
                                                type: "string",
                                                example: "Electronics"
                                            },
                                            // Include other thing attributes here, based on your 'things' table schema
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            404: {
                description: "No records found for the provided status",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                success: {
                                    type: "boolean",
                                    example: false
                                },
                                message: {
                                    type: "string",
                                    example: "No data found for the provided status"
                                }
                            }
                        }
                    }
                }
            },
            500: {
                description: "Internal server error",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                success: {
                                    type: "boolean",
                                    example: false
                                },
                                message: {
                                    type: "string",
                                    example: "An error occurred while fetching data"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
},
// -------------------
"/api/access/customer/{roomid}": {
    post: {
        summary: "Share access to a room with a customer",
        description: "Share access by verifying the thing's serial number and security key, then linking devices to the specified room.",
        tags: ["Access", "Customer"],
        parameters: [
            {
                in: "path",
                name: "roomid",
                required: true,
                description: "The room ID where the devices will be linked.",
                schema: {
                    type: "integer"
                }
            }
        ],
        requestBody: {
            required: true,
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            securitykey: {
                                type: "string",
                                description: "Security key of the thing to verify."
                            },
                            serialno: {
                                type: "string",
                                description: "Serial number of the thing to verify."
                            }
                        },
                        required: ["securitykey", "serialno"]
                    }
                }
            }
        },
        responses: {
            201: {
                description: "Access shared successfully",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                message: {
                                    type: "string",
                                    example: "Access shared successfully"
                                }
                            }
                        }
                    }
                }
            },
            404: {
                description: "Thing not found or no devices linked to the thing",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                message: {
                                    type: "string",
                                    example: "Thing not found or invalid security key"
                                }
                            }
                        }
                    }
                }
            },
            500: {
                description: "Internal server error",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                message: {
                                    type: "string",
                                    example: "Internal server error"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
},


"/api/display/device/rooms/{roomid}": {
    get: {
        summary: "Fetch devices associated with a room",
        description: "Fetches all devices linked to the specified room by querying the `room_device` table and retrieving the device details.",
        tags: ["Devices", "Rooms"],
        parameters: [
            {
                in: "path",
                name: "roomid",
                required: true,
                description: "The ID of the room whose devices are to be fetched.",
                schema: {
                    type: "integer"
                }
            }
        ],
        responses: {
            200: {
                description: "Devices successfully retrieved",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                devices: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            deviceid: {
                                                type: "integer",
                                                description: "The ID of the device"
                                            },
                                            // Add other device properties here
                                            name: {
                                                type: "string",
                                                description: "The name of the device"
                                            },
                                            type: {
                                                type: "string",
                                                description: "The type of the device"
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            404: {
                description: "No devices found for the specified room",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                message: {
                                    type: "string",
                                    example: "No devices found for this room."
                                }
                            }
                        }
                    }
                }
            },
            500: {
                description: "Internal server error",
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                message: {
                                    type: "string",
                                    example: "An error occurred while fetching devices."
                                },
                                error: {
                                    type: "string",
                                    example: "Error details"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
},








  };


  
  module.exports = Swaggerdoc;
  