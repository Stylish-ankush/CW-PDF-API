const https = require('https');
const http = require('http');
const { URL } = require('url');

// Telegram Bot API helper
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : process.env.API_BASE_URL || 'http://localhost:3000';

// Internal API key for pdf endpoint
const API_KEY = process.env.API_KEY;

async function telegramRequest(method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_TOKEN}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => (responseData += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          resolve({ ok: false, description: 'Invalid JSON response' });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Telegram API timeout'));
    });
    req.write(data);
    req.end();
  });
}

async function sendMessage(chatId, text, options = {}) {
  return telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...options,
  });
}

async function sendDocument(chatId, fileUrl, caption = '') {
  return telegramRequest('sendDocument', {
    chat_id: chatId,
    document: fileUrl,
    caption,
    parse_mode: 'HTML',
  });
}

async function sendChatAction(chatId, action = 'upload_document') {
  return telegramRequest('sendChatAction', {
    chat_id: chatId,
    action,
  });
}

function isValidUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function extractUrl(text) {
  // Extract URL from message text
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const matches = text.match(urlRegex);
  return matches ? matches[0] : null;
}

async function downloadPdfBuffer(pdfApiUrl) {
  return new Promise((resolve, reject) => {
    const makeRequest = (url, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      const protocol = url.startsWith('https') ? https : http;
      const req = protocol.get(url, { timeout: 55000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          makeRequest(redirectUrl, redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200) {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
            } catch {
              reject(new Error(`HTTP ${res.statusCode}`));
            }
          });
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Download timeout'));
      });
      req.on('error', reject);
    };

    makeRequest(pdfApiUrl);
  });
}

async function sendPdfToTelegram(chatId, pdfBuffer, filename = 'document.pdf') {
  // Use multipart/form-data to send file buffer directly to Telegram
  return new Promise((resolve, reject) => {
    const boundary = `----FormBoundary${Date.now()}`;
    const caption = '📄 Your PDF is ready!';

    // Build multipart body
    const metaPart = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`
    );
    const endPart = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([metaPart, pdfBuffer, endPart]);

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_TOKEN}/sendDocument`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => (responseData += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          resolve({ ok: false, description: 'Invalid JSON' });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Telegram upload timeout'));
    });
    req.write(body);
    req.end();
  });
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Health check
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      message: 'Telegram PDF Bot is running!',
      usage: 'Send a PDF URL to the bot on Telegram',
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  if (!TELEGRAM_TOKEN) {
    console.error('[BOT] TELEGRAM_BOT_TOKEN not set!');
    return res.status(500).json({ ok: false, error: 'Bot token not configured' });
  }

  let update;
  try {
    update = req.body;
    if (!update || typeof update !== 'object') {
      return res.status(400).json({ ok: false, error: 'Invalid update body' });
    }
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'Failed to parse body' });
  }

  // Acknowledge immediately to Telegram
  res.status(200).json({ ok: true });

  const message = update.message || update.edited_message;
  if (!message) return;

  const chatId = message.chat.id;
  const text = message.text || '';
  const firstName = message.from?.first_name || 'User';

  console.log(`[BOT] Message from ${chatId}: ${text.substring(0, 100)}`);

  // Handle /start command
  if (text.startsWith('/start')) {
    await sendMessage(
      chatId,
      `👋 <b>Hello ${firstName}!</b>\n\n` +
      `🤖 I'm a <b>PDF Downloader Bot</b>.\n\n` +
      `📎 <b>How to use:</b>\n` +
      `Just send me any PDF link and I'll download it and send it to you!\n\n` +
      `<b>Example:</b>\n` +
      `<code>https://example.com/document.pdf</code>\n\n` +
      `You can also use:\n` +
      `<code>/pdf https://example.com/document.pdf</code>`
    );
    return;
  }

  // Handle /help command
  if (text.startsWith('/help')) {
    await sendMessage(
      chatId,
      `📖 <b>Help</b>\n\n` +
      `Send me a URL to any PDF file or webpage and I'll convert/download it as PDF.\n\n` +
      `<b>Commands:</b>\n` +
      `/start - Welcome message\n` +
      `/help - This help message\n` +
      `/pdf &lt;url&gt; - Download PDF from URL\n\n` +
      `<b>Or just send a URL directly!</b>`
    );
    return;
  }

  // Extract URL from message
  let targetUrl = null;

  if (text.startsWith('/pdf ')) {
    const urlPart = text.slice(5).trim();
    if (isValidUrl(urlPart)) {
      targetUrl = urlPart;
    }
  } else {
    targetUrl = extractUrl(text);
  }

  if (!targetUrl) {
    await sendMessage(
      chatId,
      `❌ <b>No valid URL found!</b>\n\n` +
      `Please send a valid HTTP/HTTPS URL.\n\n` +
      `<b>Example:</b>\n` +
      `<code>https://example.com/document.pdf</code>`
    );
    return;
  }

  // Show typing indicator
  await sendChatAction(chatId, 'upload_document');

  await sendMessage(chatId, `⏳ <b>Processing your request...</b>\n\n🔗 URL: <code>${targetUrl.substring(0, 80)}${targetUrl.length > 80 ? '...' : ''}</code>`);

  try {
    // Build PDF API URL
    const encodedUrl = encodeURIComponent(targetUrl);
    let pdfApiUrl = `${API_BASE_URL}/api/pdf?url=${encodedUrl}`;
    if (API_KEY) {
      pdfApiUrl += `&api_key=${encodeURIComponent(API_KEY)}`;
    }

    console.log(`[BOT] Calling PDF API for: ${targetUrl.substring(0, 80)}`);

    // Download PDF buffer from our API
    const pdfBuffer = await downloadPdfBuffer(pdfApiUrl);

    console.log(`[BOT] PDF downloaded: ${pdfBuffer.length} bytes`);

    // Generate filename from URL
    let filename = 'document.pdf';
    try {
      const urlObj = new URL(targetUrl);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart && lastPart.length > 0) {
        filename = lastPart.endsWith('.pdf') ? lastPart : `${lastPart}.pdf`;
        // Sanitize filename
        filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 64);
      }
    } catch {}

    // Send PDF to user
    await sendChatAction(chatId, 'upload_document');
    const sendResult = await sendPdfToTelegram(chatId, pdfBuffer, filename);

    if (!sendResult.ok) {
      throw new Error(sendResult.description || 'Failed to send document');
    }

    console.log(`[BOT] ✅ PDF sent to ${chatId}`);

  } catch (error) {
    console.error(`[BOT] ❌ Error for ${chatId}: ${error.message}`);

    let errorMsg = `❌ <b>Failed to download PDF</b>\n\n`;

    if (error.message.includes('timeout') || error.message.includes('Timeout')) {
      errorMsg += `⏱ The request timed out. The file might be too large or the server is slow.`;
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ERR_NAME_NOT_RESOLVED')) {
      errorMsg += `🌐 Could not reach the URL. Please check if the link is correct.`;
    } else if (error.message.includes('HTTP 4')) {
      errorMsg += `🔒 Access denied or file not found at the URL.`;
    } else {
      errorMsg += `⚠️ Error: ${error.message}`;
    }

    errorMsg += `\n\n💡 <b>Tip:</b> Make sure the URL is a direct link to a PDF file.`;

    await sendMessage(chatId, errorMsg);
  }
};
