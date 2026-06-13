# AI Fleet Management — VS Code Extension

Browse, assign, and manage your fleet of AI agents, skills, prompts, and MCP configurations directly from the VS Code sidebar.

## Features

- **Sidebar explorer** listing all fleet resources (Agents, Skills, Prompts, MCP Configs)
- **Assign / unassign** resources to the current workspace (stored in `.vscode/fleet.json`)
- **Create and edit** resources with guided per-type forms
- **Duplicate detection** — warns inline when a similar resource already exists, with Override / Merge / Link resolution options
- **Real-time sync** with the backend API (configurable auto-refresh interval)

## Prerequisites

1. **Backend API** running (see [backend/README.md](../backend/README.md))
2. **GitHub Personal Access Token** with `repo` read/write scope

## Local Installation

### Option A — Install from VSIX

```bash
# 1. Build the VSIX package (only needs @vscode/vsce dev dependency)
cd vscode-extension
npm install           # installs @vscode/vsce
npx vsce package      # produces ai-fleet-management-0.1.0.vsix

# 2. Install into VS Code
code --install-extension ai-fleet-management-0.1.0.vsix
```

### Option B — Open in Extension Development Host

```bash
# Open the vscode-extension folder in VS Code, then press F5
code vscode-extension
# Press F5 to launch the Extension Development Host
```

### Option C — Symlink to extensions folder (fastest for development)

```bash
# macOS / Linux
ln -s "$(pwd)/vscode-extension" "$HOME/.vscode/extensions/ai-fleet-management-dev"

# Windows (run as Administrator)
mklink /D "%USERPROFILE%\.vscode\extensions\ai-fleet-management-dev" "%CD%\vscode-extension"
```

Then reload VS Code.

## Configuration

Open **Settings** (`Cmd/Ctrl+,`) and search for `AI Fleet Management`, or click the ⚙ icon in the Fleet sidebar panel.

| Setting | Default | Description |
|---|---|---|
| `aiFleetManagement.apiUrl` | `http://localhost:3000` | Backend API base URL |
| `aiFleetManagement.githubToken` | _(empty)_ | GitHub PAT with `repo` scope |
| `aiFleetManagement.autoRefreshInterval` | `30` | Auto-refresh in seconds (0 = off) |

## Usage

### Sidebar

Click the robot icon (🤖) in the VS Code Activity Bar to open the Fleet Management sidebar.

- **Refresh** (↻) — reload all resources from the API
- **Dashboard** (⊟) — open the resource editor panel
- **Settings** (⚙) — open extension settings
- **+ button** on a section — create a new resource of that type
- **✎ button** on a resource — open the editor for that resource
- **+ button** on a resource — assign to the current workspace
- **− button** on an assigned resource — unassign from the workspace
- **Right-click** any resource — context menu with all actions

### Workspace Assignment

Assigned resources are tracked in `.vscode/fleet.json`:

```json
{
  "assigned": {
    "agents": ["code-reviewer"],
    "skills": ["code-analysis"],
    "prompts": [],
    "mcp-configs": ["github-server"]
  }
}
```

### Duplicate Detection

When creating or editing a resource, the backend checks for similar existing resources. If duplicates are found, a warning appears in the editor with three resolution options:

- **Override** — proceed with the new resource as-is
- **Merge** — merge fields from the existing resource into the new one
- **Keep both (link)** — create the resource and add a reference to the existing duplicate

## Resource Types

| Type | Required fields |
|---|---|
| **Agent** | `id`, `name`, `description`, `model`, `system_prompt` or `prompt_ref` |
| **Skill** | `id`, `name`, `description` |
| **Prompt** | `id`, `name`, `content` |
| **MCP Config** | `id`, `name`, `server.command` or `server.url` |

All IDs must be **kebab-case** (e.g. `code-reviewer`, `github-server`).
