const swaggerU = require("swagger-ui-express");
const Swaggerdoc = require("./swaggerdash");

const options = {
  openapi: "3.0.0",
  info: {
    title: "Dashboard API",
    version: "1.0.0",
    description: "API for managing Dashboard",
  },
  servers: [
    {
      url: "http://13.200.215.17:3000/",
    },
  ],
  paths: {
    ... Swaggerdoc, // Merge external Swagger paths
  },
};

module.exports = {
  swaggerU,
  spec: options, // Pass the full OpenAPI specification directly
};
