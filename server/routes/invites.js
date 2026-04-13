const express  = require('express');
const { v4: uuidv4 } = require('uuid');
const db       = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// ── POST /api/invites ───────────────────────────────────────────────────────
// Accepts either to_email or to_username (server resolves the email).
// Optional message field — max one paragraph (500 chars).
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { to_email, to_username, message } = req.body;

    if (!to_email && !to_username) {
      return res.status(400).json({ error: 'to_email or to_username is required' });
    }

    // Resolve target email
    let targetEmail;
    if (to_username) {
      const { rows } = await db.query(
        'SELECT email FROM users WHERE username = $1',
        [to_username]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: `User "${to_username}" not found` });
      }
      targetEmail = rows[0].email;
    } else {
      targetEmail = to_email.toLowerCase();
    }

    // Prevent self-invite
    const { rows: selfRows } = await db.query(
      'SELECT email FROM users WHERE id = $1',
      [req.user.id]
    );
    if (selfRows[0].email === targetEmail) {
      return res.status(400).json({ error: 'You cannot invite yourself' });
    }

    // Avoid duplicate pending invites
    const { rows: existingRows } = await db.query(
      `SELECT id FROM invites
       WHERE from_user_id = $1 AND to_email = $2 AND accepted = 0`,
      [req.user.id, targetEmail]
    );
    if (existingRows.length > 0) {
      return res.status(409).json({ error: 'A pending invite for that user already exists' });
    }

    const trimmedMessage = message ? message.trim().slice(0, 500) : null;
    const token = uuidv4();

    const { rows } = await db.query(
      `INSERT INTO invites (from_user_id, to_email, token, message)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, targetEmail, token, trimmedMessage]
    );

    const inviteLink = `${process.env.APP_URL || 'http://localhost:3000'}/invite/${token}`;

    res.status(201).json({
      message: `Invite created`,
      invite_link: inviteLink,
      invite: rows[0],
    });
  } catch (err) {
    console.error('POST /invites:', err);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

// ── GET /api/invites/shared ─────────────────────────────────────────────────
// Returns all users with whom the current user has a mutual accepted invite
// (either direction: they invited me, or I invited them).
router.get('/shared', authenticateToken, async (req, res) => {
  try {
    const { rows: meRows } = await db.query(
      'SELECT email FROM users WHERE id = $1',
      [req.user.id]
    );
    const myEmail = meRows[0].email;
    const myId    = req.user.id;

    const { rows } = await db.query(
      `SELECT u.id, u.username, u.bio,
              COUNT(b.id) AS book_count,
              SUM(CASE WHEN b.is_currently_reading = 1 THEN 1 ELSE 0 END) AS reading_count,
              CASE WHEN u.phone_public    = 1 THEN u.phone             ELSE NULL END AS phone,
              CASE WHEN u.telegram_public = 1 THEN u.telegram_username ELSE NULL END AS telegram_username
       FROM (
         -- They invited me and I accepted
         SELECT inv.from_user_id AS uid
         FROM invites inv
         WHERE inv.to_email = $1 AND inv.accepted = 1
         UNION
         -- I invited them and they accepted
         SELECT u2.id AS uid
         FROM invites inv
         JOIN users u2 ON u2.email = inv.to_email
         WHERE inv.from_user_id = $2 AND inv.accepted = 1
       ) partners
       JOIN users u ON u.id = partners.uid
       LEFT JOIN books b ON b.user_id = u.id
       GROUP BY u.id, u.username, u.bio, u.phone_public, u.phone, u.telegram_public, u.telegram_username
       ORDER BY u.username`,
      [myEmail, myId]
    );

    res.json(rows);
  } catch (err) {
    console.error('GET /invites/shared:', err);
    res.status(500).json({ error: 'Failed to fetch shared libraries' });
  }
});

// ── GET /api/invites/received ───────────────────────────────────────────────
// Pending invites addressed to the current user (matched by their email).
router.get('/received', authenticateToken, async (req, res) => {
  try {
    const { rows: meRows } = await db.query(
      'SELECT email FROM users WHERE id = $1',
      [req.user.id]
    );
    const myEmail = meRows[0].email;

    const { rows } = await db.query(
      `SELECT invites.id, invites.token, invites.message, invites.created_at,
              users.username AS from_username, users.id AS from_user_id
       FROM invites
       JOIN users ON users.id = invites.from_user_id
       WHERE invites.to_email  = $1
         AND invites.accepted  = 0
         AND invites.declined  = 0
       ORDER BY invites.created_at DESC`,
      [myEmail]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /invites/received:', err);
    res.status(500).json({ error: 'Failed to fetch received invites' });
  }
});

// ── DELETE /api/invites/connection/:username ────────────────────────────────
// Either party can remove an accepted connection.
router.delete('/connection/:username', authenticateToken, async (req, res) => {
  try {
    const { rows: targetRows } = await db.query(
      'SELECT id, email FROM users WHERE username = $1',
      [req.params.username]
    );
    if (targetRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const target = targetRows[0];

    const { rows: meRows } = await db.query(
      'SELECT email FROM users WHERE id = $1',
      [req.user.id]
    );
    const myEmail = meRows[0].email;

    // Mark all accepted invites between these two users as declined
    await db.query(
      `UPDATE invites SET accepted = 0, declined = 1
       WHERE accepted = 1
         AND ((from_user_id = $1 AND to_email = $2)
           OR (from_user_id = $3 AND to_email = $4))`,
      [req.user.id, target.email, target.id, myEmail]
    );

    res.json({ message: 'Connection removed' });
  } catch (err) {
    console.error('DELETE /invites/connection/:username:', err);
    res.status(500).json({ error: 'Failed to remove connection' });
  }
});

// ── POST /api/invites/:id/accept ─────────────────────────────────────────────
router.post('/:id/accept', authenticateToken, async (req, res) => {
  try {
    const { rows: meRows } = await db.query(
      'SELECT email FROM users WHERE id = $1',
      [req.user.id]
    );
    const myEmail = meRows[0].email;

    const { rows } = await db.query(
      `SELECT invites.*, users.username AS from_username
       FROM invites JOIN users ON users.id = invites.from_user_id
       WHERE invites.id = $1 AND invites.to_email = $2
         AND invites.accepted = 0 AND invites.declined = 0`,
      [req.params.id, myEmail]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    await db.query('UPDATE invites SET accepted = 1 WHERE id = $1', [req.params.id]);

    res.json({ from_username: rows[0].from_username });
  } catch (err) {
    console.error('POST /invites/:id/accept:', err);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

// ── POST /api/invites/:id/decline ────────────────────────────────────────────
router.post('/:id/decline', authenticateToken, async (req, res) => {
  try {
    const { rows: meRows } = await db.query(
      'SELECT email FROM users WHERE id = $1',
      [req.user.id]
    );
    const myEmail = meRows[0].email;

    const { rows } = await db.query(
      `SELECT id FROM invites
       WHERE id = $1 AND to_email = $2 AND accepted = 0 AND declined = 0`,
      [req.params.id, myEmail]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    await db.query('UPDATE invites SET declined = 1 WHERE id = $1', [req.params.id]);
    res.json({ message: 'Invite declined' });
  } catch (err) {
    console.error('POST /invites/:id/decline:', err);
    res.status(500).json({ error: 'Failed to decline invite' });
  }
});

// ── GET /api/invites ────────────────────────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT invites.*, users.username AS to_username
       FROM invites
       LEFT JOIN users ON users.email = invites.to_email
       WHERE invites.from_user_id = $1
       ORDER BY invites.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /invites:', err);
    res.status(500).json({ error: 'Failed to fetch invites' });
  }
});

// ── GET /api/invites/accept/:token ──────────────────────────────────────────
router.get('/accept/:token', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT invites.*, users.username AS from_username
       FROM invites
       JOIN users ON invites.from_user_id = users.id
       WHERE invites.token = $1 AND invites.accepted = 0`,
      [req.params.token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invite not found or already used' });
    }

    const invite = rows[0];
    await db.query('UPDATE invites SET accepted = 1 WHERE id = $1', [invite.id]);

    res.json({
      message:       `You can now view ${invite.from_username}'s library`,
      from_username: invite.from_username,
      from_user_id:  invite.from_user_id,
      invite_message: invite.message,
    });
  } catch (err) {
    console.error('GET /invites/accept/:token:', err);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

module.exports = router;
