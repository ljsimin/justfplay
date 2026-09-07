const fs = require('fs/promises');
const path = require('path');
const { readTrackTags } = require('./tags');

const MP3_EXT = /\.mp3$/i;
const RESCAN_INTERVAL_MS = 5 * 60 * 1000;

class Library {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.tree = null;
    this.scanning = null;
  }

  async init() {
    await this.rescan();
    setInterval(() => {
      this.rescan().catch((err) => {
        console.error('Library rescan failed:', err);
      });
    }, RESCAN_INTERVAL_MS).unref();
  }

  async rescan() {
    if (this.scanning) {
      return this.scanning;
    }
    this.scanning = this._scanDir(this.rootDir, '', '(root)')
      .then((tree) => {
        this.tree = tree;
        return tree;
      })
      .finally(() => {
        this.scanning = null;
      });
    return this.scanning;
  }

  getTree() {
    return this.tree;
  }

  async _scanDir(absDir, relDir, name) {
    let entries;
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true });
    } catch (err) {
      entries = [];
    }

    const folders = [];
    const tracks = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const entryAbs = path.join(absDir, entry.name);
      const entryRel = relDir ? `${relDir}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        const sub = await this._scanDir(entryAbs, entryRel, entry.name);
        if (sub.folders.length || sub.tracks.length) {
          folders.push(sub);
        }
      } else if (entry.isFile() && MP3_EXT.test(entry.name)) {
        const tags = await readTrackTags(entryAbs, entry.name);
        tracks.push({
          type: 'track',
          name: entry.name,
          path: entryRel,
          ...tags,
        });
      }
    }

    folders.sort((a, b) => a.name.localeCompare(b.name));
    tracks.sort((a, b) => {
      if (a.trackNo != null && b.trackNo != null && a.trackNo !== b.trackNo) {
        return a.trackNo - b.trackNo;
      }
      if (a.trackNo != null && b.trackNo == null) return -1;
      if (a.trackNo == null && b.trackNo != null) return 1;
      return a.name.localeCompare(b.name);
    });

    return {
      type: 'folder',
      name,
      path: relDir,
      folders,
      tracks,
    };
  }
}

module.exports = { Library };
