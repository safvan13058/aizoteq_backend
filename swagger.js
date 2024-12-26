const swaggerUi = require("swagger-ui-express");
const Swaggerdoc = require("./swaggerdoc");

const options = {
  openapi: "3.0.0",
  info: {
    title: "Thing Management API",
    version: "1.0.0",
    description: "API for managing things and their attributes.",
  },
  servers: [
    {
      url: "http://localhost:3000",
    },
  ],
  paths: {
    ... Swaggerdoc, // Merge external Swagger paths
  },
};

module.exports = {
  swaggerUi,
  specs: options, // Pass the full OpenAPI specification directly
};
