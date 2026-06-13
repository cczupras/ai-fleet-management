'use strict';

const http = require('http');
const https = require('https');

/**
 * Low-level HTTP request helper using Node built-ins (no external dependencies).
 * @param {string} url - Full URL to request
 * @param {object} options - { method, headers, body }
 * @returns {Promise<{ status: number, data: any }>}
 */
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (e) {
      return reject(new Error(`Invalid URL: ${url}`));
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    const defaultPort = isHttps ? 443 : 80;

    const bodyString =
      options.body != null
        ? typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body)
        : null;

    const headers = Object.assign({}, options.headers);
    if (bodyString) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyString);
    }

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : defaultPort,
      path: parsedUrl.pathname + parsedUrl.search,
      method: (options.method || 'GET').toUpperCase(),
      headers,
    };

    const req = client.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data;
        try {
          data = raw ? JSON.parse(raw) : null;
        } catch (_) {
          data = raw;
        }
        resolve({ status: res.statusCode, data });
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('Request timed out after 15s'));
    });

    if (bodyString) {
      req.write(bodyString);
    }
    req.end();
  });
}

/**
 * API client for the AI Fleet Management backend.
 */
class ApiClient {
  /**
   * @param {string} baseUrl - e.g. "http://localhost:3000"
   * @param {string} [githubToken] - GitHub Personal Access Token for backend API authentication
   */
  constructor(baseUrl, githubToken) {
    this.baseUrl = (baseUrl || 'http://localhost:3000').replace(/\/$/, '');
    this.githubToken = githubToken || '';
  }

  /** @private */
  _headers() {
    const h = { Accept: 'application/json' };
    if (this.githubToken) {
      h['Authorization'] = 'Bearer ' + this.githubToken;
    }
    return h;
  }

  /** @private */
  _url(path, query = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(query).filter(([, v]) => v != null)),
    ).toString();
    return `${this.baseUrl}${path}${qs ? `?${qs}` : ''}`;
  }

  /**
   * Health check — resolves true if the backend is reachable.
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      const result = await makeRequest(this._url('/health'), {
        headers: this._headers(),
      });
      return result.status === 200;
    } catch (_) {
      return false;
    }
  }

  /**
   * List all resources of a given type.
   * @param {'agents'|'skills'|'prompts'|'mcp-configs'} resourceType
   * @returns {Promise<{ ok: boolean, data?: any[], error?: string }>}
   */
  async listResources(resourceType) {
    try {
      const result = await makeRequest(this._url(`/api/v1/${resourceType}`), {
        headers: this._headers(),
      });
      if (result.status === 200) {
        return { ok: true, data: result.data };
      }
      return { ok: false, error: result.data?.message || `HTTP ${result.status}` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Get a single resource by ID.
   * @param {'agents'|'skills'|'prompts'|'mcp-configs'} resourceType
   * @param {string} id
   * @returns {Promise<{ ok: boolean, data?: object, error?: string }>}
   */
  async getResource(resourceType, id) {
    try {
      const result = await makeRequest(this._url(`/api/v1/${resourceType}/${id}`), {
        headers: this._headers(),
      });
      if (result.status === 200) {
        return { ok: true, data: result.data };
      }
      if (result.status === 404) {
        return { ok: false, error: 'Not found' };
      }
      return { ok: false, error: result.data?.message || `HTTP ${result.status}` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Create a new resource.
   * @param {'agents'|'skills'|'prompts'|'mcp-configs'} resourceType
   * @param {object} body
   * @param {string} [dedupAction] - 'override' | 'merge' | 'link'
   * @returns {Promise<{ ok: boolean, data?: object, conflicts?: object[], error?: string, status?: number }>}
   */
  async createResource(resourceType, body, dedupAction) {
    try {
      const query = dedupAction ? { dedup_action: dedupAction } : {};
      const result = await makeRequest(this._url(`/api/v1/${resourceType}`, query), {
        method: 'POST',
        headers: this._headers(),
        body,
      });
      if (result.status === 201) {
        return { ok: true, data: result.data };
      }
      if (result.status === 409 && result.data?.conflicts) {
        return { ok: false, status: 409, conflicts: result.data.conflicts, error: result.data.message };
      }
      return { ok: false, status: result.status, error: result.data?.message || `HTTP ${result.status}` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Update (full replace) an existing resource.
   * @param {'agents'|'skills'|'prompts'|'mcp-configs'} resourceType
   * @param {string} id
   * @param {object} body
   * @param {string} [dedupAction] - 'override' | 'merge' | 'link'
   * @returns {Promise<{ ok: boolean, data?: object, conflicts?: object[], error?: string, status?: number }>}
   */
  async updateResource(resourceType, id, body, dedupAction) {
    try {
      const query = dedupAction ? { dedup_action: dedupAction } : {};
      const result = await makeRequest(this._url(`/api/v1/${resourceType}/${id}`, query), {
        method: 'PUT',
        headers: this._headers(),
        body,
      });
      if (result.status === 200) {
        return { ok: true, data: result.data };
      }
      if (result.status === 409 && result.data?.conflicts) {
        return { ok: false, status: 409, conflicts: result.data.conflicts, error: result.data.message };
      }
      return { ok: false, status: result.status, error: result.data?.message || `HTTP ${result.status}` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Delete a resource.
   * @param {'agents'|'skills'|'prompts'|'mcp-configs'} resourceType
   * @param {string} id
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  async deleteResource(resourceType, id) {
    try {
      const result = await makeRequest(this._url(`/api/v1/${resourceType}/${id}`), {
        method: 'DELETE',
        headers: this._headers(),
      });
      if (result.status === 200) {
        return { ok: true };
      }
      return { ok: false, error: result.data?.message || `HTTP ${result.status}` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}

module.exports = ApiClient;
