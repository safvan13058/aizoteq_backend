const Swaggerdoc = {
"/app/addThing": {
  "post": {
    "tags": ["Test APP APIs"],
    "summary": "Add a new thing",
    "description": "Creates a new thing, inserts its attributes and related devices, and handles status-related logic.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "thing": {
                "type": "object",
                "properties": {
                  "thingName": { "type": "string", "example": "Smart Light" },
                  "batchId": { "type": "string", "example": "BATCH-001" },
                  "model": { "type": "string", "example": "SL-100" },
                  "serialno": { "type": "string", "example": "SL100-ABC123" },
                  "type": { "type": "string" }
                },
                "required": ["thingName", "serialno"]
              },
              "attributes": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "attributeName": { "type": "string",  },
                    "attributeValue": { "type": "string",  }
                  },
                  "required": ["attributeName", "attributeValue"]
                },
                "example": [
                  {
                    "attributeName": "light",
                    "attributeValue": "5"
                  },
                  {
                    "attributeName": "fan",
                    "attributeValue": "1"
                  }
                ]
              },
              "status": { "type": "string", "example": "rework" },
              "failureReason": { "type": "string", "example": "Power failure" }
            },
            "required": ["thing", "attributes", "status"]
          }
        }
      }
    },
    "responses": {
      "201": {
        "description": "Data inserted successfully",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "message": { "type": "string", "example": "Data inserted successfully" }
              }
            }
          }
        }
      },
      "400": {
        "description": "Invalid input data",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "message": { "type": "string", "example": "Invalid input data" },
                "error": { 
                  "type": "object",
                  "example": { 
                    "details": "thingName is required" 
                  } 
                }
              }
            }
          }
        }
      },
      "500": {
        "description": "An error occurred",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "message": { "type": "string", "example": "An error occurred while inserting the data" },
                "error": { "type": "string", "example": "Database connection error" }
              }
            }
          }
        }
      }
    }
  }
},

"/api/adminstock/search/{model}": {
      "get": {
        "tags": ["Test APP APIs"],
        "summary": "Search AdminStock by model and optional status",
        "parameters": [
          {
            "name": "model",
            "in": "path",
            "required": true,
            "description": "Model of the device",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "status",
            "in": "query",
            "required": false,
            "description": "Status of the device (optional)",
            "schema": {
              "type": "string",
              "enum": ["new", "returned", "rework", "exchange"]
            }
          },
          {
            "name": "page",
            "in": "query",
            "required": false,
            "description": "Page number for pagination",
            "schema": {
              "type": "integer",
              "default": 1
            }
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "description": "Limit number of results per page",
            "schema": {
              "type": "integer",
              "default": 10
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Successful retrieval of admin stock",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "page": {
                      "type": "integer"
                    },
                    "limit": {
                      "type": "integer"
                    },
                    "total": {
                      "type": "integer"
                    },
                    "totalPages": {
                      "type": "integer"
                    },
                    "data": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "id": { "type": "integer" },
                          "thingId": { "type": "integer" },
                          "addedAt": { "type": "string", "format": "date-time" },
                          "addedBy": { "type": "string" },
                          "status": { "type": "string" },
                          "failureReason": { "type": "string" }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Bad Request, invalid parameters"
          },
          "404": {
            "description": "No records found"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },
"/api/search/things": {
      "get": {
        "tags": ["Test APP APIs"],
        "summary": "Search for Things",
        "description": "Search for 'Things' based on various parameters with pagination support.",
        "parameters": [
          {
            "name": "searchTerm",
            "in": "query",
            "description": "The term to search for.",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "page",
            "in": "query",
            "description": "The page number to retrieve.",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 1
            }
          },
          {
            "name": "pageSize",
            "in": "query",
            "description": "The number of items per page.",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 10
            }
          }
        ],
        "responses": {
          "200": {
            "description": "A list of Things matching the search criteria.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "data": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "thingId": { "type": "integer" },
                          "thingName": { "type": "string" },
                          "batchId": { "type": "string" },
                          "latitude": { "type": "number" },
                          "longitude": { "type": "number" },
                          "model": { "type": "string" },
                          "serialno": { "type": "string" },
                          "type": { "type": "string" },
                          "securityKey": { "type": "string" },
                          "lastModified": { "type": "string", "format": "date-time" },
                          "adminStockId": { "type": "integer" },
                          "addedAt": { "type": "string", "format": "date-time" },
                          "addedBy": { "type": "string" },
                          "adminStockStatus": { "type": "string" },
                          "failedDeviceId": { "type": "integer" },
                          "failureReason": { "type": "string" },
                          "fixedBy": { "type": "string" },
                          "failureLoggedAt": { "type": "string", "format": "date-time" }
                        }
                      }
                    },
                    "pagination": {
                      "type": "object",
                      "properties": {
                        "page": { "type": "integer" },
                        "pageSize": { "type": "integer" },
                        "totalCount": { "type": "integer" },
                        "totalPages": { "type": "integer" }
                      }
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Bad Request. The 'searchTerm' parameter is required."
          },
          "500": {
            "description": "Internal Server Error. An error occurred while processing the request."
          }
        }
      }
    },
"/api/update_adminstock/status/{thingid}": {
      "put": {
        "tags": ["Test APP APIs"],
        "summary": "Update AdminStock status and TestFailedDevices fixed_by",
        "description": "This endpoint updates the status in AdminStock and the fixed_by field in TestFailedDevices for a given thingId.",
        "parameters": [
          {
            "name": "thingid",
            "in": "path",
            "required": true,
            "description": "The ID of the thing to update",
            "schema": {
              "type": "integer"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "status": {
                    "type": "string",
                    "enum": ["new", "returned", "rework", "exchange"]
                  },
                  "fixedBy": {
                    "type": "string"
                  }
                },
                "required": ["status", "fixedBy"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Successfully updated AdminStock status and TestFailedDevices fixed_by",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Bad Request - Missing required parameters",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Internal Server Error - An error occurred while updating",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string"
                    },
                    "details": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },

"/api/devices/{device_id}/change/{newroomid}": {
      "put": {
        "tags": ["device"],
        "summary": "Change room for a device",
        "description": "Updates the room assignment for a specific device.",
        "parameters": [
          {
            "name": "device_id",
            "in": "path",
            "required": true,
            "description": "The ID of the device to update.",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "newroomid",
            "in": "path",
            "required": true,
            "description": "The ID of the new room to assign to the device.",
            "schema": {
              "type": "integer"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Room updated successfully.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string"
                    },
                    "device_id": {
                      "type": "string"
                    },
                    "new_room_id": {
                      "type": "integer"
                    }
                  }
                },
                "example": {
                  "message": "Device room updated successfully.",
                  "device_id": "DEVICE123",
                  "new_room_id": 456
                }
              }
            }
          },
          "400": {
            "description": "Invalid input.",
            "content": {
              "application/json": {
                "example": {
                  "error": "new_room_id is required"
                }
              }
            }
          },
          "404": {
            "description": "Device or room not found.",
            "content": {
              "application/json": {
                "example": {
                  "error": "Device not found"
                }
              }
            }
          },
          "500": {
            "description": "Internal server error.",
            "content": {
              "application/json": {
                "example": {
                  "error": "An error occurred while updating the room."
                }
              }
            }
          }
        }
      }
    },

