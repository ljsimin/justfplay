const express = require('express');
const path = require('path');
const fsSync = require('fs');
const fs = require('fs/promises');
const { readCoverArt } = require('../lib/tags');

const ART_CACHE_MAX = 200;
const STREAM_CONTENT_TYPES = { '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const IMAGE_CONTENT_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

async function readFolderCoverFallback(library, relPath) {
  const coverAbsPath = library.resolveFolderCover(relPath);
  if (!coverAbsPath) return null;
  const format = IMAGE_CONTENT_TYPES[path.extname(coverAbsPath).toLowerCase()];
  if (!format) return null;
  const data = await fs.readFile(coverAbsPath);
  return { format, data };
}

function createApiRouter(library) {
  const router = express.Router();
  const artCache = new Map();

  router.get('/tree', (req, res) => {
    const tree = library.getTree();
    if (!tree) {
      return res.status(503).json({ error: 'Library not ready yet' });
    }
    res.json(tree);
  });

  router.post('/rescan', async (req, res) => {
    try {
      await library.rescan();
      res.json({ ok: true, scannedAt: new Date().toISOString() });
    } catch (err) {
      console.error('Manual rescan failed:', err);
      res.status(500).json({ ok: false, error: 'Rescan failed' });
    }
  });

  router.get('/stream/*', (req, res) => {
    const relPath = req.params[0];
    const absPath = library.resolveAbsolutePath(relPath);
    const contentType = absPath ? STREAM_CONTENT_TYPES[path.extname(absPath).toLowerCase()] : null;
    if (!absPath || !contentType) {
      return res.status(400).send('Invalid path');
    }
    fsSync.access(absPath, fsSync.constants.R_OK, (err) => {
      if (err) {
        return res.status(404).send('Not found');
      }
      res.sendFile(absPath, {
        headers: { 'Content-Type': contentType },
      });
    });
  });

  router.get('/art', async (req, res) => {
    const relPath = req.query.path;
    if (typeof relPath !== 'string') {
      return res.status(400).send('Missing path');
    }
    const absPath = library.resolveAbsolutePath(relPath);
    if (!absPath || !/\.mp3$/i.test(absPath)) {
      return res.status(400).send('Invalid path');
    }

    if (artCache.has(absPath)) {
      const cached = artCache.get(absPath);
      if (!cached) {
        return res.status(404).end();
      }
      res.set('Content-Type', cached.format);
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(cached.data);
    }

    try {
      let art = await readCoverArt(absPath);
      if (!art) {
        art = await readFolderCoverFallback(library, relPath);
      }
      if (artCache.size >= ART_CACHE_MAX) {
        const firstKey = artCache.keys().next().value;
        artCache.delete(firstKey);
      }
      artCache.set(absPath, art);
      if (!art) {
        return res.status(404).end();
      }
      res.set('Content-Type', art.format);
      res.set('Cache-Control', 'public, max-age=86400');
      res.send(art.data);
    } catch (err) {
      res.status(404).end();
    }
  });

  return router;
}

module.exports = { createApiRouter };
