const fs = require('fs/promises');
const path = require('path');
const { readTrackTags } = require('./tags');
const { getImageSize } = require('./imageSize');

const AUDIO_EXT = /\.mp3$/i;
const VIDEO_EXT = /\.(mp4|webm)$/i;
// .m4a (audio-only mp4 container) is intentionally excluded from scope for now —
// it would need its own metadata-handling branch, not a casual extension add.
const MEDIA_EXT = /\.(mp3|mp4|webm)$/i;
const IMAGE_EXT = /\.(jpe?g|png)$/i;
const RESCAN_INTERVAL_MS = 5 * 60 * 1000;
// How many entries in one directory to process at once. Bounded so a huge
// library doesn't fire off thousands of simultaneous reads (rough on a slow
// network mount), while still overlapping I/O wait instead of going fully
// one-file-at-a-time.
const SCAN_CONCURRENCY = 8;

// Runs `worker` over `items` with at most `limit` calls in flight at once,
// preserving each result at its original index.
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function runNext() {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, runNext);
  await Promise.all(workers);
  return results;
}

function trackSortCompare(a, b) {
  if (a.trackNo != null && b.trackNo != null && a.trackNo !== b.trackNo) {
    return a.trackNo - b.trackNo;
  }
  if (a.trackNo != null && b.trackNo == null) return -1;
  if (a.trackNo == null && b.trackNo != null) return 1;
  return a.name.localeCompare(b.name);
}

