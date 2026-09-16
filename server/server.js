const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const { Library } = require('./lib/library');
const { createApiRouter } = require('./routes/api');

const PORT = process.env.PORT || 3000;
// Comma-separated list of directories to scan; all of them are merged into
// one library, mixed together as if they were a single root directory.
const MUSIC_DIRS = (process.env.MUSIC_DIR || '/music')
  .split(',')
  .map((dir) => dir.trim())
  .filter(Boolean);
const SITE_TITLE = process.env.SITE_TITLE || 'justfplay';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function main() {
  const library = new Library(MUSIC_DIRS);
  await library.init();

  const indexTemplate = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  const indexHtml = indexTemplate.replace(/{{SITE_TITLE}}/g, escapeHtml(SITE_TITLE));

  const app = express();
  app.use('/api', createApiRouter(library));

  // Deliberately not part of /api and not linked from the UI — this is a
  // manual maintenance hook (e.g. `curl -X POST` after adding files to a
  // slow-to-invalidate network mount) rather than a user-facing feature.
  app.post('/rescan', async (req, res) => {
    try {
      await library.rescan();
      res.json({ ok: true, scannedAt: new Date().toISOString() });
    } catch (err) {
      console.error('Manual rescan failed:', err);
      res.status(500).json({ ok: false, error: 'Rescan failed' });
    }
  });

  app.get(['/', '/index.html'], (req, res) => {
    res.type('html').send(indexHtml);
  });
  app.use(express.static(PUBLIC_DIR, { index: false }));

  app.listen(PORT, () => {
    console.log(`justfplay listening on port ${PORT}, serving music from ${MUSIC_DIRS.join(', ')}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
