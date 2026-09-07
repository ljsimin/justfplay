(function () {
  const STORAGE_KEY = 'justfplay.state';
  const PLACEHOLDER_ART =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44">' +
        '<rect width="44" height="44" rx="6" fill="#2b2f36"/>' +
        '<text x="50%" y="58%" font-size="20" text-anchor="middle" fill="#9aa0a8">&#9834;</text>' +
        '</svg>'
    );

  const els = {
    search: document.getElementById('search'),
    breadcrumbs: document.getElementById('breadcrumbs'),
    listing: document.getElementById('listing'),
    audio: document.getElementById('audio'),
    playerArt: document.getElementById('player-art'),
    playerTitle: document.getElementById('player-title'),
    playerSubtitle: document.getElementById('player-subtitle'),
    btnPlay: document.getElementById('btn-play'),
    btnPrev: document.getElementById('btn-prev'),
    btnNext: document.getElementById('btn-next'),
    seek: document.getElementById('seek'),
    timeCurrent: document.getElementById('time-current'),
    timeDuration: document.getElementById('time-duration'),
    volume: document.getElementById('volume'),
  };

  let tree = null;
  let flatTracks = []; // { ...track, folderPath }
  let currentFolderPath = '';
  let currentContext = []; // array of track objects currently playable in sequence
  let currentIndex = -1;
  let isSeeking = false;
  let pendingRestore = null;

  function encodeStreamPath(relPath) {
    return relPath
      .split('/')
      .map(encodeURIComponent)
      .join('/');
  }

  function artUrl(track) {
    if (!track.hasArt) return PLACEHOLDER_ART;
    return '/api/art?path=' + encodeURIComponent(track.path);
  }

  function streamUrl(track) {
    return '/api/stream/' + encodeStreamPath(track.path);
  }

  function formatTime(seconds) {
    if (seconds == null || Number.isNaN(seconds) || !Number.isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function findFolder(node, relPath) {
    if (!relPath) return node;
    const parts = relPath.split('/');
    let current = node;
    for (const part of parts) {
      const next = current.folders.find((f) => f.name === part);
      if (!next) return null;
      current = next;
    }
    return current;
  }

  function collectAllTracks(node, acc) {
    for (const track of node.tracks) {
      acc.push(Object.assign({ folderPath: node.path }, track));
    }
    for (const folder of node.folders) {
      collectAllTracks(folder, acc);
    }
    return acc;
  }

  function saveState() {
    if (currentIndex < 0) return;
    const track = currentContext[currentIndex];
    if (!track) return;
    const state = {
      path: track.path,
      folderPath: currentFolderPath,
      position: els.audio.currentTime || 0,
      volume: els.audio.volume,
      searchQuery: els.search.value || '',
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      /* ignore quota errors */
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  // ---- Rendering ----

  function render() {
    if (els.search.value.trim()) {
      renderSearchResults(els.search.value.trim());
    } else {
      renderFolder(currentFolderPath);
    }
  }

  function renderBreadcrumbs(relPath) {
    els.breadcrumbs.innerHTML = '';
    const rootLink = document.createElement('a');
    rootLink.textContent = 'Library';
    rootLink.addEventListener('click', () => navigateTo(''));
    els.breadcrumbs.appendChild(rootLink);

    if (!relPath) return;

    const parts = relPath.split('/');
    let acc = '';
    for (const part of parts) {
      acc = acc ? acc + '/' + part : part;
      const sep = document.createElement('span');
      sep.className = 'sep';
      sep.textContent = ' / ';
      els.breadcrumbs.appendChild(sep);

      const link = document.createElement('a');
      link.textContent = part;
      const target = acc;
      link.addEventListener('click', () => navigateTo(target));
      els.breadcrumbs.appendChild(link);
    }
  }

  function navigateTo(relPath) {
    currentFolderPath = relPath;
    els.search.value = '';
    render();
  }

  function renderFolder(relPath) {
    const folder = findFolder(tree, relPath);
    renderBreadcrumbs(relPath);
    els.listing.innerHTML = '';

    if (!folder) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Folder not found.';
      els.listing.appendChild(empty);
      return;
    }

    if (!folder.folders.length && !folder.tracks.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No music here yet.';
      els.listing.appendChild(empty);
      return;
    }

    for (const sub of folder.folders) {
      els.listing.appendChild(buildFolderRow(sub));
    }

    const context = folder.tracks.map((t) => Object.assign({ folderPath: folder.path }, t));
    for (const track of context) {
      els.listing.appendChild(buildTrackRow(track, context));
    }
  }

  function renderSearchResults(query) {
    els.breadcrumbs.innerHTML = '';
    const label = document.createElement('span');
    label.textContent = 'Search results for "' + query + '"';
    els.breadcrumbs.appendChild(label);

    els.listing.innerHTML = '';
    const q = query.toLowerCase();
    const matches = flatTracks.filter((t) => {
      return (
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.artist && t.artist.toLowerCase().includes(q)) ||
        (t.album && t.album.toLowerCase().includes(q)) ||
        (t.name && t.name.toLowerCase().includes(q))
      );
    });

    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No matches.';
      els.listing.appendChild(empty);
      return;
    }

    for (const track of matches) {
      els.listing.appendChild(buildTrackRow(track, matches, true));
    }
  }

  function buildFolderRow(folder) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML =
      '<div class="row-icon">📁</div>' +
      '<div class="row-meta">' +
      '<div class="row-title"></div>' +
      '<div class="row-subtitle">' +
      (folder.folders.length + folder.tracks.length) +
      ' item(s)</div>' +
      '</div>';
    row.querySelector('.row-title').textContent = folder.name;
    row.addEventListener('click', () => navigateTo(folder.path));
    return row;
  }

  function buildTrackRow(track, context, showFolder) {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.path = track.path;

    const artHtml = track.hasArt
      ? '<img class="row-art" src="' + artUrl(track) + '" alt="" />'
      : '<div class="row-icon">🎵</div>';

    const subtitleParts = [];
    if (track.artist) subtitleParts.push(track.artist);
    if (track.album) subtitleParts.push(track.album);
    if (showFolder && track.folderPath) subtitleParts.push(track.folderPath);

    row.innerHTML =
      artHtml +
      '<div class="row-meta">' +
      '<div class="row-title"></div>' +
      '<div class="row-subtitle"></div>' +
      '</div>' +
      '<div class="row-duration">' +
      formatTime(track.duration) +
      '</div>';

    row.querySelector('.row-title').textContent = track.title;
    row.querySelector('.row-subtitle').textContent = subtitleParts.join(' — ');

    row.addEventListener('click', () => playTrack(track, context));
    if (pendingRestore && pendingRestore.path === track.path) {
      row.classList.add('playing');
    }
    return row;
  }

  function highlightPlayingRow() {
    const rows = els.listing.querySelectorAll('.row[data-path]');
    const track = currentContext[currentIndex];
    rows.forEach((row) => {
      row.classList.toggle('playing', Boolean(track) && row.dataset.path === track.path);
    });
  }

  // ---- Playback ----

  function playTrack(track, context) {
    pendingRestore = null;
    currentContext = context;
    currentIndex = context.findIndex((t) => t.path === track.path);
    loadTrack(track, 0, true);
  }

  function loadTrack(track, startPosition, autoplay) {
    els.audio.src = streamUrl(track);
    els.playerTitle.textContent = track.title;
    const subtitleParts = [];
    if (track.artist) subtitleParts.push(track.artist);
    if (track.album) subtitleParts.push(track.album);
    els.playerSubtitle.textContent = subtitleParts.join(' — ');
    els.playerArt.src = artUrl(track);

    const applyPosition = () => {
      if (startPosition) {
        els.audio.currentTime = startPosition;
      }
      els.audio.removeEventListener('loadedmetadata', applyPosition);
    };
    els.audio.addEventListener('loadedmetadata', applyPosition);

    els.audio.load();
    highlightPlayingRow();

    if (autoplay) {
      els.audio.play().catch(() => {
        /* playback blocked until user interacts; ignore */
      });
    }
  }

  function next() {
    if (currentIndex < 0 || currentIndex + 1 >= currentContext.length) return;
    currentIndex += 1;
    loadTrack(currentContext[currentIndex], 0, true);
  }

  function prev() {
    if (currentIndex <= 0) {
      els.audio.currentTime = 0;
      return;
    }
    currentIndex -= 1;
    loadTrack(currentContext[currentIndex], 0, true);
  }

  function togglePlay() {
    if (els.audio.paused) {
      els.audio.play().catch(() => {});
    } else {
      els.audio.pause();
    }
  }

  // ---- Restore state ----

  function restoreState(state) {
    if (!state || !state.path) return;
    const folder = findFolder(tree, state.folderPath || '');
    let context;
    if (folder) {
      context = folder.tracks.map((t) => Object.assign({ folderPath: folder.path }, t));
    } else {
      context = flatTracks;
    }
    let track = context.find((t) => t.path === state.path);
    if (!track) {
      track = flatTracks.find((t) => t.path === state.path);
      context = flatTracks;
    }
    if (!track) return;

    pendingRestore = track;
    currentContext = context;
    currentIndex = context.findIndex((t) => t.path === track.path);
    if (typeof state.volume === 'number') {
      els.audio.volume = state.volume;
      els.volume.value = String(state.volume);
    }
    loadTrack(track, state.position || 0, false);
    if (folder) {
      currentFolderPath = folder.path;
    }
  }

  // ---- Event wiring ----

  function wireEvents() {
    els.search.addEventListener('input', () => render());

    els.btnPlay.addEventListener('click', togglePlay);
    els.btnNext.addEventListener('click', next);
    els.btnPrev.addEventListener('click', prev);

    els.audio.addEventListener('play', () => {
      els.btnPlay.textContent = '⏸';
    });
    els.audio.addEventListener('pause', () => {
      els.btnPlay.textContent = '▶';
      saveState();
    });
    els.audio.addEventListener('ended', () => {
      saveState();
      next();
    });

    els.audio.addEventListener('loadedmetadata', () => {
      els.seek.max = String(els.audio.duration || 0);
      els.timeDuration.textContent = formatTime(els.audio.duration);
    });

    els.audio.addEventListener('timeupdate', () => {
      if (!isSeeking) {
        els.seek.value = String(els.audio.currentTime);
      }
      els.timeCurrent.textContent = formatTime(els.audio.currentTime);
    });

    let saveTimer = null;
    els.audio.addEventListener('timeupdate', () => {
      if (saveTimer) return;
      saveTimer = setTimeout(() => {
        saveTimer = null;
        saveState();
      }, 3000);
    });

    els.seek.addEventListener('input', () => {
      isSeeking = true;
      els.timeCurrent.textContent = formatTime(Number(els.seek.value));
    });
    els.seek.addEventListener('change', () => {
      els.audio.currentTime = Number(els.seek.value);
      isSeeking = false;
    });

    els.volume.addEventListener('input', () => {
      els.audio.volume = Number(els.volume.value);
    });

    els.playerArt.addEventListener('error', () => {
      els.playerArt.src = PLACEHOLDER_ART;
    });

    window.addEventListener('beforeunload', saveState);
  }

  // ---- Init ----

  async function init() {
    wireEvents();
    const res = await fetch('/api/tree');
    tree = await res.json();
    flatTracks = collectAllTracks(tree, []);

    const state = loadState();
    render();
    if (state) {
      restoreState(state);
      render();
    }
  }

  init().catch((err) => {
    console.error('Failed to initialize justfplay:', err);
    els.listing.innerHTML = '<div class="empty-state">Failed to load library.</div>';
  });
})();
