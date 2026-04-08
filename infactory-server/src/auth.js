/**
 * auth.js — API-Key Authentifizierung
 *
 * Erwartet: X-API-Key Header oder ?api_key Query-Parameter
 * Vergleicht mit INFACTORY_API_KEY aus config.
 */

'use strict';

const crypto = require('crypto');
const config = require('./config');

function authMiddleware(req, res, next) {
  const provided = req.headers['x-api-key'] || req.query.api_key || '';

  if (!provided) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'X-API-Key Header fehlt'
    });
  }

  // Timing-safe Vergleich
  const expected = config.apiKey;
  if (provided.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Ungültiger API-Key'
    });
  }

  next();
}

module.exports = authMiddleware;
