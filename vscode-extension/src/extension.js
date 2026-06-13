'use strict';

const vscode = require('vscode');
const ApiClient = require('./apiClient');
const { FleetProvider, SectionItem } = require('./fleetProvider');
const WorkspaceFleet = require('./workspaceFleet');
const { openResourcePanel } = require('./webviewPanel');

/** @type {NodeJS.Timeout|null} */
let autoRefreshTimer = null;

/**
 * Build an ApiClient from the current VS Code configuration.
 * @returns {ApiClient}
 */
function buildApiClient() {
  const cfg = vscode.workspace.getConfiguration('aiFleetManagement');
  const apiUrl = cfg.get('apiUrl') || 'http://localhost:3000';
  const githubToken = cfg.get('githubToken') || '';
  return new ApiClient(apiUrl, githubToken);
}

/**
 * Start (or restart) the auto-refresh timer.
 * @param {FleetProvider} provider
 */
function startAutoRefresh(provider) {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
  const cfg = vscode.workspace.getConfiguration('aiFleetManagement');
  const intervalSecs = cfg.get('autoRefreshInterval') ?? 30;
  if (intervalSecs > 0) {
    autoRefreshTimer = setInterval(() => provider.refresh(), intervalSecs * 1000);
  }
}

/**
 * Extension activation entry point.
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const workspaceFleet = new WorkspaceFleet(vscode);
  let apiClient = buildApiClient();
  const provider = new FleetProvider(apiClient, workspaceFleet);

  // Register the tree view
  const treeView = vscode.window.createTreeView('fleetExplorer', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Re-create the API client whenever settings change
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('aiFleetManagement')) {
        apiClient = buildApiClient();
        provider.apiClient = apiClient;
        startAutoRefresh(provider);
        provider.refresh();
      }
    }),
  );

  // Auto-refresh timer
  startAutoRefresh(provider);
  context.subscriptions.push({
    dispose() {
      if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    },
  });

  // ── Commands ────────────────────────────────────────────────────────────────

  /** Refresh the tree */
  context.subscriptions.push(
    vscode.commands.registerCommand('fleetManagement.refresh', () => {
      provider.refresh();
    }),
  );

  /** Open VS Code settings filtered to this extension */
  context.subscriptions.push(
    vscode.commands.registerCommand('fleetManagement.configure', async () => {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'aiFleetManagement',
      );
    }),
  );

  /** Create a new resource — tree section item passes itself as the argument */
  context.subscriptions.push(
    vscode.commands.registerCommand('fleetManagement.createResource', async (item) => {
      let resourceType;
      if (item instanceof SectionItem) {
        resourceType = item.resourceType;
      } else {
        // Called from command palette — ask the user
        const pick = await vscode.window.showQuickPick(
          [
            { label: '$(hubot) Agent', description: 'agents', value: 'agents' },
            { label: '$(tools) Skill', description: 'skills', value: 'skills' },
            { label: '$(comment) Prompt', description: 'prompts', value: 'prompts' },
            { label: '$(server) MCP Config', description: 'mcp-configs', value: 'mcp-configs' },
          ],
          { placeHolder: 'Select resource type to create' },
        );
        if (!pick) return;
        resourceType = pick.value;
      }

      await openResourcePanel({
        context,
        apiClient,
        workspaceFleet,
        fleetProvider: provider,
        resourceType,
        resource: null,
        mode: 'create',
      });
    }),
  );

  /** Edit an existing resource (also used as the tree item click command) */
  context.subscriptions.push(
    vscode.commands.registerCommand('fleetManagement.editResource', async (item) => {
      if (!item || !item.resource) {
        vscode.window.showWarningMessage('No resource selected.');
        return;
      }

      await openResourcePanel({
        context,
        apiClient,
        workspaceFleet,
        fleetProvider: provider,
        resourceType: item.resourceType,
        resource: item.resource,
        mode: 'edit',
      });
    }),
  );

  /** Delete a resource from the tree */
  context.subscriptions.push(
    vscode.commands.registerCommand('fleetManagement.deleteResource', async (item) => {
      if (!item || !item.resource) return;
      const { resource, resourceType } = item;

      const confirm = await vscode.window.showWarningMessage(
        `Delete "${resource.name || resource.id}" from fleet? This cannot be undone.`,
        { modal: true },
        'Delete',
      );
      if (confirm !== 'Delete') return;

      const result = await apiClient.deleteResource(resourceType, resource.id);
      if (result.ok) {
        try { workspaceFleet.unassign(resourceType, resource.id); } catch (_) {}
        provider.refresh();
        vscode.window.showInformationMessage(`Deleted: ${resource.name || resource.id}`);
      } else {
        vscode.window.showErrorMessage(`Delete failed: ${result.error}`);
      }
    }),
  );

  /** Assign a resource to the current workspace */
  context.subscriptions.push(
    vscode.commands.registerCommand('fleetManagement.assignResource', async (item) => {
      if (!item || !item.resource) return;
      const { resource, resourceType } = item;
      try {
        workspaceFleet.assign(resourceType, resource.id);
        provider.refreshView();
        vscode.window.showInformationMessage(
          `Assigned "${resource.name || resource.id}" to workspace`,
        );
      } catch (err) {
        vscode.window.showErrorMessage(`Assign failed: ${err.message}`);
      }
    }),
  );

  /** Unassign a resource from the current workspace */
  context.subscriptions.push(
    vscode.commands.registerCommand('fleetManagement.unassignResource', async (item) => {
      if (!item || !item.resource) return;
      const { resource, resourceType } = item;
      try {
        workspaceFleet.unassign(resourceType, resource.id);
        provider.refreshView();
        vscode.window.showInformationMessage(
          `Unassigned "${resource.name || resource.id}" from workspace`,
        );
      } catch (err) {
        vscode.window.showErrorMessage(`Unassign failed: ${err.message}`);
      }
    }),
  );

  /** Open the Fleet Dashboard — a webview showing all resource types at once */
  context.subscriptions.push(
    vscode.commands.registerCommand('fleetManagement.openDashboard', async () => {
      await openResourcePanel({
        context,
        apiClient,
        workspaceFleet,
        fleetProvider: provider,
        resourceType: 'agents',
        resource: null,
        mode: 'create',
      });
    }),
  );

  // Perform an initial health check and warn if backend is unreachable
  apiClient.healthCheck().then((healthy) => {
    if (!healthy) {
      vscode.window
        .showWarningMessage(
          'AI Fleet Management: backend API is not reachable. Check your API URL in settings.',
          'Open Settings',
        )
        .then((action) => {
          if (action === 'Open Settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'aiFleetManagement');
          }
        });
    }
  });
}

/**
 * Extension deactivation — cleanup.
 */
function deactivate() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}

module.exports = { activate, deactivate };