"/api/searchThings/working/{status}": {
      "get": {
        "tags": ["Test APP APIs"],
        "summary": "display thing with status and search on serialno",
        "description": "Fetch details about Things based on their serial number and status.",
        "parameters": [
          {
            "name": "serialno",
            "in": "query",
            "required":false,
            "description": "The serial number of the thing to search.",
            "schema": {
              "type": "string",
              "example": "SN12345"
            }
          },
          {
            "name": "status",
            "in": "path",
            "required": true,
            "description": "The status of the thing in the admin stock.",
            "schema": {
              "type": "string",
              "example": "active"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Matching records found",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "thing_id": { "type": "integer", "example": 1 },
                      "thingName": { "type": "string", "example": "Thing A" },
                      "thingid": { "type": "string", "example": "TH001" },
                      "deviceId": { "type": "string", "example": "DEV001" },
                      "macAddress": { "type": "string", "example": "00:1A:2B:3C:4D:5E" },
                      "createdby": { "type": "string", "example": "admin" },
                      "serialno": { "type": "string", "example": "SN12345" },
                      "admin_stock_status": { "type": "string", "example": "active" },
                      "addedAt": { "type": "string", "format": "date-time", "example": "2023-12-31T10:00:00Z" },
                      "addedby": { "type": "string", "example": "admin" },
                      "failureReason": { "type": "string", "example": "Connection issue" },
                      "fixed_by": { "type": "string", "example": "technician_1" },
                      "loggedAt": { "type": "string", "format": "date-time", "example": "2023-12-01T14:00:00Z" }
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Bad request (e.g., missing serial number)",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": { "type": "string", "example": "Serial number is required" }
                  }
                }
              }
            }
          },
          "404": {
            "description": "No matching records found",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string", "example": "No matching records found" }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Internal Server Error",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": { "type": "string", "example": "Internal Server Error" }
                  }
                }
              }
            }
          }
        }
      }
    },

