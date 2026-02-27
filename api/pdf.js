const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  let browser = null;
  
  try {
    const targetUrl = req.query.url;
    
    if (!targetUrl) {
      return res.status(400).json({ 
        success: false,
        error: 'URL parameter required',
        usage: 'GET /pdf?url=YOUR_ENCODED_URL'
      });
    }
    
    console.log(`[PDF-BROWSER] Starting browser for: ${targetUrl.substring(0, 80)}...`);
    
    // Launch headless Chrome
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });
    
    const page = await browser.newPage();
    
    // Set realistic headers
    await page.setExtraHTTPHeaders({
      'Accept': 'application/pdf,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://cwmediabkt99.crwilladmin.com/',
    });
    
    // Set User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log(`[PDF-BROWSER] Navigating to URL...`);
    
    // Navigate to PDF URL
    const response = await page.goto(targetUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    if (!response || !response.ok()) {
      throw new Error(`HTTP ${response ? response.status() : 'unknown'}: Failed to load`);
    }
    
    console.log(`[PDF-BROWSER] Page loaded, extracting PDF...`);
    
    // Get PDF buffer
    const buffer = await response.buffer();
    
    // Verify PDF
    const isPDF = buffer.slice(0, 4).toString() === '%PDF';
    
    if (!isPDF) {
      throw new Error('Response is not a valid PDF');
    }
    
    console.log(`[PDF-BROWSER] ✅ Success: ${buffer.length} bytes`);
    
    // Send PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', buffer.length);
    res.status(200).send(buffer);
    
  } catch (error) {
    console.error(`[PDF-BROWSER] ❌ Error: ${error.message}`);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch PDF',
      message: error.message
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};
