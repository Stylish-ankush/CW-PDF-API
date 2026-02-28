const https = require('https');

// Run this script to register your Telegram bot webhook
// Usage: TELEGRAM_BOT_TOKEN=xxx VERCEL_URL=your-app.vercel.app node api/setup-webhook.js

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const VERCEL_URL = process.env.VERCEL_URL || process.argv[2];

if (!TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN environment variable is required');
  console.error('Usage: TELEGRAM_BOT_TOKEN=xxx VERCEL_URL=your-app.vercel.app node api/setup-webhook.js');
  process.exit(1);
}

if (!VERCEL_URL) {
  console.error('❌ VERCEL_URL environment variable or argument is required');
  console.error('Usage: TELEGRAM_BOT_TOKEN=xxx VERCEL_URL=your-app.vercel.app node api/setup-webhook.js');
  process.exit(1);
}

const webhookUrl = `https://${VERCEL_URL.replace(/^https?:\/\//, '')}/api/bot`;

console.log(`🔧 Setting webhook to: ${webhookUrl}`);

function telegramGet(path) {
  return new Promise((resolve, reject) => {
    https.get(`https://api.telegram.org/bot${TOKEN}${path}`, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function telegramPost(method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TOKEN}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let responseData = '';
      res.on('data', (c) => (responseData += c));
      res.on('end', () => {
        try { resolve(JSON.parse(responseData)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  // Get bot info
  const meResult = await telegramGet('/getMe');
  if (!meResult.ok) {
    console.error('❌ Invalid bot token:', meResult.description);
    process.exit(1);
  }
  console.log(`✅ Bot: @${meResult.result.username} (${meResult.result.first_name})`);

  // Set webhook
  const result = await telegramPost('setWebhook', {
    url: webhookUrl,
    allowed_updates: ['message', 'edited_message'],
    drop_pending_updates: true,
  });

  if (result.ok) {
    console.log('✅ Webhook set successfully!');
    console.log(`📡 Webhook URL: ${webhookUrl}`);
    console.log(`\n🤖 Your bot is ready! Search for @${meResult.result.username} on Telegram.`);
  } else {
    console.error('❌ Failed to set webhook:', result.description);
    process.exit(1);
  }

  // Verify webhook
  const info = await telegramGet('/getWebhookInfo');
  if (info.ok) {
    console.log('\n📋 Webhook Info:');
    console.log(`  URL: ${info.result.url}`);
    console.log(`  Pending updates: ${info.result.pending_update_count}`);
    if (info.result.last_error_message) {
      console.log(`  Last error: ${info.result.last_error_message}`);
    }
  }
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