"/api/scene-events": {
      "post": {
        "summary": "Create a new SceneEvent",
        "description": "Creates a new SceneEvent.",
        "tags": ["SceneEvent"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "sceneId": {
                    "type": "integer",
                    "description": "The ID of the scene associated with the event.",
                    "example": 1
                  },
                  "deviceId": {
                    "type": "integer",
                    "description": "The ID of the device associated with the event.",
                    "example": 2
                  },
                  "action": {
                    "type": "string",
                    "description": "The action performed during the event (e.g., ON, OFF).",
                    "example": "ON"
                  },
                  "datatime": {
                    "type": "string",
                    "format": "date-time",
                    "description": "The date and time of the event.",
                    "example": "2025-01-06T14:30:00Z"
                  }
                },
                "required": ["sceneId", "deviceId", "action", "datatime"]
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "SceneEvent created successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string",
                      "example": "SceneEvent created successfully"
                    },
                    "sceneEvent": {
                      "type": "object",
                      "properties": {
                        "id": {
                          "type": "integer",
                          "example": 1
                        },
                        "sceneId": {
                          "type": "integer",
                          "example": 1
                        },
                        "deviceId": {
                          "type": "integer",
                          "example": 2
                        },
                        "action": {
                          "type": "string",
                          "example": "ON"
                        },
                        "eventTime": {
                          "type": "string",
                          "format": "date-time",
                          "example": "2025-01-06T14:30:00Z"
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Error creating SceneEvent",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "Error creating SceneEvent"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },

"/api/scene-events/scene/{sceneId}": {
      "get": {
        "summary": "Retrieve SceneEvents by Scene ID",
        "description": "Retrieves all SceneEvents associated with a specific Scene ID.",
        "tags": ["SceneEvent"],
        "parameters": [
          {
            "name": "sceneId",
            "in": "path",
            "required": true,
            "description": "The ID of the scene whose events are being retrieved.",
            "schema": {
              "type": "integer",
              "example": 1
            }
          }
        ],
        "responses": {
          "200": {
            "description": "SceneEvents retrieved successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "sceneEvents": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "id": {
                            "type": "integer",
                            "example": 1
                          },
                          "sceneId": {
                            "type": "integer",
                            "example": 1
                          },
                          "deviceId": {
                            "type": "integer",
                            "example": 2
                          },
                          "action": {
                            "type": "string",
                            "example": "ON"
                          },
                          "eventTime": {
                            "type": "string",
                            "format": "date-time",
                            "example": "2025-01-06T14:30:00Z"
                          },
                          "sceneName": {
                            "type": "string",
                            "example": "Living Room Scene"
                          },
                          "deviceName": {
                            "type": "string",
                            "example": "Smart Light"
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Error retrieving SceneEvents for sceneId",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "Error retrieving SceneEvents for sceneId"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
"/api/update/scene-events/scene/{sceneId}": {
      "put": {
        "summary": "Update all SceneEvents by Scene ID",
        "description": "Updates all SceneEvents associated with a specific Scene ID.",
        "tags": ["SceneEvent"],
        "parameters": [
          {
            "name": "sceneId",
            "in": "path",
            "required": true,
            "description": "The ID of the scene whose events are being updated.",
            "schema": {
              "type": "integer",
              "example": 1
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "deviceId": {
                    "type": "integer",
                    "description": "The updated device ID for all events.",
                    "example": 3
                  },
                  "action": {
                    "type": "string",
                    "description": "The updated action for all events.",
                    "example": "OFF"
                  },
                  "datatime": {
                    "type": "string",
                    "format": "date-time",
                    "description": "The updated date and time for all events.",
                    "example": "2025-01-06T15:00:00Z"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "SceneEvents updated successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string",
                      "example": "SceneEvents updated successfully"
                    },
                    "updatedSceneEvents": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "id": {
                            "type": "integer",
                            "example": 1
                          },
                          "sceneId": {
                            "type": "integer",
                            "example": 1
                          },
                          "deviceId": {
                            "type": "integer",
                            "example": 3
                          },
                          "action": {
                            "type": "string",
                            "example": "OFF"
                          },
                          "eventTime": {
                            "type": "string",
                            "format": "date-time",
                            "example": "2025-01-06T15:00:00Z"
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "404": {
            "description": "No SceneEvents found for the specified sceneId",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "No SceneEvents found for the specified sceneId"
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Error updating SceneEvents",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "Error updating SceneEvents"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
"/api/recent/adminstock/activities": {
      "get": {
        "tags": ["Test APP APIs"],
        "summary": "Fetch recent activities in AdminStock",
        "description": "Retrieve the list of devices in AdminStock with pagination support.",
        "operationId": "getAdminStockActivities",
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "required": false,
            "description": "Page number for pagination",
            "schema": {
              "type": "integer",
              "default": 1
            }
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "description": "Number of records per page",
            "schema": {
              "type": "integer",
              "default": 10
            }
          }
        ],
        "responses": {
          "200": {
            "description": "A paginated list of admin stock activities",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "page": {
                      "type": "integer",
                      "description": "Current page"
                    },
                    "limit": {
                      "type": "integer",
                      "description": "Records per page"
                    },
                    "total": {
                      "type": "integer",
                      "description": "Total number of records"
                    },
                    "totalPages": {
                      "type": "integer",
                      "description": "Total number of pages"
                    },
                    "data": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "thing_id": {
                            "type": "integer",
                            "description": "ID of the thing"
                          },
                          "thingName": {
                            "type": "string",
                            "description": "Name of the thing"
                          },
                          "serialno": {
                            "type": "string",
                            "description": "Serial number of the thing"
                          },
                          "batchId": {
                            "type": "string",
                            "description": "Batch ID of the thing"
                          },
                          "model": {
                            "type": "string",
                            "description": "Model of the thing"
                          },
                          "addedAt": {
                            "type": "string",
                            "format": "date-time",
                            "description": "Timestamp when the thing was added to admin stock"
                          },
                          "admin_stock_status": {
                            "type": "string",
                            "description": "Status of the thing in admin stock"
                          },
                          "addedBy": {
                            "type": "string",
                            "description": "Username of the user who added the thing"
                          },
                          "addedByUserName": {
                            "type": "string",
                            "description": "Full name of the user who added the thing"
                          },
                          "fixed_by": {
                            "type": "string",
                            "description": "Username of the person who fixed the device, if applicable"
                          },
                          "failureReason": {
                            "type": "string",
                            "description": "Reason for device failure, if applicable"
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "404": {
            "description": "No devices found in AdminStock"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },

// "/api/display/devices/{thingid}": {
//       "get": {
//         "summary": "Get devices by Thing ID",
//         "description": "Fetch devices from the database using a specified Thing ID.",
//         "parameters": [
//           {
//             "name": "thingid",
//             "in": "path",
//             "required": true,
//             "description": "The unique identifier for the device.",
//             "schema": {
//               "type": "string"
//             }
//           }
//         ],
//         "responses": {
//           "200": {
//             "description": "Devices retrieved successfully.",
//             "content": {
//               "application/json": {
//                 "schema": {
//                   "type": "array",
//                   "items": {
//                     "type": "object",
//                     "properties": {
//                       "id": {
//                         "type": "integer",
//                         "description": "The unique ID of the device."
//                       },
//                       "thingid": {
//                         "type": "string",
//                         "description": "The Thing ID of the device."
//                       },
//                       "name": {
//                         "type": "string",
//                         "description": "The name of the device."
//                       },
//                       "status": {
//                         "type": "string",
//                         "description": "The status of the device."
//                       }
//                     }
//                   }
//                 }
//               }
//             }
//           },
//           "404": {
//             "description": "No records found for the provided Thing ID.",
//             "content": {
//               "application/json": {
//                 "schema": {
//                   "type": "object",
//                   "properties": {
//                     "message": {
//                       "type": "string",
//                       "example": "No records found"
//                     }
//                   }
//                 }
//               }
//             }
//           },
//           "500": {
//             "description": "Internal Server Error",
//             "content": {
//               "application/json": {
//                 "schema": {
//                   "type": "object",
//                   "properties": {
//                     "error": {
//                       "type": "string",
//                       "example": "Internal Server Error"
//                     }
//                   }
//                 }
//               }
//             }
//           }
//         },
//         "tags": ["Devices"]
//       }
//     },

"/api/display/user": {
      "get": {
        "summary": "Fetch User Details",
        "description": "Fetches user details based on the user ID provided in the request body or obtained from the authenticated user.",
        "requestBody": {
          "description": "Request body containing the user ID.",
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "userid": {
                    "type": "string",
                    "description": "ID of the user to fetch details for."
                  }
                },
                "required": ["userid"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Successful response with user details.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "userName": { "type": "string", "description": "Name of the user." },
                    "userRole": { "type": "string", "description": "Role of the user." },
                    "profilePic": { "type": "string", "description": "URL of the user's profile picture." }
                  }
                }
              }
            }
          },
          "404": {
            "description": "User not found.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string" }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Failed to fetch user by ID.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": { "type": "string" }
                  }
                }
              }
            }
          }
        }
      }
    },
"/api/adminstock/{status}/count": {
      "get": {
        "tags": ["Test APP APIs"],
        "summary": "Count AdminStock items by status",
        "description": "Returns the total count of AdminStock items where the status matches the given parameter.",
        "parameters": [
          {
            "name": "status",
            "in": "path",
            "required": true,
            "description": "The status of the items to count (e.g., 'new', 'returned', 'rework', 'exchange').",
            "schema": {
              "type": "string",
              "enum": ["new", "returned", "rework", "exchange"]
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Successfully fetched the count",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "example": "success"
                    },
                    "count": {
                      "type": "integer",
                      "example": 42
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Invalid status value",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "example": "error"
                    },
                    "message": {
                      "type": "string",
                      "example": "Invalid status value provided"
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Internal server error",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "example": "error"
                    },
                    "message": {
                      "type": "string",
                      "example": "Internal server error"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },

"/api/users/{userId}/profile-pic": {
      "post": {
        "summary": "Upload and update a user's profile picture",
        "description": "Uploads an image to AWS S3 and updates the profile picture URL in the database.",
        "parameters": [
          {
            "name": "userId",
            "in": "path",
            "required": true,
            "description": "ID of the user whose profile picture is being updated",
            "schema": {
              "type": "integer",
              "example": 1
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "multipart/form-data": {
              "schema": {
                "type": "object",
                "properties": {
                  "file": {
                    "type": "string",
                    "format": "binary",
                    "description": "The image file to upload"
                  }
                },
                "required": ["file"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Profile picture uploaded successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string",
                      "example": "Profile picture updated successfully"
                    },
                    "profilePic": {
                      "type": "string",
                      "format": "url",
                      "example": "https://your_bucket_name.s3.amazonaws.com/user_1_1672345678901.jpg"
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Bad request (e.g., no file uploaded)",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "No file uploaded"
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Internal server error",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "Failed to upload and update profile picture"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
"/api/display/all/devices/{userId}": {
      "get": {
        "summary": "Display all devices with floor and room details",
        "parameters": [
          {
            "name": "userId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "ID of the user"
          }
        ],
        "responses": {
          "200": {
            "description": "List of all devices with associated floor and room names",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "device_id": { "type": "integer" },
                      "deviceId": { "type": "string" },
                      "macAddress": { "type": "string" },
                      "hubIndex": { "type": "string" },
                      "createdBy": { "type": "string" },
                      "enable": { "type": "boolean" },
                      "status": { "type": "string" },
                      "icon": { "type": "string" },
                      "device_name": { "type": "string" },
                      "device_type": { "type": "string" },
                      "device_last_modified": { "type": "string", "format": "date-time" },
                      "floor_name": { "type": "string" },
                      "room_name": { "type": "string" }
                    }
                  }
                }
              }
            }
          },
          "404": {
            "description": "No devices found for the user"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },
"/app/reorder/rooms/{floor_id}": {
      "put": {
        "summary": "Reorder rooms in a floor",
        "description": "Updates the orderIndex for rooms within a specified floor.",
        "parameters": [
          {
            "name": "floor_id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "ID of the floor"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "user_id": {
                    "type": "integer",
                    "description": "ID of the user (optional if derived from JWT)"
                  },
                  "order": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "properties": {
                        "room_id": { "type": "integer" },
                        "orderIndex": { "type": "integer" }
                      },
                      "required": ["room_id", "orderIndex"]
                    }
                  }
                },
                "required": ["order"]
              },
              "example": {
                "user_id": 123,
                "order": [
                  { "room_id": 1, "orderIndex": 2 },
                  { "room_id": 2, "orderIndex": 1 }
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Rooms reordered successfully.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string" }
                  }
                },
                "example": {
                  "message": "Rooms reordered successfully."
                }
              }
            }
          },
          "400": {
            "description": "Invalid input.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": { "type": "string" }
                  }
                },
                "example": {
                  "error": "user_id, floor_id, and order array are required"
                }
              }
            }
          },
          "500": {
            "description": "Internal server error.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": { "type": "string" }
                  }
                },
                "example": {
                  "error": "An error occurred while reordering rooms."
                }
              }
            }
          }
        }
      }
    },
"/api/reorder/devices/{roomid}": {
      "put": {
        "tags": ["device"],
        "summary": "Reorder devices in a room",
        "description": "Updates the orderIndex for devices in a specified room based on the provided order array.",
        "parameters": [
          {
            "name": "roomid",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "ID of the room"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "order": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "properties": {
                        "device_id": { "type": "integer" },
                        "orderIndex": { "type": "integer" }
                      },
                      "required": ["device_id", "orderIndex"]
                    }
                  }
                },
                "required": ["order"]
              },
              "example": {
                "order": [
                  { "device_id": 1, "orderIndex": 2 },
                  { "device_id": 2, "orderIndex": 1 }
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Devices reordered successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string" }
                  }
                },
                "example": {
                  "message": "Devices reordered successfully."
                }
              }
            }
          },
          "500": {
            "description": "Internal server error",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string" }
                  }
                },
                "example": {
                  "message": "Internal server error"
                }
              }
            }
          }
        }
      }
    },
