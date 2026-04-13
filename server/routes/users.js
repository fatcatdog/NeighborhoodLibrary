const express = require('express');
const db      = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/users/me ───────────────────────────────────────────────────────
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, username, email, is_public, latitude, longitude, bio,
              phone, phone_public, telegram_username, telegram_public, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /users/me:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ── PATCH /api/users/me ─────────────────────────────────────────────────────
router.patch('/me', authenticateToken, async (req, res) => {
  try {
    const {
      username, is_public, latitude, longitude, bio,
      phone, phone_public, telegram_username, telegram_public,
    } = req.body;

    if (username) {
      const taken = await db.query(
        'SELECT id FROM users WHERE username = $1 AND id != $2',
        [username, req.user.id]
      );
      if (taken.rows.length > 0) {
        return res.status(409).json({ error: 'Username already taken' });
      }
    }

    const { rows } = await db.query(
      `UPDATE users
       SET username          = COALESCE($1,  username),
           is_public         = COALESCE($2,  is_public),
           latitude          = COALESCE($3,  latitude),
           longitude         = COALESCE($4,  longitude),
           bio               = COALESCE($5,  bio),
           phone             = COALESCE($6,  phone),
           phone_public      = COALESCE($7,  phone_public),
           telegram_username = COALESCE($8,  telegram_username),
           telegram_public   = COALESCE($9,  telegram_public)
       WHERE id = $10
       RETURNING id, username, email, is_public, latitude, longitude, bio,
                 phone, phone_public, telegram_username, telegram_public, created_at`,
      [
        username          ?? null,
        is_public         ?? null,
        latitude          ?? null,
        longitude         ?? null,
        bio               ?? null,
        phone             ?? null,
        phone_public      ?? null,
        telegram_username ?? null,
        telegram_public   ?? null,
        req.user.id,
      ]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('PATCH /users/me:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ── GET /api/users/:username ────────────────────────────────────────────────
router.get('/:username', authenticateToken, async (req, res) => {
  try {
    const { rows: userRows } = await db.query(
      `SELECT id, username, email, bio, is_public,
              phone, phone_public, telegram_username, telegram_public, created_at
       FROM users WHERE username = $1`,
      [req.params.username]
    );
    if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });

    const user    = userRows[0];
    const isOwner = user.id === req.user.id;

    if (!isOwner && !user.is_public) {
      return res.status(403).json({ error: 'This library is private' });
    }

    // Only expose contact details if there is an accepted invite between the two users (either direction).
    let contact = {};
    if (!isOwner) {
      const { rows: meRows } = await db.query(
        'SELECT email FROM users WHERE id = $1', [req.user.id]
      );
      const myEmail = meRows[0].email;

      const { rows: inviteRows } = await db.query(
        `SELECT id FROM invites
         WHERE accepted = 1
           AND ((from_user_id = $1 AND to_email = $2)
             OR (from_user_id = $3 AND to_email = $4))`,
        [user.id, myEmail, req.user.id, user.email]
      );

      const isConnected = inviteRows.length > 0;
      if (isConnected) {
        if (user.phone_public      && user.phone)             contact.phone             = user.phone;
        if (user.telegram_public   && user.telegram_username) contact.telegram_username = user.telegram_username;
      }

      // Check whether the viewer already has a pending outgoing invite to this user
      const { rows: pendingRows } = await db.query(
        `SELECT id FROM invites
         WHERE from_user_id = $1 AND to_email = $2 AND accepted = 0 AND declined = 0`,
        [req.user.id, user.email]
      );
      const pendingInviteSent = pendingRows.length > 0;

      const { email: _email, ...publicUser } = user;
      const { rows: books } = await db.query(
        `SELECT id, title, author, cover_url, is_available, is_currently_reading, added_at
         FROM books WHERE user_id = $1 ORDER BY added_at DESC`,
        [user.id]
      );
      return res.json({ user: { ...publicUser, ...contact }, books, isOwner, isConnected, pendingInviteSent });
    } else {
      // Owner always sees their own contact info
      contact = {
        phone:             user.phone,
        telegram_username: user.telegram_username,
      };
    }

    const { rows: books } = await db.query(
      `SELECT id, title, author, cover_url, is_available, is_currently_reading, added_at
       FROM books WHERE user_id = $1 ORDER BY added_at DESC`,
      [user.id]
    );

    const { email: _email, ...publicUser } = user;
    res.json({ user: { ...publicUser, ...contact }, books, isOwner, isConnected: false, pendingInviteSent: false });
  } catch (err) {
    console.error('GET /users/:username:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

module.exports = router;
