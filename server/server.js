const express = require('express');
const path = require('path');
const { Library } = require('./lib/library');
const { createApiRouter } = require('./routes/api');

const PORT = process.env.PORT || 3000;
const MUSIC_DIR = process.env.MUSIC_DIR || '/music';

async function main() {
  const library = new Library(MUSIC_DIR);
  await library.init();

  const app = express();
  app.use('/api', createApiRouter(library, MUSIC_DIR));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.listen(PORT, () => {
    console.log(`justfplay listening on port ${PORT}, serving music from ${MUSIC_DIR}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