"/api/device/favorite/{deviceid}": {
      "put": {
        "tags": ["device"],
        "summary": "Mark a device as favorite",
        "parameters": [
          {
            "name": "deviceid",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "ID of the device"
          }
        ],
        "responses": {
          "200": {
            "description": "Device marked as favorite successfully"
          },
          "500": {
            "description": "Error updating favorite status"
          }
        }
      }
    },
"/api/favorite-devices/{userId}": {
      "get": {
        "tags": ["device"],
        "summary": "Retrieve favorite devices for a user",
        "parameters": [
          {
            "name": "userId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "ID of the user"
          }
        ],
        "responses": {
          "200": {
            "description": "List of favorite devices",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "type": "object"
                  }
                }
              }
            }
          },
          "500": {
            "description": "Error fetching favorite devices"
          }
        }
      }
    },
"/app/searchThings/{status}": {
      "get": {
        "summary": "Search things by status",
        "description": "Retrieves a paginated list of things filtered by their status.",
        "parameters": [
          {
            "name": "status",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "The status of the things to filter by (e.g., 'rework', 'new')."
          },
          {
            "name": "limit",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 10
            },
            "description": "The number of records to return per page (default: 10)."
          },
          {
            "name": "offset",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 0
            },
            "description": "The number of records to skip before starting to return results (default: 0)."
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response with paginated results",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "page": {
                      "type": "integer",
                      "description": "The current page number."
                    },
                    "limit": {
                      "type": "integer",
                      "description": "The number of records per page."
                    },
                    "total": {
                      "type": "integer",
                      "description": "The total number of records."
                    },
                    "totalPages": {
                      "type": "integer",
                      "description": "The total number of pages."
                    },
                    "data": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "thingId": { "type": "integer" },
                          "thingName": { "type": "string" },
                          "serialno": { "type": "string" },
                          "model": { "type": "string" },
                          "adminStockStatus": { "type": "string" },
                          "failureReason": { "type": "string" },
                          "loggedAt": { "type": "string", "format": "date-time" }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Invalid input or missing parameters",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string" }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Internal server error",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string" },
                    "error": { "type": "string" }
                  }
                }
              }
            }
          }
        }
      }
    },
"/api/delete/things/{id}": {
      "delete": {
        "summary": "Delete a Thing by ID",
        "description": "Deletes a specific Thing by its ID.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "The ID of the Thing to delete.",
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Thing deleted successfully.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string"
                    },
                    "thing": {
                      "type": "object",
                      "description": "The deleted Thing object."
                    }
                  }
                }
              }
            }
          },
          "404": {
            "description": "Thing not found.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Internal Server Error.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string"
                    },
                    "error": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
"/api/delete/all/things": {
      "delete": {
        "summary": "Delete all Things",
        "description": "Deletes all Things from the database.",
        "responses": {
          "200": {
            "description": "All Things deleted successfully.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string"
                    },
                    "deletedThings": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "description": "The deleted Things objects."
                      }
                    }
                  }
                }
              }
            }
          },
          "404": {
            "description": "No Things found to delete.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Internal Server Error.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string"
                    },
                    "error": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },


