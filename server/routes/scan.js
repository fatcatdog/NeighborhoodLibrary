const express = require('express');
const multer  = require('multer');
const path    = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db      = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpeg, png, gif, webp)'));
    }
  },
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model  = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

const VISION_PROMPT = `You are analyzing a photo of books.
Identify every book visible in this image — look at spines, covers, and any visible text.
For each book extract:
  - title  (required)
  - author (if visible, otherwise null)

Return ONLY a valid JSON array with no extra commentary, markdown, or code fences.
Format: [{"title": "...", "author": "..."}, ...]
If no books are found, return [].`;

// ── POST /api/scan ──────────────────────────────────────────────────────────
router.post('/', authenticateToken, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'An image file is required (field name: image)' });
  }

  try {
    // Gemini takes inline image data as a { inlineData: { mimeType, data } } part.
    const imagePart = {
      inlineData: {
        mimeType: req.file.mimetype,
        data:     req.file.buffer.toString('base64'),
      },
    };

    const result = await model.generateContent([VISION_PROMPT, imagePart]);
    const raw    = result.response.text().trim();

    let detectedBooks = [];
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) detectedBooks = JSON.parse(jsonMatch[0]);
    } catch {
      detectedBooks = [];
    }

    const savedBooks = [];
    for (const book of detectedBooks) {
      if (!book.title) continue;
      const { rows } = await db.query(
        `INSERT INTO books (user_id, title, author)
         VALUES ($1, $2, $3) RETURNING *`,
        [req.user.id, book.title, book.author || null]
      );
      savedBooks.push(rows[0]);
    }

    res.json({ detected: detectedBooks.length, saved: savedBooks.length, books: savedBooks });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: 'Failed to process image' });
  }
});

module.exports = router;
