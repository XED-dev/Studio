/**
 * routes/health.js — Health Check
 *
 * GET /api/health — Server + Ghost Status
 */

'use strict';

const express = require('express');
const config  = require('../config');
const { GhostClient } = require('../ghost-client');

const router = express.Router();

router.get('/', async (req, res) => {
  const status = {
    server: {
      version: '1.0.0',
      uptime:  Math.floor(process.uptime()),
      node:    process.version,
    },
    sites: {},
    cli: {
      path:   config.cliPath,
      exists: require('fs').existsSync(config.cliPath),
    },
    imageArchive: {
      path:   config.imageArchivePath || '(nicht konfiguriert)',
      exists: config.imageArchivePath ? require('fs').existsSync(config.imageArchivePath) : false,
    },
  };

  // Ghost Sites pingen
  for (const [name, site] of Object.entries(config.sites)) {
    const client = new GhostClient(site);
    try {
      const online = await client.ping();
      const info   = online ? await client.site() : null;
      status.sites[name] = {
        url:     site.url,
        online,
        title:   info?.title || null,
        version: info?.version || null,
        contentPath: site.contentPath || '(nicht konfiguriert)',
      };
    } catch (err) {
      status.sites[name] = {
        url:    site.url,
        online: false,
        error:  err.message,
      };
    }
  }

  res.json(status);
});

module.exports = router;
