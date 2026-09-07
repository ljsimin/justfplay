const mm = require('music-metadata');

function pickTrackNumber(common) {
  if (common.track && typeof common.track.no === 'number') {
    return common.track.no;
  }
  return null;
}

async function readTrackTags(absPath, filename) {
  const fallbackTitle = filename.replace(/\.mp3$/i, '');
  try {
    const metadata = await mm.parseFile(absPath, { skipCovers: false, duration: true });
    const common = metadata.common || {};
    return {
      title: common.title || fallbackTitle,
      artist: common.artist || null,
      album: common.album || null,
      trackNo: pickTrackNumber(common),
      duration: metadata.format && typeof metadata.format.duration === 'number'
        ? metadata.format.duration
        : null,
      hasArt: Boolean(common.picture && common.picture.length),
    };
  } catch (err) {
    return {
      title: fallbackTitle,
      artist: null,
      album: null,
      trackNo: null,
      duration: null,
      hasArt: false,
    };
  }
}

async function readCoverArt(absPath) {
  const metadata = await mm.parseFile(absPath, { skipCovers: false, duration: false });
  const common = metadata.common || {};
  if (!common.picture || !common.picture.length) {
    return null;
  }
  const picture = common.picture[0];
  return {
    format: picture.format || 'image/jpeg',
    data: Buffer.isBuffer(picture.data) ? picture.data : Buffer.from(picture.data),
  };
}

module.exports = { readTrackTags, readCoverArt };
