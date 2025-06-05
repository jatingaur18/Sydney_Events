const express = require('express');
const router = express.Router();
const scraper = require('./scraper');

router.get('/events', (req, res) => {
  const cachedEvents = scraper.getCachedEvents();
  const lastScrapedTime = scraper.getLastScrapedTime();

  if (cachedEvents.length === 0) {
    return res.status(503).json({
      success: false,
      error: 'Events not yet available. Please try again in a few moments.'
    });
  }

  res.json({
    success: true,
    events: cachedEvents,
    lastUpdated: lastScrapedTime ? new Date(lastScrapedTime).toISOString() : null,
    totalEvents: cachedEvents.length
  });
});

router.post('/events/refresh', async (req, res) => {
  try {
    console.log('Force refreshing events (manual trigger)...');
    await scraper.updateEventCache();
    const cachedEvents = scraper.getCachedEvents();
    const lastScrapedTime = scraper.getLastScrapedTime();
    res.json({
      success: true,
      events: cachedEvents,
      refreshed: true,
      lastUpdated: lastScrapedTime ? new Date(lastScrapedTime).toISOString() : null,
      totalEvents: cachedEvents.length
    });
  } catch (error) {
    console.error('Error in /api/events/refresh:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh events',
      message: error.message
    });
  }
});

router.post('/collect-email', (req, res) => {
  const { email, eventId, eventTitle } = req.body;

  if (!email || !eventId) {
    return res.status(400).json({
      success: false,
      error: 'Email and eventId are required'
    });
  }

  console.log(`Email collected: ${email} for event ${eventId} (${eventTitle})`);

  res.json({
    success: true,
    message: 'Email collected successfully'
  });
});

router.get('/debug-scrape', async (req, res) => {
  const result = await scraper.debugScrape();
  res.status(result.success ? 200 : 500).json(result);
});

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    cachedEvents: scraper.getCachedEvents().length,
    lastScraped: scraper.getLastScrapedTime() ? new Date(scraper.getLastScrapedTime()).toISOString() : null
  });
});

module.exports = router;