// Picks which image in a folder represents its cover, for tracks whose own
// tags have no embedded art. A single image is an easy call; with several,
// prefer one clearly named as a cover, then one matching the folder's own
// name, then a square image — falling back to the alphabetically-first
// image if nothing stands out.
async function pickFolderCover(absDir, imageNames, folderName) {
  if (imageNames.length === 0) return null;
  if (imageNames.length === 1) return imageNames[0];

  const normalizedFolder = folderName.trim().toLowerCase();
  const sorted = [...imageNames].sort((a, b) => a.localeCompare(b));

  let best = sorted[0];
  let bestScore = 0;
  for (const name of sorted) {
    const stem = name.replace(IMAGE_EXT, '').trim().toLowerCase();
    let score = 0;
    if (stem === 'cover' || stem === 'folder') {
      score = 3;
    } else if (stem.includes('cover') || stem.includes('folder') || stem === normalizedFolder) {
      score = 2;
    } else {
      try {
        const buf = await fs.readFile(path.join(absDir, name));
        const dims = getImageSize(buf);
        if (dims && dims.width === dims.height) score = 1;
      } catch (err) {
        score = 0;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }
  return best;
}

class Library {
  // rootDirs: array of absolute directory paths, scanned and merged into one
  // unified tree as if they were a single root directory — the UI never
  // knows or shows which configured root a folder/track came from.
  constructor(rootDirs) {
    this.rootDirs = rootDirs;
    this.tree = null;
    this.pathIndex = new Map(); // logical relative path -> absolute file path
    this.folderCoverIndex = new Map(); // logical folder path -> absolute cover image path
    this.tagCache = new Map(); // logical relative path -> { mtimeMs, tags }
    this.scanning = null;
    this.filesScanned = 0; // live counter for the scan currently in progress
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
    this.filesScanned = 0;
    this.scanning = this._scanAll()
      .then(({ tree, pathIndex, folderCoverIndex, tagCache }) => {
        this.tree = tree;
        this.pathIndex = pathIndex;
        this.folderCoverIndex = folderCoverIndex;
        this.tagCache = tagCache;
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

  // Given a track's logical path, resolves the absolute path of its
  // containing folder's cover image (if one was found), for tracks whose
  // own tags have no embedded art.
  resolveFolderCover(trackRelPath) {
    const idx = trackRelPath.lastIndexOf('/');
    const folderRelPath = idx === -1 ? '' : trackRelPath.slice(0, idx);
    return this.folderCoverIndex.get(folderRelPath) || null;
  }

  async _scanAll() {
    const pathIndex = new Map();
    const folderCoverIndex = new Map();
    const tagCache = new Map();
    const rootTrees = [];
    for (const rootDir of this.rootDirs) {
      // Each root starts with its own empty ancestor set — a fresh Set is
      // passed (not shared/mutated) at every level, so concurrent sibling
      // directories can never falsely look like an ancestor of one another.
      rootTrees.push(await this._scanDir(rootDir, '', '(root)', pathIndex, folderCoverIndex, new Set(), tagCache));
    }
    const tree = this._mergeFolderNodes(rootTrees, '(root)', '');
    return { tree, pathIndex, folderCoverIndex, tagCache };
  }

  async _scanDir(absDir, relDir, name, pathIndex, folderCoverIndex, ancestorRealPaths, tagCache) {
    let realAbsDir;
    try {
      realAbsDir = await fs.realpath(absDir);
    } catch (err) {
      realAbsDir = absDir;
    }
    // A symlink cycle (or a symlink pointing back at an ancestor directory)
    // would otherwise recurse forever.
    if (ancestorRealPaths.has(realAbsDir)) {
      return { type: 'folder', name, path: relDir, folders: [], tracks: [] };
    }
    const childAncestors = new Set(ancestorRealPaths);
    childAncestors.add(realAbsDir);

    let entries;
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true });
    } catch (err) {
      entries = [];
    }
    entries = entries.filter((entry) => !entry.name.startsWith('.'));

    const results = await mapWithConcurrency(entries, SCAN_CONCURRENCY, async (entry) => {
      const entryAbs = path.join(absDir, entry.name);
      const entryRel = relDir ? `${relDir}/${entry.name}` : entry.name;

      let isDir = entry.isDirectory();
      let isFile = entry.isFile();
      let entryStat = null;
      if (entry.isSymbolicLink()) {
        try {
          entryStat = await fs.stat(entryAbs); // follows the symlink, unlike lstat
          isDir = entryStat.isDirectory();
          isFile = entryStat.isFile();
        } catch (err) {
          return null; // broken symlink or inaccessible target
        }
      }

      if (isDir) {
        const sub = await this._scanDir(entryAbs, entryRel, entry.name, pathIndex, folderCoverIndex, childAncestors, tagCache);
        return sub.folders.length || sub.tracks.length ? { kind: 'folder', node: sub } : null;
      }
      if (isFile && MEDIA_EXT.test(entry.name)) {
        if (pathIndex.has(entryRel)) {
          console.warn(
            `Skipping duplicate library path "${entryRel}" — already provided by an earlier music directory.`
          );
          return null;
        }
        if (!entryStat) {
          try {
            entryStat = await fs.stat(entryAbs);
          } catch (err) {
            return null; // vanished between readdir and stat
          }
        }
        const kind = AUDIO_EXT.test(entry.name) ? 'audio' : 'video';
        const cached = this.tagCache.get(entryRel);
        const tags =
          cached && cached.mtimeMs === entryStat.mtimeMs ? cached.tags : await readTrackTags(entryAbs, entry.name, kind);
        tagCache.set(entryRel, { mtimeMs: entryStat.mtimeMs, tags });
        pathIndex.set(entryRel, entryAbs);
        this.filesScanned += 1;
        return {
          kind: 'track',
          node: { type: 'track', name: entry.name, path: entryRel, ...tags, kind },
        };
      }
      if (isFile && IMAGE_EXT.test(entry.name)) {
        return { kind: 'image', name: entry.name };
      }
      return null;
    });

    const folders = [];
    const tracks = [];
    const imageNames = [];
    for (const result of results) {
      if (!result) continue;
      if (result.kind === 'folder') folders.push(result.node);
      else if (result.kind === 'track') tracks.push(result.node);
      else if (result.kind === 'image') imageNames.push(result.name);
    }

    const coverName = await pickFolderCover(absDir, imageNames, name);
    if (coverName && !folderCoverIndex.has(relDir)) {
      folderCoverIndex.set(relDir, path.join(absDir, coverName));
    }
    if (folderCoverIndex.has(relDir)) {
      for (const track of tracks) {
        if (track.kind === 'audio' && !track.hasArt) {
          track.hasArt = true;
        }
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
