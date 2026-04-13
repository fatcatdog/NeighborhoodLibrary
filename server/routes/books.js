const express = require('express');
const db      = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/books ──────────────────────────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM books WHERE user_id = $1 ORDER BY added_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /books:', err);
    res.status(500).json({ error: 'Failed to fetch books' });
  }
});

// ── POST /api/books ─────────────────────────────────────────────────────────
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, author, cover_url } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    const { rows } = await db.query(
      `INSERT INTO books (user_id, title, author, cover_url)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, title, author || null, cover_url || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /books:', err);
    res.status(500).json({ error: 'Failed to add book' });
  }
});

// ── PATCH /api/books/:id ────────────────────────────────────────────────────
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_available, is_currently_reading, title, author } = req.body;

    const ownerCheck = await db.query(
      'SELECT id FROM books WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Book not found' });
    }

    // A book being read is automatically unavailable to lend out.
    // When the user stops reading, it becomes available again.
    let effectiveAvailable = is_available ?? null;
    if (is_currently_reading === true)  effectiveAvailable = false;
    if (is_currently_reading === false) effectiveAvailable = true;

    const { rows } = await db.query(
      `UPDATE books
       SET is_available         = COALESCE($1, is_available),
           is_currently_reading = COALESCE($2, is_currently_reading),
           title                = COALESCE($3, title),
           author               = COALESCE($4, author)
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [effectiveAvailable, is_currently_reading ?? null, title ?? null, author ?? null, id, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('PATCH /books/:id:', err);
    res.status(500).json({ error: 'Failed to update book' });
  }
});

// ── DELETE /api/books/:id ───────────────────────────────────────────────────
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { rows } = await db.query(
      'DELETE FROM books WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Book not found' });
    res.json({ message: 'Book removed' });
  } catch (err) {
    console.error('DELETE /books/:id:', err);
    res.status(500).json({ error: 'Failed to delete book' });
  }
});

module.exports = router;