"/api/register/fcmtoken": {
      "post": {
        "summary": "Register FCM Token",
        "description": "Registers a new FCM token for a user.",
        "tags": ["UserFCMTokens"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "fcmToken": {
                    "type": "string",
                    "description": "Firebase Cloud Messaging token",
                    "example": "abcd1234efgh5678"
                  },
                  "id": {
                    "type": "integer",
                    "description": "User ID (if not derived from authentication)",
                    "example": 42
                  }
                },
                "required": ["fcmToken"]
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Token added successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string",
                      "example": "Token added successfully"
                    },
                    "token": {
                      "type": "object",
                      "description": "The newly added token",
                      "properties": {
                        "id": {
                          "type": "integer",
                          "example": 1
                        },
                        "userId": {
                          "type": "integer",
                          "example": 42
                        },
                        "fcmToken": {
                          "type": "string",
                          "example": "abcd1234efgh5678"
                        },
                        "createdAt": {
                          "type": "string",
                          "format": "date-time",
                          "example": "2025-01-06T12:00:00Z"
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Error adding token",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "Error adding token"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
"/api/retrieve/fcmtokens/{userId}": {
      "get": {
        "summary": "Retrieve FCM Tokens",
        "description": "Retrieves all FCM tokens for a given user.",
        "tags": ["UserFCMTokens"],
        "parameters": [
          {
            "name": "userId",
            "in": "path",
            "required": true,
            "description": "The ID of the user whose tokens are being retrieved.",
            "schema": {
              "type": "integer",
              "example": 42
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Tokens retrieved successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "tokens": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "id": {
                            "type": "integer",
                            "example": 1
                          },
                          "userId": {
                            "type": "integer",
                            "example": 42
                          },
                          "fcmToken": {
                            "type": "string",
                            "example": "abcd1234efgh5678"
                          },
                          "createdAt": {
                            "type": "string",
                            "format": "date-time",
                            "example": "2025-01-06T12:00:00Z"
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Error retrieving tokens",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "Error retrieving tokens"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },

"/api/create/notifications": {
      "post": {
        "summary": "Create Notification",
        "description": "Creates a new notification and associated message.",
        "tags": ["Notifications"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "userId": { "type": "integer", "example": 1 },
                  "deviceId": { "type": "integer", "example": 2 },
                  "message": { "type": "string", "example": "Your device has been updated." }
                },
                "required": ["userId", "deviceId", "message"]
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Notification created successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string", "example": "Notification created successfully" },
                    "notification": {
                      "type": "object",
                      "properties": {
                        "id": { "type": "integer", "example": 1 },
                        "userId": { "type": "integer", "example": 1 },
                        "deviceId": { "type": "integer", "example": 2 },
                        "createdAt": { "type": "string", "format": "date-time", "example": "2025-01-06T12:00:00Z" }
                      }
                    },
                    "notificationMessage": {
                      "type": "object",
                      "properties": {
                        "id": { "type": "integer", "example": 1 },
                        "notificationId": { "type": "integer", "example": 1 },
                        "message": { "type": "string", "example": "Your device has been updated." }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
"/api/retrieve/notifications/{userId}": {
      "get": {
        "summary": "Retrieve Notifications",
        "description": "Retrieves all notifications and messages for a specific user.",
        "tags": ["Notifications"],
        "parameters": [
          {
            "name": "userId",
            "in": "path",
            "required": true,
            "schema": { "type": "integer" },
            "description": "The ID of the user.",
            "example": 1
          }
        ],
        "responses": {
          "200": {
            "description": "Notifications retrieved successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "notifications": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "notificationId": { "type": "integer", "example": 1 },
                          "userId": { "type": "integer", "example": 1 },
                          "deviceId": { "type": "integer", "example": 2 },
                          "createdAt": { "type": "string", "format": "date-time", "example": "2025-01-06T12:00:00Z" },
                          "messageId": { "type": "integer", "example": 1 },
                          "message": { "type": "string", "example": "Your device has been updated." }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
"/api/delete/notifications/{notificationId}": {
      "delete": {
        "summary": "Delete Notification",
        "description": "Deletes a notification and its associated message.",
        "tags": ["Notifications"],
        "parameters": [
          {
            "name": "notificationId",
            "in": "path",
            "required": true,
            "schema": { "type": "integer" },
            "description": "The ID of the notification.",
            "example": 1
          }
        ],
        "responses": {
          "200": {
            "description": "Notification deleted successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string", "example": "Notification deleted successfully" }
                  }
                }
              }
            }
          },
          "404": {
            "description": "Notification not found",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": { "type": "string", "example": "Notification not found" }
                  }
                }
              }
            }
          }
        }
      }
    }, 
    
// "/app/add/home/": {
//   post: {
//     summary: "Add a new home",
//     description: "Create a new home entry in the database with the specified name. The created_by field is automatically set based on the authenticated user's information.",
//     tags: ["Homes"],
//     security: [
//       {
//         bearerAuth: []  // Ensure that your security scheme is defined globally for JWT
//       }
//     ],
//     requestBody: {
//       required: true,
//       content: {
//         "application/json": {
//           schema: {
//             type: "object",
//             properties: {
//               name: {
//                 type: "string",
//                 description: "Name of the home"
//               }
//             },
//             required: ["name"],
//             example: {
//               name: "My Sweet Home"
//             }
//           }
//         }
//       }
//     },
//     responses: {
//       201: {
//         description: "Home added successfully",
//         content: {
//           "application/json": {
//             schema: {
//               type: "object",
//               properties: {
//                 message: {
//                   type: "string",
//                   example: "Home added successfully"
//                 },
//                 homeId: {
//                   type: "integer",
//                   example: 1
//                 }
//               }
//             }
//           }
//         }
//       },
//       400: {
//         description: "Bad Request - Missing or invalid data",
//         content: {
//           "application/json": {
//             schema: {
//               type: "object",
//               properties: {
//                 error: {
//                   type: "string",
//                   example: "name and created_by are required"
//                 }
//               }
//             }
//           }
//         }
//       },
//       500: {
//         description: "Internal Server Error",
//         content: {
//           "application/json": {
//             schema: {
//               type: "object",
//               properties: {
//                 error: {
//                   type: "string",
//                   example: "An error occurred while adding the home"
//                 }
//               }
//             }
//           }
//         }
//       }
//     }
//   }
// },

"/app/add/home/": {
      "post": {
        "summary": "Add a new home",
        "description": "Creates a new home record and associates it with the authenticated user.",
        "tags": ["Homes"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "name": {
                    "type": "string",
                    "description": "Name of the home",
                    "example": "My Sweet Home"
                  },
                  "username": {
                    "type": "string",
                    "description": "Username of the creator (optional if authenticated)",
                    "example": "johndoe"
                  },
                  "id": {
                    "type": "integer",
                    "description": "User ID (optional if authenticated)",
                    "example": 123
                  }
                },
                "required": ["name"]
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Home added successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string",
                      "example": "Home added successfully"
                    },
                    "homeId": {
                      "type": "integer",
                      "example": 1
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Validation error",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "Name is required"
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Server error",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "An error occurred while adding the home"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },


    //------------------------
// "/app/display/homes/": {
//         get: {
//           summary: "Get all homes for a user",
//           description: "Retrieve a list of homes associated with the authenticated user.",
//           tags: ["Homes"],
//           security: [
//             {
//               bearerAuth: [], // Include if your API uses JWT authentication
//             },
//           ],
//              "requestBody": {
//           "required": true,
//           "content": {
//             "application/json": {
//               "schema": {
//                 "type": "object",
//                 "properties": {
                 
//                   "userId": {
//                     "type": "integer",
//                     "description": "User ID (optional if authenticated)",
//                     "example": 123
//                   }
//                 },
//                 "required": ["name"]
//               }
//             }
//           }
//         },
//           responses: {
//             200: {
//               description: "A list of homes for the authenticated user",
//               content: {
//                 "application/json": {
//                   schema: {
//                     type: "array",
//                     items: {
//                       type: "object",
//                       properties: {
//                         id: {
//                           type: "integer",
//                           description: "Unique identifier for the home",
//                           example: 1,
//                         },
//                         name: {
//                           type: "string",
//                           description: "Name of the home",
//                           example: "My Sweet Home",
//                         },
//                         created_by: {
//                           type: "string",
//                           description: "User who created the home",
//                           example: "john_doe",
//                         },
//                         userid: {
//                           type: "integer",
//                           description: "ID of the user associated with the home",
//                           example: 42,
//                         },
//                       },
//                     },
//                   },
//                 },
//               },
//             },
//             404: {
//               description: "No homes found for the user",
//               content: {
//                 "application/json": {
//                   schema: {
//                     type: "object",
//                     properties: {
//                       error: {
//                         type: "string",
//                         example: "No homes found for this user",
//                       },
//                     },
//                   },
//                 },
//               },
//             },
//             500: {
//               description: "Internal server error",
//               content: {
//                 "application/json": {
//                   schema: {
//                     type: "object",
//                     properties: {
//                       error: {
//                         type: "string",
//                         example: "An error occurred while fetching homes",
//                       },
//                     },
//                   },
//                 },
//               },
//             },
//           },
//         },
//       },

"/app/display/homes/": {
      "get": {
        "summary": "Fetch homes for a user",
        "description": "Retrieves a list of homes associated with the user ID provided in query parameters.",
        "tags": ["Homes"],
        "parameters": [
          {
            "name": "userId",
            "in": "query",
            "required": true,
            "description": "User ID to fetch associated homes",
            "schema": {
              "type": "string",
              "example": "123"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "List of homes successfully retrieved",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "id": {
                        "type": "integer",
                        "description": "Unique identifier for the home",
                        "example": 1
                      },
                      "name": {
                        "type": "string",
                        "description": "Name of the home",
                        "example": "My Sweet Home"
                      },
                      "created_by": {
                        "type": "string",
                        "description": "User who created the home",
                        "example": "john_doe"
                      },
                      "userid": {
                        "type": "integer",
                        "description": "ID of the user associated with the home",
                        "example": 42
                      }
                    }
                  }
                }
              }
            }
          },
          "404": {
            "description": "No homes found for the user",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "No homes found for this user"
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Internal server error",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
                      "type": "string",
                      "example": "An error occurred while fetching homes"
                    }
                  }
                }
              }
            }
          }
        }
      }
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
            // requestBody: {
            //     required: true,
            //     content: {
            //         "application/json": {
            //             schema: {
            //                 type: "object",
            //                 properties: {
            //                     name: {
            //                         type: "string",
            //                         description: "Name of the floor",
            //                     },
            //                 },
            //             },
            //             example: {
            //                 name: "Ground Floor",
            //             },
            //         },
            //     },
            // },
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
// "/app/add/floor/{home_id}": {
//       "post": {
//         "summary": "Add a floor to a home",
//         "description": "This endpoint allows adding a new floor to a specific home. The floor name is automatically incremented based on existing floor names.",
//         "operationId": "addFloor",
//         "tag":["floors"],
//         "parameters": [
//           {
//             "name": "home_id",
//             "in": "path",
//             "required": true,
//             "description": "ID of the home to add a floor to",
//             "schema": {
//               "type": "string"
//             }
//           }
//         ],
//         "requestBody": {
//           "required": true,
//           "content": {
//             "application/json": {
//               "schema": {
//                 "type": "object",
//                 "properties": {
//                   "name": {
//                     "type": "string",
//                     "description": "The name of the floor to be added."
//                   }
//                 },
//                 "required": ["name"]
//               }
//             }
//           }
//         },
//         "responses": {
//           "201": {
//             "description": "Floor added successfully",
//             "content": {
//               "application/json": {
//                 "schema": {
//                   "type": "object",
//                   "properties": {
//                     "message": {
//                       "type": "string",
//                       "example": "Floor added successfully"
//                     },
//                     "floorId": {
//                       "type": "integer",
//                       "example": 1
//                     },
//                     "floorName": {
//                       "type": "string",
//                       "example": "floor3"
//                     }
//                   }
//                 }
//               }
//             }
//           },
//           "400": {
//             "description": "Bad request due to missing or invalid parameters",
//             "content": {
//               "application/json": {
//                 "schema": {
//                   "type": "object",
//                   "properties": {
//                     "error": {
//                       "type": "string",
//                       "example": "home_id is required"
//                     }
//                   }
//                 }
//               }
//             }
//           },
//           "500": {
//             "description": "Internal server error",
//             "content": {
//               "application/json": {
//                 "schema": {
//                   "type": "object",
//                   "properties": {
//                     "error": {
//                       "type": "string",
//                       "example": "An error occurred while adding the floor"
//                     }
//                   }
//                 }
//               }
//             }
//           }
//         }
//       }
// },
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
                            },
                            user_id: {
                              type: "string",
                             example: "123",
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

// "/api/display/thingattribute/{thingid}": {
//     get: {
//         summary: "Get attributes of a specific thing",
//         description: "Fetch a list of attributes for a specific thing identified by its ID.",
//         tags: ["ThingAttributes"],
//         parameters: [
//             {
//                 in: "path",
//                 name: "thingid",
//                 required: true,
//                 description: "ID of the thing whose attributes are to be retrieved",
//                 schema: {
//                     type: "integer"
//                 }
//             }
//         ],
//         responses: {
//             200: {
//                 description: "Attributes retrieved successfully",
//                 content: {
//                     "application/json": {
//                         schema: {
//                             type: "array",
//                             items: {
//                                 type: "object",
//                                 properties: {
//                                     thingid: {
//                                         type: "integer",
//                                         example: 1
//                                     },
//                                     attribute_name: {
//                                         type: "string",
//                                         example: "Color"
//                                     },
//                                     attribute_value: {
//                                         type: "string",
//                                         example: "Red"
//                                     },
//                                     // Include other attributes as per the 'thingattributes' table structure
//                                 }
//                             }
//                         }
//                     }
//                 }
//             },
//             404: {
//                 description: "No attributes found for the specified thing",
//                 content: {
//                     "application/json": {
//                         schema: {
//                             type: "object",
//                             properties: {
//                                 message: {
//                                     type: "string",
//                                     example: "No records found"
//                                 }
//                             }
//                         }
//                     }
//                 }
//             },
//             500: {
//                 description: "Internal server error",
//                 content: {
//                     "application/json": {
//                         schema: {
//                             type: "object",
//                             properties: {
//                                 error: {
//                                     type: "string",
//                                     example: "Internal Server Error"
//                                 }
//                             }
//                         }
//                     }
//                 }
//             }
//         }
//     }
// },

// ---------------

"/api/display/thingattribute/{serialno}": {
      "get": {
        "tags": ["Test APP APIs"],
        "summary": "Get Thing Attributes by Serial Number",
        "description": "Fetch paginated thing attributes for a specific thing identified by its serial number.",
        "parameters": [
          {
            "name": "serialno",
            "in": "path",
            "required": true,
            "description": "Serial number of the thing",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "page",
            "in": "query",
            "required": false,
            "description": "Page number for pagination (default is 1)",
            "schema": {
              "type": "integer",
              "default": 1
            }
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "description": "Number of records per page (default is 10)",
            "schema": {
              "type": "integer",
              "default": 10
            }
          }
        ],
        "responses": {
          "200": {
            "description": "A list of thing attributes for the specified serialno",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "page": {
                      "type": "integer"
                    },
                    "limit": {
                      "type": "integer"
                    },
                    "total": {
                      "type": "integer"
                    },
                    "totalPages": {
                      "type": "integer"
                    },
                    "data": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "id": {
                            "type": "integer"
                          },
                          "thingId": {
                            "type": "integer"
                          },
                          "attributeName": {
                            "type": "string"
                          },
                          "attributeValue": {
                            "type": "string"
                          },
                          "lastModified": {
                            "type": "string",
                            "format": "date-time"
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Invalid or missing serialno, page or limit value"
          },
          "404": {
            "description": "No thing found for the given serialno or no attributes found"
          },
          "500": {
            "description": "Internal Server Error"
          }
        }
      }
    },

// "/api/display/test/{type}": {
//     get: {
//         summary: "Get thing by type",
//         description: "Fetch a thing record based on the provided type parameter.",
//         tags: ["Things"],
//         parameters: [
//             {
//                 in: "path",
//                 name: "type",
//                 required: true,
//                 description: "Type of the thing to be retrieved",
//                 schema: {
//                     type: "string"
//                 }
//             }
//         ],
//         responses: {
//             200: {
//                 description: "Thing retrieved successfully",
//                 content: {
//                     "application/json": {
//                         schema: {
//                             type: "object",
//                             properties: {
//                                 success: {
//                                     type: "boolean",
//                                     example: true
//                                 },
//                                 data: {
//                                     type: "object",
//                                     properties: {
//                                         id: {
//                                             type: "integer",
//                                             example: 1
//                                         },
//                                         name: {
//                                             type: "string",
//                                             example: "Laptop"
//                                         },
//                                         type: {
//                                             type: "string",
//                                             example: "Electronics"
//                                         },
//                                         // Add additional thing properties as per your 'things' table schema
//                                     }
//                                 }
//                             }
//                         }
//                     }
//                 }
//             },
//             404: {
//                 description: "No records found for the given type",
//                 content: {
//                     "application/json": {
//                         schema: {
//                             type: "object",
//                             properties: {
//                                 success: {
//                                     type: "boolean",
//                                     example: false
//                                 },
//                                 message: {
//                                     type: "string",
//                                     example: "No records found"
//                                 }
//                             }
//                         }
//                     }
//                 }
//             },
//             500: {
//                 description: "Internal server error",
//                 content: {
//                     "application/json": {
//                         schema: {
//                             type: "object",
//                             properties: {
//                                 success: {
//                                     type: "boolean",
//                                     example: false
//                                 },
//                                 message: {
//                                     type: "string",
//                                     example: "An error occurred while fetching data"
//                                 }
//                             }
//                         }
//                     }
//                 }
//             }
//         }
//     }
// },
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

"/api/display/all/devices/{userId}": {
      "get": {
        "tags": ["device"],
        "summary": "Get All Devices for a User",
        "description": "Fetch all devices with their details, along with the floor and room they are located in, for a specific user.",
        "parameters": [
          {
            "name": "userId",
            "in": "path",
            "required": true,
            "description": "The ID of the user whose devices are being fetched.",
            "schema": {
              "type": "integer",
              "example": 1
            }
          }
        ],
        "responses": {
          "200": {
            "description": "List of devices with full details.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "device_id": { "type": "integer", "example": 1 },
                      "deviceId": { "type": "string", "example": "ABC123" },
                      "macAddress": { "type": "string", "example": "00:1B:44:11:3A:B7" },
                      "hubIndex": { "type": "string", "example": "HUB01" },
                      "createdBy": { "type": "string", "example": "admin" },
                      "enable": { "type": "boolean", "example": true },
                      "status": { "type": "string", "example": "new" },
                      "icon": { "type": "string", "example": "thermostat.png" },
                      "device_name": { "type": "string", "example": "Smart Thermostat" },
                      "device_type": { "type": "string", "example": "Thermostat" },
                      "device_last_modified": {
                        "type": "string",
                        "format": "date-time",
                        "example": "2025-01-01T12:34:56"
                      },
                      "floor_name": { "type": "string", "example": "First Floor" },
                      "room_name": { "type": "string", "example": "Living Room" }
                    }
                  }
                }
              }
            }
          },
          "404": {
            "description": "No devices found for the user.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string", "example": "No devices found for this user." }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Internal Server Error.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": { "type": "string", "example": "Internal Server Error" }
                  }
                }
              }
            }
          }
        },
        "tags": ["Devices"]
      }
    },
