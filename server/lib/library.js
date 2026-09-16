const fs = require('fs/promises');
const path = require('path');
const { readTrackTags } = require('./tags');

const AUDIO_EXT = /\.mp3$/i;
const VIDEO_EXT = /\.(mp4|webm)$/i;
// .m4a (audio-only mp4 container) is intentionally excluded from scope for now —
// it would need its own metadata-handling branch, not a casual extension add.
const MEDIA_EXT = /\.(mp3|mp4|webm)$/i;
const RESCAN_INTERVAL_MS = 5 * 60 * 1000;

function trackSortCompare(a, b) {
  if (a.trackNo != null && b.trackNo != null && a.trackNo !== b.trackNo) {
    return a.trackNo - b.trackNo;
  }
  if (a.trackNo != null && b.trackNo == null) return -1;
  if (a.trackNo == null && b.trackNo != null) return 1;
  return a.name.localeCompare(b.name);
}

class Library {
  // rootDirs: array of absolute directory paths, scanned and merged into one
  // unified tree as if they were a single root directory — the UI never
  // knows or shows which configured root a folder/track came from.
  constructor(rootDirs) {
    this.rootDirs = rootDirs;
    this.tree = null;
    this.pathIndex = new Map(); // logical relative path -> absolute file path
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
    this.scanning = this._scanAll()
      .then(({ tree, pathIndex }) => {
        this.tree = tree;
        this.pathIndex = pathIndex;
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

  // Resolves a logical (root-agnostic) path from the merged tree back to the
  // absolute file it came from. Only ever returns paths the scanner itself
  // discovered, so callers don't need separate traversal-safety checks.
  resolveAbsolutePath(relPath) {
    return this.pathIndex.get(relPath) || null;
  }

  async _scanAll() {
    const pathIndex = new Map();
    const rootTrees = [];
    for (const rootDir of this.rootDirs) {
      rootTrees.push(await this._scanDir(rootDir, '', '(root)', pathIndex));
    }
    const tree = this._mergeFolderNodes(rootTrees, '(root)', '');
    return { tree, pathIndex };
  }

  async _scanDir(absDir, relDir, name, pathIndex) {
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
        const sub = await this._scanDir(entryAbs, entryRel, entry.name, pathIndex);
        if (sub.folders.length || sub.tracks.length) {
          folders.push(sub);
        }
      } else if (entry.isFile() && MEDIA_EXT.test(entry.name)) {
        const kind = AUDIO_EXT.test(entry.name) ? 'audio' : 'video';
        const tags = await readTrackTags(entryAbs, entry.name, kind);
        if (pathIndex.has(entryRel)) {
          console.warn(
            `Skipping duplicate library path "${entryRel}" — already provided by an earlier music directory.`
          );
          continue;
        }
        pathIndex.set(entryRel, entryAbs);
        tracks.push({
          type: 'track',
          name: entry.name,
          path: entryRel,
          ...tags,
          kind,
        });
      }
    }

    return {
      type: 'folder',
      name,
      path: relDir,
      folders,
      tracks,
    };
  }

  // Merges same-named folder nodes coming from different root directories
  // into one, recursively, so the whole tree reads as a single library.
  // When two roots contain a track at the exact same logical path, the
  // first root (in configured order) wins — _scanDir already enforces this
  // via pathIndex, so this just mirrors that choice at the tree level.
  _mergeFolderNodes(nodes, name, relPath) {
    const folderGroups = new Map(); // name -> sub-nodes[]
    const tracksByPath = new Map();

    for (const node of nodes) {
      for (const track of node.tracks) {
        if (!tracksByPath.has(track.path)) {
          tracksByPath.set(track.path, track);
        }
      }
      for (const sub of node.folders) {
        if (!folderGroups.has(sub.name)) {
          folderGroups.set(sub.name, []);
        }
        folderGroups.get(sub.name).push(sub);
      }
    }

    const folders = [...folderGroups.entries()].map(([subName, subNodes]) =>
      this._mergeFolderNodes(subNodes, subName, subNodes[0].path)
    );
    folders.sort((a, b) => a.name.localeCompare(b.name));

    const tracks = [...tracksByPath.values()];
    tracks.sort(trackSortCompare);

    return {
      type: 'folder',
      name,
      path: relPath,
      folders,
      tracks,
    };
  }
}

module.exports = { Library };
