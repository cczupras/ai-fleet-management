/* global acquireVsCodeApi, __FLEET_STATE__ */
'use strict';

(function () {
  const vscode = acquireVsCodeApi();

  // ── State ──────────────────────────────────────────────────────────────────

  const { resourceType, resource: initialResource, mode: initialMode, assigned: initialAssigned } =
    window.__FLEET_STATE__;

  let currentResource = initialResource ? JSON.parse(JSON.stringify(initialResource)) : null;
  let currentMode = initialMode;
  let isAssigned = initialAssigned;
  let pendingSavePayload = null; // stored while waiting for dedup resolution

  // ── DOM refs ───────────────────────────────────────────────────────────────

  const loadingOverlay = document.getElementById('loading-overlay');
  const dupWarning = document.getElementById('dup-warning');
  const dupMessage = document.getElementById('dup-message');
  const dupList = document.getElementById('dup-list');
  const dupOverrideBtn = document.getElementById('dup-override');
  const dupMergeBtn = document.getElementById('dup-merge');
  const dupLinkBtn = document.getElementById('dup-link');
  const dupCancelBtn = document.getElementById('dup-cancel');
  const errorBanner = document.getElementById('error-banner');
  const errorMessageEl = document.getElementById('error-message');
  const resourceForm = document.getElementById('resource-form');
  const formFields = document.getElementById('form-fields');
  const saveBtn = document.getElementById('save-btn');
  const assignBtn = document.getElementById('assign-btn');
  const deleteBtn = document.getElementById('delete-btn');
  const assignedBadge = document.getElementById('assigned-badge');

  // ── Field definitions per resource type ───────────────────────────────────

  const FIELD_DEFS = {
    agents: {
      sections: [
        {
          title: 'Identity',
          fields: [
            { key: 'id', label: 'ID', type: 'text', required: true, hint: 'Unique kebab-case identifier (e.g. code-reviewer)', pattern: '^[a-z0-9]+(-[a-z0-9]+)*$', patternMsg: 'Must be lowercase kebab-case', readonlyOnEdit: true },
            { key: 'name', label: 'Name', type: 'text', required: true, hint: 'Human-readable display name' },
            { key: 'description', label: 'Description', type: 'textarea', required: true, hint: 'What this agent does' },
            { key: 'model', label: 'Model', type: 'text', required: true, hint: 'e.g. gpt-4, claude-sonnet-4, gemini-pro' },
          ],
        },
        {
          title: 'Prompt (choose one)',
          fields: [
            { key: '_prompt_mode', label: '', type: 'prompt_toggle' },
            { key: 'system_prompt', label: 'Inline System Prompt', type: 'textarea', hint: 'Inline system prompt text', conditional: '_prompt_mode:inline' },
            { key: 'prompt_ref', label: 'Prompt Reference ID', type: 'text', hint: 'ID of a shared Prompt resource', pattern: '^[a-z0-9]+(-[a-z0-9]+)*$', patternMsg: 'Must be kebab-case', conditional: '_prompt_mode:ref' },
          ],
        },
        {
          title: 'Resources',
          fields: [
            { key: 'skills', label: 'Skill IDs', type: 'array', hint: 'One skill ID per line (kebab-case)' },
            { key: 'mcp_configs', label: 'MCP Config IDs', type: 'array', hint: 'One MCP config ID per line (kebab-case)' },
          ],
        },
        {
          title: 'Parameters',
          fields: [
            { key: 'parameters.temperature', label: 'Temperature', type: 'number', hint: '0.0 – 2.0', min: 0, max: 2, step: 0.1 },
            { key: 'parameters.max_tokens', label: 'Max Tokens', type: 'number', hint: 'Integer ≥ 1', min: 1, step: 1 },
          ],
        },
        {
          title: 'Metadata',
          fields: [
            { key: 'tags', label: 'Tags', type: 'tags', hint: 'Comma-separated tags' },
          ],
        },
      ],
    },

    skills: {
      sections: [
        {
          title: 'Identity',
          fields: [
            { key: 'id', label: 'ID', type: 'text', required: true, hint: 'Unique kebab-case identifier', pattern: '^[a-z0-9]+(-[a-z0-9]+)*$', patternMsg: 'Must be lowercase kebab-case', readonlyOnEdit: true },
            { key: 'name', label: 'Name', type: 'text', required: true },
            { key: 'description', label: 'Description', type: 'textarea', required: true },
          ],
        },
        {
          title: 'Behavior',
          fields: [
            { key: 'instructions', label: 'Instructions', type: 'textarea', hint: "Prompt template that defines this skill's behavior" },
            { key: 'dependencies', label: 'Dependency Skill IDs', type: 'array', hint: 'One skill ID per line' },
          ],
        },
        {
          title: 'Metadata',
          fields: [
            { key: 'tags', label: 'Tags', type: 'tags', hint: 'Comma-separated tags' },
          ],
        },
      ],
    },

    prompts: {
      sections: [
        {
          title: 'Identity',
          fields: [
            { key: 'id', label: 'ID', type: 'text', required: true, hint: 'Unique kebab-case identifier', pattern: '^[a-z0-9]+(-[a-z0-9]+)*$', patternMsg: 'Must be lowercase kebab-case', readonlyOnEdit: true },
            { key: 'name', label: 'Name', type: 'text', required: true },
            { key: 'description', label: 'Description', type: 'textarea' },
            {
              key: 'role', label: 'Role', type: 'select', hint: 'Message role this prompt is used for',
              options: [
                { value: '', label: '— choose —' },
                { value: 'system', label: 'system' },
                { value: 'user', label: 'user' },
                { value: 'assistant', label: 'assistant' },
              ],
            },
          ],
        },
        {
          title: 'Content',
          fields: [
            { key: 'content', label: 'Prompt Content', type: 'code_textarea', required: true, hint: 'Supports {{variable}} template syntax' },
          ],
        },
        {
          title: 'Metadata',
          fields: [
            { key: 'tags', label: 'Tags', type: 'tags', hint: 'Comma-separated tags' },
          ],
        },
      ],
    },

    'mcp-configs': {
      sections: [
        {
          title: 'Identity',
          fields: [
            { key: 'id', label: 'ID', type: 'text', required: true, hint: 'Unique kebab-case identifier', pattern: '^[a-z0-9]+(-[a-z0-9]+)*$', patternMsg: 'Must be lowercase kebab-case', readonlyOnEdit: true },
            { key: 'name', label: 'Name', type: 'text', required: true },
            { key: 'description', label: 'Description', type: 'textarea' },
          ],
        },
        {
          title: 'Server (command or URL)',
          fields: [
            { key: 'server.command', label: 'Command', type: 'text', hint: 'e.g. npx @modelcontextprotocol/server-github' },
            { key: 'server.args', label: 'Arguments', type: 'array', hint: 'One argument per line' },
            { key: 'server.env', label: 'Environment Variables', type: 'kv', hint: 'KEY=value pairs for the server process' },
            { key: 'server.url', label: 'URL (remote server)', type: 'text', hint: 'e.g. https://mcp.example.com/sse' },
          ],
        },
        {
          title: 'Metadata',
          fields: [
            { key: 'tags', label: 'Tags', type: 'tags', hint: 'Comma-separated tags' },
          ],
        },
      ],
    },
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Deep-get a dotted key path from an object. */
  function deepGet(obj, path) {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((acc, k) => (acc != null ? acc[k] : undefined), obj);
  }

  /** Deep-set a dotted key path on an object (mutates). Guards against prototype pollution. */
  function deepSet(obj, path, value) {
    const keys = path.split('.');
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (UNSAFE_PROP_KEYS.has(key)) return; // block prototype pollution
      if (cur[key] == null || typeof cur[key] !== 'object') {
        cur[key] = {};
      }
      cur = cur[key];
    }
    const lastKey = keys[keys.length - 1];
    if (!UNSAFE_PROP_KEYS.has(lastKey)) {
      cur[lastKey] = value;
    }
  }

  /** Show or hide an element using the `hidden` attribute. */
  function setVisible(el, visible) {
    if (visible) el.removeAttribute('hidden');
    else el.setAttribute('hidden', '');
  }

  /** Escape HTML to prevent XSS in dynamically created content. */
  function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * Keys that must never be used as object property names to prevent prototype pollution.
   * @type {Set<string>}
   */
  const UNSAFE_PROP_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

  // ── Form rendering ─────────────────────────────────────────────────────────

  function getPromptMode(res) {
    if (!res) return 'inline';
    if (res.prompt_ref) return 'ref';
    return 'inline';
  }

  function renderForm() {
    const defs = FIELD_DEFS[resourceType];
    if (!defs) {
      formFields.innerHTML = '<p>Unknown resource type.</p>';
      return;
    }

    const promptMode = getPromptMode(currentResource);
    let html = '';

    for (const section of defs.sections) {
      html += `<div class="form-section">`;
      html += `<h3 class="form-section-title">${esc(section.title)}</h3>`;
      html += `<div class="form-section-body">`;

      for (const field of section.fields) {
        if (field.conditional) {
          const [condKey, condVal] = field.conditional.split(':');
          if (condKey === '_prompt_mode' && condVal !== promptMode) continue;
        }

        html += renderField(field, currentResource, promptMode);
      }

      html += `</div></div>`;
    }

    formFields.innerHTML = html;
    attachFieldListeners();
  }

  function renderField(field, resource, promptMode) {
    const value = deepGet(resource, field.key) ?? '';
    const readonly = field.readonlyOnEdit && currentMode === 'edit';

    if (field.type === 'prompt_toggle') {
      return `<div class="radio-toggle">
        <label><input type="radio" name="_prompt_mode" value="inline" ${promptMode === 'inline' ? 'checked' : ''}> Inline system prompt</label>
        <label><input type="radio" name="_prompt_mode" value="ref" ${promptMode === 'ref' ? 'checked' : ''}> Reference a Prompt resource</label>
      </div>`;
    }

    const labelHtml = field.label
      ? `<label for="field-${esc(field.key)}">${esc(field.label)}${field.required ? '<span class="required-mark">*</span>' : ''}</label>`
      : '';
    const hintHtml = field.hint ? `<span class="field-hint">${esc(field.hint)}</span>` : '';
    const validationHtml = `<span class="validation-msg" id="err-${esc(field.key)}"></span>`;

    let inputHtml = '';

    switch (field.type) {
      case 'text':
      case 'url':
        inputHtml = `<input type="text" id="field-${esc(field.key)}" data-key="${esc(field.key)}"
          value="${esc(value)}"
          ${field.pattern ? `pattern="${esc(field.pattern)}"` : ''}
          ${field.required ? 'required' : ''}
          ${readonly ? 'readonly' : ''}
          autocomplete="off" spellcheck="false" />`;
        break;

      case 'number':
        inputHtml = `<input type="number" id="field-${esc(field.key)}" data-key="${esc(field.key)}"
          value="${value !== '' && value != null ? esc(String(value)) : ''}"
          ${field.min != null ? `min="${field.min}"` : ''}
          ${field.max != null ? `max="${field.max}"` : ''}
          ${field.step != null ? `step="${field.step}"` : ''}
          autocomplete="off" />`;
        break;

      case 'textarea':
        inputHtml = `<textarea id="field-${esc(field.key)}" data-key="${esc(field.key)}"
          rows="4"
          ${field.required ? 'required' : ''}
          ${readonly ? 'readonly' : ''}>${esc(String(value))}</textarea>`;
        break;

      case 'code_textarea':
        inputHtml = `<textarea id="field-${esc(field.key)}" data-key="${esc(field.key)}"
          class="code-textarea"
          rows="8"
          ${field.required ? 'required' : ''}
          ${readonly ? 'readonly' : ''}>${esc(String(value))}</textarea>`;
        break;

      case 'select': {
        const opts = (field.options || [])
          .map((o) => `<option value="${esc(o.value)}" ${value === o.value ? 'selected' : ''}>${esc(o.label)}</option>`)
          .join('');
        inputHtml = `<select id="field-${esc(field.key)}" data-key="${esc(field.key)}">${opts}</select>`;
        break;
      }

      case 'array': {
        const lines = Array.isArray(value) ? value.join('\n') : '';
        inputHtml = `<textarea id="field-${esc(field.key)}" data-key="${esc(field.key)}"
          rows="3"
          placeholder="One item per line">${esc(lines)}</textarea>`;
        break;
      }

      case 'tags': {
        const tagStr = Array.isArray(value) ? value.join(', ') : String(value);
        inputHtml = `<input type="text" id="field-${esc(field.key)}" data-key="${esc(field.key)}"
          value="${esc(tagStr)}"
          placeholder="tag1, tag2, tag3"
          autocomplete="off" />`;
        break;
      }

      case 'kv': {
        // Key-value pair editor for env vars
        const kvPairs = value && typeof value === 'object' ? Object.entries(value) : [];
        const rows = kvPairs.map(([k, v], i) => kvRow(i, k, v)).join('');
        inputHtml = `<div class="kv-editor" id="kv-${esc(field.key)}" data-key="${esc(field.key)}">
          ${rows}
          <button type="button" class="btn btn-ghost kv-add" data-kv-target="kv-${esc(field.key)}">+ Add variable</button>
        </div>`;
        break;
      }

      default:
        inputHtml = `<input type="text" id="field-${esc(field.key)}" data-key="${esc(field.key)}" value="${esc(value)}" />`;
    }

    return `<div class="form-field" id="wrap-${esc(field.key)}">
      ${labelHtml}
      ${inputHtml}
      ${hintHtml}
      ${validationHtml}
    </div>`;
  }

  function kvRow(index, key = '', value = '') {
    return `<div class="kv-row" data-kv-index="${index}">
      <input type="text" placeholder="KEY" value="${esc(key)}" class="kv-key" autocomplete="off" spellcheck="false" />
      <input type="text" placeholder="value" value="${esc(value)}" class="kv-value" autocomplete="off" />
      <button type="button" class="kv-remove" title="Remove">✕</button>
    </div>`;
  }

  function attachFieldListeners() {
    // Prompt mode toggle
    document.querySelectorAll('input[name="_prompt_mode"]').forEach((radio) => {
      radio.addEventListener('change', () => renderForm());
    });

    // KV add row
    document.querySelectorAll('.kv-add').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.kvTarget;
        const container = document.getElementById(targetId);
        const rows = container.querySelectorAll('.kv-row');
        const newRow = document.createElement('div');
        newRow.innerHTML = kvRow(rows.length);
        container.insertBefore(newRow.firstElementChild, btn);
        attachKvRemoveListeners(container);
      });
    });

    // KV remove rows
    document.querySelectorAll('.kv-editor').forEach((editor) => {
      attachKvRemoveListeners(editor);
    });
  }

  function attachKvRemoveListeners(container) {
    container.querySelectorAll('.kv-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.closest('.kv-row').remove();
      });
    });
  }

  // ── Read form values ───────────────────────────────────────────────────────

  function readFormValues() {
    const result = { schema_version: 'v1' };
    const defs = FIELD_DEFS[resourceType];
    if (!defs) return result;

    // Current prompt mode
    const promptModeEl = document.querySelector('input[name="_prompt_mode"]:checked');
    const promptMode = promptModeEl ? promptModeEl.value : 'inline';

    for (const section of defs.sections) {
      for (const field of section.fields) {
        if (field.type === 'prompt_toggle') continue;

        // Skip fields for the inactive prompt mode
        if (field.conditional) {
          const [, condVal] = field.conditional.split(':');
          if (condVal !== promptMode) continue;
        }

        const el = document.getElementById(`field-${field.key}`);
        if (!el) continue;

        let val;
        switch (field.type) {
          case 'number':
            val = el.value !== '' ? parseFloat(el.value) : undefined;
            if (field.step === 1) val = val != null ? Math.round(val) : undefined;
            break;
          case 'array':
            val = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
            if (val.length === 0) val = undefined;
            break;
          case 'tags':
            val = el.value.split(',').map((s) => s.trim()).filter(Boolean);
            if (val.length === 0) val = undefined;
            break;
          case 'kv': {
            const kvEl = document.getElementById(`kv-${field.key}`);
            if (!kvEl) break;
            const pairs = {};
            kvEl.querySelectorAll('.kv-row').forEach((row) => {
              const k = row.querySelector('.kv-key').value.trim();
              const v = row.querySelector('.kv-value').value;
              if (k) pairs[k] = v;
            });
            val = Object.keys(pairs).length > 0 ? pairs : undefined;
            break;
          }
          case 'select':
            val = el.value || undefined;
            break;
          default:
            val = el.value.trim() || undefined;
        }

        if (val !== undefined) {
          deepSet(result, field.key, val);
        }
      }
    }

    return result;
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  function validateForm() {
    let valid = true;
    const defs = FIELD_DEFS[resourceType];
    if (!defs) return true;

    const promptModeEl = document.querySelector('input[name="_prompt_mode"]:checked');
    const promptMode = promptModeEl ? promptModeEl.value : 'inline';

    // Clear previous errors
    document.querySelectorAll('.form-field').forEach((el) => {
      el.classList.remove('has-error');
    });

    for (const section of defs.sections) {
      for (const field of section.fields) {
        if (field.type === 'prompt_toggle' || field.type === 'kv') continue;
        if (field.conditional) {
          const [, condVal] = field.conditional.split(':');
          if (condVal !== promptMode) continue;
        }

        const el = document.getElementById(`field-${field.key}`);
        const wrapper = document.getElementById(`wrap-${field.key}`);
        const errEl = document.getElementById(`err-${field.key}`);
        if (!el || !wrapper) continue;

        const val = el.value.trim();

        if (field.required && !val) {
          showFieldError(el, wrapper, errEl, `${field.label} is required`);
          valid = false;
          continue;
        }

        if (val && field.pattern) {
          const re = new RegExp(field.pattern);
          if (!re.test(val)) {
            showFieldError(el, wrapper, errEl, field.patternMsg || 'Invalid format');
            valid = false;
          }
        }
      }
    }

    // Agent-specific: must have system_prompt OR prompt_ref
    if (resourceType === 'agents') {
      const spEl = document.getElementById('field-system_prompt');
      const prEl = document.getElementById('field-prompt_ref');
      const hasPrompt = (spEl && spEl.value.trim()) || (prEl && prEl.value.trim());
      if (!hasPrompt) {
        const activeEl = spEl || prEl;
        const wrapId = spEl ? 'wrap-system_prompt' : 'wrap-prompt_ref';
        const errId = spEl ? 'err-system_prompt' : 'err-prompt_ref';
        const wrapper = document.getElementById(wrapId);
        const errEl = document.getElementById(errId);
        if (activeEl && wrapper) {
          showFieldError(activeEl, wrapper, errEl, 'Either a system prompt or a prompt reference is required');
          valid = false;
        }
      }
    }

    return valid;
  }

  function showFieldError(el, wrapper, errEl, msg) {
    el.classList.add('invalid');
    wrapper.classList.add('has-error');
    if (errEl) errEl.textContent = msg;
    el.focus();
  }

  // ── Save flow ──────────────────────────────────────────────────────────────

  function handleSave(dedupAction) {
    hideError();
    hideDupWarning();

    if (!validateForm()) return;

    const payload = readFormValues();

    // Preserve id in edit mode
    if (currentMode === 'edit' && currentResource) {
      payload.id = currentResource.id;
    }

    pendingSavePayload = payload;

    vscode.postMessage({
      type: 'save',
      resourceType,
      resource: payload,
      dedupAction: dedupAction || undefined,
    });
  }

  // ── Assign flow ────────────────────────────────────────────────────────────

  function handleAssignToggle() {
    if (!currentResource) return;
    if (isAssigned) {
      vscode.postMessage({ type: 'unassign', resourceType, resourceId: currentResource.id });
    } else {
      vscode.postMessage({ type: 'assign', resourceType, resourceId: currentResource.id });
    }
  }

  // ── Duplicate warning ──────────────────────────────────────────────────────

  function showDupWarning(message, conflicts) {
    dupMessage.textContent = message || 'Similar resources already exist in the fleet.';
    dupList.innerHTML = conflicts
      .map(
        (c) => `<li>
        <strong>${esc(c.resource.name || c.resource.id)}</strong>
        <span class="match-type">${esc(c.matchType)}</span>
        — ${esc(c.resource.description || '')}
        (score: ${esc(String(c.score))})
      </li>`,
      )
      .join('');
    setVisible(dupWarning, true);
    dupWarning.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideDupWarning() {
    setVisible(dupWarning, false);
    pendingSavePayload = null;
  }

  // ── Error banner ───────────────────────────────────────────────────────────

  function showError(msg) {
    errorMessageEl.textContent = msg;
    setVisible(errorBanner, true);
  }

  function hideError() {
    setVisible(errorBanner, false);
  }

  // ── Update assigned UI ─────────────────────────────────────────────────────

  function updateAssignedUI(assigned) {
    isAssigned = assigned;
    if (assignedBadge) {
      assignedBadge.textContent = assigned ? '✓ Assigned' : '○ Unassigned';
      assignedBadge.className = assigned ? 'badge-assigned' : 'badge-unassigned';
      assignedBadge.title = assigned ? 'Assigned to workspace' : 'Not assigned to workspace';
    }
    if (assignBtn) {
      assignBtn.textContent = assigned ? 'Unassign from Workspace' : 'Assign to Workspace';
    }
  }

  // ── Message handling from the extension ───────────────────────────────────

  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'saving':
        setVisible(loadingOverlay, true);
        if (saveBtn) saveBtn.disabled = true;
        break;

      case 'saveSuccess':
        setVisible(loadingOverlay, false);
        if (saveBtn) saveBtn.disabled = false;
        hideDupWarning();
        hideError();
        currentResource = msg.resource;
        currentMode = 'edit';
        if (saveBtn) saveBtn.textContent = 'Save Changes';
        if (deleteBtn) setVisible(deleteBtn, true);
        if (assignBtn) setVisible(assignBtn, true);
        break;

      case 'saveError':
        setVisible(loadingOverlay, false);
        if (saveBtn) saveBtn.disabled = false;
        showError(msg.message || 'An error occurred while saving.');
        break;

      case 'dupConflict':
        setVisible(loadingOverlay, false);
        if (saveBtn) saveBtn.disabled = false;
        showDupWarning(msg.message, msg.conflicts || []);
        break;

      case 'deleteSuccess':
        // Panel will be disposed by the extension; nothing to do here
        break;

      case 'assignChanged':
        updateAssignedUI(msg.assigned);
        break;

      default:
        break;
    }
  });

  // ── Event listeners ────────────────────────────────────────────────────────

  resourceForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSave(null);
  });

  if (assignBtn) {
    assignBtn.addEventListener('click', handleAssignToggle);
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (!currentResource) return;
      vscode.postMessage({
        type: 'delete',
        resourceType,
        resourceId: currentResource.id,
      });
    });
  }

  // Duplicate action buttons
  dupOverrideBtn.addEventListener('click', () => handleSave('override'));
  dupMergeBtn.addEventListener('click', () => handleSave('merge'));
  dupLinkBtn.addEventListener('click', () => handleSave('link'));
  dupCancelBtn.addEventListener('click', () => hideDupWarning());

  // ── Init ───────────────────────────────────────────────────────────────────

  renderForm();
})();
