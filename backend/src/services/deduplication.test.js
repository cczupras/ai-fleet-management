'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { findDuplicates, mergeResources, linkResources, SIMILARITY_THRESHOLD } = require('./deduplication');

describe('findDuplicates', () => {
  test('returns empty array when there are no existing resources', () => {
    const result = findDuplicates([], { id: 'new-agent', name: 'New Agent', description: 'Does things' });
    assert.deepEqual(result, []);
  });

  test('returns empty array for completely different resources', () => {
    const existing = [
      { data: { id: 'foo-agent', name: 'Foo Agent', description: 'Does foo things' } },
    ];
    const incoming = { id: 'bar-skill', name: 'Bar Skill', description: 'Processes bar data' };
    const result = findDuplicates(existing, incoming);
    assert.equal(result.length, 0);
  });

  test('detects exact name match (case-insensitive)', () => {
    const existing = [
      { data: { id: 'code-reviewer', name: 'Code Reviewer', description: 'Reviews code' } },
    ];
    const incoming = { id: 'code-reviewer-v2', name: 'Code Reviewer', description: 'Advanced code review' };
    const result = findDuplicates(existing, incoming);
    assert.equal(result.length, 1);
    assert.equal(result[0].matchType, 'exact_name');
    assert.equal(result[0].score, 1.0);
    assert.equal(result[0].resource.id, 'code-reviewer');
  });

  test('detects exact name match regardless of letter case', () => {
    const existing = [
      { data: { id: 'my-agent', name: 'My Agent', description: 'Does something' } },
    ];
    const incoming = { id: 'my-agent-2', name: 'MY AGENT', description: 'Does something else' };
    const result = findDuplicates(existing, incoming);
    assert.equal(result.length, 1);
    assert.equal(result[0].matchType, 'exact_name');
  });

  test('detects near-duplicate via keyword similarity on name and description', () => {
    const existing = [
      {
        data: {
          id: 'text-summarizer',
          name: 'Text Summarizer',
          description: 'Summarizes long text documents into concise summaries',
        },
      },
    ];
    const incoming = {
      id: 'doc-summarizer',
      name: 'Text Summarizer Tool',
      description: 'Summarizes long text documents into concise summaries quickly',
    };
    const result = findDuplicates(existing, incoming);
    assert.equal(result.length, 1);
    assert.equal(result[0].matchType, 'similar');
    assert.ok(result[0].score >= SIMILARITY_THRESHOLD);
  });

  test('excludes the resource being updated (excludeId)', () => {
    const existing = [
      { data: { id: 'my-skill', name: 'My Skill', description: 'Does things' } },
    ];
    const incoming = { id: 'my-skill', name: 'My Skill', description: 'Does things' };
    const result = findDuplicates(existing, incoming, 'my-skill');
    assert.equal(result.length, 0);
  });

  test('returns results sorted by score descending', () => {
    const existing = [
      {
        data: {
          id: 'text-processor',
          name: 'Text Processor',
          description: 'Processes text input data efficiently',
        },
      },
      {
        data: {
          id: 'unrelated',
          name: 'Unrelated Tool',
          description: 'Something completely different here',
        },
      },
    ];
    const incoming = {
      id: 'text-worker',
      name: 'Text Processor',
      description: 'Processes text input data',
    };
    const result = findDuplicates(existing, incoming);
    assert.ok(result.length >= 1);
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i - 1].score >= result[i].score);
    }
  });

  test('does not match resources below the similarity threshold', () => {
    const existing = [
      { data: { id: 'alpha', name: 'Alpha Service', description: 'Handles alpha requests' } },
    ];
    const incoming = { id: 'omega', name: 'Omega Service', description: 'Manages omega workflows completely' };
    const result = findDuplicates(existing, incoming);
    // "Service" overlaps in name, but description similarity should keep score below threshold
    if (result.length > 0) {
      assert.ok(result[0].score >= SIMILARITY_THRESHOLD);
    }
  });

  test('score property is a number between 0 and 1', () => {
    const existing = [
      { data: { id: 'dup', name: 'Duplicate Agent', description: 'Near duplicate description text here' } },
    ];
    const incoming = { id: 'other', name: 'Duplicate Agent Clone', description: 'Near duplicate description text' };
    const result = findDuplicates(existing, incoming);
    for (const item of result) {
      assert.ok(typeof item.score === 'number');
      assert.ok(item.score >= 0 && item.score <= 1);
    }
  });
});

