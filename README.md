# 📄 Telegram PDF Downloader Bot

A Telegram bot deployed on Vercel that downloads PDF files from URLs and sends them directly to users.

## ✨ Features

- 🤖 Telegram bot that accepts PDF URLs
- 📥 Downloads PDFs directly or renders pages as PDF using Puppeteer
- ☁️ Deployed on Vercel (serverless)
- 🔒 Optional API key protection
- ⚡ Fast direct download with Puppeteer fallback

---

## 🚀 Setup Guide

### Step 1: Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Choose a name (e.g., `My PDF Bot`)
4. Choose a username (e.g., `mypdfdownloader_bot`)
5. Copy the **bot token** (looks like: `123456789:ABCdefGHIjklMNOpqrSTUvwxYZ`)

### Step 2: Deploy to Vercel

1. Fork/clone this repository
2. Go to [vercel.com](https://vercel.com) and import the project
3. Add **Environment Variables** in Vercel project settings:

| Variable | Value | Required |
|----------|-------|----------|
| `TELEGRAM_BOT_TOKEN` | Your bot token from BotFather | ✅ Yes |
| `API_KEY` | Any secret string (optional protection) | ❌ No |

4. Deploy the project
5. Note your deployment URL (e.g., `my-pdf-bot.vercel.app`)

### Step 3: Register Webhook

After deploying, register the webhook so Telegram sends updates to your bot:

```bash
# Set your environment variables
export TELEGRAM_BOT_TOKEN="your_bot_token_here"
export VERCEL_URL="your-app.vercel.app"

# Run the setup script
node api/setup-webhook.js
```

Or manually via browser:
```
https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=https://your-app.vercel.app/api/bot
```

---

## 💬 Bot Usage

Once deployed, open your bot on Telegram:

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/help` | Help information |
| `/pdf <url>` | Download PDF from URL |
| Just send a URL | Auto-detects and downloads |

**Examples:**
```
https://www.w3.org/WAI/WCAG21/wcag-2.1.pdf
/pdf https://example.com/document.pdf
```

---

## 🔌 API Endpoints

### `GET /api/pdf?url=<encoded_url>`

Downloads or renders a URL as PDF.

**Parameters:**
- `url` (required) - URL-encoded link to PDF or webpage
- `api_key` (optional) - API key if `API_KEY` env var is set

**Headers (optional):**
- `x-api-key` - Alternative way to pass API key

**Example:**
```
GET /api/pdf?url=https%3A%2F%2Fexample.com%2Fdoc.pdf
```

### `POST /api/bot`

Telegram webhook endpoint (receives updates from Telegram).

### `GET /api/bot`

Health check endpoint.

---

## 🛠️ Local Development

```bash
# Install dependencies
npm install

# Install Vercel CLI
npm i -g vercel

# Create .env file
cp .env.example .env
# Edit .env with your values

# Run locally
vercel dev
```

---

## 📁 Project Structure

```
├── api/
│   ├── pdf.js          # PDF download/render API
│   ├── bot.js          # Telegram bot webhook handler
│   └── setup-webhook.js # Script to register Telegram webhook
├── .env.example        # Environment variables template
├── package.json
├── vercel.json         # Vercel configuration
└── README.md
```

---

## ⚠️ Limitations

- Vercel functions have a **60 second** timeout
- Maximum PDF size depends on Telegram's **50MB** file limit
- Some websites may block automated access
