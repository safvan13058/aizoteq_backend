const Swaggerdoc = {
    "/api/users/count": {
        "get": {
          "summary": "Count users",
          "description": "Retrieve the total number of users in the system.",
          "responses": {
            "200": {
              "description": "Number of users successfully retrieved.",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "user_count": {
                        "type": "integer",
                        "description": "Total number of users."
                      }
                    }
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
                      "error": {
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
      "/api/users/graph": {
        "get": {
          "summary": "User graph data",
          "description": "Retrieve user data grouped by day or month.",
          "parameters": [
            {
              "name": "groupBy",
              "in": "query",
              "required": true,
              "description": "Group users by 'day' or 'month'.",
              "schema": {
                "type": "string",
                "enum": ["day", "month"]
              }
            }
          ],
          "responses": {
            "200": {
              "description": "Graph data successfully retrieved.",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "groupBy": {
                        "type": "string",
                        "description": "The grouping method (day or month)."
                      },
                      "data": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "properties": {
                            "period": {
                              "type": "string",
                              "description": "The date or month representing the period."
                            },
                            "user_count": {
                              "type": "integer",
                              "description": "Number of users for the period."
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
              "description": "Invalid groupBy value.",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "error": {
                        "type": "string",
                        "example": "Invalid groupBy value. Use 'day' or 'month'."
                      }
                    }
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
                      "error": {
                        "type": "string",
                        "example": "Internal Server Error"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/display/things": {
        "get": {
          "summary": "Display items",
          "description": "Retrieve a paginated list of items from the stock, optionally filtered by serial number.",
          "parameters": [
            {
              "name": "page",
              "in": "query",
              "required": false,
              "description": "Page number for pagination (default: 1).",
              "schema": {
                "type": "integer",
                "default": 1
              }
            },
            {
              "name": "limit",
              "in": "query",
              "required": false,
              "description": "Number of records per page (default: 10).",
              "schema": {
                "type": "integer",
                "default": 10
              }
            },
            {
              "name": "serialno",
              "in": "query",
              "required": false,
              "description": "Filter by a specific serial number.",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "Items successfully retrieved.",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "page": {
                        "type": "integer",
                        "description": "Current page number."
                      },
                      "limit": {
                        "type": "integer",
                        "description": "Number of records per page."
                      },
                      "total": {
                        "type": "integer",
                        "description": "Total number of records."
                      },
                      "totalPages": {
                        "type": "integer",
                        "description": "Total number of pages."
                      },
                      "data": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "properties": {
                            "id": {
                              "type": "integer",
                              "description": "Unique identifier for the item."
                            },
                            "name": {
                              "type": "string",
                              "description": "Name of the item."
                            },
                            "serialno": {
                              "type": "string",
                              "description": "Serial number of the item."
                            },
                            "stock_status": {
                              "type": "string",
                              "description": "Status of the item in stock."
                            },
                            "addedAt": {
                              "type": "string",
                              "format": "date-time",
                              "description": "Timestamp when the item was added."
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
              "description": "Invalid page or limit value.",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "error": {
                        "type": "string",
                        "example": "Invalid page or limit value."
                      }
                    }
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
                      "error": {
                        "type": "string",
                        "example": "Internal Server Error"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/things/count": {
      "get": {
        "summary": "Get total count of things",
        "description": "Retrieve the total number of things in the system.",
        "responses": {
          "200": {
            "description": "Total count successfully retrieved.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "total_count": {
                      "type": "integer",
                      "description": "Total number of things."
                    }
                  }
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
                    "error": {
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
    "/api/things/model-count": {
      "get": {
        "summary": "Get count of things grouped by model",
        "description": "Retrieve the count of things grouped by model, sorted by count in descending order and then by model name in ascending order.",
        "responses": {
          "200": {
            "description": "Model counts successfully retrieved.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "total_count": {
                      "type": "integer",
                      "description": "Total number of things."
                    },
                    "model_counts": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "model": {
                            "type": "string",
                            "description": "The model name."
                          },
                          "model_count": {
                            "type": "integer",
                            "description": "The count of things for this model."
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
            "description": "Internal server error.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": {
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
    "/api/users/{id}/role": {
        "put": {
          "summary": "Update user role",
          "description": "Update the role of a user by their ID.",
          "parameters": [
            {
              "name": "id",
              "in": "path",
              "required": true,
              "description": "The ID of the user to update.",
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
                    "userRole": {
                      "type": "string",
                      "description": "The new role for the user.",
                      "enum": ["admin", "staff", "customer"]
                    }
                  },
                  "required": ["userRole"]
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "User role updated successfully.",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "message": {
                        "type": "string",
                        "example": "User role updated successfully"
                      },
                      "user": {
                        "type": "object",
                        "properties": {
                          "id": { "type": "integer" },
                          "userRole": { "type": "string" },
                          "lastModified": { "type": "string", "format": "date-time" }
                        }
                      }
                    }
                  }
                }
              }
            },
            "400": {
              "description": "Invalid input or missing parameters.",
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
            },
            "404": {
              "description": "User not found.",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "error": { "type": "string", "example": "User not found" }
                    }
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
                      "error": { "type": "string", "example": "Internal server error" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/users/{role}": {
        "get": {
          "summary": "Get users by role",
          "description": "Retrieve all users with a specific role, with optional search.",
          "parameters": [
            {
              "name": "role",
              "in": "path",
              "required": true,
              "description": "The role to filter users by.",
              "schema": {
                "type": "string",
                "enum": ["admin", "staff", "customer"]
              }
            },
            {
              "name": "search",
              "in": "query",
              "required": false,
              "description": "Search query to filter users by name, email, or phone.",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "Users retrieved successfully.",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "message": {
                        "type": "string",
                        "example": "Users retrieved successfully"
                      },
                      "users": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "properties": {
                            "id": { "type": "integer" },
                            "userName": { "type": "string" },
                            "userRole": { "type": "string" },
                            "profilePic": { "type": "string", "format": "url" },
                            "lastModified": { "type": "string", "format": "date-time" },
                            "email": { "type": "string", "format": "email" },
                            "phone": { "type": "string" }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            "400": {
              "description": "Invalid role or search parameters.",
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
            },
            "500": {
              "description": "Internal server error.",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "error": { "type": "string", "example": "Internal server error" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/recent-bills": {
      "get": {
        "summary": "Get recent bills",
        "description": "Retrieve a list of recent billing details, with an option to search by customer name, phone, or receipt number.",
        "parameters": [
          {
            "name": "search_term",
            "in": "query",
            "required": false,
            "description": "Search term to filter bills by customer name, phone, or receipt number.",
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "List of recent bills retrieved successfully.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "billing_id": { "type": "integer", "description": "Unique identifier for the billing record." },
                      "receipt_no": { "type": "string", "description": "Receipt number associated with the billing." },
                      "customer_name": { "type": "string", "description": "Name of the customer." },
                      "phone": { "type": "string", "description": "Phone number of the customer." },
                      "email": { "type": "string", "description": "Email address of the customer." },
                      "billing_address": { "type": "string", "description": "Billing address of the customer." },
                      "shipping_address": { "type": "string", "description": "Shipping address of the customer." },
                      "dealer_or_customer": { "type": "string", "description": "Whether the entity is a dealer or customer." },
                      "total_amount": { "type": "number", "format": "float", "description": "Total amount for the billing." },
                      "paid_amount": { "type": "number", "format": "float", "description": "Amount paid by the customer." },
                      "balance": { "type": "number", "format": "float", "description": "Remaining balance amount." },
                      "billing_createdby": { "type": "string", "description": "User who created the billing record." },
                      "billing_datetime": { "type": "string", "format": "date-time", "description": "Datetime when the billing record was created." },
                      "lastmodified": { "type": "string", "format": "date-time", "description": "Datetime when the billing record was last modified." },
                      "payments": {
                        "type": "array",
                        "description": "List of payments associated with the billing.",
                        "items": {
                          "type": "object",
                          "properties": {
                            "payment_method": { "type": "string", "description": "Method of payment (e.g., cash, card)." },
                            "payment_amount": { "type": "number", "format": "float", "description": "Amount paid using this method." }
                          }
                        }
                      },
                      "items": {
                        "type": "array",
                        "description": "List of items associated with the billing.",
                        "items": {
                          "type": "object",
                          "properties": {
                            "item_name": { "type": "string", "description": "Name of the item." },
                            "model": { "type": "string", "description": "Model of the item." },
                            "mrp": { "type": "number", "format": "float", "description": "MRP (Maximum Retail Price) of the item." },
                            "serial_no": { "type": "string", "description": "Serial number of the item." },
                            "retail_price": { "type": "number", "format": "float", "description": "Retail price of the item." },
                            "item_type": { "type": "string", "description": "Type/category of the item." }
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
            "description": "Internal server error.",
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
    "/warranties": {
        "get": {
          "summary": "Get warranty details",
          "description": "Retrieve warranty details with optional search and sorting.",
          "parameters": [
            {
              "name": "search",
              "in": "query",
              "required": false,
              "description": "Search term to filter warranties by serial number or receipt number.",
              "schema": {
                "type": "string"
              }
            },
            {
              "name": "sort",
              "in": "query",
              "required": false,
              "description": "Sort order for warranty start date. Allowed values: ASC or DESC (default: DESC).",
              "schema": {
                "type": "string",
                "enum": ["ASC", "DESC"],
                "default": "DESC"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "Warranty details retrieved successfully.",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "properties": {
                        "warranty_id": { "type": "integer", "description": "Unique identifier for the warranty record." },
                        "serial_no": { "type": "string", "description": "Serial number of the item under warranty." },
                        "warranty_start_date": { "type": "string", "format": "date", "description": "Start date of the warranty." },
                        "warranty_due_date": { "type": "string", "format": "date", "description": "Due date of the warranty." },
                        "receipt_no": { "type": "string", "description": "Receipt number associated with the warranty." },
                        "customer_or_dealer_name": { "type": "string", "description": "Name of the customer or dealer." },
                        "phone": { "type": "string", "description": "Phone number of the customer or dealer." },
                        "email": { "type": "string", "format": "email", "description": "Email address of the customer or dealer." },
                        "billing_address": { "type": "string", "description": "Billing address of the customer or dealer." },
                        "shipping_address": { "type": "string", "description": "Shipping address of the customer or dealer." },
                        "total_amount": { "type": "number", "format": "float", "description": "Total billing amount for the warranty." },
                        "paid_amount": { "type": "number", "format": "float", "description": "Amount paid by the customer or dealer." },
                        "balance": { "type": "number", "format": "float", "description": "Remaining balance amount." },
                        "type": { "type": "string", "description": "Type of the billing (e.g., customer or dealer)." },
                        "billing_date": { "type": "string", "format": "date-time", "description": "Datetime when the billing record was created." }
                      }
                    }
                  }
                }
              }
            },
            "500": {
              "description": "Failed to retrieve warranties.",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "object",
                    "properties": {
                      "error": { "type": "string", "example": "Failed to retrieve warranties" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/create/account/for/{Party}": {
      "post": {
        "summary": "Create a new account for a Party",
        "description": "Insert data into the specified Party's table (e.g., dealers, customers).",
        "parameters": [
          {
            "name": "Party",
            "in": "path",
            "required": true,
            "description": "The party for which the account is being created (e.g., dealers, customers).",
            "schema": {
              "type": "string"
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
                  "name": { "type": "string", "description": "Name of the Party." },
                  "address": { "type": "string", "description": "Address of the Party." },
                  "email": { "type": "string", "format": "email", "description": "Email of the Party." },
                  "phone": { "type": "string", "description": "Phone number of the Party." },
                  "alt_phone": { "type": "string", "description": "Alternate phone number of the Party." }
                },
                "required": ["name", "address", "phone"]
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Account created successfully.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string" },
                    "data": {
                      "type": "object",
                      "description": "Details of the created account."
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Validation error.",
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
                }
              }
            }
          }
        }
      }
    },
    "/api/display/party/{Party}": {
      "get": {
        "summary": "Retrieve account details for a Party",
        "description": "Fetch account details for a Party, optionally filtered by a search query.",
        "parameters": [
          {
            "name": "Party",
            "in": "path",
            "required": true,
            "description": "The party for which details are being fetched (e.g., dealers, customers).",
            "schema": {
              "type": "string",
              "enum": ["onlinecustomer", "customers", "dealers"]
            }
          },
          {
            "name": "query",
            "in": "query",
            "required": false,
            "description": "Search query to filter results by name, address, or phone.",
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Data retrieved successfully.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string" },
                    "data": {
                      "type": "array",
                      "items": { "type": "object" }
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Invalid Party parameter.",
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
                }
              }
            }
          }
        }
      }
    },
    "/api/delete/account/for/{Party}/{id}": {
      "delete": {
        "summary": "Delete an account for a Party",
        "description": "Delete a specific account from a Party's table by ID.",
        "parameters": [
          {
            "name": "Party",
            "in": "path",
            "required": true,
            "description": "The party for which the account is being deleted (e.g., dealers, customers).",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "The ID of the account to delete.",
            "schema": {
              "type": "integer"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Account deleted successfully.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string" },
                    "deleted_data": {
                      "type": "object",
                      "description": "Details of the deleted account."
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Validation error.",
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
          },
          "404": {
            "description": "Account not found.",
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
                }
              }
            }
          }
        }
      }
    },
    "/api/update/account/for/{Party}/{id}": {
      "put": {
        "summary": "Update account details for a Party",
        "description": "Update specific details of an account for a Party by ID.",
        "parameters": [
          {
            "name": "Party",
            "in": "path",
            "required": true,
            "description": "The party for which the account is being updated (e.g., dealers, customers).",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "The ID of the account to update.",
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
                  "name": { "type": "string" },
                  "address": { "type": "string" },
                  "email": { "type": "string", "format": "email" },
                  "phone": { "type": "string" },
                  "alt_phone": { "type": "string" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Account updated successfully.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string" },
                    "updated_data": {
                      "type": "object",
                      "description": "Details of the updated account."
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Validation error.",
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
          },
          "404": {
            "description": "Account not found.",
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
                }
              }
            }
          }
        }
      }
    },
    "/api/create/price_table": {
      "post": {
        "summary": "Create a new price entry",
        "description": "Insert a new entry into the price_table.",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "model": { "type": "string", "description": "Model name." },
                  "mrp": { "type": "number", "format": "float", "description": "Maximum Retail Price." },
                  "retail_price": { "type": "number", "format": "float", "description": "Retail price." },
                  "tax": { "type": "number", "format": "float", "description": "Tax percentage." },
                  "discount": { "type": "number", "format": "float", "description": "Discount percentage." },
                  "warranty_period": { "type": "integer", "description": "Warranty period in months." }
                },
                "required": ["model", "mrp", "retail_price", "tax", "discount", "warranty_period"]
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Price entry created successfully.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "500": {
            "description": "Failed to create entry.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": { "type": "string", "example": "Failed to create entry" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/display/prices-table": {
      "get": {
        "summary": "Get all price entries",
        "description": "Retrieve all entries from the price_table.",
        "responses": {
          "200": {
            "description": "List of all price entries.",
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
            "description": "Failed to retrieve prices.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": { "type": "string", "example": "Failed to retrieve prices" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/display/single/price_table/{id}": {
      "get": {
        "summary": "Get a single price entry",
        "description": "Retrieve a specific price entry by ID.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "ID of the price entry to retrieve.",
            "schema": {
              "type": "integer"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Price entry retrieved successfully.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "404": {
            "description": "Price entry not found.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": { "type": "string", "example": "Price entry not found" }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Failed to retrieve price entry.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": { "type": "string", "example": "Failed to retrieve price entry" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/update/price_table/{id}": {
      "put": {
        "summary": "Update a price entry",
        "description": "Update an existing price entry by ID.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "ID of the price entry to update.",
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
                  "model": { "type": "string" },
                  "mrp": { "type": "number", "format": "float" },
                  "retail_price": { "type": "number", "format": "float" },
                  "tax": { "type": "number", "format": "float" },
                  "discount": { "type": "number", "format": "float" },
                  "warranty_period": { "type": "integer" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Price entry updated successfully.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "404": {
            "description": "Price entry not found.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": { "type": "string", "example": "Price entry not found" }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Failed to update price entry.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": { "type": "string", "example": "Failed to update price entry" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/delete/price_table/{id}": {
      "delete": {
        "summary": "Delete a price entry",
        "description": "Delete a specific price entry by ID.",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "description": "ID of the price entry to delete.",
            "schema": {
              "type": "integer"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Price entry deleted successfully.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": { "type": "string", "example": "Price entry deleted successfully" }
                  }
                }
              }
            }
          },
          "404": {
            "description": "Price entry not found.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": { "type": "string", "example": "Price entry not found" }
                  }
                }
              }
            }
          },
          "500": {
            "description": "Failed to delete price entry.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "error": { "type": "string", "example": "Failed to delete price entry" }
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