'use strict';

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const path = require('path');
const fs = require('fs');

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const SCHEMA_DIR = path.resolve(__dirname, '../../../schemas/v1');

const SCHEMA_MAP = {
  agents: 'agent.schema.json',
  skills: 'skill.schema.json',
  prompts: 'prompt.schema.json',
  'mcp-configs': 'mcp-config.schema.json',
};

const validators = {};

for (const [resourceType, filename] of Object.entries(SCHEMA_MAP)) {
  const schemaPath = path.join(SCHEMA_DIR, filename);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  validators[resourceType] = ajv.compile(schema);
}

/**
 * Validate a resource object against its schema.
 * @param {string} resourceType
 * @param {object} data
 * @returns {{ valid: boolean, errors: Array|null }}
 */
function validate(resourceType, data) {
  const validator = validators[resourceType];
  if (!validator) {
    return { valid: false, errors: [{ message: `Unknown resource type: ${resourceType}` }] };
  }
  const valid = validator(data);
  return { valid, errors: valid ? null : validator.errors };
}

module.exports = { validate };