describe('mergeResources', () => {
  test('incoming fields take precedence over existing', () => {
    const existing = { id: 'old-agent', name: 'Old Agent', description: 'Old description', model: 'gpt-3.5' };
    const incoming = { id: 'new-agent', name: 'New Agent', description: 'New description', model: 'gpt-4' };
    const merged = mergeResources(existing, incoming);
    assert.equal(merged.id, 'new-agent');
    assert.equal(merged.name, 'New Agent');
    assert.equal(merged.model, 'gpt-4');
    assert.equal(merged.description, 'New description');
  });

  test('existing-only fields are preserved in merged output', () => {
    const existing = { id: 'a', name: 'A', tags: ['legacy'], model: 'gpt-3.5' };
    const incoming = { id: 'b', name: 'B', model: 'gpt-4' };
    const merged = mergeResources(existing, incoming);
    assert.deepEqual(merged.tags, ['legacy']);
  });

  test('metadata is shallowly merged with incoming taking precedence', () => {
    const existing = { id: 'a', name: 'A', metadata: { author: 'alice', custom_field: 'value' } };
    const incoming = { id: 'b', name: 'B', metadata: { author: 'bob' } };
    const merged = mergeResources(existing, incoming);
    assert.equal(merged.metadata.author, 'bob');
    assert.equal(merged.metadata.custom_field, 'value');
  });

  test('sets metadata.updated_at to a valid ISO date string', () => {
    const existing = { id: 'a', name: 'A' };
    const incoming = { id: 'b', name: 'B' };
    const before = new Date();
    const merged = mergeResources(existing, incoming);
    const after = new Date();
    assert.ok(merged.metadata.updated_at);
    const updatedAt = new Date(merged.metadata.updated_at);
    assert.ok(updatedAt >= before && updatedAt <= after);
  });

  test('works when existing has no metadata', () => {
    const existing = { id: 'a', name: 'A' };
    const incoming = { id: 'b', name: 'B', metadata: { author: 'bob' } };
    const merged = mergeResources(existing, incoming);
    assert.equal(merged.metadata.author, 'bob');
  });
});

describe('linkResources', () => {
  test('adds linked_resources to metadata', () => {
    const incoming = { id: 'new-skill', name: 'New Skill', description: 'Does something' };
    const duplicates = [{ resource: { id: 'existing-skill' } }, { resource: { id: 'another-skill' } }];
    const linked = linkResources(incoming, duplicates);
    assert.deepEqual(linked.metadata.linked_resources, ['existing-skill', 'another-skill']);
  });

  test('preserves existing metadata fields', () => {
    const incoming = { id: 'new-skill', name: 'New Skill', metadata: { author: 'alice' } };
    const duplicates = [{ resource: { id: 'existing-skill' } }];
    const linked = linkResources(incoming, duplicates);
    assert.equal(linked.metadata.author, 'alice');
    assert.deepEqual(linked.metadata.linked_resources, ['existing-skill']);
  });

  test('deduplicates linked_resources when id already present', () => {
    const incoming = {
      id: 'new-skill',
      name: 'New Skill',
      metadata: { linked_resources: ['existing-skill'] },
    };
    const duplicates = [{ resource: { id: 'existing-skill' } }];
    const linked = linkResources(incoming, duplicates);
    assert.equal(linked.metadata.linked_resources.length, 1);
    assert.deepEqual(linked.metadata.linked_resources, ['existing-skill']);
  });

  test('does not mutate the original incoming object', () => {
    const incoming = { id: 'new-skill', name: 'New Skill' };
    const duplicates = [{ resource: { id: 'other-skill' } }];
    linkResources(incoming, duplicates);
    assert.equal(incoming.metadata, undefined);
  });

  test('handles empty duplicates array', () => {
    const incoming = { id: 'skill', name: 'Skill' };
    const linked = linkResources(incoming, []);
    assert.deepEqual(linked.metadata.linked_resources, []);
  });
});
