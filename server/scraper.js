const puppeteer = require('puppeteer');

let cachedEvents = [];
let lastScrapedTime = null;

async function scrapeEventbriteEvents() {
  let browser;
  try {
    console.log('Starting to scrape Eventbrite events...');
    const chromePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable';
    browser = await puppeteer.launch({
      headless: true,
      executablePath: chromePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection'
      ]
    });

    const page = await browser.newPage();
    
    await page.setDefaultNavigationTimeout(60000);
    await page.setDefaultTimeout(60000);
    
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/91.0.4472.124 Safari/537.36'
    );
    await page.setViewport({ width: 1920, height: 1080 });

    console.log('Navigating to Eventbrite Sydney events page...');
    await page.goto('https://www.eventbrite.com/d/australia--sydney/events/', {
      waitUntil: 'networkidle0',
      timeout: 120000
    });
    await new Promise(res => setTimeout(res, 3000)); // allow dynamic content to load

    const basicEvents = await page.evaluate(() => {
      const possibleSelectors = [
        'article[data-testid="search-event-card"]',
        '[data-testid="search-event-card"]',
        '.search-event-card',
        '.event-card',
        '.discover-search-desktop-card',
        '.eds-event-card'
      ];
      let eventCards = [];
      for (const sel of possibleSelectors) {
        const found = document.querySelectorAll(sel);
        if (found.length) {
          eventCards = found;
          break;
        }
      }

      const getText = el => (el ? el.innerText.trim() : null);

      const getImageUrl = (card) => {
        const imgSelectors = [
          'img[src*="eventbrite"]',
          'img[src*="eb.com"]',
          'img[class*="event"]',
          'img',
          '[style*="background-image"]'
        ];
        for (const s of imgSelectors) {
          const imgEl = card.querySelector(s);
          if (!imgEl) continue;
          let imgUrl = imgEl.src
            || imgEl.getAttribute('data-src')
            || imgEl.getAttribute('data-original')
            || null;
          if (!imgUrl && imgEl.srcset) {
            const parts = imgEl.srcset.split(',');
            if (parts.length) imgUrl = parts[0].trim().split(' ')[0];
          }
          if (!imgUrl && imgEl.style?.backgroundImage) {
            const m = imgEl.style.backgroundImage.match(
              /url\(["']?([^"']+)["']?\)/
            );
            if (m) imgUrl = m[1];
          }
          if (imgUrl && imgUrl.startsWith('//')) {
            imgUrl = 'https:' + imgUrl;
          } else if (imgUrl && imgUrl.startsWith('/')) {
            imgUrl = 'https://www.eventbrite.com' + imgUrl;
          }
          if (imgUrl && imgUrl.startsWith('http')) {
            return imgUrl;
          }
        }
        return null;
      };

      const extracted = [];
      eventCards.forEach((card, idx) => {
        try {
          const titleEl = card.querySelector(
            'h1, h2, h3, h4, [data-testid*="title"], [class*="title"], .event-card__formatted-name--is-clamped'
          );
          const title = getText(titleEl);

          const dateEl = card.querySelector(
            'time, [data-testid*="date"], [class*="date"]'
          );
          let dateText = getText(dateEl) || 'Date TBA';

          const locEl = card.querySelector(
            '[data-testid*="location"], [class*="location"], [class*="venue"]'
          );
          const location = getText(locEl) || 'Sydney, Australia';

          const linkEl = card.querySelector('a[href*="/e/"]') || card.querySelector('a');
          let originalUrl = linkEl?.href || null;
          if (originalUrl && originalUrl.startsWith('/')) {
            originalUrl = 'https://www.eventbrite.com' + originalUrl;
          }

          const image = getImageUrl(card);

          const descEl = card.querySelector(
            '[data-testid*="description"], .card-text, .event-card__description-block'
          );
          const shortCardDescription = descEl
            ? getText(descEl).slice(0, 200) + '...'
            : 'Click to view full details on Eventbrite';

          let price = 'See original listing';
          const pricePattern = /\$[\d,]+\.?\d*/g;
          const allText = card.innerText || '';
          const priceMatch = allText.match(pricePattern);
          if (priceMatch && priceMatch.length) {
            price = priceMatch[0];
          }

          if (title && originalUrl) {
            extracted.push({
              id: `event_${idx + 1}_${Date.now()}`,
              title,
              date: dateText.trim(),
              location: location.trim(),
              image,
              originalUrl,
              shortCardDescription,
              price,
              scrapedAt: new Date().toISOString()
            });
          }
        } catch (err) {
          console.warn('Error processing a card:', err.message);
        }
      });
      return extracted;
    });

    console.log(`Found ${basicEvents.length} events on the listing page.`);

    const maxConcurrent = 3;
    for (let i = 0; i < basicEvents.length; i += maxConcurrent) {
      const batch = basicEvents.slice(i, i + maxConcurrent);
      const promises = batch.map(async (ev, batchIdx) => {
        const actualIdx = i + batchIdx;
        console.log(
          `Scraping detail page for event ${actualIdx + 1}/${basicEvents.length}: ${ev.originalUrl}`
        );

        try {
          const detailPage = await browser.newPage();
          await detailPage.setDefaultNavigationTimeout(60000);
          await detailPage.setDefaultTimeout(60000);
          await detailPage.setUserAgent(page._userAgent);
          await detailPage.setViewport({ width: 1920, height: 1080 });

          await detailPage.goto(ev.originalUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
          });
          await new Promise(res => setTimeout(res, 2000)); // allow dynamic content to render

          const detailData = await detailPage.evaluate(() => {
            const getText = (selector) => {
              const el = document.querySelector(selector);
              return el ? el.innerText.trim() : null;
            };

            let startTime = null;
            const timeTag = document.querySelector('time[datetime]');
            if (timeTag) {
              startTime = timeTag.getAttribute('datetime');
            } else {
              const altDate = document.querySelector('[data-automation="event-details-start-date"]');
              if (altDate) {
                startTime = altDate.innerText.trim();
              }
            }

            let price = null;
            const priceEl = document.querySelector('.js-display-price');
            if (priceEl) {
              price = priceEl.innerText.trim();
            } else {
              const allText = document.body.innerText || '';
              const m = allText.match(/(Free|from\s*\$\d+|Starting\s*at\s*\$\d+|\$\d+)/i);
              if (m) {
                price = m[0];
              }
            }

            let venueName = null;
            let venueAddress = null;
            const nameEl = document.querySelector('.location-info__address-text');
            if (nameEl) {
              venueName = nameEl.innerText.trim();
            }

            const addrBlock = document.querySelector('.location-info__address');
            if (addrBlock) {
              const fullAddr = addrBlock.innerText.trim();
              if (venueName && fullAddr.startsWith(venueName)) {
                const parts = fullAddr.split('\n');
                venueAddress = parts.slice(1).join(', ').trim();
              } else {
                venueAddress = fullAddr;
              }
            }
            if (!venueAddress) {
              venueAddress = 'Venue details not found';
            }
            if (!venueName && addrBlock) {
              const lines = addrBlock.innerText.trim().split('\n');
              if (lines.length > 1) {
                venueName = lines[0].trim();
                venueAddress = lines.slice(1).join(', ').trim();
              }
            }

            const tags = [];
            document.querySelectorAll('ul li.tags-item a.tags-link').forEach(a => {
              const t = a.innerText.trim();
              if (t) tags.push(t);
            });

            let humanDate = null;
            const dateBlock = document.querySelector('.date-info__full-datetime');
            if (dateBlock) {
              humanDate = dateBlock.innerText.trim();
            }

            return {
              startTime,
              price,
              venueName,
              venueAddress,
              tags,
              humanDate
            };
          });

          basicEvents[actualIdx] = {
            ...ev,
            startTime: detailData.startTime,
            humanDate: detailData.humanDate,
            price: detailData.price || ev.price,
            venueName: detailData.venueName,
            venueAddress: detailData.venueAddress,
            tags: detailData.tags
          };

          await detailPage.close();
        } catch (innerErr) {
          console.warn(
            `Failed to scrape detail for event ${actualIdx + 1}:`,
            innerErr.message
          );
        }
      });

      await Promise.all(promises);
    }

    console.log('Finished scraping all detail pages.');
    return basicEvents;
  } catch (error) {
    console.error('Error scraping Eventbrite:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function updateEventCache() {
  try {
    console.log('Updating event cache...');
    const events = await scrapeEventbriteEvents();
    cachedEvents = events;
    lastScrapedTime = Date.now();
    console.log(`Event cache updated: ${events.length} events stored.`);
  } catch (error) {
    console.error('Failed to update event cache:', error.message);
  }
}

async function debugScrape() {
  let browser;
  try {
    console.log('Starting debug scrape...');

    browser = await puppeteer.launch({
      headless: true, // Keep headless true for Render
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    console.log('Navigating to page...');

    await page.goto('https://www.eventbrite.com/d/australia--sydney/events/', {
      waitUntil: 'networkidle0',
      timeout: 100000
    });

    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        htmlLength: document.documentElement.outerHTML.length,
        allElements: document.querySelectorAll('*').length,
        articles: document.querySelectorAll('article').length,
        divs: document.querySelectorAll('div').length,
        links: document.querySelectorAll('a').length,
        eventLinks: document.querySelectorAll('a[href*="/e/"]').length,
        possibleEventSelectors: [
          'article[data-testid="search-event-card"]',
          '[data-testid="search-event-card"]',
          '.search-event-card',
          '.event-card',
          'article',
          'a[href*="/e/"]'
        ].map(selector => ({
          selector,
          count: document.querySelectorAll(selector).length
        }))
      };
    });

    await browser.close();

    return {
      success: true,
      debugInfo: pageInfo,
      message: 'Debug scrape completed'
    };
  } catch (error) {
    if (browser) await browser.close();
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

module.exports = {
  scrapeEventbriteEvents,
  updateEventCache,
  debugScrape,
  getCachedEvents: () => cachedEvents,
  getLastScrapedTime: () => lastScrapedTime
};