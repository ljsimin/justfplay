const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const { Library } = require('./lib/library');
const { createApiRouter } = require('./routes/api');

const PORT = process.env.PORT || 3000;
const MUSIC_DIR = process.env.MUSIC_DIR || '/music';
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
  const library = new Library(MUSIC_DIR);
  await library.init();

  const indexTemplate = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  const indexHtml = indexTemplate.replace(/{{SITE_TITLE}}/g, escapeHtml(SITE_TITLE));

  const app = express();
  app.use('/api', createApiRouter(library, MUSIC_DIR));
  app.get(['/', '/index.html'], (req, res) => {
    res.type('html').send(indexHtml);
  });
  app.use(express.static(PUBLIC_DIR, { index: false }));

  app.listen(PORT, () => {
    console.log(`justfplay listening on port ${PORT}, serving music from ${MUSIC_DIR}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