"/app/add/scenes/{userid}": {
      "post": {
        "summary": "Add a new scene",
        "description": "Create a new scene with optional icon upload and insert it into the database.",
        "tags": ["Scenes"],
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "userid",
            "in": "path",
            "required": true,
            "description": "The ID of the user to whom the scene belongs",
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "multipart/form-data": {
              "schema": {
                "type": "object",
                "properties": {
                  "name": { "type": "string" },
                  "aliasName": { "type": "string" },
                  "type": { "type": "string" },
                  "icon": {
                    "type": "string",
                    "format": "binary"
                  },
                  "createdBy": { "type": "string" }
                },
                "required": ["name", "type"]
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Scene successfully created",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "id": { "type": "integer", "example": 1 },
                    "name": { "type": "string", "example": "My Scene" },
                    "aliasName": { "type": "string", "example": "Scene Alias" },
                    "type": { "type": "string", "example": "Type A" },
                    "createdBy": { "type": "string", "example": "Admin" },
                    "icon": { "type": "string", "example": "https://s3-bucket/icon-url.png" }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Invalid input data",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string", "example": "Invalid input data" }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Internal server error",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string", "example": "An error occurred" },
                    "error": { "type": "string", "example": "Error details" }
                  }
                }
              }
            }
          }
        }
      }
    },
