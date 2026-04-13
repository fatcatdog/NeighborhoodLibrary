const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes    = require('./routes/auth');
const usersRoutes   = require('./routes/users');
const booksRoutes   = require('./routes/books');
const scanRoutes    = require('./routes/scan');
const nearbyRoutes  = require('./routes/nearby');
const invitesRoutes = require('./routes/invites');

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the static frontend from /client
app.use(express.static(path.join(__dirname, '../client')));

// ── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth',    authRoutes);
app.use('/api/users',   usersRoutes);
app.use('/api/books',   booksRoutes);
app.use('/api/scan',    scanRoutes);
app.use('/api/nearby',  nearbyRoutes);
app.use('/api/invites', invitesRoutes);

// ── SPA catch-all ───────────────────────────────────────────────────────────
// Any non-API route serves the frontend so client-side routing works.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// ── Global error handler ────────────────────────────────────────────────────
// Must have 4 parameters for Express to recognise it as an error handler.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Neighborhood Library listening on http://localhost:${PORT}`);
});
