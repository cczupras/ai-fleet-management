'use strict';

require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  github: {
    owner: process.env.GITHUB_OWNER || 'cczupras',
    repo: process.env.GITHUB_REPO || 'ai-fleet-management',
    branch: process.env.GITHUB_BRANCH || 'main',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },
};

module.exports = config;
