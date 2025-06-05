const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const eventRoutes = require('./routes');
const scraper = require('./scraper');
app.set('trust proxy', true);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

app.use('/api', eventRoutes);

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Events API: http://localhost:${PORT}/api/events`);
});

setTimeout(scraper.updateEventCache, 5000);
setInterval(scraper.updateEventCache, 60 * 60 * 1000);