const jwt = require('jsonwebtoken');

/**
 * Express middleware that validates a Bearer JWT from the Authorization header.
 * On success it attaches `req.user = { id, username }` and calls next().
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = payload; // { id, username, iat, exp }
    next();
  });
}

module.exports = { authenticateToken };
