const express = require('express');
const db      = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * Haversine formula — returns distance in kilometres between two (lat, lng) pairs.
 * Classic interview question in disguise 🌍
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R    = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── GET /api/nearby?lat=&lng=&radius= ──────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { lat, lng, radius = '25' } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng query params are required' });
    }

    const userLat      = parseFloat(lat);
    const userLng      = parseFloat(lng);
    const searchRadius = parseFloat(radius);

    if (isNaN(userLat) || isNaN(userLng) || isNaN(searchRadius)) {
      return res.status(400).json({ error: 'lat, lng, and radius must be numbers' });
    }

    const { rows } = await db.query(
      `SELECT
         u.id,
         u.username,
         u.bio,
         u.latitude,
         u.longitude,
         COUNT(b.id) AS book_count
       FROM users u
       LEFT JOIN books b ON b.user_id = u.id
       WHERE u.is_public = 1
         AND u.latitude  IS NOT NULL
         AND u.longitude IS NOT NULL
         AND u.id != $1
       GROUP BY u.id`,
      [req.user.id]
    );

    const nearby = rows
      .map((u) => ({
        ...u,
        distance_km: parseFloat(
          haversineKm(userLat, userLng, parseFloat(u.latitude), parseFloat(u.longitude)).toFixed(2)
        ),
      }))
      .filter((u) => u.distance_km <= searchRadius)
      .sort((a, b) => a.distance_km - b.distance_km);

    res.json(nearby);
  } catch (err) {
    console.error('GET /nearby:', err);
    res.status(500).json({ error: 'Failed to fetch nearby users' });
  }
});

module.exports = router;
