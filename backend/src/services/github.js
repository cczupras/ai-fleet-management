'use strict';

const { Octokit } = require('@octokit/rest');

/**
 * Build an Octokit client authenticated with the provided GitHub token.
 * @param {string} token - GitHub Personal Access Token
 * @returns {Octokit}
 */
function buildClient(token) {
  return new Octokit({ auth: token });
}

/**
 * Map resource type to its fleet directory path.
 * @param {string} resourceType - 'agents' | 'skills' | 'prompts' | 'mcp-configs'
 * @returns {string}
 */
function resourcePath(resourceType, id = null) {
  const base = `fleet/${resourceType}`;
  return id ? `${base}/${id}.json` : base;
}

/**
 * List all resources of a given type from the GitHub repo.
 * @param {Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {string} resourceType
 * @returns {Promise<Array>}
 */
async function listResources(octokit, owner, repo, branch, resourceType) {
  let items;
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: resourcePath(resourceType),
      ref: branch,
    });
    items = response.data;
  } catch (err) {
    if (err.status === 404) {
      return [];
    }
    throw err;
  }

  if (!Array.isArray(items)) {
    return [];
  }

  const jsonFiles = items.filter((item) => item.type === 'file' && item.name.endsWith('.json'));

  // Fetch blob content using the SHA from the directory listing to avoid redundant path
  // resolution. Process in small batches to stay within GitHub rate limits.
  const BATCH_SIZE = 5;
  const resources = [];
  for (let i = 0; i < jsonFiles.length; i += BATCH_SIZE) {
    const batch = jsonFiles.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        try {
          const blob = await octokit.git.getBlob({ owner, repo, file_sha: item.sha });
          const raw = Buffer.from(blob.data.content, blob.data.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8');
          return { data: JSON.parse(raw), sha: item.sha };
        } catch (blobErr) {
          console.error('[listResources] Failed to fetch or parse blob', { sha: item.sha, name: item.name, message: blobErr.message });
          return null;
        }
      }),
    );
    resources.push(...batchResults.filter(Boolean));
  }

  return resources;
}

/**
 * Get a single resource by ID.
 * @param {Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {string} resourceType
 * @param {string} id
 * @returns {Promise<{data: object, sha: string}|null>}
 */
async function getResource(octokit, owner, repo, branch, resourceType, id) {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: resourcePath(resourceType, id),
      ref: branch,
    });
    const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
    return { data: JSON.parse(content), sha: response.data.sha };
  } catch (err) {
    if (err.status === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Create or update a resource file in the GitHub repo.
 * @param {Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {string} resourceType
 * @param {string} id
 * @param {object} data
 * @param {string|null} sha - Required when updating; null for create
 * @param {string} message - Commit message
 * @returns {Promise<object>}
 */
async function putResource(octokit, owner, repo, branch, resourceType, id, data, sha, message) {
  const content = Buffer.from(JSON.stringify(data, null, 2) + '\n').toString('base64');
  const params = {
    owner,
    repo,
    path: resourcePath(resourceType, id),
    message,
    content,
    branch,
  };
  if (sha) {
    params.sha = sha;
  }
  const response = await octokit.repos.createOrUpdateFileContents(params);
  return response.data;
}

/**
 * Delete a resource file from the GitHub repo.
 * @param {Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {string} resourceType
 * @param {string} id
 * @param {string} sha
 * @param {string} message - Commit message
 * @returns {Promise<object>}
 */
async function deleteResource(octokit, owner, repo, branch, resourceType, id, sha, message) {
  const response = await octokit.repos.deleteFile({
    owner,
    repo,
    path: resourcePath(resourceType, id),
    message,
    sha,
    branch,
  });
  return response.data;
}

module.exports = { buildClient, listResources, getResource, putResource, deleteResource };