"/app/display/scenes/{userid}": {
      "get": {
        "summary": "Get all scenes for a user",
        "description": "Fetch all scenes that belong to a specific user.",
        "tags": ["Scenes"],
        "parameters": [
          {
            "name": "userid",
            "in": "path",
            "required": true,
            "description": "The ID of the user",
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "List of scenes",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "id": { "type": "integer", "example": 1 },
                      "name": { "type": "string", "example": "My Scene" },
                      "aliasName": { "type": "string", "example": "Alias" },
                      "type": { "type": "string", "example": "Type A" }
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Internal server error",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string", "example": "An error occurred" }
                  }
                }
              }
            }
          }
        }
      }
    },
"/app/update/scenes/{id}": {
      "put": {
        "summary": "Update a scene",
        "description": "Update the details of a scene, including optional icon upload.",
        "tags": ["Scenes"],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "The ID of the scene to update",
            "schema": {
              "type": "integer"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "multipart/form-data": {
              "schema": {
                "type": "object",
                "properties": {
                  "name": { "type": "string" },
                  "aliasName": { "type": "string" },
                  "type": { "type": "string" },
                  "icon": {
                    "type": "string",
                    "format": "binary"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Scene successfully updated",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "id": { "type": "integer", "example": 1 },
                    "name": { "type": "string", "example": "Updated Scene" },
                    "aliasName": { "type": "string", "example": "Updated Alias" },
                    "type": { "type": "string", "example": "Type B" }
                  }
                }
              }
            }
          },
          "404": {
            "description": "Scene not found",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string", "example": "Scene not found" }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Internal server error",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string", "example": "An error occurred" }
                  }
                }
              }
            }
          }
        }
      }
    },
"app/delete/scenes/{id}": {
      "delete": {
        "summary": "Delete a scene",
        "description": "Delete a scene by its ID.",
        "tags": ["Scenes"],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "The ID of the scene to delete",
            "schema": {
              "type": "integer"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Scene successfully deleted",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string", "example": "Scene deleted successfully" }
                  }
                }
              }
            }
          },
          "404": {
            "description": "Scene not found",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string", "example": "Scene not found" }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Internal server error",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string", "example": "An error occurred" }
                  }
                }
              }
            }
          }
        }
      }
    },
  
"/app/create/scene_devices/{scene_id}/{device_id}": {
    post: {
      summary: "Create a Scene Device",
      description: "Add a device to a scene by specifying the scene ID and device ID.",
      tags: ["Scene Devices"],
      security: [
        {
          bearerAuth: [] // JWT authentication
        }
      ],
      parameters: [
        {
          name: "scene_id",
          in: "path",
          required: true,
          schema: {
            type: "integer"
          },
          description: "The ID of the scene to associate the device with."
        },
        {
          name: "device_id",
          in: "path",
          required: true,
          schema: {
            type: "integer"
          },
          description: "The ID of the device to associate with the scene."
        }
      ],
      responses: {
        201: {
          description: "Scene device created successfully.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  id: { type: "integer", example: 1 },
                  device_id: { type: "integer", example: 3 },
                  scene_id: { type: "integer", example: 5 },
                  message: { type: "string", example: "Scene device created successfully" }
                }
              }
            }
          }
        },
        400: {
          description: "Invalid input data",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Invalid input data" }
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
                  message: { type: "string", example: "An error occurred" },
                  error: { type: "string", example: "Error details" }
                }
              }
            }
          }
        }
      }
    }
  },
