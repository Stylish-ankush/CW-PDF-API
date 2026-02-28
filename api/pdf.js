const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const https = require('https');
const http = require('http');
const { URL } = require('url');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Accept-Encoding, x-api-key');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed',
      message: 'Only GET requests are supported',
      usage: 'GET /api/pdf?url=https://example.com/file.pdf'
    });
  }

  // API Key check (optional - set API_KEY env var to enable protection)
  const API_KEY = process.env.API_KEY;
  if (API_KEY) {
    const providedKey = req.headers['x-api-key'] || req.query.api_key;
    if (!providedKey || providedKey !== API_KEY) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Valid API key required. Pass via x-api-key header or ?api_key= query param'
      });
    }
  }

  let browser = null;

  try {
    let targetUrl = req.query.url;

    if (!targetUrl) {
      return res.status(400).json({
        success: false,
        error: 'URL parameter is required',
        usage: 'GET /api/pdf?url=https://example.com/file.pdf'
      });
    }

    try {
      targetUrl = decodeURIComponent(targetUrl);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL encoding'
      });
    }

    try {
      new URL(targetUrl);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format'
      });
    }

    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      return res.status(400).json({
        success: false,
        error: 'Only HTTP and HTTPS URLs are supported'
      });
    }

    console.log(`[PDF-API] Processing: ${targetUrl.substring(0, 100)}`);

    // Try direct download first
    try {
      const pdfBuffer = await downloadFile(targetUrl);
      const isPDF = pdfBuffer.slice(0, 4).toString('utf8') === '%PDF';

      if (isPDF) {
        console.log(`[PDF-API] ✅ Success (direct): ${pdfBuffer.length} bytes`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', pdfBuffer.length);
        res.setHeader('Content-Disposition', 'inline; filename="document.pdf"');
        return res.status(200).send(pdfBuffer);
      }
      console.log('[PDF-API] Downloaded file is not a PDF, trying Puppeteer...');
    } catch (e) {
      console.log(`[PDF-API] Direct download failed, using Puppeteer: ${e.message}`);
    }

    // Launch Puppeteer with proper chromium args
    console.log('[PDF-API] Launching Puppeteer...');

    let executablePath;
    try {
      executablePath = await chromium.executablePath();
    } catch (e) {
      console.log('[PDF-API] Could not get chromium executablePath:', e.message);
    }

    const launchArgs = {
      headless: chromium.headless !== undefined ? chromium.headless : true,
      ignoreHTTPSErrors: true,
      args: (chromium.args && Array.isArray(chromium.args) && chromium.args.length > 0)
        ? chromium.args
        : [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--single-process',
            '--no-zygote',
          ],
    };

    if (executablePath) {
      launchArgs.executablePath = executablePath;
    }

    if (chromium.defaultViewport !== undefined) {
      launchArgs.defaultViewport = chromium.defaultViewport;
    }

    browser = await puppeteer.launch(launchArgs);

    const page = await browser.newPage();

    await page.setExtraHTTPHeaders({
      'Accept': 'application/pdf,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    );

    const response = await page.goto(targetUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    if (!response || !response.ok()) {
      throw new Error(`HTTP ${response ? response.status() : 'unknown'} from target URL`);
    }

    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
      printBackground: true,
      timeout: 30000
    });

    console.log(`[PDF-API] ✅ Success (Puppeteer): ${pdfBuffer.length} bytes`);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Content-Disposition', 'inline; filename="document.pdf"');
    return res.status(200).send(pdfBuffer);

  } catch (error) {
    console.error(`[PDF-API] ❌ Error: ${error.message}`);
    console.error(error.stack);

    let statusCode = 500;
    if (error.message.includes('ENOTFOUND') || error.message.includes('ERR_NAME_NOT_RESOLVED')) {
      statusCode = 400;
    } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
      statusCode = 504;
    }

    return res.status(statusCode).json({
      success: false,
      error: error.message,
      status: statusCode
    });

  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('[PDF-API] Error closing browser:', e.message);
      }
    }
  }
};

function downloadFile(urlString) {
  return new Promise((resolve, reject) => {
    const makeRequest = (url, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      const protocol = url.startsWith('https') ? https : http;

      const request = protocol.get(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
          'Accept': 'application/pdf,*/*',
        }
      }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          const redirectUrl = response.headers.location.startsWith('http')
            ? response.headers.location
            : new URL(response.headers.location, url).href;

          makeRequest(redirectUrl, redirectCount + 1);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      });

      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request Timeout'));
      });

      request.on('error', reject);
    };

    makeRequest(urlString);
  });
}
