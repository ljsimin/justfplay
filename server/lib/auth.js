const crypto = require('crypto');

function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function createBasicAuthMiddleware(username, password) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');

    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const sepIndex = decoded.indexOf(':');
      if (sepIndex !== -1) {
        const user = decoded.slice(0, sepIndex);
        const pass = decoded.slice(sepIndex + 1);
        if (timingSafeStringEqual(user, username) && timingSafeStringEqual(pass, password)) {
          return next();
        }
      }
    }

    res.set('WWW-Authenticate', 'Basic realm="justfplay"');
    res.status(401).send('Authentication required');
  };
}

module.exports = { createBasicAuthMiddleware };
