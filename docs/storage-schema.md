# GitHub Storage Schema

This document defines the data structures, folder conventions, and versioning strategy for the AI Fleet Management system.

## Repository Structure

```
fleet/
├── agents/
│   └── code-reviewer.json
├── skills/
│   └── code-analysis.json
├── prompts/
│   └── system-code-review.json
└── mcp-configs/
    └── github-server.json
schemas/
└── v1/
    ├── agent.schema.json
    ├── skill.schema.json
    ├── prompt.schema.json
    └── mcp-config.schema.json
```

## Resource Types

| Resource | Schema | Storage Path |
|----------|--------|--------------|
| Agent | `schemas/v1/agent.schema.json` | `fleet/agents/<id>.json` |
| Skill | `schemas/v1/skill.schema.json` | `fleet/skills/<id>.json` |
| Prompt | `schemas/v1/prompt.schema.json` | `fleet/prompts/<id>.json` |
| MCP Config | `schemas/v1/mcp-config.schema.json` | `fleet/mcp-configs/<id>.json` |

## Naming Conventions

### File Names
- Use **kebab-case** for all file names (e.g., `code-reviewer.json`, `github-server.json`).
- File name must match the resource `id` field.
- All resource files use the `.json` extension.

### Resource IDs
- Must be **kebab-case**: lowercase alphanumeric characters separated by hyphens.
- Pattern: `^[a-z0-9]+(-[a-z0-9]+)*$`
- Examples: `code-reviewer`, `research-assistant`, `github-mcp`

### Display Names
- Use human-readable names with proper capitalization.
- Examples: `Code Reviewer`, `Research Assistant`, `GitHub MCP Server`

## Schema Versioning Strategy

### Approach: Directory-Based Versioning

Schemas are versioned using a directory-based approach:

```
schemas/
├── v1/
│   ├── agent.schema.json
│   └── ...
├── v2/   (future)
│   ├── agent.schema.json
│   └── ...
```

### Rules

1. **Version Identifier**: Each resource includes a `schema_version` field (e.g., `"v1"`) that declares which schema version it conforms to.
2. **Backward Compatibility**: Minor, additive changes (new optional fields) are made within the current version without incrementing.
3. **Breaking Changes**: Any change that removes fields, renames fields, or changes field types requires a new version directory (e.g., `v2/`).
4. **Migration**: When a new version is released, existing resources continue to work with their declared version. A migration guide will be provided for upgrading.
5. **Deprecation**: Old versions are marked as deprecated but remain available for at least one major release cycle.

### Version Lifecycle

| Stage | Description |
|-------|-------------|
| **Active** | Current recommended version for new resources |
| **Deprecated** | Still supported but new resources should use the latest version |
| **Retired** | No longer supported; resources must be migrated |

## Schema Overview

### Agent Schema (`agent.schema.json`)

Defines an AI agent with its model configuration, assigned skills, and MCP access.

**Required fields**: `schema_version`, `id`, `name`, `description`, `model`

### Skill Schema (`skill.schema.json`)

Defines a reusable skill that can be assigned to agents. Supports hierarchical sub-skills.

**Required fields**: `schema_version`, `id`, `name`, `description`

### Prompt Schema (`prompt.schema.json`)

Defines a reusable prompt template with support for template variables (`{{variable}}` syntax).

**Required fields**: `schema_version`, `id`, `name`, `content`

### MCP Configuration Schema (`mcp-config.schema.json`)

Defines connection details for a Model Context Protocol server.

**Required fields**: `schema_version`, `id`, `name`, `server`
