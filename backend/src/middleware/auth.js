'use strict';

/**
 * Auth middleware – expects a GitHub PAT in the Authorization header.
 * Format: "******"
 * The token is attached to req.githubToken for downstream use.
 */
function auth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'A GitHub Personal Access Token must be provided as a ******',
    });
  }
  req.githubToken = authHeader.slice('Bearer '.length).trim();
  if (!req.githubToken) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: '****** is empty.',
    });
  }
  next();
}

module.exports = auth;
