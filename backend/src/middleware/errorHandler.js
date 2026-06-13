'use strict';

/**
 * Global error-handling middleware.
 * Catches errors thrown or passed via next(err) in route handlers.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Log only sanitized fields to avoid leaking credentials present in Octokit error objects
  console.error('[ErrorHandler]', { name: err.name, message: err.message, status: err.status || err.statusCode });

  // GitHub API errors surfaced by Octokit
  if (err.status && err.response) {
    return res.status(err.status).json({
      error: 'GitHub API Error',
      message: err.message,
      status: err.status,
    });
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({ error: status === 500 ? 'Internal Server Error' : message, message });
}

module.exports = errorHandler;
