'use strict';

/**
 * Deduplication Engine
 *
 * Detects duplicate fleet resources via:
 *   1. Exact name match (case-insensitive)
 *   2. Keyword-based Jaccard similarity on name + description
 *
 * Provides helper functions to resolve conflicts via merge or link actions.
 */

/** Minimum similarity score (0–1) to classify a resource as a near-duplicate. */
const SIMILARITY_THRESHOLD = 0.7;

/**
 * Tokenize a text string into a set of lowercase words.
 * @param {string} text
 * @returns {Set<string>}
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return new Set();
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean),
  );
}

/**
 * Compute Jaccard similarity coefficient between two token sets.
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {number} value in [0, 1]
 */
function jaccardSimilarity(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersectionSize = 0;
  for (const token of a) {
    if (b.has(token)) intersectionSize++;
  }
  const unionSize = a.size + b.size - intersectionSize;
  return intersectionSize / unionSize;
}

/**
 * Compute a combined similarity score between two resources.
 * Weights: name 60 %, description 40 %.
 * @param {object} a
 * @param {object} b
 * @returns {number} value in [0, 1]
 */
function computeSimilarity(a, b) {
  const nameSim = jaccardSimilarity(tokenize(a.name || ''), tokenize(b.name || ''));
  const aDesc = tokenize(a.description || '');
  const bDesc = tokenize(b.description || '');
  // Both descriptions empty → no evidence of similarity; treat as 0 to avoid false positives.
  const descSim = aDesc.size === 0 && bDesc.size === 0 ? 0 : jaccardSimilarity(aDesc, bDesc);
  return 0.6 * nameSim + 0.4 * descSim;
}

/**
 * Find duplicate resources from a list of existing resources.
 * Checks for exact name match first, then keyword-based similarity.
 *
 * @param {Array<{data: object}>} existingResources - All existing resources of the type
 * @param {object} incoming - The resource being created or updated
 * @param {string} [excludeId] - Resource ID to exclude from the check (used during updates)
 * @returns {Array<{resource: object, matchType: 'exact_name'|'similar', score: number}>}
 *   Sorted by score descending.
 */
function findDuplicates(existingResources, incoming, excludeId = null) {
  const duplicates = [];

  for (const { data } of existingResources) {
    if (excludeId && data.id === excludeId) continue;

    // 1. Exact name match (case-insensitive)
    if (data.name && incoming.name && data.name.toLowerCase() === incoming.name.toLowerCase()) {
      duplicates.push({ resource: data, matchType: 'exact_name', score: 1.0 });
      continue;
    }

    // 2. Keyword-based similarity
    const score = computeSimilarity(incoming, data);
    if (score >= SIMILARITY_THRESHOLD) {
      duplicates.push({ resource: data, matchType: 'similar', score });
    }
  }

  return duplicates.sort((a, b) => b.score - a.score);
}

/**
 * Merge two resources; incoming fields take precedence over existing fields.
 * Metadata objects are shallowly merged and `updated_at` is set to the current time.
 *
 * @param {object} existing - The existing (best-match) resource data
 * @param {object} incoming - The incoming resource data
 * @returns {object} Merged resource
 */
function mergeResources(existing, incoming) {
  return {
    ...existing,
    ...incoming,
    metadata: {
      ...(existing.metadata || {}),
      ...(incoming.metadata || {}),
      updated_at: new Date().toISOString(),
    },
  };
}

/**
 * Annotate an incoming resource with `metadata.linked_resources` referencing duplicate IDs.
 * Existing `linked_resources` entries are preserved; duplicates are deduplicated.
 *
 * @param {object} incoming - The resource being created or updated
 * @param {Array<{resource: object}>} duplicates - Detected duplicate resources
 * @returns {object} Annotated resource
 */
function linkResources(incoming, duplicates) {
  const linkedIds = duplicates.map((d) => d.resource.id);
  return {
    ...incoming,
    metadata: {
      ...(incoming.metadata || {}),
      linked_resources: [
        ...new Set([...((incoming.metadata || {}).linked_resources || []), ...linkedIds]),
      ],
    },
  };
}

module.exports = { findDuplicates, mergeResources, linkResources, SIMILARITY_THRESHOLD };
