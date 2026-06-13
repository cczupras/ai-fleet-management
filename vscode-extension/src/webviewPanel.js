'use strict';

const vscode = require('vscode');
const path = require('path');
const crypto = require('crypto');

/** Map of open panels: key → WebviewPanel */
const openPanels = new Map();

/**
 * Generate a cryptographically random nonce for CSP.
 * @returns {string}
 */
function getNonce() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Build the panel key for deduplication.
 * @param {string} resourceType
 * @param {string} resourceId - use '' for create mode
 * @returns {string}
 */
function panelKey(resourceType, resourceId) {
  return `${resourceType}::${resourceId || '__new__'}`;
}

/**
 * Open (or reveal) a webview panel for viewing/editing a fleet resource.
 *
 * @param {object} opts
 * @param {import('vscode').ExtensionContext} opts.context
 * @param {import('./apiClient')} opts.apiClient
 * @param {import('./workspaceFleet')} opts.workspaceFleet
 * @param {import('./fleetProvider').FleetProvider} opts.fleetProvider
 * @param {string} opts.resourceType - 'agents' | 'skills' | 'prompts' | 'mcp-configs'
 * @param {object|null} opts.resource - existing resource object, or null for create
 * @param {'view'|'edit'|'create'} opts.mode
 */
async function openResourcePanel(opts) {
  const { context, apiClient, workspaceFleet, fleetProvider, resourceType, resource, mode } = opts;

  const id = resource ? resource.id : '';
  const key = panelKey(resourceType, id);

  // Reveal existing panel if open
  const existing = openPanels.get(key);
  if (existing) {
    existing.reveal(vscode.ViewColumn.One);
    return;
  }

  const title = mode === 'create'
    ? `New ${resourceType.replace(/-/g, ' ')} — Fleet`
    : `${resource.name || resource.id} — Fleet`;

  const panel = vscode.window.createWebviewPanel(
    'fleetResource',
    title,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))],
      retainContextWhenHidden: true,
    },
  );

  openPanels.set(key, panel);
  panel.onDidDispose(() => openPanels.delete(key));

  // Build media URIs
  const cssUri = panel.webview.asWebviewUri(
    vscode.Uri.file(path.join(context.extensionPath, 'media', 'webview.css')),
  );
  const jsUri = panel.webview.asWebviewUri(
    vscode.Uri.file(path.join(context.extensionPath, 'media', 'webview.js')),
  );

  const nonce = getNonce();
  const assigned = resource ? workspaceFleet.isAssigned(resourceType, resource.id) : false;

  panel.webview.html = buildHtml({
    cssUri,
    jsUri,
    nonce,
    cspSource: panel.webview.cspSource,
    resourceType,
    resource,
    mode: mode === 'view' ? 'edit' : mode, // treat 'view' as 'edit' for simplicity
    assigned,
  });

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.type) {
        case 'save':
          await handleSave({ panel, message, apiClient, workspaceFleet, fleetProvider, key, mode });
          break;
        case 'delete':
          await handleDelete({ panel, message, apiClient, workspaceFleet, fleetProvider, key });
          break;
        case 'assign':
          handleAssign({ message, workspaceFleet, fleetProvider, panel });
          break;
        case 'unassign':
          handleUnassign({ message, workspaceFleet, fleetProvider, panel });
          break;
        case 'close':
          panel.dispose();
          break;
        default:
          break;
      }
    },
    undefined,
    context.subscriptions,
  );
}

// ─── Message Handlers ────────────────────────────────────────────────────────

async function handleSave({ panel, message, apiClient, workspaceFleet, fleetProvider, key, mode }) {
  const { resourceType, resource, dedupAction } = message;

  panel.webview.postMessage({ type: 'saving' });

  let result;
  const isCreate = !resource.id || mode === 'create';

  if (isCreate) {
    result = await apiClient.createResource(resourceType, resource, dedupAction);
  } else {
    result = await apiClient.updateResource(resourceType, resource.id, resource, dedupAction);
  }

  if (result.ok) {
    const savedResource = result.data.resource || resource;
    panel.title = `${savedResource.name || savedResource.id} — Fleet`;

    // Update the panel key if the ID changed (create mode)
    if (isCreate) {
      openPanels.delete(key);
      openPanels.set(panelKey(resourceType, savedResource.id), panel);
    }

    panel.webview.postMessage({ type: 'saveSuccess', resource: savedResource });
    fleetProvider.refresh();
    vscode.window.showInformationMessage(
      `${isCreate ? 'Created' : 'Updated'}: ${savedResource.name || savedResource.id}`,
    );
  } else if (result.status === 409 && result.conflicts) {
    // Duplicate detected — let the webview handle the user prompt
    panel.webview.postMessage({
      type: 'dupConflict',
      conflicts: result.conflicts,
      message: result.error,
    });
  } else {
    panel.webview.postMessage({ type: 'saveError', message: result.error });
    vscode.window.showErrorMessage(`Save failed: ${result.error}`);
  }
}

