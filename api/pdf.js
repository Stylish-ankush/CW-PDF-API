const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // CORS headers - allow all origins
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // Get URL from query parameter or body
    const targetUrl = req.query.url || (req.body && req.body.url);
    
    if (!targetUrl) {
      return res.status(400).json({ 
        success: false,
        error: 'URL parameter is required',
        usage: 'GET /pdf?url=https://cwmediabkt99.crwilladmin.com/92013a99927c4842b0a70fbd6f064a95:crwilladmin/class-attachment/6952111b97606_10_13th_class_JM_28_dec_2025.pdf'
      });
    }
    
    console.log(`[PDF-PROXY] Fetching: ${targetUrl.substring(0, 100)}...`);
    
    // Fetch PDF with proper headers to bypass restrictions
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://cwmediabkt99.crwilladmin.com/',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      timeout: 120000, // 2 minutes timeout
      follow: 10 // Follow up to 10 redirects
    });
    
    // Check if request was successful
    if (!response.ok) {
      console.error(`[PDF-PROXY] ❌ HTTP ${response.status}: ${response.statusText}`);
      return res.status(response.status).json({
        success: false,
        error: `Failed to fetch PDF: HTTP ${response.status}`,
        details: response.statusText
      });
    }
    
    // Get PDF buffer
    const buffer = await response.buffer();
    
    // Verify it's actually a PDF
    const isPDF = buffer.slice(0, 4).toString() === '%PDF';
    
    if (!isPDF) {
      console.error('[PDF-PROXY] ❌ Response is not a valid PDF');
      return res.status(400).json({
        success: false,
        error: 'Downloaded file is not a valid PDF',
        details: 'File header verification failed'
      });
    }
    
    console.log(`[PDF-PROXY] ✅ Success: ${buffer.length} bytes (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
    
    // Send PDF response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', 'inline; filename="document.pdf"');
    res.status(200).send(buffer);
    
  } catch (error) {
    console.error(`[PDF-PROXY] ❌ Error: ${error.message}`);
    
    // Send error response
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch PDF',
      message: error.message,
      details: error.stack
    });
  }
};