"/api/display/scenes/{scene_id}/devices": {
    get: {
      summary: "Get Devices in a Scene",
      description: "Retrieve all devices associated with a specific scene ID.",
      tags: ["Scene Devices"],
      security: [
        {
          bearerAuth: [] // JWT authentication
        }
      ],
      parameters: [
        {
          name: "scene_id",
          in: "path",
          required: true,
          schema: {
            type: "integer"
          },
          description: "The ID of the scene."
        }
      ],
      responses: {
        200: {
          description: "List of devices in the specified scene.",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "integer", example: 1 },
                    device_id: { type: "integer", example: 3 },
                    scene_id: { type: "integer", example: 5 },
                    name: { type: "string", example: "Living Room Light" },
                    type: { type: "string", example: "light" },
                    status: { type: "string", example: "active" }
                  }
                }
              }
            }
          }
        },
        404: {
          description: "No devices found for the specified scene.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "No devices found for the specified scene ID" }
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
                  message: { type: "string", example: "An error occurred" },
                  error: { type: "string", example: "Error details" }
                }
              }
            }
          }
        }
      }
    }
  },


"/app/Update/scene_devices/{id}": {
      put: {
        summary: "Update a Scene Device",
        description: "Updates the specified fields of a scene-device association by ID.",
        tags: ["Scene Devices"],
        security: [
          {
            bearerAuth: [] // JWT authentication
          }
        ],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "integer"
            },
            description: "The ID of the scene-device association to update."
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", example: "Updated Device Name" },
                  type: { type: "string", example: "light" },
                  status: { type: "string", example: "active" }
                }
              },
              example: {
                name: "Updated Device Name",
                type: "light",
                status: "active"
              }
            }
          }
        },
        responses: {
          200: {
            description: "Scene device updated successfully.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "integer", example: 1 },
                    device_id: { type: "integer", example: 3 },
                    scene_id: { type: "integer", example: 5 },
                    name: { type: "string", example: "Updated Device Name" },
                    type: { type: "string", example: "light" },
                    status: { type: "string", example: "active" }
                  }
                }
              }
            }
          },
          400: {
            description: "No fields to update.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "No fields to update" }
                  }
                }
              }
            }
          },
          404: {
            description: "Scene device not found.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "Scene device not found" }
                  }
                }
              }
            }
          },
          500: {
            description: "Internal server error.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "An error occurred" },
                    error: { type: "string", example: "Error details" }
                  }
                }
              }
            }
          }
        }
      }
    },
"/api/delete/scene_devices/{id}": {
      delete: {
        summary: "Delete a Scene Device",
        description: "Deletes a scene-device association by ID.",
        tags: ["Scene Devices"],
        security: [
          {
            bearerAuth: [] // JWT authentication
          }
        ],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "integer"
            },
            description: "The ID of the scene-device association to delete."
          }
        ],
        responses: {
          200: {
            description: "Scene device deleted successfully.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "Scene device deleted successfully" }
                  }
                }
              }
            }
          },
          404: {
            description: "Scene device not found.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "Scene device not found" }
                  }
                }
              }
            }
          },
          500: {
            description: "Internal server error.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "An error occurred" },
                    error: { type: "string", example: "Error details" }
                  }
                }
              }
            }
          }
        }
      }
    },
    
    
"/signup/app/customer/signup": {
      "post": {
        "summary": "Customer Signup",
        "description": "Registers a new customer with AWS Cognito and stores user details in the PostgreSQL database.",
        "tags": ["Authentication"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "userName": {
                    "type": "string",
                    "description": "The username of the customer.",
                    "example": "john_doe"
                  },
                  "password": {
                    "type": "string",
                    "description": "The password for the customer.",
                    "example": "StrongPassword123!"
                  },
                  "email": {
                    "type": "string",
                    "format": "email",
                    "description": "The email address of the customer.",
                    "example": "john.doe@example.com"
                  },
                  "phoneNumber": {
                    "type": "string",
                    "description": "The phone number of the customer.",
                    "example": "+1234567890"
                  },
                  "fullName": {
                    "type": "string",
                    "description": "The full name of the customer.",
                    "example": "John Doe"
                  }
                },
                "required": ["userName", "password", "email"]
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "User signed up successfully.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string",
                      "example": "User signed up successfully"
                    },
                    "userSub": {
                      "type": "string",
                      "description": "The unique identifier for the user in Cognito.",
                      "example": "12345-abcde-67890"
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Missing required fields.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string",
                      "example": "Missing required fields"
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Error during Cognito sign-up.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string",
                      "example": "Error during Cognito sign-up"
                    },
                    "error": {
                      "type": "string",
                      "example": "InvalidPasswordException"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },

"/signup/verify-otp": {
      "post": {
        "summary": "Verify OTP",
        "description": "Verifies the OTP entered by the user during signup and confirms their account in AWS Cognito.",
        "tags": ["Verification"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "username": {
                    "type": "string",
                    "description": "The username of the user.",
                    "example": "john_doe"
                  },
                  "otp": {
                    "type": "string",
                    "description": "The OTP sent to the user's email or phone.",
                    "example": "123456"
                  }
                },
                "required": ["username", "otp"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OTP verified successfully.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string",
                      "example": "OTP verified successfully"
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Invalid request or OTP errors.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string",
                      "example": "Invalid OTP"
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Server error during OTP verification.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string",
                      "example": "Error during OTP verification"
                    },
                    "error": {
                      "type": "string",
                      "example": "InternalServerError"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },

"/signup/resend-otp": {
      "post": {
        "summary": "Resend OTP",
        "description": "Resends the OTP to the user during the signup process.",
        "tags": ["Verification"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "username": {
                    "type": "string",
                    "description": "The username of the user.",
                    "example": "john_doe"
                  }
                },
                "required": ["username"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OTP resent successfully.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string",
                      "example": "OTP resent successfully"
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Missing required field: username.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string",
                      "example": "Missing required field: username"
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Error during OTP resend.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string",
                      "example": "Error during OTP resend"
                    },
                    "error": {
                      "type": "string",
                      "example": "InternalServerError"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
"/signup/login": {
      "post": {
        "summary": "User Login",
        "description": "Authenticates the user using AWS Cognito and returns a JWT token along with user details.",
        "tags": ["Authentication"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "username": {
                    "type": "string",
                    "description": "The username of the user.",
                    "example": "johndoe@gmail.com"
                  },
                  "password": {
                    "type": "string",
                    "description": "The password of the user.",
                    "example": "StrongPassword123!"
                  }
                },
                "required": ["username", "password"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Login successful.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string",
                      "example": "Login successful"
                    },
                    "token": {
                      "type": "string",
                      "description": "JWT token for authenticated requests.",
                      "example": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    },
                    "jwtsub": {
                      "type": "string",
                      "description": "Unique identifier for the user in Cognito.",
                      "example": "12345-abcde-67890"
                    },
                    "user": {
                      "type": "object",
                      "description": "Details of the authenticated user.",
                      "example": {
                        "userName": "johndoe@gmail.com",
                        "jwtsub": "12345-abcde-67890",
                        "userRole": "customer"
                      }
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Missing required fields or invalid token.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string",
                      "example": "Missing required fields"
                    }
                  }
                }
              }
            }
          },
          "404": {
            "description": "User not found for the provided sub.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string",
                      "example": "User not found for the provided sub"
                    }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Error during login.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string",
                      "example": "Error during login"
                    },
                    "error": {
                      "type": "string",
                      "example": "InternalServerError"
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
  