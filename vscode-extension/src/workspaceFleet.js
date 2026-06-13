'use strict';

const path = require('path');
const fs = require('fs');

/**
 * Manages per-workspace fleet resource assignments.
 * Reads and writes `.vscode/fleet.json` inside the first workspace folder.
 */
class WorkspaceFleet {
  /**
   * @param {import('vscode')} vscode
   */
  constructor(vscode) {
    this.vscode = vscode;
  }

  /** @private Returns the path to .vscode/fleet.json, or null if no workspace. */
  _fleetFilePath() {
    const folders = this.vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return null;
    }
    return path.join(folders[0].uri.fsPath, '.vscode', 'fleet.json');
  }

  /**
   * Read the current fleet assignment config.
   * Returns a normalized object: { assigned: { agents: [], skills: [], prompts: [], 'mcp-configs': [] } }
   * @returns {{ assigned: Record<string, string[]> }}
   */
  read() {
    const filePath = this._fleetFilePath();
    const empty = {
      assigned: { agents: [], skills: [], prompts: [], 'mcp-configs': [] },
    };
    if (!filePath) {
      return empty;
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      // Normalize: ensure all resource type keys exist
      const assigned = parsed.assigned || {};
      return {
        assigned: {
          agents: Array.isArray(assigned.agents) ? assigned.agents : [],
          skills: Array.isArray(assigned.skills) ? assigned.skills : [],
          prompts: Array.isArray(assigned.prompts) ? assigned.prompts : [],
          'mcp-configs': Array.isArray(assigned['mcp-configs']) ? assigned['mcp-configs'] : [],
        },
      };
    } catch (_) {
      return empty;
    }
  }

  /**
   * Write the fleet assignment config back to disk.
   * @param {{ assigned: Record<string, string[]> }} data
   */
  write(data) {
    const filePath = this._fleetFilePath();
    if (!filePath) {
      throw new Error('No workspace folder open. Please open a project folder first.');
    }
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }

  /**
   * Check whether a resource is assigned to the current workspace.
   * @param {string} resourceType
   * @param {string} id
   * @returns {boolean}
   */
  isAssigned(resourceType, id) {
    const config = this.read();
    return (config.assigned[resourceType] || []).includes(id);
  }

  /**
   * Assign a resource to the current workspace.
   * @param {string} resourceType
   * @param {string} id
   */
  assign(resourceType, id) {
    const config = this.read();
    const list = config.assigned[resourceType] || [];
    if (!list.includes(id)) {
      config.assigned[resourceType] = [...list, id];
      this.write(config);
    }
  }

  /**
   * Unassign a resource from the current workspace.
   * @param {string} resourceType
   * @param {string} id
   */
  unassign(resourceType, id) {
    const config = this.read();
    const list = config.assigned[resourceType] || [];
    config.assigned[resourceType] = list.filter((x) => x !== id);
    this.write(config);
  }

  /**
   * Get all assigned IDs for a resource type.
   * @param {string} resourceType
   * @returns {string[]}
   */
  getAssigned(resourceType) {
    return this.read().assigned[resourceType] || [];
  }
}

module.exports = WorkspaceFleet;
