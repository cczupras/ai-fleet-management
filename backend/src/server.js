'use strict';

require('dotenv').config();

const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./docs/swagger');
const config = require('./config');
const auth = require('./middleware/auth');
const rateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');

const agentsRouter = require('./routes/agents');
const skillsRouter = require('./routes/skills');
const promptsRouter = require('./routes/prompts');
const mcpConfigsRouter = require('./routes/mcpConfigs');

const app = express();

// Parse JSON bodies
app.use(express.json());

// Apply rate limiter to all routes
app.use(rateLimiter);

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Swagger UI (no auth required)
app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api/v1/openapi.json', (req, res) => res.json(swaggerSpec));

// All resource routes require authentication
app.use('/api/v1/agents', auth, agentsRouter);
app.use('/api/v1/skills', auth, skillsRouter);
app.use('/api/v1/prompts', auth, promptsRouter);
app.use('/api/v1/mcp-configs', auth, mcpConfigsRouter);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', message: `Route ${req.method} ${req.path} not found.` });
});

// Global error handler (must be last)
app.use(errorHandler);

// Start server only when run directly (not during tests)
if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`AI Fleet Management API running on port ${config.port}`);
    console.log(`Swagger UI: http://localhost:${config.port}/api/v1/docs`);
  });
}

module.exports = app;