async function handleDelete({ panel, message, apiClient, workspaceFleet, fleetProvider, key }) {
  const { resourceType, resourceId } = message;

  const confirm = await vscode.window.showWarningMessage(
    `Delete "${resourceId}" from fleet? This cannot be undone.`,
    { modal: true },
    'Delete',
  );
  if (confirm !== 'Delete') {
    return;
  }

  panel.webview.postMessage({ type: 'saving' });
  const result = await apiClient.deleteResource(resourceType, resourceId);

  if (result.ok) {
    // Unassign from workspace too
    try {
      workspaceFleet.unassign(resourceType, resourceId);
    } catch (_) {}

    fleetProvider.refresh();
    panel.dispose();
    vscode.window.showInformationMessage(`Deleted: ${resourceId}`);
  } else {
    panel.webview.postMessage({ type: 'saveError', message: result.error });
    vscode.window.showErrorMessage(`Delete failed: ${result.error}`);
  }
}

function handleAssign({ message, workspaceFleet, fleetProvider, panel }) {
  const { resourceType, resourceId } = message;
  try {
    workspaceFleet.assign(resourceType, resourceId);
    fleetProvider.refreshView();
    panel.webview.postMessage({ type: 'assignChanged', assigned: true });
  } catch (err) {
    vscode.window.showErrorMessage(`Assign failed: ${err.message}`);
  }
}

function handleUnassign({ message, workspaceFleet, fleetProvider, panel }) {
  const { resourceType, resourceId } = message;
  try {
    workspaceFleet.unassign(resourceType, resourceId);
    fleetProvider.refreshView();
    panel.webview.postMessage({ type: 'assignChanged', assigned: false });
  } catch (err) {
    vscode.window.showErrorMessage(`Unassign failed: ${err.message}`);
  }
}

// ─── HTML Builder ─────────────────────────────────────────────────────────────

/**
 * Build the full HTML document for the webview.
 * @returns {string}
 */
function buildHtml({ cssUri, jsUri, nonce, cspSource, resourceType, resource, mode, assigned }) {
  const title = mode === 'create'
    ? `Create ${resourceType.replace(/-/g, ' ')}`
    : resource?.name || resource?.id || resourceType;

  // Serialize initial state for the webview script
  const initialState = JSON.stringify({
    resourceType,
    resource: resource || null,
    mode,
    assigned,
  });

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src ${cspSource} 'nonce-${nonce}';
                 script-src 'nonce-${nonce}';" />
  <link rel="stylesheet" href="${cssUri}" />
  <title>${escapeHtml(title)}</title>
</head>
<body>
  <div id="app">
    <div class="loading-overlay" id="loading-overlay" hidden>
      <span class="codicon codicon-loading spin"></span> Saving…
    </div>

    <header class="panel-header">
      <span class="resource-type-badge" data-type="${escapeHtml(resourceType)}">${escapeHtml(resourceType)}</span>
      <h1 class="panel-title" id="panel-title">${escapeHtml(title)}</h1>
      <div class="header-actions">
        <span id="assigned-badge" class="${assigned ? 'badge-assigned' : 'badge-unassigned'}" title="${assigned ? 'Assigned to workspace' : 'Not assigned to workspace'}">
          ${assigned ? '✓ Assigned' : '○ Unassigned'}
        </span>
      </div>
    </header>

    <!-- Duplicate conflict warning -->
    <div class="dup-warning" id="dup-warning" hidden>
      <div class="dup-warning-header">
        <span class="dup-icon">⚠</span>
        <strong>Potential Duplicate Detected</strong>
      </div>
      <p id="dup-message"></p>
      <ul id="dup-list" class="dup-list"></ul>
      <div class="dup-actions">
        <button id="dup-override" class="btn btn-warning">Override (replace)</button>
        <button id="dup-merge" class="btn btn-primary">Merge fields</button>
        <button id="dup-link" class="btn btn-secondary">Keep both (link)</button>
        <button id="dup-cancel" class="btn btn-ghost">Cancel</button>
      </div>
    </div>

    <!-- Save/delete error banner -->
    <div class="error-banner" id="error-banner" hidden>
      <span id="error-message"></span>
    </div>

    <!-- Main resource form -->
    <form id="resource-form" novalidate>
      <div id="form-fields">
        <!-- Populated by webview.js -->
      </div>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary" id="save-btn">
          ${mode === 'create' ? 'Create' : 'Save Changes'}
        </button>
        <button type="button" class="btn btn-secondary" id="assign-btn" ${!resource ? 'hidden' : ''}>
          ${assigned ? 'Unassign from Workspace' : 'Assign to Workspace'}
        </button>
        <button type="button" class="btn btn-danger" id="delete-btn" ${mode === 'create' ? 'hidden' : ''}>
          Delete
        </button>
      </div>
    </form>
  </div>

  <script nonce="${nonce}">
    window.__FLEET_STATE__ = ${initialState};
  </script>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}

/**
 * Escape HTML special characters to prevent XSS in attribute/text content.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { openResourcePanel };
