'use strict';

const vscode = require('vscode');

/** Icons for each resource type section in the tree. */
const SECTION_ICONS = {
  agents: new vscode.ThemeIcon('hubot'),
  skills: new vscode.ThemeIcon('tools'),
  prompts: new vscode.ThemeIcon('comment'),
  'mcp-configs': new vscode.ThemeIcon('server'),
};

/** Human-readable section labels. */
const SECTION_LABELS = {
  agents: 'Agents',
  skills: 'Skills',
  prompts: 'Prompts',
  'mcp-configs': 'MCP Configs',
};

/** All resource type keys in display order. */
const RESOURCE_TYPES = ['agents', 'skills', 'prompts', 'mcp-configs'];

/**
 * Represents a section header node (Agents, Skills, Prompts, MCP Configs).
 */
class SectionItem extends vscode.TreeItem {
  /**
   * @param {string} resourceType
   * @param {number} count
   * @param {boolean} isLoading
   * @param {string} [error]
   */
  constructor(resourceType, count, isLoading, error) {
    const label = SECTION_LABELS[resourceType];
    super(label, vscode.TreeItemCollapsibleState.Expanded);

    this.resourceType = resourceType;
    this.contextValue = 'fleetSection';
    this.iconPath = SECTION_ICONS[resourceType];

    if (isLoading) {
      this.description = 'loading…';
    } else if (error) {
      this.description = '⚠ error';
      this.tooltip = error;
    } else {
      this.description = String(count);
    }
  }
}

/**
 * Represents a single fleet resource node.
 */
class ResourceItem extends vscode.TreeItem {
  /**
   * @param {object} resource - The resource data object
   * @param {string} resourceType
   * @param {boolean} assigned - Whether assigned to the current workspace
   */
  constructor(resource, resourceType, assigned) {
    super(resource.name || resource.id, vscode.TreeItemCollapsibleState.None);

    this.resource = resource;
    this.resourceType = resourceType;
    this.assigned = assigned;

    // Context value drives menu visibility
    this.contextValue = assigned ? 'fleetResourceAssigned' : 'fleetResource';

    // Show ID as description, and assigned marker
    this.description = assigned ? `${resource.id}  ✓` : resource.id;
    this.tooltip = resource.description || resource.name || resource.id;

    // Icon
    this.iconPath = assigned
      ? new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'))
      : new vscode.ThemeIcon('circle-outline');

    // Open resource in webview on click
    this.command = {
      command: 'fleetManagement.editResource',
      title: 'Open Resource',
      arguments: [this],
    };
  }
}

/**
 * Represents an empty/info placeholder node.
 */
class InfoItem extends vscode.TreeItem {
  constructor(label, tooltip) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = tooltip;
    this.contextValue = 'fleetInfo';
    this.iconPath = new vscode.ThemeIcon('info');
  }
}

/**
 * TreeDataProvider for the Fleet Resources sidebar.
 */
class FleetProvider {
  /**
   * @param {import('./apiClient')} apiClient
   * @param {import('./workspaceFleet')} workspaceFleet
   */
  constructor(apiClient, workspaceFleet) {
    this.apiClient = apiClient;
    this.workspaceFleet = workspaceFleet;

    /** @type {vscode.EventEmitter<undefined>} */
    this._onDidChangeTreeData = new vscode.EventEmitter();
    /** @type {vscode.Event<undefined>} */
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;

    /** Cache of loaded resources per type: Map<type, object[]|null> */
    this._cache = new Map();
    /** Cache of errors per type: Map<type, string|null> */
    this._errors = new Map();
    /** Loading state per type: Map<type, boolean> */
    this._loading = new Map();

    // Initialize loading state
    for (const t of RESOURCE_TYPES) {
      this._cache.set(t, null);
      this._errors.set(t, null);
      this._loading.set(t, false);
    }
  }

  /** Trigger a full tree refresh (reloads all resource types from the API). */
  refresh() {
    for (const t of RESOURCE_TYPES) {
      this._cache.set(t, null);
      this._errors.set(t, null);
      this._loading.set(t, false);
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  /** Fire a lightweight tree update (e.g. after assign/unassign — no API call). */
  refreshView() {
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Load resources for a single type from the API (with simple in-flight dedup).
   * @param {string} resourceType
   */
  async _loadType(resourceType) {
    if (this._loading.get(resourceType)) {
      return; // already loading
    }
    this._loading.set(resourceType, true);
    this._onDidChangeTreeData.fire(undefined);

    try {
      const result = await this.apiClient.listResources(resourceType);
      if (result.ok) {
        this._cache.set(resourceType, result.data);
        this._errors.set(resourceType, null);
      } else {
        this._cache.set(resourceType, []);
        this._errors.set(resourceType, result.error);
      }
    } catch (err) {
      this._cache.set(resourceType, []);
      this._errors.set(resourceType, err.message);
    } finally {
      this._loading.set(resourceType, false);
      this._onDidChangeTreeData.fire(undefined);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // vscode.TreeDataProvider implementation
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * @param {SectionItem|ResourceItem|undefined} element
   * @returns {vscode.ProviderResult<vscode.TreeItem[]>}
   */
  getChildren(element) {
    if (!element) {
      // Root — return section items
      return RESOURCE_TYPES.map((t) => {
        const cached = this._cache.get(t);
        const loading = this._loading.get(t);
        const error = this._errors.get(t);
        const count = cached ? cached.length : 0;

        // Kick off a load if cache is empty
        if (cached === null && !loading) {
          this._loadType(t);
        }

        return new SectionItem(t, count, loading || cached === null, error);
      });
    }

    if (element instanceof SectionItem) {
      const { resourceType } = element;
      const cached = this._cache.get(resourceType);
      const loading = this._loading.get(resourceType);

      if (loading || cached === null) {
        return [new InfoItem('Loading…', 'Fetching resources from the backend API')];
      }
      if (!cached || cached.length === 0) {
        const error = this._errors.get(resourceType);
        if (error) {
          return [new InfoItem(`Error: ${error}`, error)];
        }
        return [new InfoItem('No resources found', 'Use the + button to create one')];
      }

      const assignedIds = this.workspaceFleet.getAssigned(resourceType);
      return cached.map((r) => new ResourceItem(r, resourceType, assignedIds.includes(r.id)));
    }

    return [];
  }

  /**
   * @param {SectionItem|ResourceItem} element
   * @returns {vscode.TreeItem}
   */
  getTreeItem(element) {
    return element;
  }
}

module.exports = { FleetProvider, SectionItem, ResourceItem };
