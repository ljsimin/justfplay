const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const { Library } = require('./lib/library');
const { createApiRouter } = require('./routes/api');
const { createBasicAuthMiddleware } = require('./lib/auth');

const PORT = process.env.PORT || 3000;
// Optional HTTP Basic Auth — only enabled when both are set. Only meaningful
// protection if the instance is reached over TLS (e.g. behind a reverse
// proxy); Basic Auth sends credentials on every request.
const AUTH_USER = process.env.AUTH_USER || '';
const AUTH_PASS = process.env.AUTH_PASS || '';
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

  const manifestTemplate = await fs.readFile(path.join(PUBLIC_DIR, 'manifest.webmanifest'), 'utf8');
  const escapedTitleForJson = JSON.stringify(SITE_TITLE).slice(1, -1);
  const manifestJson = manifestTemplate.replace(/{{SITE_TITLE}}/g, escapedTitleForJson);

  const app = express();

  if (AUTH_USER && AUTH_PASS) {
    app.use(createBasicAuthMiddleware(AUTH_USER, AUTH_PASS));
  }

  app.use('/api', createApiRouter(library));

  app.get(['/', '/index.html'], (req, res) => {
    res.type('html').send(indexHtml);
  });
  app.get('/manifest.webmanifest', (req, res) => {
    res.type('application/manifest+json').send(manifestJson);
  });
  app.use(express.static(PUBLIC_DIR, { index: false }));

  app.listen(PORT, () => {
    const authNote = AUTH_USER && AUTH_PASS ? ', HTTP Basic Auth enabled' : '';
    console.log(`justfplay listening on port ${PORT}, serving music from ${MUSIC_DIRS.join(', ')}${authNote}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
