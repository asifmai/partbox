const puppeteer = require('puppeteer')

module.exports.launchBrowser = (headless) => {
  return new Promise(async (resolve, reject) => {
    try {
      const browser = await puppeteer.launch({
        headless: headless,
        args: [
          '--disable-setuid-sandbox',
          '--no-sandbox',
          '--disable-infobars',
          '--window-position=0,0',
          '--ignore-certifcate-errors',
          '--ignore-certifcate-errors-spki-list',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
        ],
        ignoreHTTPSErrors: true,
        defaultViewport: null,
      });
      resolve(browser);
    } catch (error) {
      console.log('Browser Launch Error: ', error);
      reject(error);
    }
  });
}

module.exports.launchPage = (browser, blockResources = false) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Create New Page
      const page = await browser.newPage();

      // Set user agent for page.
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36';
      await page.setUserAgent(userAgent);

      // Pass the Webdriver Test.
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });

        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en'],
        });

        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });
      });

      if (blockResources === true) {
        const blockedResources = ['image', 'stylesheet', 'media', 'font', 'texttrack', 'object', 'beacon', 'csp_report', 'imageset'];

        // Set Request Interception to avoid receiving images, fonts and stylesheets for fast speed
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          if (blockedResources.includes(req.resourceType())) {
            req.abort();
          } else {
            req.continue();
          }
        });
      }

      // Set Extra Header for request
      await page.setExtraHTTPHeaders({
        'accept-language': 'en-US,en;q=0.8',
      });

      resolve(page);
    } catch (error) {
      console.log('Launch Page Error: ', error);
      reject(error);
    }
  });
}