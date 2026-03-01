require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// ── MIDDLEWARE ──────────────────────────────────────────────────────
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'http://localhost:5173',
  ],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── ROUTES ──────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/products',  require('./routes/products'));
app.use('/api/retailers', require('./routes/retailers'));
app.use('/api/orders',    require('./routes/orders'));
app.use('/api/otp',       require('./routes/otp'));

// ── HEALTH CHECK ────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'VK Furnishing Backend is running',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ── 404 HANDLER ─────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── ERROR HANDLER ───────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── START SERVER ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`VK Furnishing backend running on port ${PORT}`);
});
