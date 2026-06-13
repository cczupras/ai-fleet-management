'use strict';

/**
 * Auth middleware - expects a GitHub Personal Access Token (PAT) in the
 * Authorization header using the standard HTTP bearer token scheme.
 * The token is forwarded to the GitHub API and never stored server-side.
 */
function auth(req, res, next) {
  const schemePrefix = 'Bearer ';
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith(schemePrefix)) {
    return res.status(401).json({
      error: 'Unauthorized',
      message:
        'Missing or invalid Authorization header. Provide a GitHub PAT via: Authorization: ******',
    });
  }
  req.githubToken = authHeader.slice(schemePrefix.length).trim();
  if (!req.githubToken) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'The token in the Authorization header is empty.',
    });
  }
  next();
}

module.exports = auth;
