// Minimal PNG/JPEG dimension reader — reads only the header, no dependency
// on an image-decoding library, just enough to compare width vs height.

function getPngSize(buf) {
  if (buf.length < 24) return null;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (!isPng) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function getJpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    offset += 2;

    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      continue; // markers with no payload
    }
    if (marker === 0xda) break; // start of scan — no more headers to read

    if (offset + 2 > buf.length) break;
    const segLength = buf.readUInt16BE(offset);
    const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isSOF) {
      if (offset + 7 > buf.length) break;
      return { height: buf.readUInt16BE(offset + 3), width: buf.readUInt16BE(offset + 5) };
    }
    offset += segLength;
  }
  return null;
}

function getImageSize(buf) {
  return getPngSize(buf) || getJpegSize(buf) || null;
}

module.exports = { getImageSize };
