'use strict';

const swaggerJsdoc = require('swagger-jsdoc');

const RESOURCE_TYPES = ['agents', 'skills', 'prompts', 'mcp-configs'];

function buildPaths() {
  const paths = {};

  for (const rt of RESOURCE_TYPES) {
    const tag = rt.charAt(0).toUpperCase() + rt.slice(1);
    const singular = rt.replace(/-configs$/, ' Config').replace(/-/g, ' ');

    paths[`/api/v1/${rt}`] = {
      get: {
        tags: [tag],
        summary: `List all ${singular}s`,
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: `Array of ${singular} resources`, content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } } },
          401: { $ref: '#/components/responses/Unauthorized' },
          429: { $ref: '#/components/responses/TooManyRequests' },
        },
      },
      post: {
        tags: [tag],
        summary: `Create a new ${singular}`,
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: {
          201: { description: `${tag} created` },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          409: { $ref: '#/components/responses/Conflict' },
          422: { $ref: '#/components/responses/ValidationError' },
          429: { $ref: '#/components/responses/TooManyRequests' },
        },
      },
    };

    paths[`/api/v1/${rt}/{id}`] = {
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' }, description: 'Resource ID (kebab-case)' },
      ],
      get: {
        tags: [tag],
        summary: `Get a ${singular} by ID`,
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: `${tag} resource` },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          429: { $ref: '#/components/responses/TooManyRequests' },
        },
      },
      put: {
        tags: [tag],
        summary: `Update a ${singular} (full replace)`,
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: {
          200: { description: `${tag} updated` },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          422: { $ref: '#/components/responses/ValidationError' },
          429: { $ref: '#/components/responses/TooManyRequests' },
        },
      },
      delete: {
        tags: [tag],
        summary: `Delete a ${singular}`,
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: `${tag} deleted` },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
          429: { $ref: '#/components/responses/TooManyRequests' },
        },
      },
    };
  }

  return paths;
}

const definition = {
  openapi: '3.0.3',
  info: {
    title: 'AI Fleet Management API',
    version: '1.0.0',
    description:
      'REST API for managing AI agents, skills, prompts, and MCP configurations stored in a GitHub repository.',
    contact: { name: 'cczupras', url: 'https://github.com/cczupras/ai-fleet-management' },
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local development server' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'GitHub PAT',
        description: 'GitHub Personal Access Token with repo read/write scope.',
      },
    },
    responses: {
      BadRequest: { description: 'Bad Request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Unauthorized: { description: 'Unauthorized – missing or invalid token', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      NotFound: { description: 'Resource not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Conflict: { description: 'Resource already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      ValidationError: { description: 'Schema validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
      TooManyRequests: { description: 'Rate limit exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error', 'message'],
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
        },
      },
      ValidationError: {
        type: 'object',
        required: ['error', 'message'],
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
          details: { type: 'array', items: { type: 'object' } },
        },
      },
    },
  },
  paths: buildPaths(),
};

const swaggerSpec = swaggerJsdoc({ definition, apis: [] });

module.exports = swaggerSpec;
