# AI Fleet Management – Backend API

A lightweight Node.js/Express REST API that manages fleet resources (Agents, Skills, Prompts, MCP Configs) stored as JSON files in this GitHub repository.

## Architecture

```
src/
├── config/       – Environment-based configuration
├── docs/         – OpenAPI/Swagger spec generation
├── middleware/
│   ├── auth.js          – GitHub PAT bearer-token authentication
│   ├── rateLimiter.js   – express-rate-limit
│   └── errorHandler.js  – Global error handler
├── routes/
│   ├── resourceRouter.js – Generic CRUD router factory
│   ├── agents.js
│   ├── skills.js
│   ├── prompts.js
│   └── mcpConfigs.js
├── services/
│   ├── github.js     – Octokit-based GitHub file read/write
│   └── validation.js – AJV schema validation against schemas/v1/
└── server.js
```

## Authentication

Every API request (except `/health` and `/api/v1/docs`) must include a GitHub Personal Access Token (PAT) with **`repo`** scope using the HTTP bearer token scheme in the `Authorization` header.

The token is forwarded directly to the GitHub API – the server never stores it.

## Quick Start

```bash
cp .env.example .env
# edit .env with your GitHub owner/repo if different from defaults
npm install
npm start
```

Server listens on `PORT` (default `3000`).

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/v1/docs` | Swagger UI |
| GET | `/api/v1/openapi.json` | Raw OpenAPI spec |
| GET | `/api/v1/agents` | List all agents |
| POST | `/api/v1/agents` | Create agent |
| GET | `/api/v1/agents/:id` | Get agent |
| PUT | `/api/v1/agents/:id` | Update agent |
| DELETE | `/api/v1/agents/:id` | Delete agent |
| GET | `/api/v1/skills` | List all skills |
| POST | `/api/v1/skills` | Create skill |
| GET | `/api/v1/skills/:id` | Get skill |
| PUT | `/api/v1/skills/:id` | Update skill |
| DELETE | `/api/v1/skills/:id` | Delete skill |
| GET | `/api/v1/prompts` | List all prompts |
| POST | `/api/v1/prompts` | Create prompt |
| GET | `/api/v1/prompts/:id` | Get prompt |
| PUT | `/api/v1/prompts/:id` | Update prompt |
| DELETE | `/api/v1/prompts/:id` | Delete prompt |
| GET | `/api/v1/mcp-configs` | List all MCP configs |
| POST | `/api/v1/mcp-configs` | Create MCP config |
| GET | `/api/v1/mcp-configs/:id` | Get MCP config |
| PUT | `/api/v1/mcp-configs/:id` | Update MCP config |
| DELETE | `/api/v1/mcp-configs/:id` | Delete MCP config |

## Validation

All create/update payloads are validated against the JSON schemas in `schemas/v1/`. Invalid payloads receive a `422 Unprocessable Entity` response with AJV error details.

## Rate Limiting

Default: **100 requests per 60 seconds** per IP. Configurable via `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX` environment variables.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server listen port |
| `GITHUB_OWNER` | `cczupras` | GitHub repository owner |
| `GITHUB_REPO` | `ai-fleet-management` | GitHub repository name |
| `GITHUB_BRANCH` | `main` | Branch to read/write fleet files |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window in ms |
| `RATE_LIMIT_MAX` | `100` | Max requests per window |
