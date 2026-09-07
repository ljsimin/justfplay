const express = require('express');
const path = require('path');
const fsSync = require('fs');
const { readCoverArt } = require('../lib/tags');

const ART_CACHE_MAX = 200;

function resolveSafePath(rootDir, relPath) {
  const normalizedRoot = path.resolve(rootDir);
  const target = path.resolve(normalizedRoot, relPath || '');
  if (target !== normalizedRoot && !target.startsWith(normalizedRoot + path.sep)) {
    return null;
  }
  return target;
}

function createApiRouter(library, musicDir) {
  const router = express.Router();
  const artCache = new Map();

  router.get('/tree', (req, res) => {
    const tree = library.getTree();
    if (!tree) {
      return res.status(503).json({ error: 'Library not ready yet' });
    }
    res.json(tree);
  });

  router.get('/stream/*', (req, res) => {
    const relPath = req.params[0];
    const absPath = resolveSafePath(musicDir, relPath);
    if (!absPath || !/\.mp3$/i.test(absPath)) {
      return res.status(400).send('Invalid path');
    }
    fsSync.access(absPath, fsSync.constants.R_OK, (err) => {
      if (err) {
        return res.status(404).send('Not found');
      }
      res.sendFile(absPath, {
        headers: { 'Content-Type': 'audio/mpeg' },
      });
    });
  });

  router.get('/art', async (req, res) => {
    const relPath = req.query.path;
    if (typeof relPath !== 'string') {
      return res.status(400).send('Missing path');
    }
    const absPath = resolveSafePath(musicDir, relPath);
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
      const art = await readCoverArt(absPath);
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
