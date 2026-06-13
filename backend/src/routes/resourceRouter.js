'use strict';

const express = require('express');
const config = require('../config');
const github = require('../services/github');
const { validate } = require('../services/validation');
const dedup = require('../services/deduplication');

const VALID_DEDUP_ACTIONS = new Set(['override', 'merge', 'link']);

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Helper to format the conflicts array for a 409 deduplication response.
 * @param {Array} conflicts
 * @returns {Array}
 */
function formatConflicts(conflicts) {
  return conflicts.map((c) => ({
    resource: c.resource,
    matchType: c.matchType,
    score: parseFloat(c.score.toFixed(3)),
  }));
}

/**
 * Build an Express router that exposes CRUD endpoints for a fleet resource type.
 * @param {string} resourceType - 'agents' | 'skills' | 'prompts' | 'mcp-configs'
 * @returns {express.Router}
 */
function buildResourceRouter(resourceType) {
  const router = express.Router();

  /**
   * @openapi
   * /api/v1/{resourceType}:
   *   get:
   *     summary: List all resources of this type
   */
  router.get('/', async (req, res, next) => {
    try {
      const octokit = github.buildClient(req.githubToken);
      const resources = await github.listResources(
        octokit,
        config.github.owner,
        config.github.repo,
        config.github.branch,
        resourceType,
      );
      res.json(resources.map((r) => r.data));
    } catch (err) {
      next(err);
    }
  });

  /**
   * @openapi
   * /api/v1/{resourceType}/{id}:
   *   get:
   *     summary: Get a single resource by ID
   */
  router.get('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!ID_PATTERN.test(id)) {
        return res.status(400).json({ error: 'Bad Request', message: 'Invalid resource ID format.' });
      }
      const octokit = github.buildClient(req.githubToken);
      const result = await github.getResource(
        octokit,
        config.github.owner,
        config.github.repo,
        config.github.branch,
        resourceType,
        id,
      );
      if (!result) {
        return res.status(404).json({ error: 'Not Found', message: `${resourceType} '${id}' not found.` });
      }
      res.json(result.data);
    } catch (err) {
      next(err);
    }
  });

  /**
   * @openapi
   * /api/v1/{resourceType}:
   *   post:
   *     summary: Create a new resource
   */
  router.post('/', async (req, res, next) => {
    try {
      let body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ error: 'Bad Request', message: 'Request body must be a JSON object.' });
      }

      const { id } = body;
      if (!id || !ID_PATTERN.test(id)) {
        return res.status(400).json({ error: 'Bad Request', message: 'Resource id is required and must be kebab-case.' });
      }

      const { valid, errors } = validate(resourceType, body);
      if (!valid) {
        return res.status(422).json({ error: 'Validation Error', message: 'Resource failed schema validation.', details: errors });
      }

      const octokit = github.buildClient(req.githubToken);

      // Conflict check: exact ID match
      const existing = await github.getResource(
        octokit,
        config.github.owner,
        config.github.repo,
        config.github.branch,
        resourceType,
        id,
      );
      if (existing) {
        return res.status(409).json({ error: 'Conflict', message: `${resourceType} '${id}' already exists.` });
      }

      // Deduplication check: name/similarity across all resources
      const allResources = await github.listResources(
        octokit,
        config.github.owner,
        config.github.repo,
        config.github.branch,
        resourceType,
      );
      const conflicts = dedup.findDuplicates(allResources, body);

      if (conflicts.length > 0) {
        const { dedup_action } = req.query;
        if (!dedup_action) {
          return res.status(409).json({
            error: 'Conflict',
            message: 'Potential duplicate resources detected.',
            conflicts: formatConflicts(conflicts),
            hint: 'Resubmit with ?dedup_action=override|merge|link to resolve.',
          });
        }
        if (!VALID_DEDUP_ACTIONS.has(dedup_action)) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Invalid dedup_action. Must be one of: override, merge, link.',
          });
        }
        if (dedup_action === 'merge') {
          body = dedup.mergeResources(conflicts[0].resource, body);
          const revalidation = validate(resourceType, body);
          if (!revalidation.valid) {
            return res.status(422).json({
              error: 'Validation Error',
              message: 'Merged resource failed schema validation.',
              details: revalidation.errors,
            });
          }
        } else if (dedup_action === 'link') {
          body = dedup.linkResources(body, conflicts);
        }
        // dedup_action === 'override': proceed with body unchanged
      }

      const result = await github.putResource(
        octokit,
        config.github.owner,
        config.github.repo,
        config.github.branch,
        resourceType,
        id,
        body,
        null,
        `feat(fleet): add ${resourceType}/${id}`,
      );
      res.status(201).json({ message: 'Created', resource: body, commit: result.commit.sha });
    } catch (err) {
      next(err);
    }
  });

  /**
   * @openapi
   * /api/v1/{resourceType}/{id}:
   *   put:
   *     summary: Update an existing resource (full replace)
   */
  router.put('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!ID_PATTERN.test(id)) {
        return res.status(400).json({ error: 'Bad Request', message: 'Invalid resource ID format.' });
      }

      let body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ error: 'Bad Request', message: 'Request body must be a JSON object.' });
      }

      // Enforce id consistency
      if (body.id && body.id !== id) {
        return res.status(400).json({ error: 'Bad Request', message: 'Body id must match URL id.' });
      }
      body.id = id;

      const { valid, errors } = validate(resourceType, body);
      if (!valid) {
        return res.status(422).json({ error: 'Validation Error', message: 'Resource failed schema validation.', details: errors });
      }

      const octokit = github.buildClient(req.githubToken);
      const existing = await github.getResource(
        octokit,
        config.github.owner,
        config.github.repo,
        config.github.branch,
        resourceType,
        id,
      );
      if (!existing) {
        return res.status(404).json({ error: 'Not Found', message: `${resourceType} '${id}' not found.` });
      }

      // Deduplication check: detect similarity against other resources (exclude current ID)
      const allResources = await github.listResources(
        octokit,
        config.github.owner,
        config.github.repo,
        config.github.branch,
        resourceType,
      );
      const conflicts = dedup.findDuplicates(allResources, body, id);

      if (conflicts.length > 0) {
        const { dedup_action } = req.query;
        if (!dedup_action) {
          return res.status(409).json({
            error: 'Conflict',
            message: 'Potential duplicate resources detected.',
            conflicts: formatConflicts(conflicts),
            hint: 'Resubmit with ?dedup_action=override|merge|link to resolve.',
          });
        }
        if (!VALID_DEDUP_ACTIONS.has(dedup_action)) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Invalid dedup_action. Must be one of: override, merge, link.',
          });
        }
        if (dedup_action === 'merge') {
          body = dedup.mergeResources(conflicts[0].resource, body);
          const revalidation = validate(resourceType, body);
          if (!revalidation.valid) {
            return res.status(422).json({
              error: 'Validation Error',
              message: 'Merged resource failed schema validation.',
              details: revalidation.errors,
            });
          }
        } else if (dedup_action === 'link') {
          body = dedup.linkResources(body, conflicts);
        }
        // dedup_action === 'override': proceed with body unchanged
      }

      const result = await github.putResource(
        octokit,
        config.github.owner,
        config.github.repo,
        config.github.branch,
        resourceType,
        id,
        body,
        existing.sha,
        `feat(fleet): update ${resourceType}/${id}`,
      );
      res.json({ message: 'Updated', resource: body, commit: result.commit.sha });
    } catch (err) {
      next(err);
    }
  });

  /**
   * @openapi
   * /api/v1/{resourceType}/{id}:
   *   delete:
   *     summary: Delete a resource
   */
  router.delete('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!ID_PATTERN.test(id)) {
        return res.status(400).json({ error: 'Bad Request', message: 'Invalid resource ID format.' });
      }

      const octokit = github.buildClient(req.githubToken);
      const existing = await github.getResource(
        octokit,
        config.github.owner,
        config.github.repo,
        config.github.branch,
        resourceType,
        id,
      );
      if (!existing) {
        return res.status(404).json({ error: 'Not Found', message: `${resourceType} '${id}' not found.` });
      }

      const result = await github.deleteResource(
        octokit,
        config.github.owner,
        config.github.repo,
        config.github.branch,
        resourceType,
        id,
        existing.sha,
        `feat(fleet): delete ${resourceType}/${id}`,
      );
      res.json({ message: 'Deleted', commit: result.commit.sha });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = buildResourceRouter;
